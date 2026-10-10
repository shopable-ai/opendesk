//go:build darwin || linux

package browserbridge

import (
    "bufio"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "errors"
    "strings"
    "time"
    "unicode/utf8"
)

type devLease struct {
    owner *localClient
    workspaceID, sourceID string
    temporary bool
}
type modernProject struct {
    BindingID string `json:"bindingId"`
    Name string `json:"name"`
    RuntimeKind string `json:"runtimeKind"`
}
type modernEntry struct {
    rawID string
    name string
    runtimeKind string
    sourceID string
    workspaceID string
}
type modernProvider struct {
    leaseID string
    sourceID string
    workspaceID string
    entries map[string]modernEntry
}

func modernBinding(sourceID, rawID string) string {
    sum := sha256.Sum256([]byte("dev-v2\x00"+sourceID+"\x00"+rawID))
    return "local-v2-"+hex.EncodeToString(sum[:12])
}
func legacyBinding(epoch, rawID string) string {
    sum := sha256.Sum256([]byte("legacy\x00"+epoch+"\x00"+rawID))
    return "local-v1-"+hex.EncodeToString(sum[:12])
}
func (h *Host) rotateAggregateLocked() {
    if len(h.modern)==0 {
        h.aggregateEpoch=""
        return
    }
    h.aggregateEpoch,_=NewID()
}
func (h *Host) serveDevAttach(c *localClient, f Fields, reader *bufio.Reader) {
    h.mu.Lock()
    ready:=h.ready&&h.localDevMulti&&h.localFiles&&!h.closed
    h.mu.Unlock()
    if !ready {
        _=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"dev.rejected",
            "error":map[string]string{"code":"E_NATIVE_UPDATE_REQUIRED"}}))
        return
    }
    if len(f)!=3 || !Has(f,"path") || String(f,"path")=="" {
        _=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"dev.rejected",
            "error":map[string]string{"code":"E_SCHEMA"}}))
        return
    }
    if err:=h.files.verifyInstall();err!=nil {
        _=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"dev.rejected",
            "error":map[string]string{"code":"E_FILES_ACCESS"}}))
        return
    }
    // The directory grant and its owning lease must be one atomic Host
    // transaction. Releasing A cannot erase a newly attached B, and two
    // commands for the same source must not install duplicate providers.
    h.mu.Lock()
    if h.closed {h.mu.Unlock();return}
    result,owned,err:=h.files.attachDevWorkspace(String(f,"path"))
    if err!=nil {
        h.mu.Unlock()
        code:=err.Error()
        if !strings.HasPrefix(code,"E_") {code="E_FILES_ACCESS"}
        _=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"dev.rejected",
            "error":map[string]string{"code":code}}))
        return
    }
    sourceID:=result["sourceId"].(string)
    for _,active:=range h.leases {
        if active.sourceID!=sourceID{continue}
        h.mu.Unlock()
        result["v"]=1
        result["kind"]="dev.attached"
        result["leaseId"]="" // Display-only response, no authority transferred.
        result["alreadyActive"]=true
        _=h.sendLocal(c,MustEncode(result))
        return
    }
    leaseID,err:=NewID()
    if err!=nil {
        if owned{h.files.detachDevWorkspace(result["workspaceId"].(string))}
        h.mu.Unlock()
        return
    }
    record:=devLease{owner:c,workspaceID:result["workspaceId"].(string),
        sourceID:sourceID,temporary:owned||result["temporary"]==true}
    // Existing read/write grants remain independent of the temporary CLI
    // provider lease. The CLI cannot grant itself write privileges.
    h.leases[leaseID]=record
    h.mu.Unlock()
    result["v"]=1
    result["kind"]="dev.attached"
    result["leaseId"]=leaseID
    if err=h.sendLocal(c,MustEncode(result));err!=nil {
        h.releaseDevLease(c)
        return
    }
    if owned { _=h.sendChrome(MustEncode(h.files.state())) }
    _=c.socket.SetReadDeadline(time.Time{})
    // This socket owns one read-only lease. A second launch never steals it.
    // No execution, grants or file RPC are accepted through this socket.
    for {
        bytes,err:=ReadLine(reader)
        if err!=nil {return}
        frame,err:=Decode(bytes)
        if err!=nil||String(frame,"kind")!="dev.ping"||len(frame)!=2||Int(frame,"v")!=1{return}
        if err=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"dev.pong"}));err!=nil{return}
    }
}
func (h *Host) releaseDevLease(c *localClient) {
    h.mu.Lock()
    changed:=false
    providers:=[]*localClient{}
    for id,lease:=range h.leases {
        if lease.owner!=c {continue}
        // Only this CLI's temporary grant is retired. A persistent grant
        // cannot be revoked by a session close or second launch.
        if lease.temporary&&h.files.detachDevWorkspace(lease.workspaceID){changed=true}
        delete(h.leases,id)
        for provider,row:=range h.modern {
            if row.leaseID==id {providers=append(providers,provider)}
        }
    }
    h.mu.Unlock()
    for _,provider:=range providers {_=provider.socket.Close()}
    if changed {_=h.sendChrome(MustEncode(h.files.state()))}
}

func (h *Host) readCatalog(raw json.RawMessage, lease devLease) (map[string]modernEntry,error) {
    var projects []modernProject
    if len(raw)==0||json.Unmarshal(raw,&projects)!=nil||len(projects)>4{return nil,ErrSchema}
    rows:=map[string]modernEntry{}
    for _,project:=range projects {
        if !projectBindingRE.MatchString(project.BindingID) ||
            project.Name==""||len(project.Name)>160||!utf8.ValidString(project.Name)||
            project.RuntimeKind!="controller"&&project.RuntimeKind!="page-userscript"{
            return nil,ErrSchema
        }
        scoped:=modernBinding(lease.sourceID,project.BindingID)
        if _,exists:=rows[scoped];exists{return nil,ErrSchema}
        rows[scoped]=modernEntry{rawID:project.BindingID,name:project.Name,
            runtimeKind:project.RuntimeKind,sourceID:lease.sourceID,workspaceID:lease.workspaceID}
    }
    return rows,nil
}
func (h *Host) serveModernProvider(c *localClient, request Fields, reader *bufio.Reader) {
    leaseID:=String(request,"leaseId")
    h.mu.Lock()
    lease,ok:=h.leases[leaseID]
    ready:=h.ready&&h.localDevMulti&&!h.closed
    already:=len(h.modern)>=4
    h.mu.Unlock()
    if !ok||!ready||already||!RequestIDValid(String(request,"providerId")) {
        _=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"provider.rejected",
            "error":map[string]string{"code":"E_DEV_AUTH"}}))
        return
    }
    entries,err:=h.readCatalog(request["projects"],lease)
    if err!=nil||len(request)!=6 {
        _=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"provider.rejected",
            "error":map[string]string{"code":"E_SCHEMA"}}))
        return
    }
    epoch,err:=NewID()
    if err!=nil{return}
    h.mu.Lock()
    still,ok:=h.leases[leaseID]
    if !ok||still.owner!=lease.owner||still.workspaceID!=lease.workspaceID||h.closed {
        h.mu.Unlock();return
    }
    c.providerEpoch=epoch
    h.modern[c]=&modernProvider{leaseID:leaseID,sourceID:lease.sourceID,
        workspaceID:lease.workspaceID,entries:entries}
    h.rotateAggregateLocked()
    h.mu.Unlock()
    if err=h.sendLocal(c,MustEncode(map[string]any{"v":1,"kind":"provider.registered",
        "providerId":String(request,"providerId"),"providerEpoch":epoch}));err!=nil{return}
    h.providerState()
    _=c.socket.SetReadDeadline(time.Time{})
    for {
        raw,err:=ReadLine(reader)
        if err!=nil{return}
        frame,err:=Decode(raw)
        if err!=nil||Int(frame,"v")!=1||String(frame,"providerEpoch")!=epoch{return}
        switch String(frame,"kind"){
        case "provider.changed":
            h.mu.Lock()
            provider:=h.modern[c]
            lease,valid:=h.leases[leaseID]
            h.mu.Unlock()
            if provider==nil||!valid{return}
            entries,err:=h.readCatalog(frame["projects"],lease)
            if err!=nil||len(frame)!=4{return}
            h.mu.Lock()
            if h.modern[c]==provider {
                provider.entries=entries
                h.rotateAggregateLocked()
            }
            h.mu.Unlock()
            h.providerState()
        case "dev.response":
            if !h.deliverDevReply(c,frame,raw){return}
        default:return
        }
    }
}
func (h *Host) releaseModernProvider(c *localClient) {
    h.mu.Lock()
    provider,exists:=h.modern[c]
    if !exists{h.mu.Unlock();return}
    delete(h.modern,c)
    h.rotateAggregateLocked()
    ids:=[]string{}
    for id,p:=range h.devPending {
        if p.owner==c {p.timer.Stop();delete(h.devPending,id);ids=append(ids,id)}
    }
    h.mu.Unlock()
    for _,id:=range ids {
        _=h.sendChrome(MustEncode(map[string]any{"v":1,"kind":"dev.response",
            "requestId":id,"providerEpoch":c.providerEpoch,
            "error":map[string]string{"code":"E_DEV_DISCONNECTED"}}))
    }
    _=provider
    h.providerState()
}
func (h *Host) deliverDevReply(c *localClient, frame Fields, raw []byte) bool {
    id:=String(frame,"requestId")
    if !RequestIDValid(id)||Has(frame,"result")==Has(frame,"error"){return false}
    h.mu.Lock()
    if wait:=h.legacyQueries[id];wait!=nil && h.provider==c {
        delete(h.legacyQueries,id)
        h.mu.Unlock()
        select{case wait<-frame:default:}
        return true
    }
    entry:=h.devPending[id]
    if entry==nil||entry.epoch!=c.providerEpoch||(entry.owner!=nil&&entry.owner!=c) {
        h.mu.Unlock();return true
    }
    entry.timer.Stop();delete(h.devPending,id)
    valid:=entry.aggregateEpoch==""||entry.aggregateEpoch==h.aggregateEpoch&&len(h.modern)>0
    h.mu.Unlock()
    if !valid{return true}
    if entry.aggregateEpoch=="" {_=h.sendChrome(raw);return true}
    reply:=map[string]any{"v":1,"kind":"dev.response","requestId":id,
        "providerEpoch":entry.aggregateEpoch}
    if Has(frame,"error") {
        reply["error"]=json.RawMessage(frame["error"])
    }else{
        var result map[string]any
        if json.Unmarshal(frame["result"],&result)!=nil||result==nil||
            entry.rawID!=""&&result["bindingId"]!=entry.rawID {
            reply["error"]=map[string]string{"code":"E_DEV_SOURCE_IDENTITY","message":"Source identity mismatch"}
        }else{
            if entry.scopedID!="" {result["bindingId"]=entry.scopedID}
            reply["result"]=result
        }
    }
    data,err:=Encode(reply)
    if err!=nil {h.devError(id,entry.aggregateEpoch,"E_LIMIT");return true}
    _=h.sendChrome(data)
    return true
}
func (h *Host) legacyCatalog() ([]map[string]any,error) {
    h.mu.Lock()
    provider:=h.provider
    if provider==nil{h.mu.Unlock();return nil,nil}
    epoch:=provider.providerEpoch
    id,_:=NewID()
    wait:=make(chan Fields,1)
    h.legacyQueries[id]=wait
    h.mu.Unlock()
    defer func(){h.mu.Lock();delete(h.legacyQueries,id);h.mu.Unlock()}()
    req:=MustEncode(map[string]any{"v":1,"kind":"dev.request","requestId":id,
        "providerEpoch":epoch,"method":"projects.list","params":map[string]any{}})
    if err:=h.sendLocal(provider,req);err!=nil{return nil,err}
    select{
    case frame:=<-wait:
        if Has(frame,"error"){return nil,errors.New("E_DEV_SOURCE")}
        var result struct{Projects []struct{BindingID,Name,RuntimeKind string}}
        if json.Unmarshal(frame["result"],&result)!=nil||len(result.Projects)>8{
            return nil,ErrSchema
        }
        rows:=make([]map[string]any,0,len(result.Projects))
        for _,row:=range result.Projects{
            if !RequestIDValid(row.BindingID)||row.Name==""||len(row.Name)>160{return nil,ErrSchema}
            rows=append(rows,map[string]any{"bindingId":legacyBinding(epoch,row.BindingID),
                "name":row.Name,"source":"legacy-mcp","sourceId":"legacy-"+epoch,
                "_rawId":row.BindingID})
        }
        return rows,nil
    case <-time.After(3*time.Second):
        return nil,errors.New("E_DEV_TIMEOUT")
    case <-h.done:return nil,ErrClosed
    }
}
func (h *Host) handleModernDevRequest(f Fields) error {
    id:=String(f,"requestId")
    requestedEpoch:=String(f,"providerEpoch")
    method:=String(f,"method")
    params,_:=Decode(f["params"])
    bindingID:=String(params,"bindingId")
    h.mu.Lock()
    if requestedEpoch!=h.aggregateEpoch||len(h.modern)==0 {
        h.mu.Unlock();h.devError(id,requestedEpoch,"E_DEV_DISCONNECTED");return nil
    }
    modern:=make(map[string]struct{client *localClient;entry modernEntry;epoch string})
    for client,provider:=range h.modern{
        for scoped,entry:=range provider.entries{
            modern[scoped]=struct{client *localClient;entry modernEntry;epoch string}{client,entry,client.providerEpoch}
        }
    }
    old:=h.provider
    epoch:=h.aggregateEpoch
    h.mu.Unlock()
    if method=="projects.list"{
        go func(){
            listed,err:=ProjectList()
            if err!=nil{h.devError(id,epoch,"E_DEV_AUTH");return}
            rows,_:=listed["projects"].([]map[string]any)
            for scoped,entry:=range modern{
                rows=append(rows,map[string]any{"bindingId":scoped,"name":entry.entry.name,
                    "runtimeKind":entry.entry.runtimeKind,"source":"local-files",
                    "sourceId":entry.entry.sourceID,"workspaceId":entry.entry.workspaceID})
            }
            others,err:=h.legacyCatalog()
            if err!=nil {h.devError(id,epoch,"E_DEV_DISCONNECTED");return}
            for _,row:=range others{delete(row,"_rawId")}
            rows=append(rows,others...)
            if len(rows)>32 {h.devError(id,epoch,"E_LIMIT");return}
            h.mu.Lock();live:=!h.closed&&h.aggregateEpoch==epoch;h.mu.Unlock()
            if !live{return}
            data,err:=Encode(map[string]any{"v":1,"kind":"dev.response","requestId":id,
                "providerEpoch":epoch,"result":map[string]any{"projects":rows}})
            if err!=nil{h.devError(id,epoch,"E_LIMIT");return}
            _=h.sendChrome(data)
        }()
        return nil
    }
    if method!="project.resolve"{h.devError(id,epoch,"E_SCHEMA");return nil}
    target,found:=modern[bindingID]
    rawID:=""
    scopedID:=""
    var owner *localClient
    ownerEpoch:=""
    if found{
        owner=target.client;ownerEpoch=target.epoch
        rawID=target.entry.rawID;scopedID=bindingID
    }else if strings.HasPrefix(bindingID,"local-v1-")&&old!=nil {
        catalog,err:=h.legacyCatalog()
        if err!=nil{h.devError(id,epoch,"E_DEV_DISCONNECTED");return nil}
        for _,row:=range catalog{
            if row["bindingId"]==bindingID{
                rawID,_=row["_rawId"].(string)
                break
            }
        }
        if rawID==""{h.devError(id,epoch,"E_DEV_DETACHED");return nil}
        owner=old;ownerEpoch=old.providerEpoch;scopedID=bindingID
    }else if projectBindingRE.MatchString(bindingID){
        go h.serveAggregatedGoProject(id,epoch,bindingID)
        return nil
    }else{h.devError(id,epoch,"E_DEV_DETACHED");return nil}
    h.mu.Lock()
    if h.closed||h.aggregateEpoch!=epoch||h.modern[owner]==nil&&h.provider!=owner{
        h.mu.Unlock();h.devError(id,epoch,"E_DEV_DISCONNECTED");return nil
    }
    if len(h.devPending)>=4||len(h.pending)+len(h.devPending)+h.internalPending>=MaxInflight{
        h.mu.Unlock();h.devError(id,epoch,"E_LIMIT");return nil
    }
    if _,exists:=h.devPending[id];exists{h.mu.Unlock();h.devError(id,epoch,"E_LIMIT");return nil}
    pending:=&pendingDev{epoch:ownerEpoch,owner:owner,aggregateEpoch:epoch,
        rawID:rawID,scopedID:scopedID}
    pending.timer=time.AfterFunc(devTimeout,func(){
        h.mu.Lock();current:=h.devPending[id]
        if current==pending{delete(h.devPending,id)}
        h.mu.Unlock()
        if current==pending{h.devError(id,epoch,"E_DEV_TIMEOUT")}
    })
    h.devPending[id]=pending
    h.mu.Unlock()
    request:=MustEncode(map[string]any{"v":1,"kind":"dev.request","requestId":id,
        "providerEpoch":ownerEpoch,"method":"project.resolve",
        "params":map[string]any{"bindingId":rawID}})
    if err:=h.sendLocal(owner,request);err!=nil{_ = owner.socket.Close()}
    return nil
}
func (h *Host) serveAggregatedGoProject(id,epoch,bindingID string) {
    result,err:=ResolveProject(bindingID)
    h.mu.Lock();live:=!h.closed&&h.aggregateEpoch==epoch&&len(h.modern)>0;h.mu.Unlock()
    if !live{return}
    if err!=nil {h.devError(id,epoch,"E_DEV_SOURCE");return}
    payload,err:=Encode(map[string]any{"v":1,"kind":"dev.response",
        "requestId":id,"providerEpoch":epoch,"result":result})
    if err!=nil{h.devError(id,epoch,"E_LIMIT");return}
    _=h.sendChrome(payload)
}
