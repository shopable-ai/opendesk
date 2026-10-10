//go:build darwin || linux

package browserbridge

import (
    "bufio"
    "encoding/json"
    "io"
    "net"
    "os"
    "path/filepath"
    "strings"
    "testing"
    "time"
)

type r17Wire struct {
    conn *net.UnixConn
    read *bufio.Reader
}
func r17Local(t *testing.T, cfg Installation) *r17Wire {
    t.Helper()
    conn,err:=net.DialUnix("unix",nil,&net.UnixAddr{Name:cfg.SocketPath,Net:"unix"})
    if err!=nil{t.Fatal(err)}
    t.Cleanup(func(){_ = conn.Close()})
    if err=conn.SetDeadline(time.Now().Add(5*time.Second));err!=nil{t.Fatal(err)}
    reader:=bufio.NewReaderSize(conn,MaxBytes+2)
    if err=WriteLine(conn,MustEncode(map[string]any{"v":1,"kind":"auth",
        "credential":cfg.ClientCredential}));err!=nil{t.Fatal(err)}
    raw,err:=ReadLine(reader)
    if err!=nil{t.Fatal(err)}
    reply,_:=Decode(raw)
    if String(reply,"kind")!="authenticated"||!Bool(reply,"browserReady")||
        Int(reply,"localDevMultiVersion")!=1||Int(reply,"localFilesVersion")!=FilesVersion{
        t.Fatalf("Host did not negotiate R17: %+v",reply)
    }
    return &r17Wire{conn,reader}
}
func (w *r17Wire) send(t *testing.T, row any) {
    t.Helper()
    if err:=WriteLine(w.conn,MustEncode(row));err!=nil{t.Fatal(err)}
}
func (w *r17Wire) next(t *testing.T) Fields {
    t.Helper()
    raw,err:=ReadLine(w.read)
    if err!=nil{t.Fatal(err)}
    fields,err:=Decode(raw)
    if err!=nil{t.Fatal(err)}
    return fields
}
func r17Attach(t *testing.T, cfg Installation, dir string) (*r17Wire,Fields) {
    t.Helper()
    c:=r17Local(t,cfg)
    c.send(t,map[string]any{"v":1,"kind":"dev.attach","path":dir})
    row:=c.next(t)
    if String(row,"kind")!="dev.attached"||String(row,"workspaceId")==""||
        String(row,"sourceId")==""{
        t.Fatalf("directory attach failed: %+v",row)
    }
    return c,row
}
func r17Provider(t *testing.T, cfg Installation, lease Fields, letter string) (*r17Wire,string) {
    t.Helper()
    c:=r17Local(t,cfg)
    rawID:="local-"+strings.Repeat(letter,20)
    c.send(t,map[string]any{"v":1,"kind":"provider.register","providerId":"provider-"+letter,
        "catalogVersion":2,"leaseId":String(lease,"leaseId"),
        "projects":[]map[string]any{{"bindingId":rawID,"name":"同名目录","runtimeKind":"controller"}}})
    reply:=c.next(t)
    if String(reply,"kind")!="provider.registered"||!RequestIDValid(String(reply,"providerEpoch")){
        t.Fatalf("provider registration failed: %+v",reply)
    }
    return c,String(reply,"providerEpoch")
}
func TestR17HostConcurrentDirectoriesAndScopedResolver(t *testing.T) {
    home,_:=projectFixture(t)
    cfg,err:=Load()
    if err!=nil{t.Fatal(err)}
    // This test exercises real Unix sockets, authenticated Native framing,
    // two live Node-like providers, the Browser-facing aggregate and lease exit.
    chromeRead,chromeWrite:=io.Pipe()
    browserRead,browserWrite:=io.Pipe()
    host,err:=NewHost(cfg,"chrome-extension://"+cfg.ExtensionID+"/",chromeRead,browserWrite)
    if err!=nil{t.Fatal(err)}
    finished:=make(chan error,1)
    go func(){finished<-host.Run()}()
    t.Cleanup(func(){
        host.Close();_ = chromeWrite.Close();_ = browserRead.Close();_ = browserWrite.Close()
        select{case <-finished:case <-time.After(2*time.Second):t.Error("R17 Host failed to exit")}
    })
    frames:=make(chan Fields,64)
    ioErrors:=make(chan error,1)
    go func(){
        for {
            data,readErr:=ReadFrame(browserRead)
            if readErr!=nil{ioErrors<-readErr;return}
            frame,decodeErr:=Decode(data)
            if decodeErr!=nil{ioErrors<-decodeErr;return}
            frames<-frame
        }
    }()
    next:=func(kind string) Fields{
        t.Helper()
        timer:=time.NewTimer(5*time.Second);defer timer.Stop()
        for {
            select{
            case frame:=<-frames:
                if String(frame,"kind")==kind{return frame}
            case err:=<-ioErrors:
                t.Fatalf("Chrome Native framing terminated while waiting for %s: %v",kind,err)
            case <-timer.C:
                t.Fatalf("Chrome Native %s timed out",kind)
            }
        }
    }
    if Int(next("hello"),"localDevMultiVersion")!=1{
        t.Fatal("Host did not advertise R17 capability")
    }
    if err=WriteFrame(chromeWrite,MustEncode(map[string]any{"v":1,"kind":"welcome",
        "extensionId":cfg.ExtensionID,"extensionVersion":"0.1.0",
        "localDevVersion":1,"localDevMultiVersion":1,"localFilesVersion":FilesVersion}));err!=nil{
        t.Fatal(err)
    }
    _=next("files.state")
    for _,name:=range []string{"one","two"} {
        dir:=filepath.Join(home,name,"同名目录")
        if err=os.MkdirAll(dir,0700);err!=nil{t.Fatal(err)}
        if err=os.WriteFile(filepath.Join(dir,"README.md"),[]byte("# "+name),0600);err!=nil{t.Fatal(err)}
    }
    aPath:=filepath.Join(home,"one","同名目录")
    bPath:=filepath.Join(home,"two","同名目录")
    a,aLease:=r17Attach(t,cfg,aPath)
    _=next("files.state")
    b,bLease:=r17Attach(t,cfg,bPath)
    _=next("files.state")
    if String(aLease,"sourceId")==String(bLease,"sourceId")||
        String(aLease,"workspaceId")==String(bLease,"workspaceId"){
        t.Fatal("same-name folders received identical authority")
    }
    ap,apEpoch:=r17Provider(t,cfg,aLease,"a")
    first:=next("dev.state")
    if !Bool(first,"connected"){t.Fatalf("provider A is offline: %+v",first)}
    // An authenticated second process still may not take over the lease
    // belonging to A. Its provider ID and catalog cannot override A's data.
    attacker:=r17Local(t,cfg)
    attacker.send(t,map[string]any{"v":1,"kind":"provider.register",
        "providerId":"forged-second-a","catalogVersion":2,
        "leaseId":String(aLease,"leaseId"),
        "projects":[]map[string]any{{"bindingId":"local-"+strings.Repeat("f",20),
            "name":"伪造目录","runtimeKind":"controller"}}})
    blocked:=attacker.next(t)
    if String(blocked,"kind")!="provider.rejected" {
        t.Fatalf("duplicate provider acquired same directory lease: %+v",blocked)
    }
    rejected,_:=Decode(blocked["error"])
    if String(rejected,"code")!="E_DEV_PROVIDER_CONFLICT"{
        t.Fatalf("wrong duplicate-provider diagnostic: %+v",blocked)
    }
    _=attacker.conn.Close()
    bp,bpEpoch:=r17Provider(t,cfg,bLease,"b")
    second:=next("dev.state")
    epoch:=String(second,"providerEpoch")
    if epoch==String(first,"providerEpoch")||!Bool(second,"connected"){
        t.Fatalf("aggregate epoch was not rotated on B: %+v",second)
    }
    // Second CLI from same directory does not acquire a second lease.
    duplicate,repeat:=r17Attach(t,cfg,aPath)
    if !Bool(repeat,"alreadyActive")||String(repeat,"leaseId")!=""{
        t.Fatalf("repeat launch acquired source ownership: %+v",repeat)
    }
    _=duplicate.conn.Close()
    list:=func(whichEpoch,requestID string) []struct{BindingID,Name,SourceID,WorkspaceID string}{
        t.Helper()
        if err=WriteFrame(chromeWrite,MustEncode(map[string]any{"v":1,"kind":"dev.request",
            "requestId":requestID,"providerEpoch":whichEpoch,"method":"projects.list",
            "params":map[string]any{}}));err!=nil{t.Fatal(err)}
        result:=next("dev.response")
        if Has(result,"error")||String(result,"requestId")!=requestID {
            t.Fatalf("aggregated project list error: %+v",result)
        }
        var rows struct{Projects []struct{BindingID,Name,SourceID,WorkspaceID string}}
        if err=json.Unmarshal(result["result"],&rows);err!=nil{t.Fatal(err)}
        return rows.Projects
    }
    rows:=list(epoch,"r17-list-ab")
    if len(rows)!=2||rows[0].BindingID==rows[1].BindingID{
        t.Fatalf("sources not separately listed: %+v",rows)
    }
    bySource:=map[string]string{}
    for _,row:=range rows{
        bySource[row.SourceID]=row.BindingID
        if row.Name!="同名目录" {t.Fatalf("unexpected name: %+v",row)}
    }
    aid:=bySource[String(aLease,"sourceId")]
    bid:=bySource[String(bLease,"sourceId")]
    if aid==""||bid==""||aid==bid{t.Fatalf("cross-source identity: %+v",rows)}
    if err=WriteFrame(chromeWrite,MustEncode(map[string]any{"v":1,"kind":"dev.request",
        "requestId":"r17-resolve-a","providerEpoch":epoch,"method":"project.resolve",
        "params":map[string]any{"bindingId":aid}}));err!=nil{t.Fatal(err)}
    aReq:=ap.next(t)
    if String(aReq,"requestId")!="r17-resolve-a"||
        String(aReq,"providerEpoch")!=apEpoch{t.Fatalf("A routed incorrectly: %+v",aReq)}
    bparams,_:=Decode(aReq["params"])
    if String(bparams,"bindingId")!="local-"+strings.Repeat("a",20){t.Fatal("raw resolver ID changed")}
    // Provider B cannot forge an ACK for an in-flight request owned by A.
    bp.send(t,map[string]any{"v":1,"kind":"dev.response",
        "requestId":"r17-resolve-a","providerEpoch":bpEpoch,
        "result":map[string]any{"bindingId":"local-"+strings.Repeat("b",20),"sourceUtf8":"FORGED"}})
    ap.send(t,map[string]any{"v":1,"kind":"dev.response",
        "requestId":"r17-resolve-a","providerEpoch":apEpoch,
        "result":map[string]any{"bindingId":"local-"+strings.Repeat("a",20),"sourceUtf8":"A"}})
    reply:=next("dev.response")
    if String(reply,"requestId")!="r17-resolve-a"||String(reply,"providerEpoch")!=epoch||
        !Has(reply,"result"){t.Fatalf("A response was not delivered correctly: %+v",reply)}
    var resolved struct{BindingID,SourceUtf8 string}
    if err=json.Unmarshal(reply["result"],&resolved);err!=nil{t.Fatal(err)}
    if resolved.BindingID!=aid||resolved.SourceUtf8!="A" {t.Fatalf("forged response escaped: %+v",resolved)}
    // Closing A only retires A. B retains the exact provider and directory.
    _=a.conn.Close()
    // The Native port sends file and provider state on independent
    // goroutines. They may arrive in either order; assert both without
    // consuming the other message while filtering by kind.
    var after Fields
    sawFiles:=false
    fenceTimeout:=time.NewTimer(5*time.Second)
    defer fenceTimeout.Stop()
    for !sawFiles||after==nil {
        select{
        case frame:=<-frames:
            if String(frame,"kind")=="files.state"{sawFiles=true}
            if String(frame,"kind")=="dev.state"&&Bool(frame,"connected")&&
                String(frame,"providerEpoch")!=epoch {after=frame}
        case <-fenceTimeout.C:
            t.Fatal("Host failed to publish both file and provider lifecycle changes")
        }
    }
    laterEpoch:=String(after,"providerEpoch")
    if !Bool(after,"connected")||laterEpoch==epoch{
        t.Fatalf("B disappeared or epoch was not fenced after A exit: %+v",after)
    }
    remaining:=list(laterEpoch,"r17-list-b")
    if len(remaining)!=1||remaining[0].BindingID!=bid{
        t.Fatalf("A exit stole B source: %+v",remaining)
    }
    if err=WriteFrame(chromeWrite,MustEncode(map[string]any{"v":1,"kind":"dev.request",
        "requestId":"r17-resolve-b","providerEpoch":laterEpoch,"method":"project.resolve",
        "params":map[string]any{"bindingId":bid}}));err!=nil{t.Fatal(err)}
    bReq:=bp.next(t)
    if String(bReq,"requestId")!="r17-resolve-b"||String(bReq,"providerEpoch")!=bpEpoch{
        t.Fatalf("B provider was reassigned: %+v",bReq)
    }
    bp.send(t,map[string]any{"v":1,"kind":"dev.response","requestId":"r17-resolve-b",
        "providerEpoch":bpEpoch,"result":map[string]any{
            "bindingId":"local-"+strings.Repeat("b",20),"sourceUtf8":"B"}})
    reply=next("dev.response")
    if !Has(reply,"result"){t.Fatalf("B stopped responding: %+v",reply)}
    _=b.conn.Close()
}
