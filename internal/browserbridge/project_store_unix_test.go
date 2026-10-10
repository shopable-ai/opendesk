//go:build darwin || linux

package browserbridge

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func projectFixture(t *testing.T)(string,string){
	t.Helper()
	root:="/tmp"
	if runtime.GOOS=="darwin"{root="/private/tmp"}
	home,err:=os.MkdirTemp(root,"od-go-project-")
	if err!=nil{t.Fatal(err)}
	t.Cleanup(func(){_ = os.RemoveAll(home)})
	if err=os.Chmod(home,0700);err!=nil{t.Fatal(err)}
	t.Setenv("HOME",home)
	binary,err:=os.Executable()
	if err!=nil{t.Fatal(err)}
	if _,err=Setup(testExtensionID,"chrome","",binary);err!=nil{t.Fatal(err)}
	p:=filepath.Join(home,"authorized.js")
	if err=os.WriteFile(p,[]byte("return {title: await page.title()};\n"),0600);err!=nil{t.Fatal(err)}
	return home,p
}
func TestNativeGoSingleFileGrantAndRevocation(t *testing.T){
	home,p:=projectFixture(t)
	if _,err:=ProjectAdd(home,"controller","async-main","https://example.test");err==nil {
		t.Fatal("directory was authorized as executable source")
	}
	if _,err:=ProjectAdd(p,"controller","async-main","file:///private");err==nil{
		t.Fatal("file origin bypassed project permission")
	}
	a,err:=ProjectAdd(p,"controller","async-main","https://example.test")
	if err!=nil{t.Fatal(err)}
	id,ok:=a["bindingId"].(string)
	if !ok||!projectBindingRE.MatchString(id){t.Fatalf("bad binding ID %v",a)}
	info,err:=os.Stat(filepath.Join(home,".opendesk-browser","native-agent-r1",projectStoreName))
	if err!=nil||info.Mode().Perm()!=0600{t.Fatalf("grant file mode: %v %v",info,err)}
	listed,err:=ProjectList()
	if err!=nil{t.Fatal(err)}
	rows:=listed["projects"].([]map[string]any)
	if len(rows)!=1 || rows[0]["bindingId"]!=id ||
		rows[0]["source"]!="opendesk-native-files"{t.Fatalf("unexpected list %v",rows)}
	result,err:=ResolveProject(id)
	if err!=nil{t.Fatal(err)}
	source:=result["sourceUtf8"].(string)
	hash:=sha256.Sum256([]byte(source))
	if result["sourceHash"]!=hex.EncodeToString(hash[:]) ||
		result["sourceBytes"]!=len(source) || result["runtimeKind"]!="controller" {
		t.Fatalf("resolved source identity incorrect: %v",result)
	}
	if _,exists:=result["path"];exists{t.Fatal("filesystem path escaped Go into Browser result")}
	if _,exists:=result["files"];exists{t.Fatal("file graph escaped Go into Browser result")}
	if _,err=ProjectAdd(p,"controller","async-main","https://other.test");err==nil {
		t.Fatal("project origin expanded without revoke")
	}
	// Replacing bytes on the SAME explicitly granted file is permitted;
	// a different inode is not.
	if err=os.WriteFile(p,[]byte("return 101;\n"),0600);err!=nil{t.Fatal(err)}
	result,err=ResolveProject(id)
	if err!=nil||result["sourceUtf8"]!="return 101;\n"{t.Fatalf("file refresh: %v %v",result,err)}
	tmp:=p+".new"
	if err=os.WriteFile(tmp,[]byte("return 999;\n"),0600);err!=nil{t.Fatal(err)}
	if err=os.Rename(tmp,p);err!=nil{t.Fatal(err)}
	if _,err=ResolveProject(id);err==nil||err.Error()!="E_PROJECT_CHANGED"{
		t.Fatalf("replaced file silently reauthorized: %v",err)
	}
	if _,err=ProjectRevoke(id);err!=nil{t.Fatal(err)}
	if _,err=ResolveProject(id);err==nil||err.Error()!="E_DEV_DETACHED"{
		t.Fatalf("revoked grant still resolves: %v",err)
	}
	if _,err=Cleanup();err!=nil{t.Fatal(err)}
	for _,name:=range []string{projectStoreName,"project-grants.lock"} {
		if _,err=os.Stat(filepath.Join(home,".opendesk-browser","native-agent-r1",name));!os.IsNotExist(err){
			t.Fatalf("uninstall retained old grant %s: %v",name,err)
		}
	}
}
func TestNativeGoProjectsRejectSymlinksAndUnsafeInputs(t *testing.T){
	home,p:=projectFixture(t)
	link:=filepath.Join(home,"linked.js")
	if err:=os.Symlink(p,link);err!=nil{t.Fatal(err)}
	if _,err:=ProjectAdd(link,"controller","async-main","https://example.test");err==nil||
		err.Error()!="E_DEV_SYMLINK"{t.Fatalf("symlink accepted: %v",err)}
	for _,invalid:=range []string{"https://example.test/","https://example.test/path",
		"https://example.test?token=one","https://user@example.test",
		"ftp://example.test"}{
		if _,err:=ProjectAdd(p,"controller","async-main",invalid);err==nil{
			t.Fatalf("invalid siteOrigin accepted: %q",invalid)
		}
	}
	if _,err:=ProjectAdd(p,"controller","classic-userscript","https://example.test");err==nil{
		t.Fatal("Controller classic-userscript unsupported")
	}
	if err:=os.WriteFile(p,[]byte{0xff,0xfe},0600);err!=nil{t.Fatal(err)}
	info,err:=ProjectAdd(p,"page-userscript","classic-userscript","https://example.test")
	if err!=nil{t.Fatal(err)}
	if _,err=ResolveProject(info["bindingId"].(string));err==nil||err.Error()!="E_PROJECT_ENCODING"{
		t.Fatalf("non-UTF8 source delivered: %v",err)
	}
}
func TestNativeGoGrantsBoundToCredentialAndInstallOwner(t *testing.T){
	home,p:=projectFixture(t)
	info,err:=ProjectAdd(p,"controller","async-main","http://127.0.0.1:43111")
	if err!=nil{t.Fatal(err)}
	cfg,err:=Load();if err!=nil{t.Fatal(err)}
	// Attack: reuse the same grants file after changing installation identity.
	cfg.ClientCredential=strings.Repeat("b",64)
	config:=map[string]any{}
	bytes,err:=os.ReadFile(configPath());if err!=nil{t.Fatal(err)}
	if err=json.Unmarshal(bytes,&config);err!=nil{t.Fatal(err)}
	config["clientCredential"]=cfg.ClientCredential
	data,_:=json.Marshal(config)
	if err=os.WriteFile(configPath(),data,0600);err!=nil{t.Fatal(err)}
	if _,err=ResolveProject(info["bindingId"].(string));err==nil||err.Error()!="E_DEV_AUTH"{
		t.Fatalf("reinstall credential inherited earlier grant: %v",err)
	}
	_ = home
}
