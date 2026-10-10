//go:build darwin || linux

package browserbridge

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"syscall"
	"time"
)

type Installation struct {
	Name string
	ExtensionID string
	Browser string
	UserDataDir string
	SocketPath string
	ClientCredential string
	InstallRoot string
	Provider string
	Executable string
	CreatedAt string
	InstalledAt string
}
var nativeInstancePattern=regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)
func nativeInstance() (string,bool,error) {
	instance,set:=os.LookupEnv("OPENDESK_NATIVE_INSTANCE")
	if !set{return "",false,nil}
	if instance=="" || !nativeInstancePattern.MatchString(instance){return "",true,errors.New("E_INSTALL_INSTANCE")}
	return instance,true,nil
}
func browserBaseDir() (string,error) {
	home,err:=os.UserHomeDir();if err!=nil{return "",err}
	return filepath.Join(home,".opendesk-browser"),nil
}
func ensureBrowserBaseDir() (string,error) {
	base,err:=browserBaseDir();if err!=nil{return "",err}
	if _,err=os.Lstat(base);err==nil{return base,requireDir(base)}
	if !os.IsNotExist(err){return "",err}
	if err=os.Mkdir(base,0700);err!=nil{return "",err}
	return base,requireDir(base)
}
func installRootChecked() (string,error) {
	base,err:=browserBaseDir();if err!=nil{return "",err}
	instance,_,err:=nativeInstance();if err!=nil{return "",err}
	if instance==""{return filepath.Join(base,"native-agent-r1"),nil}
	return filepath.Join(base,"native-agent-instances",instance),nil
}
func installRoot() string {root,_:=installRootChecked();return root}
func configPath() string {return filepath.Join(installRoot(),"install.json")}
func userOwned(info os.FileInfo) bool {
	s,ok:=info.Sys().(*syscall.Stat_t)
	return ok && int(s.Uid)==os.Getuid()
}
func requireRegular(path string,mode os.FileMode) (os.FileInfo,error) {
	info,err:=os.Lstat(path)
	if err!=nil{return nil,err}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink!=0 || !userOwned(info) ||
		info.Mode().Perm()&0077!=0 || (mode!=0 && info.Mode().Perm()!=mode) {
		return nil,errors.New("E_INSTALL_PERMISSIONS")
	}
	return info,nil
}
func requireDir(path string) error {
	info,err:=os.Lstat(path)
	if err!=nil{return err}
	if !info.IsDir() || info.Mode()&os.ModeSymlink!=0 || !userOwned(info) || info.Mode().Perm()&0077!=0 {
		return errors.New("E_INSTALL_PERMISSIONS")
	}
	return nil
}
func ensureDir(path string) error {
	if err:=os.MkdirAll(path,0700);err!=nil{return err}
	return requireDir(path)
}
// Chrome owns its NativeMessagingHosts directory. An existing safe 0755
// directory is valid; we must not chmod a shared Chrome profile directory.
func ensureManifestDir(path string) error {
	if err:=os.MkdirAll(path,0755);err!=nil{return err}
	info,err:=os.Lstat(path)
	if err!=nil{return err}
	if !info.IsDir() || info.Mode()&os.ModeSymlink!=0 || !userOwned(info) ||
		info.Mode().Perm()&0022!=0 {
		return errors.New("E_INSTALL_PERMISSIONS")
	}
	return nil
}
func ManifestFor(browser,userDataDir string) (string,error) {
	if browser!="chrome" && browser!="cft"{return "",errors.New("E_BROWSER")}
	var profile string
	if userDataDir!="" {
		if !filepath.IsAbs(userDataDir) || filepath.Clean(userDataDir)!=userDataDir{
			return "",errors.New("E_PROFILE_PATH")
		}
		var err error
		profile,err=filepath.EvalSymlinks(userDataDir)
		if err!=nil{return "",err}
	}else{
		home,err:=os.UserHomeDir();if err!=nil{return "",err}
		if runtime.GOOS=="darwin"{
			dir:="Chrome";if browser=="cft"{dir="ChromeForTesting"}
			profile=filepath.Join(home,"Library","Application Support","Google",dir)
		}else{
			dir:="google-chrome";if browser=="cft"{dir="google-chrome-for-testing"}
			profile=filepath.Join(home,".config",dir)
		}
	}
	return filepath.Join(profile,"NativeMessagingHosts",HostName+".json"),nil
}
func readConfig() (Installation,error) {
	var cfg Installation
	root,err:=installRootChecked();if err!=nil{return cfg,err}
	base,err:=browserBaseDir();if err!=nil{return cfg,err}
	if err:=requireDir(base);err!=nil{return cfg,err}
	if err:=requireDir(filepath.Dir(root));err!=nil{return cfg,err}
	if err:=requireDir(root);err!=nil{return cfg,err}
	if _,err:=requireRegular(configPath(),0600);err!=nil{return cfg,err}
	b,err:=os.ReadFile(configPath());if err!=nil{return cfg,err}
	if err:=json.Unmarshal(b,&cfg);err!=nil{return cfg,errors.New("E_INSTALL_INVALID")}
	if cfg.Name!=HostName || !ExtensionIDValid(cfg.ExtensionID) ||
		!CredentialValid(cfg.ClientCredential) || cfg.InstallRoot!=root ||
		cfg.SocketPath!=filepath.Join(root,"agent.sock") ||
		(cfg.Browser!="chrome" && cfg.Browser!="cft") {
		return cfg,errors.New("E_INSTALL_INVALID")
	}
	return cfg,nil
}
func Load() (Installation,error) {
	cfg,err:=readConfig()
	if err!=nil{return cfg,err}
	if cfg.Provider!="opendesk" || !filepath.IsAbs(cfg.Executable) {
		return cfg,errors.New("E_MIGRATION_REQUIRED")
	}
	wrapperFile:=filepath.Join(cfg.InstallRoot,"native-host")
	if _,err:=requireRegular(wrapperFile,0700);err!=nil{return cfg,err}
	if err:=validateWrapper(wrapperFile,cfg.Executable);err!=nil{return cfg,err}
	return cfg,nil
}
func writeAtomic(file string,data []byte,mode os.FileMode) error {
	if _,err:=os.Lstat(file);err==nil{
		if _,err=requireRegular(file,0);err!=nil{return err}
	}else if !os.IsNotExist(err){return err}
	tmp:=file+".new"
	if _,err:=os.Lstat(tmp);err==nil{return errors.New("E_INSTALL_CONFLICT")}else if !os.IsNotExist(err){return err}
	f,err:=os.OpenFile(tmp,os.O_WRONLY|os.O_CREATE|os.O_EXCL,mode)
	if err!=nil{return err}
	if _,err=f.Write(data);err!=nil{f.Close();return err}
	if err=f.Sync();err!=nil{f.Close();return err}
	if err=f.Close();err!=nil{return err}
	if err=os.Chmod(tmp,mode);err!=nil{return err}
	return os.Rename(tmp,file)
}
func shellQuote(s string) string {
	return "'"+strings.ReplaceAll(s,"'","'\\''")+"'"
}
func expectedWrapper(executable string) (string,string,error) {
	instance,set,err:=nativeInstance();if err!=nil{return "","",err}
	wrapperEnv:="unset OPENDESK_NATIVE_INSTANCE\n"
	if set{wrapperEnv="OPENDESK_NATIVE_INSTANCE="+shellQuote(instance)+"\nexport OPENDESK_NATIVE_INSTANCE\n"}
	expected:="#!/bin/sh\n"+wrapperEnv+"exec "+shellQuote(executable)+" browser native-host \"$@\"\n"
	legacy:="#!/bin/sh\nexec "+shellQuote(executable)+" browser native-host \"$@\"\n"
	return expected,legacy,nil
}
func validateWrapper(file,executable string) error {
	current,err:=os.ReadFile(file);if err!=nil{return err}
	expected,legacy,err:=expectedWrapper(executable);if err!=nil{return err}
	_,set,_:=nativeInstance()
	if string(current)==expected || (!set && string(current)==legacy){return nil}
	return errors.New("E_MIGRATION_REQUIRED")
}
func expectedManifest(cfg Installation) map[string]any {
	return map[string]any{"name":HostName,
		"description":"OpenDesk Browser Native Messaging Host (OpenDesk)",
		"path":filepath.Join(cfg.InstallRoot,"native-host"),
		"type":"stdio",
		"allowed_origins":[]string{"chrome-extension://"+cfg.ExtensionID+"/"}}
}
func validateManifest(file string,cfg Installation) error {
	if _,err:=requireRegular(file,0);err!=nil{return err}
	b,err:=os.ReadFile(file);if err!=nil{return err}
	var m map[string]json.RawMessage
	if json.Unmarshal(b,&m)!=nil{return errors.New("E_MANIFEST_CONFLICT")}
	expected:=expectedManifest(cfg)
	for _,key:=range []string{"name","path","type"}{
		want,_:=json.Marshal(expected[key])
		if string(m[key])!=string(want){return errors.New("E_MANIFEST_CONFLICT")}
	}
	var origins []string
	if err:=json.Unmarshal(m["allowed_origins"],&origins);err!=nil ||
		len(origins)!=1 || origins[0]!="chrome-extension://"+cfg.ExtensionID+"/"{
		return errors.New("E_MANIFEST_CONFLICT")
	}
	return nil
}
// Release maintainers must replace this EMPTY constant only after verifying
// the actual Chrome Web Store extension ID and signed distribution. Never
// default to a randomly generated unpacked/CFT ID or accept a wildcard.
// Its empty value is intentional: unpublished builds must fail closed.
const verifiedOfficialExtensionID = ""

// Resolve the omitted command-line parameters from an ALREADY authenticated
// OpenDesk installation or a release-pinned official ID. The absence of a
// verified release identity on a fresh machine cannot be repaired by guessing.
// This is a CLI/installer convenience, not a substitute for Chrome's precise
// allowed_origins permission boundary.
func SetupAutomatic(extensionID,browser,userDataDir,executable string) (map[string]any,error) {
    if extensionID!="" && !ExtensionIDValid(extensionID) {return nil,errors.New("E_EXTENSION_ID")}
	if _,err:=installRootChecked();err!=nil{return nil,err}
    var previous *Installation
    if _,err:=os.Lstat(configPath());err==nil {
        saved,err:=Load()
        if err!=nil{return nil,err} // Includes legacy Node and unsafe installation paths.
        previous=&saved
    } else if !os.IsNotExist(err){return nil,err}
    if extensionID=="" {
        if previous!=nil {
            extensionID=previous.ExtensionID
        }else{
            if verifiedOfficialExtensionID==""{return nil,errors.New("E_OFFICIAL_ID_UNAVAILABLE")}
            if !ExtensionIDValid(verifiedOfficialExtensionID){return nil,errors.New("E_OFFICIAL_ID_INVALID")}
            extensionID=verifiedOfficialExtensionID
        }
    }
    if browser=="" {
        if previous!=nil{browser=previous.Browser}else{browser="chrome"}
    }
    if userDataDir=="" && previous!=nil{userDataDir=previous.UserDataDir}
	if _,set,_:=nativeInstance();set && (browser!="cft" || userDataDir==""){return nil,errors.New("E_INSTANCE_PROFILE")}
    // Setup enforces browser/profile/extension identity equality, socket
    // ownership, private permissions and Node→Go migration isolation.
    return Setup(extensionID,browser,userDataDir,executable)
}

// Setup never replaces the legacy Node provider. Existing installations
// require an explicitly reviewed migration with a reversible byte-for-byte
// backup, not an implicit setup/update side effect.
func Setup(extensionID,browser,userDataDir,executable string) (map[string]any,error) {
	if !ExtensionIDValid(extensionID){return nil,errors.New("E_EXTENSION_ID")}
	if browser!="chrome" && browser!="cft"{return nil,errors.New("E_BROWSER")}
	root,err:=installRootChecked();if err!=nil{return nil,err}
	if _,set,_:=nativeInstance();set && (browser!="cft" || userDataDir==""){return nil,errors.New("E_INSTANCE_PROFILE")}
	if userDataDir!=""{
		var err error
		userDataDir,err=filepath.EvalSymlinks(userDataDir)
		if err!=nil{return nil,err}
	}
	manifest,err:=ManifestFor(browser,userDataDir);if err!=nil{return nil,err}
	if _,err=os.Lstat(filepath.Join(root,"agent.sock"));err==nil{
		return nil,errors.New("E_SOCKET_IN_USE")
	}else if !os.IsNotExist(err){return nil,err}
	if executable==""{executable,err=os.Executable();if err!=nil{return nil,err}}
	executable,err=filepath.Abs(executable);if err!=nil{return nil,err}
	executable,err=filepath.EvalSymlinks(executable);if err!=nil{return nil,err}
	if info,err:=os.Stat(executable);err!=nil || !info.Mode().IsRegular() || info.Mode().Perm()&0111==0 {
		return nil,errors.New("E_EXECUTABLE")
	}
	if len(filepath.Join(root,"agent.sock"))>=104{
		return nil,errors.New("E_SOCKET_PATH")
	}
	if _,err=ensureBrowserBaseDir();err!=nil{return nil,err}
	if err=ensureDir(filepath.Dir(root));err!=nil{return nil,err}
	if err=ensureDir(root);err!=nil{return nil,err}
	cfg:=Installation{Name:HostName,ExtensionID:extensionID,Browser:browser,UserDataDir:userDataDir,
		InstallRoot:root,SocketPath:filepath.Join(root,"agent.sock"),Provider:"opendesk",Executable:executable}
	wrapperExecutable:=executable
	if _,err=os.Lstat(configPath());err==nil{
		var prior Installation
		prior,err=Load()
		if err!=nil{return nil,err}
		if prior.ExtensionID!=extensionID{return nil,errors.New("E_EXTENSION_ID_CONFLICT")}
		if prior.Browser!=browser{return nil,errors.New("E_BROWSER_CONFLICT")}
		if prior.UserDataDir!=userDataDir{return nil,errors.New("E_PROFILE_CONFLICT")}
		cfg.ClientCredential=prior.ClientCredential
		cfg.CreatedAt=prior.CreatedAt
		wrapperExecutable=prior.Executable
	}else if !os.IsNotExist(err){return nil,err}
	if cfg.ClientCredential==""{
		var credential [32]byte
		if _,err=rand.Read(credential[:]);err!=nil{return nil,err}
		cfg.ClientCredential=hex.EncodeToString(credential[:])
	}
	if cfg.CreatedAt==""{cfg.CreatedAt=time.Now().UTC().Format(time.RFC3339Nano)}
	cfg.InstalledAt=time.Now().UTC().Format(time.RFC3339Nano)
	// Never change an existing manifest which is not already our own.
	if _,err=os.Lstat(manifest);err==nil{
		if err=validateManifest(manifest,cfg);err!=nil{return nil,errors.New("E_MANIFEST_CONFLICT")}
	}else if !os.IsNotExist(err){return nil,err}
	wrapperFile:=filepath.Join(root,"native-host")
	if _,err=os.Lstat(wrapperFile);err==nil{
		if _,err=requireRegular(wrapperFile,0700);err!=nil{return nil,err}
		if err=validateWrapper(wrapperFile,wrapperExecutable);err!=nil{return nil,err}
	}else if !os.IsNotExist(err){return nil,err}
	if err=ensureManifestDir(filepath.Dir(manifest));err!=nil{return nil,err}
	wrapper,_,err:=expectedWrapper(executable);if err!=nil{return nil,err}
	configMap:=map[string]any{
		"name":cfg.Name,"extensionId":cfg.ExtensionID,"browser":cfg.Browser,
		"userDataDir":func() any {if cfg.UserDataDir==""{return nil};return cfg.UserDataDir}(),
		"socketPath":cfg.SocketPath,"clientCredential":cfg.ClientCredential,
		"installRoot":cfg.InstallRoot,"provider":cfg.Provider,"executable":cfg.Executable,
		"createdAt":cfg.CreatedAt,"installedAt":cfg.InstalledAt,
	}
	infoBytes,_:=json.MarshalIndent(configMap,"","  ")
	manifestBytes,_:=json.MarshalIndent(expectedManifest(cfg),"","  ")
	if err=writeAtomic(wrapperFile,[]byte(wrapper),0700);err!=nil{return nil,err}
	if err=writeAtomic(configPath(),append(infoBytes,'\n'),0600);err!=nil{return nil,err}
	if err=writeAtomic(manifest,append(manifestBytes,'\n'),0600);err!=nil{return nil,err}
	return map[string]any{"installed":true,"extensionId":cfg.ExtensionID,"browser":browser,
		"manifest":manifest,"nativeHost":wrapperFile,"provider":"opendesk"},nil
}
func Doctor() map[string]any {
	out:=map[string]any{"installed":false,"socketExists":false}
	cfg,err:=Load()
	if err!=nil{
		out["error"]=fmt.Sprintf("%v",err)
		return out
	}
	out["extensionId"]=cfg.ExtensionID
	out["browser"]=cfg.Browser
	manifest,_:=ManifestFor(cfg.Browser,cfg.UserDataDir)
	out["manifest"]=manifest
	_,err=os.Lstat(cfg.SocketPath)
	out["socketExists"]=err==nil
	if err=validateManifest(manifest,cfg);err!=nil{out["error"]="E_MANIFEST_CONFLICT";return out}
	out["installed"]=true
	out["provider"]="opendesk"
	out["note"]="Socket presence does not prove an authenticated Chrome connection"
	return out
}
func Cleanup() (map[string]any,error) {
	cfg,err:=Load();if err!=nil{return nil,err}
	if _,err=os.Lstat(cfg.SocketPath);err==nil{return nil,errors.New("E_SOCKET_IN_USE")}else if !os.IsNotExist(err){return nil,err}
	manifest,err:=ManifestFor(cfg.Browser,cfg.UserDataDir);if err!=nil{return nil,err}
	if err=validateManifest(manifest,cfg);err!=nil{return nil,err}
	// Cleanup is an explicit uninstall: revoke all Go-owned project grants as
	// part of the same owner-scoped deletion. Otherwise a subsequent install
	// could accidentally regain a previous user's file authorization.
	files:=[]string{manifest,filepath.Join(cfg.InstallRoot,"native-host"),configPath()}
	for _,name:=range []string{projectStoreName,"project-grants.lock"}{
		p:=filepath.Join(cfg.InstallRoot,name)
		if _,err:=os.Lstat(p);os.IsNotExist(err){continue
		}else if err!=nil{return nil,err}
		if _,err:=requireRegular(p,0600);err!=nil{return nil,err}
		files=append(files,p)
	}
	if _,err:=readProjectStore(cfg);err!=nil{return nil,err}
	for _,file:=range files{
		if _,err:=requireRegular(file,0);err!=nil{return nil,err}
	}
	for _,file:=range files{
		if err=os.Remove(file);err!=nil{return nil,err}
	}
	// Preserve any old provider files and every unrelated Native host.
	if entries,err:=os.ReadDir(cfg.InstallRoot);err==nil && len(entries)==0{_ = os.Remove(cfg.InstallRoot)}
	return map[string]any{"cleaned":true,"otherNativeHostsUntouched":true},nil
}
