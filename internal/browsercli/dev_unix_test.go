//go:build darwin || linux

package browsercli

import (
    "bytes"
    "os"
    "path/filepath"
    "strings"
    "testing"
)

func TestR17GoCLIHelpVersionAndUnknownNeverAuthorizeDirectory(t *testing.T) {
    home,err:=os.MkdirTemp("","opendesk-r17-cli-")
    if err!=nil{t.Fatal(err)}
    t.Cleanup(func(){_ = os.RemoveAll(home)})
    if err=os.Chmod(home,0700);err!=nil{t.Fatal(err)}
    t.Setenv("HOME",home)
    for _,args:=range [][]string{
        {"browser","help"},{"browser","--help"},{"browser","-h"},
        {"browser","dev","--help"},{"browser","--version"},
    }{
        var out,diag bytes.Buffer
        if code:=Execute(args,&out,&diag);code!=0||out.Len()==0||diag.Len()!=0{
            t.Fatalf("side-effect-free command %v rejected: code=%d stdout=%q stderr=%q",args,code,out.String(),diag.String())
        }
    }
    if _,err:=os.Lstat(filepath.Join(home,".opendesk-browser"));!os.IsNotExist(err){
        t.Fatalf("help/version performed installation side effect: %v",err)
    }
    for _,args:=range [][]string{
        {"browser","unexpected-script.js"}, {"browser","not-a-directory"},
    }{
        var out,diag bytes.Buffer
        if code:=Execute(args,&out,&diag);code==0||!strings.Contains(diag.String(),"E_CAPABILITY"){
            t.Fatalf("unknown subcommand implicitly authorized: %v %s",args,diag.String())
        }
    }
    for _,args:=range [][]string{
        {"browser"},{"browser","dev"},{"browser","dev","."},
    }{
        var out,diag bytes.Buffer
        if code:=Execute(args,&out,&diag);code==0||!strings.Contains(diag.String(),"E_DEV_COMPONENT_MISSING"){
            t.Fatalf("bare browser/dev did not consistently select trusted Node CLI: %v %s",args,diag.String())
        }
    }
}
