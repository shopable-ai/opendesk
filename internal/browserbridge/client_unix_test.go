//go:build darwin || linux

package browserbridge

import (
    "bufio"
    "context"
    "encoding/json"
    "errors"
    "net"
    "os"
    "path/filepath"
    "testing"
    "time"
)

// An exact fake LOCAL Go/Node-compatible IPC server; it never grants a real
// Browser permission or triggers an actual Controller action.
func TestMismatchedDispatchedReplyIsUnknownNotRetryable(t *testing.T) {
    home,err:=os.MkdirTemp("/tmp","od-clt-")
    if err!=nil{t.Fatal(err)}
    t.Cleanup(func(){_ = os.RemoveAll(home)})
    if err=os.Chmod(home,0700);err!=nil{t.Fatal(err)}
    t.Setenv("HOME",home)
    binary,err:=os.Executable()
    if err!=nil{t.Fatal(err)}
    _,err=Setup(testExtensionID,"chrome","",binary)
    if err!=nil{t.Fatal(err)}
    cfg,err:=Load()
    if err!=nil{t.Fatal(err)}
    ln,err:=net.ListenUnix("unix",&net.UnixAddr{Name:cfg.SocketPath,Net:"unix"})
    if err!=nil{t.Fatal(err)}
    ln.SetUnlinkOnClose(true)
    t.Cleanup(func(){_ = ln.Close()})
    dispatched:=make(chan string,1)
    serveError:=make(chan error,1)
    go func(){
        conn,err:=ln.AcceptUnix()
        if err!=nil{serveError<-err;return}
        defer conn.Close()
        _=conn.SetDeadline(time.Now().Add(4*time.Second))
        rd:=bufio.NewReaderSize(conn,MaxBytes+2)
        raw,err:=ReadLine(rd)
        if err!=nil{serveError<-err;return}
        auth,_:=Decode(raw)
        if String(auth,"kind")!="auth"||String(auth,"credential")!=cfg.ClientCredential{
            serveError<-ErrSchema;return
        }
        if err=WriteLine(conn,MustEncode(map[string]any{"v":1,"kind":"authenticated","browserReady":true}));err!=nil{
            serveError<-err;return
        }
        raw,err=ReadLine(rd)
        if err!=nil{serveError<-err;return}
        req,_:=Decode(raw)
        if err=ValidateRequest(req);err!=nil{serveError<-err;return}
        dispatched<-String(req,"requestId")
        // Simulates corrupted/misdirected ACK after mutation admission.
        // There must be no ambiguity: the old run needs read-only recovery.
        if err=WriteLine(conn,MustEncode(map[string]any{
            "v":1,"kind":"response","requestId":"wrong-ack-id",
            "result":map[string]any{"runId":"run-not-trusted"},
        }));err!=nil{serveError<-err;return}
        serveError<-nil
    }()
    raw,err:=Call(context.Background(),"run.start",json.RawMessage("{}"),"original-mutation-id",4*time.Second)
    if len(raw)!=0{t.Fatalf("mismatched ACK should not expose success: %s",raw)}
    var problem *CallError
    if !errors.As(err,&problem) || problem.Code!="E_EFFECT_UNKNOWN" || problem.Outcome!="OUTCOME_UNKNOWN"{
        t.Fatalf("unexpected retryable error for possibly dispatched mutation: %v",err)
    }
    select {
    case id:=<-dispatched:
        if id!="original-mutation-id"{t.Fatalf("requestId changed during dispatch: %s",id)}
    case <-time.After(time.Second):t.Fatal("original mutation was not dispatched")
    }
    select {
    case err:=<-serveError:if err!=nil{t.Fatal(err)}
    case <-time.After(time.Second):t.Fatal("server did not finish")
    }
    // An existing installation must remain untouched and readable.
    if cfg2,err:=Load();err!=nil||cfg2.SocketPath!=filepath.Join(home,".opendesk-browser","native-agent-r1","agent.sock"){
        t.Fatalf("transport mutated installation: %v",err)
    }
}
