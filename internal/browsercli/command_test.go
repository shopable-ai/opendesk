//go:build darwin || linux

package browsercli

import (
    "bytes"
    "encoding/json"
    "os"
    "strings"
    "testing"

    "opendesk/internal/browserbridge"
)

const cliTestExtensionID = "abcdefghijklmnopabcdefghijklmnop"

func TestNoArgumentSetupReusesTrustedInstall(t *testing.T) {
    home:=t.TempDir()
    if err:=os.Chmod(home,0700);err!=nil{t.Fatal(err)}
    t.Setenv("HOME",home)
    binary,err:=os.Executable()
    if err!=nil{t.Fatal(err)}
    if _,err=browserbridge.Setup(cliTestExtensionID,"chrome","",binary);err!=nil{t.Fatal(err)}
    original,err:=browserbridge.Load()
    if err!=nil{t.Fatal(err)}
    for _,command:=range []string{"setup","update"} {
        var out,diagnostics bytes.Buffer
        if code:=Execute([]string{"browser",command},&out,&diagnostics);code!=0 {
            t.Fatalf("%s without flags rejected an existing trusted binding: %s",command,diagnostics.String())
        }
        var reply map[string]any
        if err=json.Unmarshal(out.Bytes(),&reply);err!=nil{t.Fatal(err)}
        if reply["extensionId"]!=cliTestExtensionID || reply["browser"]!="chrome" {
            t.Fatalf("silent identity drift: %v",reply)
        }
        current,err:=browserbridge.Load()
        if err!=nil{t.Fatal(err)}
        if current.ClientCredential!=original.ClientCredential {t.Fatal("credential was rotated")}
    }
    var out,diagnostics bytes.Buffer
    conflictingID:=strings.Repeat("b",32)
    if code:=Execute([]string{"browser","update","--extension-id",conflictingID},&out,&diagnostics);code==0 {
        t.Fatal("explicit conflicting extension ID was accepted")
    }
    if !strings.Contains(diagnostics.String(),"E_EXTENSION_ID_CONFLICT") {
        t.Fatalf("missing conflict code: %s",diagnostics.String())
    }
}

func TestFreshUnpublishedSetupReturnsHelpfulFailureWithoutWriting(t *testing.T) {
    home:=t.TempDir()
    if err:=os.Chmod(home,0700);err!=nil{t.Fatal(err)}
    t.Setenv("HOME",home)
    var out,diagnostics bytes.Buffer
    code:=Execute([]string{"browser","setup"},&out,&diagnostics)
    if code==0 {t.Fatal("an unregistered dev build must not guess a Chrome extension ID")}
    if !strings.Contains(diagnostics.String(),"E_OFFICIAL_ID_UNAVAILABLE") {
        t.Fatalf("expected explicit release-identity diagnostic: %s",diagnostics.String())
    }
    if out.Len()!=0 {t.Fatalf("a failed setup returned success output: %s",out.String())}
}
