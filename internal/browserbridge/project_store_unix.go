//go:build darwin || linux

// Package browserbridge owns explicit private grants for the optional Go
// single-file project provider. A file grant is NOT website/Run permission.
package browserbridge

import (
 "bytes"
 "crypto/sha256"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "net/url"
 "os"
 "path/filepath"
 "regexp"
 "strings"
 "syscall"
 "time"
 "unicode/utf8"
)

const projectStoreName = "project-grants.v1.json"
const projectStoreFormat = "opendesk.browser-native-project-grants.v1"
const maxProjectGrants = 8
const maxProjectSource = 48*1024
var projectBindingRE=regexp.MustCompile("^local-[a-f0-9]{20}$")

// Private on-disk types do not form a Browser or public wire contract.
type ProjectGrant struct{
 BindingID,Name,Path,RuntimeKind,EntryFormat,SiteOrigin string
 Device,Inode uint64
}
type projectStore struct{
 Format,ExtensionID,CredentialDigest string
 Projects []ProjectGrant
}
func projectStoreFile(cfg Installation)string{return filepath.Join(cfg.InstallRoot,projectStoreName)}
func digestCredential(v string)string{sum:=sha256.Sum256([]byte(v));return hex.EncodeToString(sum[:])}
func newProjectStore(cfg Installation)projectStore{
 return projectStore{Format:projectStoreFormat,ExtensionID:cfg.ExtensionID,
 CredentialDigest:digestCredential(cfg.ClientCredential),Projects:[]ProjectGrant{}}
}
func projectErr(code string)error{return errors.New(code)}
func secureSourcePath(candidate string)(*os.File,os.FileInfo,error){
 if candidate==""||len(candidate)>4096||!filepath.IsAbs(candidate)||
 filepath.Clean(candidate)!=candidate||strings.ContainsRune(candidate,0){return nil,nil,projectErr("E_DEV_PATH")}
 if !strings.HasSuffix(candidate,".js")&&!strings.HasSuffix(candidate,".mjs"){return nil,nil,projectErr("E_DEV_RUNTIME")}
 // Reject symlinks at the file AND at every parent component.
 for p:=candidate;;p=filepath.Dir(p){
  info,err:=os.Lstat(p);if err!=nil{return nil,nil,projectErr("E_DEV_PATH")}
  if info.Mode()&os.ModeSymlink!=0{return nil,nil,projectErr("E_DEV_SYMLINK")}
  if p==candidate{
   if !info.Mode().IsRegular()||!userOwned(info)||info.Size()>maxProjectSource{
    return nil,nil,projectErr("E_DEV_AUTH")
   }
  }else if !info.IsDir(){return nil,nil,projectErr("E_DEV_PATH")}
  if p==filepath.Dir(p){break}
 }
 fd,err:=syscall.Open(candidate,syscall.O_RDONLY|syscall.O_CLOEXEC|syscall.O_NOFOLLOW,0)
 if err!=nil{return nil,nil,projectErr("E_DEV_PATH")}
 f:=os.NewFile(uintptr(fd),candidate)
 info,err:=f.Stat()
 if err!=nil||!info.Mode().IsRegular()||!userOwned(info)||info.Size()>maxProjectSource{
  f.Close();return nil,nil,projectErr("E_DEV_AUTH")
 }
 return f,info,nil
}
func inodeIdentity(info os.FileInfo)(uint64,uint64,error){
 stat,ok:=info.Sys().(*syscall.Stat_t);if !ok{return 0,0,projectErr("E_DEV_AUTH")}
 return uint64(stat.Dev),uint64(stat.Ino),nil
}
func validateSiteOrigin(raw string)bool{
 if raw==""||len(raw)>1024{return false}
 u,err:=url.Parse(raw)
 return err==nil&&(u.Scheme=="http"||u.Scheme=="https")&&
 u.Host!=""&&u.Hostname()!=""&&u.User==nil&&
 u.Path==""&&u.RawPath==""&&u.RawQuery==""&&u.Fragment==""&&
 !u.ForceQuery&&u.String()==raw
}
func validateProjectKind(kind,entry string)bool{
 return (kind=="controller"&&entry=="async-main")||
 (kind=="page-userscript"&&(entry=="async-main"||entry=="classic-userscript"))
}
func readProjectStore(cfg Installation)(projectStore,error){
 empty:=newProjectStore(cfg);p:=projectStoreFile(cfg)
 info,err:=os.Lstat(p)
 if os.IsNotExist(err){return empty,nil}
 if err!=nil{return empty,err}
 if !info.Mode().IsRegular()||info.Mode()&os.ModeSymlink!=0||
 !userOwned(info)||info.Mode().Perm()!=0600||info.Size()>65536{
  return empty,projectErr("E_DEV_AUTH")
 }
 fd,err:=syscall.Open(p,syscall.O_RDONLY|syscall.O_CLOEXEC|syscall.O_NOFOLLOW,0)
 if err!=nil{return empty,projectErr("E_DEV_AUTH")}
 f:=os.NewFile(uintptr(fd),p);defer f.Close()
 opened,err:=f.Stat()
 if err!=nil||!os.SameFile(info,opened){return empty,projectErr("E_DEV_AUTH")}
 bytes,err:=io.ReadAll(io.LimitReader(f,65537))
 if err!=nil||len(bytes)>65536{return empty,projectErr("E_DEV_AUTH")}
 var state projectStore
 if err=json.Unmarshal(bytes,&state);err!=nil{return empty,projectErr("E_DEV_AUTH")}
 if state.Format!=projectStoreFormat||state.ExtensionID!=cfg.ExtensionID||
 state.CredentialDigest!=digestCredential(cfg.ClientCredential)||
 len(state.Projects)>maxProjectGrants{return empty,projectErr("E_DEV_AUTH")}
 seen:=map[string]bool{}
 for _,grant:=range state.Projects{
  if !projectBindingRE.MatchString(grant.BindingID)||seen[grant.BindingID]||
   grant.Path==""||grant.Device==0||grant.Inode==0||
   !validateProjectKind(grant.RuntimeKind,grant.EntryFormat)||
   !validateSiteOrigin(grant.SiteOrigin){return empty,projectErr("E_DEV_AUTH")}
  seen[grant.BindingID]=true
 }
 return state,nil
}
func writeProjectStore(cfg Installation,state projectStore)error{
 if err:=requireDir(cfg.InstallRoot);err!=nil{return err}
 content,err:=json.MarshalIndent(state,"","  ");if err!=nil{return err}
 content=append(content,'\n')
 if len(content)>65536{return projectErr("E_DEV_LIMIT")}
 return writeAtomic(projectStoreFile(cfg),content,0600)
}
func projectFileSnapshot(p string,device,inode uint64)([]byte,error){
 f,info,err:=secureSourcePath(p);if err!=nil{return nil,err}
 defer f.Close()
 dev,ino,err:=inodeIdentity(info);if err!=nil{return nil,err}
 if dev!=device||ino!=inode{return nil,projectErr("E_PROJECT_CHANGED")}
 source,err:=io.ReadAll(io.LimitReader(f,maxProjectSource+1))
 if err!=nil||len(source)==0||len(source)>maxProjectSource{return nil,projectErr("E_DEV_LIMIT")}
 if !utf8.Valid(source)||bytes.HasPrefix(source,[]byte{0xef,0xbb,0xbf})||
 bytes.IndexByte(source,0)!=-1{return nil,projectErr("E_PROJECT_ENCODING")}
 if _,err=f.Seek(0,io.SeekStart);err!=nil{return nil,projectErr("E_PROJECT_CHANGED")}
 after,err:=io.ReadAll(io.LimitReader(f,maxProjectSource+1))
 if err!=nil||!bytes.Equal(source,after){return nil,projectErr("E_PROJECT_CHANGED")}
 now,err:=f.Stat()
 if err!=nil||now.Size()!=info.Size()||!now.ModTime().Equal(info.ModTime()){
  return nil,projectErr("E_PROJECT_CHANGED")
 }
 return source,nil
}
func projectStoreLock(cfg Installation)(func(),error){
 // OS lock: two CLI/GUI writers cannot silently lose each other's grants.
 // The kernel releases this lock even if its owner crashes.
 p:=filepath.Join(cfg.InstallRoot,"project-grants.lock")
 fd,err:=syscall.Open(p,syscall.O_RDWR|syscall.O_CREAT|syscall.O_CLOEXEC|syscall.O_NOFOLLOW,0600)
 if err!=nil{return nil,projectErr("E_DEV_AUTH")}
 f:=os.NewFile(uintptr(fd),p)
 info,err:=f.Stat()
 if err!=nil||!info.Mode().IsRegular()||!userOwned(info)||info.Mode().Perm()!=0600{
  f.Close();return nil,projectErr("E_DEV_AUTH")
 }
 if err:=syscall.Flock(fd,syscall.LOCK_EX|syscall.LOCK_NB);err!=nil{
  f.Close();return nil,projectErr("E_DEV_BUSY")
 }
 return func(){_ = syscall.Flock(fd,syscall.LOCK_UN);_ = f.Close()},nil
}
// ProjectAdd requires a user's exact local path and explicit type/site scope.
// It grants no directory traversal, browser action, HTTP origin or npm access.
func ProjectAdd(p,kind,entry,siteOrigin string)(map[string]any,error){
 cfg,err:=Load();if err!=nil{return nil,err}
 if !validateProjectKind(kind,entry){return nil,projectErr("E_DEV_RUNTIME")}
 if !validateSiteOrigin(siteOrigin){return nil,projectErr("E_DEV_ORIGIN")}
 f,info,err:=secureSourcePath(p);if err!=nil{return nil,err}
 dev,ino,err:=inodeIdentity(info);f.Close()
 if err!=nil{return nil,err}
 release,err:=projectStoreLock(cfg);if err!=nil{return nil,err}
 defer release()
 state,err:=readProjectStore(cfg);if err!=nil{return nil,err}
 digest:=sha256.Sum256([]byte(p))
 id:="local-"+hex.EncodeToString(digest[:])[:20]
 grant:=ProjectGrant{BindingID:id,Name:filepath.Base(p),Path:p,
 RuntimeKind:kind,EntryFormat:entry,SiteOrigin:siteOrigin,Device:dev,Inode:ino}
 for _,existing:=range state.Projects{
  if existing.BindingID!=id{continue}
  if existing==grant{return map[string]any{"bindingId":id,"name":grant.Name,"unchanged":true},nil}
  return nil,projectErr("E_DEV_CONFLICT")
 }
 if len(state.Projects)>=maxProjectGrants{return nil,projectErr("E_LIMIT")}
 state.Projects=append(state.Projects,grant)
 if err=writeProjectStore(cfg,state);err!=nil{return nil,err}
 return map[string]any{"bindingId":id,"name":grant.Name,"authorized":true},nil
}
func ProjectList()(map[string]any,error){
 cfg,err:=Load();if err!=nil{return nil,err}
 state,err:=readProjectStore(cfg);if err!=nil{return nil,err}
 projects:=make([]map[string]any,0,len(state.Projects))
 for _,grant:=range state.Projects{
  projects=append(projects,map[string]any{"bindingId":grant.BindingID,
    "name":grant.Name,"source":"opendesk-native-files"})
 }
 return map[string]any{"projects":projects},nil
}
func ProjectRevoke(id string)(map[string]any,error){
 if !projectBindingRE.MatchString(id){return nil,projectErr("E_SCHEMA")}
 cfg,err:=Load();if err!=nil{return nil,err}
 release,err:=projectStoreLock(cfg);if err!=nil{return nil,err}
 defer release()
 state,err:=readProjectStore(cfg);if err!=nil{return nil,err}
 found:=false;next:=make([]ProjectGrant,0,len(state.Projects))
 for _,grant:=range state.Projects{
  if grant.BindingID==id{found=true;continue}
  next=append(next,grant)
 }
 if !found{return nil,projectErr("E_DEV_DETACHED")}
 state.Projects=next
 if err=writeProjectStore(cfg,state);err!=nil{return nil,err}
 return map[string]any{"bindingId":id,"revoked":true},nil
}
// ResolveProject returns ONLY source bytes and execution metadata, never
// workspace paths. The grant is checked both before and after file snapshot.
func ResolveProject(id string)(map[string]any,error){
 if !projectBindingRE.MatchString(id){return nil,projectErr("E_SCHEMA")}
 cfg,err:=Load();if err!=nil{return nil,err}
 state,err:=readProjectStore(cfg);if err!=nil{return nil,err}
 var grant *ProjectGrant
 for i:=range state.Projects{if state.Projects[i].BindingID==id{grant=&state.Projects[i];break}}
 if grant==nil{return nil,projectErr("E_DEV_DETACHED")}
 source,err:=projectFileSnapshot(grant.Path,grant.Device,grant.Inode)
 if err!=nil{return nil,err}
 latest,err:=readProjectStore(cfg);if err!=nil{return nil,err}
 authorized:=false
 for _,item:=range latest.Projects{if item==*grant{authorized=true;break}}
 if !authorized{return nil,projectErr("E_DEV_AUTH")}
 hash:=sha256.Sum256(source)
 input:=sha256.Sum256([]byte(fmt.Sprintf("%s|%s|%x",projectStoreFormat,id,hash)))
 return map[string]any{
  "bindingId":id,"projectId":id,"runtimeKind":grant.RuntimeKind,
  "entryFormat":grant.EntryFormat,"managedUI":false,
  "sourceUtf8":string(source),"sourceHash":hex.EncodeToString(hash[:]),
  "sourceBytes":len(source),"inputHash":hex.EncodeToString(input[:]),
  "cacheHit":false,"capturedAt":time.Now().UTC().Format(time.RFC3339Nano),
  "siteOrigins":[]string{grant.SiteOrigin},
 },nil
}
