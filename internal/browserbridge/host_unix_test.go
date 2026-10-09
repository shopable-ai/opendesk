//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"bytes"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testExtensionID="abcdefghijklmnopabcdefghijklmnop"
func testHost(t *testing.T) (*Host,*io.PipeWriter,*io.PipeReader,string) {
	t.Helper()
	root:=t.TempDir()
	socket:=filepath.Join(root,"agent.sock")
	cfg:=Installation{Name:HostName,ExtensionID:testExtensionID,ClientCredential:strings.Repeat("a",64),
		InstallRoot:root,SocketPath:socket,Provider:"opendesk"}
	input,extensionWrite:=io.Pipe()
	extensionRead,output:=io.Pipe()
	host,err:=NewHost(cfg,"chrome-extension://"+testExtensionID+"/",input,output)
	if err!=nil{t.Fatal(err)}
	done:=make(chan error,1)
	go func(){
		err:=host.Run()
		if err!=nil{_ = output.CloseWithError(err)} else {_ = output.Close()}
		done<-err
	}()
	t.Cleanup(func(){
		host.Close();extensionWrite.Close();extensionRead.Close();output.Close()
		select{case <-done:case <-time.After(time.Second):t.Error("host failed to exit")}
	})
	type firstResult struct{raw []byte;err error}
	first:=make(chan firstResult,1)
	go func(){raw,err:=ReadFrame(extensionRead);first<-firstResult{raw,err}}()
	var raw []byte
	select{
	case frame:=<-first:
		if frame.err!=nil{t.Fatalf("native host failed before hello: %v",frame.err)}
		raw=frame.raw
	case <-time.After(5*time.Second):
		t.Fatal("native host never sent hello")
	}
	var err error
	f,_:=Decode(raw)
	if String(f,"kind")!="hello"{t.Fatalf("initial frame %s",raw)}
	return host,extensionWrite,extensionRead,socket
}
func welcome(t *testing.T,h *Host,w *io.PipeWriter,dev bool) {
	t.Helper()
	version:=0;if dev{version=1}
	if err:=WriteFrame(w,MustEncode(map[string]any{
		"v":1,"kind":"welcome","extensionId":testExtensionID,
		"extensionVersion":"0.1.0","localDevVersion":version,
	}));err!=nil{t.Fatal(err)}
	end:=time.Now().Add(time.Second)
	for time.Now().Before(end){
		h.mu.Lock();ready:=h.ready;h.mu.Unlock()
		if ready{return}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("welcome not processed")
}
func local(t *testing.T,socket string) (*net.UnixConn,*bufio.Reader) {
	t.Helper()
	conn,err:=net.DialUnix("unix",nil,&net.UnixAddr{Name:socket,Net:"unix"})
	if err!=nil{t.Fatal(err)}
	t.Cleanup(func(){conn.Close()})
	_ = conn.SetDeadline(time.Now().Add(3*time.Second))
	reader:=bufio.NewReaderSize(conn,MaxBytes+2)
	if err=WriteLine(conn,MustEncode(map[string]any{"v":1,"kind":"auth","credential":strings.Repeat("a",64)}));err!=nil{t.Fatal(err)}
	resp,err:=ReadLine(reader);if err!=nil{t.Fatal(err)}
	fields,_:=Decode(resp)
	if String(fields,"kind")!="authenticated"{t.Fatalf("auth: %s",resp)}
	return conn,reader
}
func TestHostChromeCLIBridgeAndUnknownIdentity(t *testing.T) {
	h,w,r,socket:=testHost(t)
	welcome(t,h,w,false)
	conn,reader:=local(t,socket)
	req:=MustEncode(map[string]any{"v":1,"kind":"request","requestId":"go-bridge-one",
		"method":"target.current","params":map[string]any{}})
	if err:=WriteLine(conn,req);err!=nil{t.Fatal(err)}
	forward,err:=ReadFrame(r)
	if err!=nil || !bytes.Equal(forward,req){t.Fatalf("forward: %v %s",err,forward)}
	reply:=MustEncode(map[string]any{"v":1,"kind":"response","requestId":"go-bridge-one",
		"result":map[string]any{"title":"日本語","revision":123456789}})
	if err=WriteFrame(w,reply);err!=nil{t.Fatal(err)}
	got,err:=ReadLine(reader)
	if err!=nil || !bytes.Equal(got,reply){t.Fatalf("reply: %v %s",err,got)}
	// Another identity cannot turn the host into a separate browser executor.
	_,err=NewHost(h.cfg,"chrome-extension://"+strings.Repeat("b",32)+"/",strings.NewReader(""),io.Discard)
	if err==nil{t.Fatal("wrong origin accepted")}
}
func TestProviderReverseRequestsAndDisconnect(t *testing.T) {
	h,w,r,socket:=testHost(t)
	welcome(t,h,w,true)
	conn,reader:=local(t,socket)
	if err:=WriteLine(conn,MustEncode(map[string]any{"v":1,"kind":"provider.register","providerId":"provider-a"}));err!=nil{t.Fatal(err)}
	registered,err:=ReadLine(reader)
	if err!=nil{t.Fatal(err)}
	fields,_:=Decode(registered);epoch:=String(fields,"providerEpoch")
	if String(fields,"kind")!="provider.registered" || !RequestIDValid(epoch){t.Fatalf("provider: %s",registered)}
	state,err:=ReadFrame(r)
	if err!=nil{t.Fatal(err)}
	sf,_:=Decode(state)
	if String(sf,"kind")!="dev.state" || !Bool(sf,"connected"){t.Fatalf("state: %s",state)}
	request:=MustEncode(map[string]any{"v":1,"kind":"dev.request","requestId":"local-project-1",
		"providerEpoch":epoch,"method":"projects.list","params":map[string]any{}})
	if err=WriteFrame(w,request);err!=nil{t.Fatal(err)}
	forward,err:=ReadLine(reader)
	if err!=nil || !bytes.Equal(forward,request){t.Fatalf("project: %v %s",err,forward)}
	reply:=MustEncode(map[string]any{"v":1,"kind":"dev.response","requestId":"local-project-1",
		"providerEpoch":epoch,"result":map[string]any{"projects":[]string{"one"}}})
	if err=WriteLine(conn,reply);err!=nil{t.Fatal(err)}
	got,err:=ReadFrame(r)
	if err!=nil || !bytes.Equal(got,reply){t.Fatalf("dev response: %v %s",err,got)}
	conn.Close()
	state,err=ReadFrame(r)
	if err!=nil{t.Fatal(err)}
	sf,_=Decode(state)
	if String(sf,"kind")!="dev.state" || Bool(sf,"connected"){t.Fatalf("disconnect: %s",state)}
}
func TestHostNeverDeletesExistingSocket(t *testing.T) {
	root:=t.TempDir()
	socket:=filepath.Join(root,"agent.sock")
	if err:=os.WriteFile(socket,[]byte("preserve"),0600);err!=nil{t.Fatal(err)}
	cfg:=Installation{Name:HostName,ExtensionID:testExtensionID,ClientCredential:strings.Repeat("a",64),
		InstallRoot:root,SocketPath:socket,Provider:"opendesk"}
	host,err:=NewHost(cfg,"chrome-extension://"+testExtensionID+"/",strings.NewReader(""),io.Discard)
	if err!=nil{t.Fatal(err)}
	if err=host.Run();err==nil || err.Error()!="E_SOCKET_IN_USE"{t.Fatalf("expected conflict, got %v",err)}
	raw,_:=os.ReadFile(socket)
	if string(raw)!="preserve"{t.Fatalf("destroyed other inode %s",raw)}
}
