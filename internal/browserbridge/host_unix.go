//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"crypto/subtle"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	handshakeTimeout = 10*time.Second
	authTimeout = 3*time.Second
	nativeTimeout = 138*time.Second
	devTimeout = 15*time.Second
)

type pendingCall struct { answer chan []byte }
type pendingDev struct { epoch string; timer *time.Timer }
type localClient struct {
	socket *net.UnixConn
	writeMu sync.Mutex
	providerEpoch string
}
type Host struct {
	cfg Installation
	origin string
	input io.Reader
	output io.Writer
	mu sync.Mutex
	writeMu sync.Mutex
	listener *net.UnixListener
	socketInfo os.FileInfo
	ready bool
	localDev bool
	closed bool
	clients map[*localClient]bool
	pending map[string]*pendingCall
	devPending map[string]*pendingDev
	provider *localClient
	done chan struct{}
	closeOnce sync.Once
}
func NewHost(cfg Installation,origin string,input io.Reader,output io.Writer) (*Host,error) {
	if cfg.Name!=HostName || !ExtensionIDValid(cfg.ExtensionID) ||
		!CredentialValid(cfg.ClientCredential) || !filepath.IsAbs(cfg.SocketPath) ||
		origin!="chrome-extension://"+cfg.ExtensionID+"/"{
		return nil,errors.New("E_EXTENSION_ID")
	}
	if input==nil || output==nil{return nil,ErrSchema}
	return &Host{cfg:cfg,origin:origin,input:input,output:output,clients:make(map[*localClient]bool),
		pending:make(map[string]*pendingCall),devPending:make(map[string]*pendingDev),done:make(chan struct{})},nil
}
func (h *Host) sendChrome(raw []byte) error {
	h.writeMu.Lock();defer h.writeMu.Unlock()
	select{case <-h.done:return ErrClosed;default:}
	if err:=WriteFrame(h.output,raw);err!=nil{go h.Close();return err}
	return nil
}
func (h *Host) sendLocal(c *localClient,raw []byte) error {
	c.writeMu.Lock();defer c.writeMu.Unlock()
	if err:=c.socket.SetWriteDeadline(time.Now().Add(4*time.Second));err!=nil{return err}
	return WriteLine(c.socket,raw)
}
func (h *Host) localError(c *localClient,id,code,outcome string) {
	if err:=h.sendLocal(c,ErrorResponse(id,code,outcome));err!=nil{c.socket.Close()}
}
func (h *Host) devError(id,epoch,code string) {
	_ = h.sendChrome(MustEncode(map[string]any{"v":1,"kind":"dev.response","requestId":id,"providerEpoch":epoch,
		"error":map[string]string{"code":code,"message":code}}))
}
func (h *Host) providerState() {
	h.mu.Lock()
	connected:=h.provider!=nil
	epoch:=""
	if connected{epoch=h.provider.providerEpoch}
	h.mu.Unlock()
	var current any
	if connected{current=epoch}
	_ = h.sendChrome(MustEncode(map[string]any{"v":1,"kind":"dev.state","connected":connected,"providerEpoch":current}))
}
// Close never removes a socket created by another process after ours was bound.
func (h *Host) Close() {
	h.closeOnce.Do(func(){
		h.mu.Lock()
		h.closed=true
		close(h.done)
		listener:=h.listener
		clients:=make([]*localClient,0,len(h.clients))
		for client:=range h.clients{clients=append(clients,client)}
		for _,p:=range h.devPending{p.timer.Stop()}
		h.mu.Unlock()
		if listener!=nil{_ = listener.Close()}
		for _,c:=range clients{_ = c.socket.Close()}
		if closer,ok:=h.input.(io.Closer);ok{_ = closer.Close()}
		if h.socketInfo!=nil{
			now,err:=os.Lstat(h.cfg.SocketPath)
			if err==nil && now.Mode()&os.ModeSocket!=0 && os.SameFile(now,h.socketInfo){
				_ = os.Remove(h.cfg.SocketPath)
			}
		}
	})
}
func (h *Host) startSocket() error {
	if err:=requireDir(filepath.Dir(h.cfg.SocketPath));err!=nil{return err}
	if _,err:=os.Lstat(h.cfg.SocketPath);err==nil{return errors.New("E_SOCKET_IN_USE")}else if !os.IsNotExist(err){return err}
	listener,err:=net.ListenUnix("unix",&net.UnixAddr{Name:h.cfg.SocketPath,Net:"unix"})
	if err!=nil{return err}
	listener.SetUnlinkOnClose(false)
	if err=os.Chmod(h.cfg.SocketPath,0600);err!=nil{listener.Close();return err}
	stat,err:=os.Lstat(h.cfg.SocketPath)
	if err!=nil{listener.Close();return err}
	if stat.Mode()&os.ModeSocket==0 || !userOwned(stat) || stat.Mode().Perm()!=0600 {
		listener.Close();return errors.New("E_SOCKET_INVALID")
	}
	h.mu.Lock();h.socketInfo=stat;h.listener=listener;h.mu.Unlock()
	go h.accept()
	return nil
}
func (h *Host) accept() {
	for {
		conn,err:=h.listener.AcceptUnix()
		if err!=nil{select{case <-h.done:return;default:go h.Close();return}}
		h.mu.Lock()
		if h.closed || len(h.clients)>=MaxClients{h.mu.Unlock();conn.Close();continue}
		item:=&localClient{socket:conn}
		h.clients[item]=true
		h.mu.Unlock()
		go h.serveLocal(item)
	}
}
func (h *Host) releaseProvider(c *localClient) {
	h.mu.Lock()
	if h.provider!=c{h.mu.Unlock();return}
	epoch:=c.providerEpoch
	h.provider=nil
	var ids []string
	for id,p:=range h.devPending{
		if p.epoch==epoch{p.timer.Stop();delete(h.devPending,id);ids=append(ids,id)}
	}
	h.mu.Unlock()
	for _,id:=range ids{h.devError(id,epoch,"E_DEV_DISCONNECTED")}
	h.providerState()
}
func (h *Host) serveLocal(c *localClient) {
	defer func(){
		h.releaseProvider(c)
		h.mu.Lock();delete(h.clients,c);h.mu.Unlock()
		c.socket.Close()
	}()
	_ = c.socket.SetReadDeadline(time.Now().Add(authTimeout))
	reader:=bufio.NewReaderSize(c.socket,MaxBytes+2)
	authBytes,err:=ReadLine(reader)
	if err!=nil{return}
	auth,_:=Decode(authBytes)
	if Int(auth,"v")!=1 || String(auth,"kind")!="auth" ||
		!CredentialValid(String(auth,"credential")) ||
		subtle.ConstantTimeCompare([]byte(String(auth,"credential")),[]byte(h.cfg.ClientCredential))!=1{
		return
	}
	h.mu.Lock();ready:=h.ready;dev:=h.localDev;h.mu.Unlock()
	if err=h.sendLocal(c,MustEncode(map[string]any{
		"v":1,"kind":"authenticated","browserReady":ready,
		"localDevVersion":func()int{if dev{return 1};return 0}(),
	}));err!=nil{return}
	_ = c.socket.SetReadDeadline(time.Now().Add(10*time.Second))
	payload,err:=ReadLine(reader)
	if err!=nil{return}
	f,err:=Decode(payload);if err!=nil{return}
	if Int(f,"v")!=1{return}
	if String(f,"kind")=="provider.register"{
		h.mu.Lock()
		ready=h.ready;dev=h.localDev
		conflict:=h.provider!=nil
		if ready && dev && !conflict && RequestIDValid(String(f,"providerId")){
			c.providerEpoch,_=NewID()
			h.provider=c
		}
		h.mu.Unlock()
		if c.providerEpoch==""{
			if conflict{_ = h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"provider.rejected",
				"error":map[string]any{"code":"E_DEV_PROVIDER_CONFLICT","message":"Another local provider owns the connection"}}))}
			return
		}
		if err=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"provider.registered",
			"providerId":String(f,"providerId"),"providerEpoch":c.providerEpoch}));err!=nil{return}
		h.providerState()
		_ = c.socket.SetReadDeadline(time.Time{})
		for {
			raw,err:=ReadLine(reader)
			if err!=nil{return}
			reply,err:=Decode(raw);if err!=nil{return}
			if Int(reply,"v")!=1 || String(reply,"providerEpoch")!=c.providerEpoch{return}
			switch String(reply,"kind"){
			case "provider.changed":
				h.providerState()
			case "dev.response":
				if !RequestIDValid(String(reply,"requestId")) || Has(reply,"result")==Has(reply,"error"){return}
				id:=String(reply,"requestId")
				h.mu.Lock()
				entry,ok:=h.devPending[id]
				if ok && entry.epoch==c.providerEpoch {
					entry.timer.Stop();delete(h.devPending,id)
				}
				h.mu.Unlock()
				if ok && entry.epoch==c.providerEpoch{_ = h.sendChrome(raw)}
			default:return
			}
		}
	}
	if err=ValidateRequest(f);err!=nil{return}
	id:=String(f,"requestId")
	h.mu.Lock()
	if !h.ready{h.mu.Unlock();h.localError(c,id,"E_NATIVE_NOT_READY","NOT_DISPATCHED");return}
	if len(h.pending)+len(h.devPending)>=MaxInflight{h.mu.Unlock();h.localError(c,id,"E_LIMIT","NOT_DISPATCHED");return}
	if _,exists:=h.pending[id];exists{h.mu.Unlock();h.localError(c,id,"E_REQUEST_CONFLICT","NOT_DISPATCHED");return}
	entry:=&pendingCall{answer:make(chan []byte,1)}
	h.pending[id]=entry
	h.mu.Unlock()
	// Pending IDs remain fenced even if the caller closes its socket.
	if err=h.sendChrome(payload);err!=nil{
		h.mu.Lock();delete(h.pending,id);h.mu.Unlock()
		h.localError(c,id,"E_EFFECT_UNKNOWN","OUTCOME_UNKNOWN")
		return
	}
	select{
	case answer:=<-entry.answer:
		_ = h.sendLocal(c,answer)
	case <-time.After(nativeTimeout):
		h.mu.Lock()
		if current,ok:=h.pending[id];ok && current==entry{delete(h.pending,id)}
		h.mu.Unlock()
		h.localError(c,id,"E_EFFECT_UNKNOWN","OUTCOME_UNKNOWN")
	case <-h.done:
		h.localError(c,id,"E_EFFECT_UNKNOWN","OUTCOME_UNKNOWN")
	}
}
func (h *Host) handleChrome(raw []byte) error {
	f,err:=Decode(raw);if err!=nil{return err}
	h.mu.Lock();ready:=h.ready;h.mu.Unlock()
	if !ready {
		if Int(f,"v")!=1 || String(f,"kind")!="welcome" ||
			String(f,"extensionId")!=h.cfg.ExtensionID ||
			String(f,"extensionVersion")==""{return errors.New("E_NATIVE_HANDSHAKE")}
		h.mu.Lock();h.ready=true;h.localDev=Int(f,"localDevVersion")==1;h.mu.Unlock()
		return nil
	}
	if Int(f,"v")!=1{return ErrSchema}
	switch String(f,"kind"){
	case "response":
		if err=ValidateResponse(f);err!=nil{return err}
		id:=String(f,"requestId")
		h.mu.Lock();entry:=h.pending[id];delete(h.pending,id);h.mu.Unlock()
		if entry!=nil{select{case entry.answer<-raw:default:}}
		return nil
	case "dev.request":
		if err=ValidateDevRequest(f);err!=nil{return err}
		id:=String(f,"requestId");epoch:=String(f,"providerEpoch")
		h.mu.Lock()
		provider:=h.provider
		if provider==nil || provider.providerEpoch!=epoch{
			h.mu.Unlock();h.devError(id,epoch,"E_DEV_DISCONNECTED");return nil
		}
		if len(h.devPending)>=4 || len(h.pending)+len(h.devPending)>=MaxInflight{
			h.mu.Unlock();h.devError(id,epoch,"E_LIMIT");return nil
		}
		if _,exists:=h.devPending[id];exists{
			h.mu.Unlock();h.devError(id,epoch,"E_LIMIT");return nil
		}
		entry:=&pendingDev{epoch:epoch}
		entry.timer=time.AfterFunc(devTimeout,func(){
			h.mu.Lock();current:=h.devPending[id]
			if current==entry{delete(h.devPending,id)}
			h.mu.Unlock()
			if current==entry{h.devError(id,epoch,"E_DEV_TIMEOUT")}
		})
		h.devPending[id]=entry
		h.mu.Unlock()
		if err=h.sendLocal(provider,raw);err!=nil{provider.socket.Close()}
		return nil
	default:return ErrSchema
	}
}
// Run is entered only from the explicit Chrome-launched browser native-host
// command. No Desktop, MCP, Scheduler, HTTP or script initialization occurs here.
func (h *Host) Run() error {
	if h.cfg.Provider!="opendesk" {return errors.New("E_MIGRATION_REQUIRED")}
	if err:=h.startSocket();err!=nil{return err}
	defer h.Close()
	if err:=h.sendChrome(MustEncode(map[string]any{"v":1,"kind":"hello"}));err!=nil{return err}
	timer:=time.AfterFunc(handshakeTimeout,func(){h.mu.Lock();ready:=h.ready;h.mu.Unlock();if !ready{h.Close()}})
	defer timer.Stop()
	for {
		raw,err:=ReadFrame(h.input)
		if err!=nil{
			if errors.Is(err,io.EOF) || errors.Is(err,io.ErrClosedPipe){
				return nil
			}
			select{case <-h.done:return nil;default:return fmt.Errorf("E_NATIVE_PROTOCOL: %w",err)}
		}
		if err=h.handleChrome(raw);err!=nil{return err}
	}
}
