//go:build darwin || linux

package browsercli

import (
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "os"
    "os/exec"
    "os/signal"
    "path/filepath"
    "strings"
    "syscall"
)

const devReceiptFormat = "opendesk.dev-cli.r17"
const devHelp = "用法: opendesk browser [dev [目录] | dev -- <特殊目录> | help | --version]\\n" +
    "省略 dev 时从当前目录接入；只读 Workspace，合法 OpenDesk 程序需明确点击运行。\\n"

type devReceipt struct {
    Format string `json:"format"`
    Entry string `json:"entry"`
    SHA256 string `json:"sha256"`
}

func devTrustedPath(path string, directory bool, private bool) error {
    info,err:=os.Lstat(path)
    if err!=nil{return err}
    if info.Mode()&os.ModeSymlink!=0{return errors.New("E_DEV_INSTALL_PERMISSIONS")}
    if directory {
        if !info.IsDir(){return errors.New("E_DEV_INSTALL_PERMISSIONS")}
    }else if !info.Mode().IsRegular(){return errors.New("E_DEV_INSTALL_PERMISSIONS")}
    if private&&info.Mode().Perm()&0077!=0{return errors.New("E_DEV_INSTALL_PERMISSIONS")}
    stat,ok:=info.Sys().(*syscall.Stat_t)
    if !ok||int(stat.Uid)!=os.Getuid()&&stat.Uid!=0{return errors.New("E_DEV_INSTALL_PERMISSIONS")}
    return nil
}

func findTrustedDevTool() (string,error) {
    home,err:=os.UserHomeDir();if err!=nil{return "",err}
    root:=filepath.Join(home,".opendesk-browser")
    dir:=filepath.Join(root,"dev-tool-r17")
    for _,p:=range []string{root,dir} {
        if err:=devTrustedPath(p,true,true);err!=nil{return "",errors.New("E_DEV_COMPONENT_MISSING: Install the R17 opendesk-dev npm package and run opendesk-dev --register-go")}
    }
    receipt:=filepath.Join(dir,"entry.json")
    if err:=devTrustedPath(receipt,false,true);err!=nil{return "",errors.New("E_DEV_COMPONENT_MISSING: Run opendesk-dev --register-go")}
    data,err:=os.ReadFile(receipt)
    if err!=nil||len(data)>4096{return "",errors.New("E_DEV_COMPONENT_INVALID")}
    var v devReceipt
    if json.Unmarshal(data,&v)!=nil||v.Format!=devReceiptFormat||
        len(v.SHA256)!=64||!filepath.IsAbs(v.Entry)||filepath.Clean(v.Entry)!=v.Entry||
        !strings.HasSuffix(v.Entry,filepath.Join("lib","node_modules","@shopable","opendesk-dev","bin","opendesk-dev.mjs")){
        return "",errors.New("E_DEV_COMPONENT_INVALID")
    }
    if err:=devTrustedPath(v.Entry,false,false);err!=nil{return "",errors.New("E_DEV_COMPONENT_INVALID")}
    // A replaced file (including a version update) cannot silently acquire
    // the authority previously recorded by explicit npm CLI registration.
    body,err:=os.ReadFile(v.Entry)
    if err!=nil||len(body)>131072{return "",errors.New("E_DEV_COMPONENT_INVALID")}
    digest:=sha256.Sum256(body)
    if hex.EncodeToString(digest[:])!=v.SHA256{return "",errors.New("E_DEV_COMPONENT_CHANGED: Run opendesk-dev --register-go after reviewing the updated package")}
    return v.Entry,nil
}

func findTrustedNode() (string,error) {
    dirs:=[]string{"/opt/homebrew/bin","/usr/local/bin","/usr/bin"}
    dirs=append(dirs,filepath.SplitList(os.Getenv("PATH"))...)
    cwd,_:=os.Getwd()
    seen:=map[string]bool{}
    for _,dir:=range dirs{
        if !filepath.IsAbs(dir)||strings.Contains(dir,filepath.Join("node_modules",""))||seen[dir]||dir==cwd||
            cwd!=""&&strings.HasPrefix(dir,cwd+string(os.PathSeparator)){continue}
        seen[dir]=true
        file:=filepath.Join(dir,"node")
        // Node installed via nvm, brew or system directories may be a
        // symlink. Resolve only the executable and validate the resolved file.
        actual,err:=filepath.EvalSymlinks(file)
        if err!=nil||!filepath.IsAbs(actual)||strings.Contains(actual,string(os.PathSeparator)+"node_modules"+string(os.PathSeparator))||
            cwd!=""&&strings.HasPrefix(actual,cwd+string(os.PathSeparator)){continue}
        if err:=devTrustedPath(actual,false,false);err!=nil{continue}
        stat,_:=os.Stat(actual)
        if stat.Mode().Perm()&0111==0{continue}
        return actual,nil
    }
    return "",errors.New("E_NODE_MISSING: Install a supported Node.js >=22.12 runtime")
}

// The Go binary dispatches only to a previously registered, hashed npm CLI
// entry. It never resolves an executable from the project or invokes a shell.
func runBrowserDev(rest []string, stdout, stderr io.Writer) int {
    if len(rest)==1&& (rest[0]=="--help"||rest[0]=="-h"||rest[0]=="help"){
        _,_=io.WriteString(stdout,devHelp);return 0
    }
    if len(rest)>2||len(rest)==2&&rest[0]!="--"||
        len(rest)==1&&strings.HasPrefix(rest[0],"-")&&rest[0]!="--" {
        return exitError(stderr,errors.New("E_SCHEMA: Usage opendesk browser dev [directory] or dev -- <directory>"))
    }
    if len(rest)==1&&rest[0]=="--"||len(rest)==2&&rest[1]=="" {
        return exitError(stderr,errors.New("E_SCHEMA: missing directory"))
    }
    entry,err:=findTrustedDevTool()
    if err!=nil{return exitError(stderr,err)}
    node,err:=findTrustedNode()
    if err!=nil{return exitError(stderr,err)}
    args:=[]string{entry,"dev"}
    args=append(args,rest...)
    cmd:=exec.Command(node,args...)
    cmd.Stdin=os.Stdin
    cmd.Stdout=stdout
    cmd.Stderr=stderr
    if err=cmd.Start();err!=nil{return exitError(stderr,fmt.Errorf("E_NODE_START: %w",err))}
    interrupted:=make(chan os.Signal,1)
    signal.Notify(interrupted,os.Interrupt,syscall.SIGTERM)
    defer signal.Stop(interrupted)
    finished:=make(chan error,1)
    go func(){finished<-cmd.Wait()}()
    select {
    case err=<-finished:
    case sig:=<-interrupted:
        _=cmd.Process.Signal(sig)
        err=<-finished
    }
    if err==nil{return 0}
    var exited *exec.ExitError
    if errors.As(err,&exited){return exited.ExitCode()}
    return exitError(stderr,fmt.Errorf("E_NODE_EXIT: %w",err))
}
