//go:build darwin || linux

package browserbridge

import (
    "os"
    "path/filepath"
    "testing"
)

// R17 never converts local directory intent into a permanent writable grant.
func TestR17TemporaryWorkspacesAreScopedReadOnlyAndIndependent(t *testing.T) {
    home,_:=projectFixture(t)
    cfg,err:=Load();if err!=nil{t.Fatal(err)}
    f,err:=newNativeFiles(cfg);if err!=nil{t.Fatal(err)}
    defer f.Close()
    folders:=[]string{filepath.Join(home,"one","同名目录"),filepath.Join(home,"two","同名目录")}
    ids:=make([]string,2)
    for i,d:=range folders{
        if err:=os.MkdirAll(d,0700);err!=nil{t.Fatal(err)}
        if err:=os.WriteFile(filepath.Join(d,"README.md"),[]byte("content-"+string(rune('A'+i))),0600);err!=nil{t.Fatal(err)}
        grant,owned,err:=f.attachDevWorkspace(d)
        if err!=nil||!owned{t.Fatalf("attach %d: %+v, owned=%v, err=%v",i,grant,owned,err)}
        ids[i]=grant["workspaceId"].(string)
        if grant["sourceId"]==""||grant["access"]!="read-only"{t.Fatalf("invalid scoped grant: %+v",grant)}
        if i==1&&ids[0]==ids[1]{t.Fatal("same display name merged distinct directory identities")}
    }
    repeat,owned,err:=f.attachDevWorkspace(folders[0])
    if err!=nil||owned||repeat["workspaceId"]!=ids[0]||repeat["alreadyActive"]!=true{
        t.Fatalf("second launch stole directory lease: %+v (%t, %v)",repeat,owned,err)
    }
    list:=requireFilesResult(t,callFiles(t,f,"workspaces.list",map[string]any{}))
    if len(list["workspaces"].([]map[string]any))!=2{t.Fatalf("source list: %+v",list)}
    for i,id:=range ids{
        got:=requireFilesResult(t,callFiles(t,f,"files.read",map[string]any{"workspaceId":id,"path":"README.md"}))
        if got["content"]!="content-"+string(rune('A'+i)){t.Fatalf("wrong source routed %d: %v",i,got)}
        requireFilesCode(t,callFiles(t,f,"files.write",map[string]any{"workspaceId":id,
            "path":"README.md","content":"forbidden","expectedSha256":got["sha256"]}),"E_FILES_ACCESS")
        requireFilesCode(t,callFiles(t,f,"files.read",map[string]any{"workspaceId":id,"path":"../two/同名目录/README.md"}),"E_FILES_PATH")
    }
    if !f.detachDevWorkspace(ids[0]){t.Fatal("owner couldn't detach first temporary scope")}
    requireFilesCode(t,callFiles(t,f,"files.read",map[string]any{"workspaceId":ids[0],"path":"README.md"}),"E_FILES_ACCESS")
    got:=requireFilesResult(t,callFiles(t,f,"files.read",map[string]any{"workspaceId":ids[1],"path":"README.md"}))
    if got["content"]!="content-B"{t.Fatal("stopping A detached B")}
    if f.detachDevWorkspace(ids[0]){t.Fatal("replayed detach must not affect other sessions")}
}
func TestR17PermanentWorkspaceNeverBecomesTemporary(t *testing.T){
    f,dir,existing:=filesFixture(t)
    result,owned,err:=f.attachDevWorkspace(dir)
    if err!=nil||owned||result["workspaceId"]!=existing||result["alreadyAuthorized"]!=true{
        t.Fatalf("existing write grant replaced: %v, %v, %v",result,owned,err)
    }
    if f.detachDevWorkspace(existing){t.Fatal("temporary exit revoked permanent Workspace")}
    grant:=requireFilesResult(t,callFiles(t,f,"workspaces.list",map[string]any{}))
    rows:=grant["workspaces"].([]map[string]any)
    if len(rows)!=1||rows[0]["access"]!="read-write"{t.Fatal("persistent permission disappeared")}
}
