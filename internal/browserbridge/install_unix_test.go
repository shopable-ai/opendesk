//go:build darwin || linux

package browserbridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFreshInstallRejectsLegacyAndPreservesOtherHosts(t *testing.T) {
	home,err:=os.MkdirTemp("/tmp","od-inst-")
	if err!=nil{t.Fatal(err)}
	t.Cleanup(func(){_ = os.RemoveAll(home)})
	if err=os.Chmod(home,0700);err!=nil{t.Fatal(err)}
	t.Setenv("HOME",home)
	executable,err:=os.Executable()
	if err!=nil{t.Fatal(err)}
	result,err:=Setup(testExtensionID,"chrome","",executable)
	if err!=nil{t.Fatal(err)}
	manifestPath,err:=ManifestFor("chrome","")
	if err!=nil{t.Fatal(err)}
	manifestBytes,err:=os.ReadFile(manifestPath)
	if err!=nil{t.Fatal(err)}
	if !strings.Contains(string(manifestBytes),"chrome-extension://"+testExtensionID+"/"){t.Fatal("missing exact allowed origin")}
	if result["provider"]!="opendesk"{t.Fatalf("provider: %v",result)}
	cfg,err:=Load()
	if err!=nil{t.Fatal(err)}
	if cfg.Provider!="opendesk" || cfg.ExtensionID!=testExtensionID || len(cfg.ClientCredential)!=64{t.Fatalf("identity: %#v",cfg)}
	// A repeated setup cannot silently rotate the IPC credential.
	if _,err=Setup(testExtensionID,"chrome","",executable);err!=nil{t.Fatal(err)}
	cfgAgain,err:=Load()
	if err!=nil{t.Fatal(err)}
	if cfgAgain.ClientCredential!=cfg.ClientCredential{t.Fatal("credential rotated")}
	if _,err=Setup(strings.Repeat("b",32),"chrome","",executable);err==nil || err.Error()!="E_EXTENSION_ID_CONFLICT"{t.Fatalf("extension conflict: %v",err)}
	if _,err=Setup(testExtensionID,"cft","",executable);err==nil || err.Error()!="E_BROWSER_CONFLICT"{t.Fatalf("browser conflict: %v",err)}
	other:=filepath.Join(filepath.Dir(manifestPath),"org.other.host.json")
	if err=os.WriteFile(other,[]byte("preserve"),0600);err!=nil{t.Fatal(err)}
	if _,err=Cleanup();err!=nil{t.Fatal(err)}
	b,err:=os.ReadFile(other)
	if err!=nil || string(b)!="preserve"{t.Fatalf("removed another host: %v %s",err,b)}
	if _,err=os.Stat(manifestPath);!os.IsNotExist(err){t.Fatalf("manifest still present: %v",err)}
	// Legacy provider is neither auto-migrated nor deleted.
	root:=installRoot()
	if err=os.MkdirAll(root,0700);err!=nil{t.Fatal(err)}
	b,_=json.Marshal(map[string]any{"name":HostName,"extensionId":testExtensionID,
		"browser":"chrome","socketPath":filepath.Join(root,"agent.sock"),
		"clientCredential":strings.Repeat("a",64),"installRoot":root})
	if err=os.WriteFile(filepath.Join(root,"install.json"),b,0600);err!=nil{t.Fatal(err)}
	before,err:=os.ReadFile(filepath.Join(root,"install.json"))
	if err!=nil{t.Fatal(err)}
	if _,err=Setup(testExtensionID,"chrome","",executable);err==nil || err.Error()!="E_MIGRATION_REQUIRED"{t.Fatalf("legacy takeover allowed: %v",err)}
	after,_:=os.ReadFile(filepath.Join(root,"install.json"))
	if string(after)!=string(before){t.Fatal("legacy install mutated")}
}
