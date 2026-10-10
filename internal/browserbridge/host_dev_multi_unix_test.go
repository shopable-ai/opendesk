//go:build darwin || linux

package browserbridge

import (
    "bufio"
    "bytes"
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
        Int(reply,"localDevMultiVersion")!=1||Int(reply,"localDevAccessVersion")!=1||Int(reply,"localFilesVersion")!=FilesVersion{
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
func r17Attach(t *testing.T, cfg Installation, dir string, access ...string) (*r17Wire,Fields) {
    t.Helper()
    c:=r17Local(t,cfg)
    request:=map[string]any{"v":1,"kind":"dev.attach","path":dir}
    if len(access)>0{request["access"]=access[0]}
    c.send(t,request)
    row:=c.next(t)
    if String(row,"kind")!="dev.attached"||String(row,"workspaceId")==""||
        String(row,"sourceId")==""||!RequestIDValid(String(row,"leaseEpoch"))||
        String(row,"leaseEpoch")==String(row,"leaseId"){
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
    home,singleFile:=projectFixture(t)
    goGrant,err:=ProjectAdd(singleFile,"controller","async-main","https://example.test")
    if err!=nil{t.Fatal(err)}
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
            case err:=<-finished:
                finished<-err // Cleanup still observes the completed Host.
                t.Fatalf("Native Host stopped before %s: %v",kind,err)
            case <-timer.C:
                t.Fatalf("Chrome Native %s timed out",kind)
            }
        }
    }
    hello:=next("hello")
    if Int(hello,"localDevMultiVersion")!=1||Int(hello,"localDevAccessVersion")!=1{
        t.Fatal("Host did not advertise R17 capability")
    }
    if err=WriteFrame(chromeWrite,MustEncode(map[string]any{"v":1,"kind":"welcome",
        "extensionId":cfg.ExtensionID,"extensionVersion":"0.1.0",
        "localDevVersion":1,"localDevMultiVersion":1,"localDevAccessVersion":1,"localFilesVersion":FilesVersion}));err!=nil{
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
    a,aLease:=r17Attach(t,cfg,aPath,"read-write")
    _=next("files.state")
    b,bLease:=r17Attach(t,cfg,bPath,"read-write")
    _=next("files.state")
    if String(aLease,"sourceId")==String(bLease,"sourceId")||
        String(aLease,"workspaceId")==String(bLease,"workspaceId")||
        String(aLease,"access")!="read-write"||String(bLease,"access")!="read-write"{
        t.Fatal("same-name folders received identical authority")
    }
    nativeFilesCall:=func(method string,params map[string]any) Fields {
        t.Helper()
        id,err:=NewID();if err!=nil{t.Fatal(err)}
        if err=WriteFrame(chromeWrite,MustEncode(map[string]any{"v":1,"kind":"files.request",
            "protocol":FilesProtocol,"requestId":id,"sessionId":host.files.sessionID,
            "method":method,"params":params}));err!=nil{t.Fatal(err)}
        reply:=next("files.response")
        if String(reply,"requestId")!=id||Has(reply,"error"){t.Fatalf("Native files dispatch: %+v",reply)}
        result,err:=Decode(reply["result"]);if err!=nil{t.Fatal(err)}
        return result
    }
    for i,lease:=range []Fields{aLease,bLease} {
        read:=nativeFilesCall("files.read",map[string]any{"workspaceId":String(lease,"workspaceId"),
            "leaseEpoch":String(lease,"leaseEpoch"),"path":"README.md"})
        expected:="# "+[]string{"one","two"}[i]
        if String(read,"content")!=expected{t.Fatal("Native read crossed directories")}
        content:=expected+"\nwritten-through-native"
        saved:=nativeFilesCall("files.write",map[string]any{"workspaceId":String(lease,"workspaceId"),
            "leaseEpoch":String(lease,"leaseEpoch"),"path":"README.md","content":content,"expectedSha256":String(read,"sha256")})
        disk,err:=os.ReadFile(filepath.Join([]string{aPath,bPath}[i],"README.md"))
        if err!=nil||string(disk)!=content||String(saved,"sha256")!=textHash(string(disk))||!Bool(saved,"saved") {
            t.Fatalf("Native save receipt was not proved by independent disk read: %v %v",saved,err)
        }
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
    duplicate,repeat:=r17Attach(t,cfg,aPath,"read-write")
    if !Bool(repeat,"alreadyActive")||String(repeat,"leaseId")!=""||
        String(repeat,"leaseEpoch")!=String(aLease,"leaseEpoch"){
        t.Fatalf("repeat launch acquired source ownership: %+v",repeat)
    }
    _=duplicate.conn.Close()
    readonly:=r17Local(t,cfg)
    readonly.send(t,map[string]any{"v":1,"kind":"dev.attach","path":aPath,"access":"read-only"})
    readonlyReply:=readonly.next(t)
    denied,_:=Decode(readonlyReply["error"])
    if String(readonlyReply,"kind")!="dev.rejected"||String(denied,"code")!="E_DEV_ACCESS_CONFLICT" {
        t.Fatalf("live read/write lease incorrectly downgraded: %+v",readonlyReply)
    }
    _=readonly.conn.Close()
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
    if len(rows)!=3{
        t.Fatalf("Go single-file grant was hidden when multi-source CLI attached: %+v",rows)
    }
    bySource:=map[string]string{}
    goVisible:=false
    for _,row:=range rows{
        if row.BindingID==goGrant["bindingId"]{
            goVisible=true
            continue // Go file label intentionally differs from directory names
        }
        if row.Name!="同名目录" {t.Fatalf("unexpected directory label: %+v",row)}
        if bySource[row.SourceID]!=""{t.Fatal("duplicate source joined another folder")}
        bySource[row.SourceID]=row.BindingID
    }
    if !goVisible{t.Fatal("existing Go single-file authorization disappeared")}
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
    bLive,goLive:=false,false
    for _,row:=range remaining{
        if row.BindingID==bid{bLive=true}
        if row.BindingID==goGrant["bindingId"]{goLive=true}
    }
    if len(remaining)!=2||!bLive||!goLive{
        t.Fatalf("A exit stole B or old Go authorization: %+v",remaining)
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

func TestR17DevAttachStrictSchemaAndLegacyAccess(t *testing.T) {
    for _,raw:=range []string{
        `{"v":1,"kind":"dev.attach","path":"/exact/directory"}`,
        `{"v":1,"kind":"dev.attach","path":"/exact/directory","access":"read-only"}`,
        `{"v":1,"kind":"dev.attach","path":"/exact/directory","access":"read-write"}`,
    } {
        if _,err:=decodeDevAttach([]byte(raw));err!=nil{t.Fatalf("valid attach rejected: %s %v",raw,err)}
    }
    for _,raw:=range []string{
        `{"v":1,"kind":"dev.attach","path":"/exact/directory","access":"read"}`,
        `{"v":1,"kind":"dev.attach","path":"/exact/directory","access":""}`,
        `{"v":1,"kind":"dev.attach","path":"/exact/directory","access":null}`,
        `{"v":1,"kind":"dev.attach","path":"/exact/directory","access":true}`,
        `{"v":1,"kind":"dev.attach","path":"/exact/directory","access":"read-only","access":"read-write"}`,
        `{"v":1,"kind":"dev.attach","path":"/one","path":"/two"}`,
        `{"v":1,"kind":"dev.attach","path":"/exact/directory","extra":true}`,
        `{"v":1,"kind":"dev.attach","path":1}`,
        `{"v":1,"kind":"dev.attach"}`,
        `{"v":2,"kind":"dev.attach","path":"/exact/directory"}`,
    } {
        if _,err:=decodeDevAttach([]byte(raw));err==nil{t.Fatalf("ambiguous/invalid authorization accepted: %s",raw)}
    }
}

func TestR17AccessCapabilityMustBeNegotiated(t *testing.T) {
    for _,advertised:=range []bool{false,true} {
        home,_:=projectFixture(t)
        _=home
        cfg,err:=Load();if err!=nil{t.Fatal(err)}
        var output bytes.Buffer
        host,err:=NewHost(cfg,"chrome-extension://"+cfg.ExtensionID+"/",strings.NewReader(""),&output)
        if err!=nil{t.Fatal(err)}
        message:=map[string]any{"v":1,"kind":"welcome","extensionId":cfg.ExtensionID,"extensionVersion":"r17-access-test","localFilesVersion":1,"localDevMultiVersion":1}
        if advertised{message["localDevAccessVersion"]=1}
        if err=host.handleChrome(MustEncode(message));err!=nil{host.Close();t.Fatal(err)}
        if host.localDevAccess!=advertised{host.Close();t.Fatal("new CLI access silently enabled for old extension")}
        host.Close()
    }
}
