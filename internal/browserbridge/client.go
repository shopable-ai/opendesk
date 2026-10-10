package browserbridge

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net"
	"time"
)

func NewID() (string,error) {
	var b [16]byte
	if _,err:=rand.Read(b[:]);err!=nil{return "",err}
	b[6]=(b[6]&0x0f)|0x40
	b[8]=(b[8]&0x3f)|0x80
	s:=hex.EncodeToString(b[:])
	return s[:8]+"-"+s[8:12]+"-"+s[12:16]+"-"+s[16:20]+"-"+s[20:],nil
}
type CallError struct {
	Code string
	Outcome string
}
func (e *CallError) Error() string {return e.Code}
func callError(sent bool) error {
	if sent {return &CallError{Code:"E_EFFECT_UNKNOWN",Outcome:"OUTCOME_UNKNOWN"}}
	return &CallError{Code:"E_NATIVE_NOT_READY",Outcome:"NOT_DISPATCHED"}
}
// Call is intentionally one request per local socket with NO reconnect/replay.
// It preserves source JSON as RawMessage; the extension owns effect admission,
// target permissions, Controller execution and the durable request ledger.
func Call(ctx context.Context,method string,params json.RawMessage,requestID string,timeout time.Duration) ([]byte,error) {
	if !supportedMethods[method] || !RequestIDValid(requestID) {return nil,ErrSchema}
	if _,err:=Decode(params);err!=nil{return nil,ErrSchema}
	cfg,err:=Load();if err!=nil{return nil,err}
	if timeout<=0{timeout=145*time.Second}
	deadline:=time.Now().Add(timeout)
	dialer:=net.Dialer{Timeout:3*time.Second}
	conn,err:=dialer.DialContext(ctx,"unix",cfg.SocketPath)
	if err!=nil{return nil,callError(false)}
	defer conn.Close()
	if err=conn.SetDeadline(deadline);err!=nil{return nil,callError(false)}
	if err=WriteLine(conn,MustEncode(map[string]any{"v":Version,"kind":"auth","credential":cfg.ClientCredential}));err!=nil{
		return nil,callError(false)
	}
	reader:=bufio.NewReaderSize(conn,MaxBytes+2)
	authBytes,err:=ReadLine(reader)
	if err!=nil{return nil,callError(false)}
	auth,err:=Decode(authBytes)
	if err!=nil || Int(auth,"v")!=Version || String(auth,"kind")!="authenticated" {
		return nil,&CallError{Code:"E_AUTH",Outcome:"NOT_DISPATCHED"}
	}
	if !Bool(auth,"browserReady"){return nil,callError(false)}
	id,err:=json.Marshal(requestID);if err!=nil{return nil,err}
	methodJSON,_:=json.Marshal(method)
	// Stitch only the already-validated raw params. Never decode and
	// re-encode a user source string or large numeric literal.
	request:=[]byte("{\"v\":1,\"kind\":\"request\",\"requestId\":")
	request=append(request,id...)
	request=append(request,[]byte(",\"method\":")...)
	request=append(request,methodJSON...)
	request=append(request,[]byte(",\"params\":")...)
	request=append(request,params...)
	request=append(request,'}')
	if _,err=Decode(request);err!=nil{return nil,err}
	// Once the first byte may have entered the socket, outcome is unknown.
	sent:=true
	if err=WriteLine(conn,request);err!=nil{return nil,callError(sent)}
	reply,err:=ReadLine(reader)
	if err!=nil{return nil,callError(sent)}
	f,err:=Decode(reply)
	if err!=nil{return nil,callError(sent)}
	if err=ValidateResponse(f);err!=nil || String(f,"requestId")!=requestID {
		// Request may have reached the browser and executed a mutation; never
		// downgrade an invalid or mismatched reply to retryable schema failure.
		return nil,callError(sent)
	}
	return reply,nil
}
