//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
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

func TestAutomaticSetupNeverGuessesAnExtensionID(t *testing.T) {
    home,err:=os.MkdirTemp("/tmp","od-inst-auto-fresh-")
    if err!=nil{t.Fatal(err)}
    t.Cleanup(func(){_ = os.RemoveAll(home)})
    if err=os.Chmod(home,0700);err!=nil{t.Fatal(err)}
    t.Setenv("HOME",home)
    executable,err:=os.Executable()
    if err!=nil{t.Fatal(err)}
    if verifiedOfficialExtensionID!=""{t.Skip("An official ID is now pinned; verify signed-channel coverage separately")}
    if _,err=SetupAutomatic("","","",executable);err==nil || err.Error()!="E_OFFICIAL_ID_UNAVAILABLE"{
        t.Fatalf("fresh unpacked build must fail closed without a release ID, got %v",err)
    }
    if _,err=os.Lstat(configPath());!os.IsNotExist(err){t.Fatalf("a failed auto setup wrote installation config: %v",err)}
    if _,err=SetupAutomatic("not-an-extension-id","","",executable);err==nil || err.Error()!="E_EXTENSION_ID"{
        t.Fatalf("explicit malformed ID must not be silently defaulted: %v",err)
    }
}

func TestAutomaticSetupReusesExistingAuthorizedBinding(t *testing.T) {
    home,err:=os.MkdirTemp("/tmp","od-inst-auto-existing-")
    if err!=nil{t.Fatal(err)}
    t.Cleanup(func(){_ = os.RemoveAll(home)})
    if err=os.Chmod(home,0700);err!=nil{t.Fatal(err)}
    t.Setenv("HOME",home)
    executable,err:=os.Executable()
    if err!=nil{t.Fatal(err)}
    if _,err=Setup(testExtensionID,"chrome","",executable);err!=nil{t.Fatal(err)}
    original,err:=Load()
    if err!=nil{t.Fatal(err)}
    result,err:=SetupAutomatic("","","",executable)
    if err!=nil{t.Fatal(err)}
    if result["extensionId"]!=testExtensionID || result["browser"]!="chrome"{t.Fatalf("automatic defaults changed identity: %v",result)}
    after,err:=Load()
    if err!=nil{t.Fatal(err)}
    if after.ClientCredential!=original.ClientCredential{t.Fatal("automatic repeat changed credential")}
    if _,err=SetupAutomatic(strings.Repeat("b",32),"","",executable);err==nil || err.Error()!="E_EXTENSION_ID_CONFLICT"{
        t.Fatalf("explicit conflicting ID must fail closed: %v",err)
    }
    if _,err=SetupAutomatic("","cft","",executable);err==nil || err.Error()!="E_BROWSER_CONFLICT"{
        t.Fatalf("explicit conflicting browser must fail closed: %v",err)
    }
    // A Node legacy file must never be interpreted as a reusable Go binding.
    root:=installRoot()
    b,_:=json.Marshal(map[string]any{"name":HostName,"extensionId":testExtensionID,"browser":"chrome",
        "socketPath":filepath.Join(root,"agent.sock"),"clientCredential":strings.Repeat("a",64),"installRoot":root})
    if err=os.WriteFile(configPath(),b,0600);err!=nil{t.Fatal(err)}
    before,err:=os.ReadFile(configPath())
    if err!=nil{t.Fatal(err)}
    if _,err=SetupAutomatic("","","",executable);err==nil || err.Error()!="E_MIGRATION_REQUIRED"{
        t.Fatalf("legacy Node binding must not be auto-migrated: %v",err)
    }
    afterBytes,_:=os.ReadFile(configPath())
    if string(afterBytes)!=string(before){t.Fatal("legacy config changed during failed automatic setup")}
}

func TestLegacyNativeConnectionsRejectUpdateWithoutChangingInstallation(t *testing.T) {
	updated, files := transactionFixture(t)
	parent, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	a, aw, ar := openPreparedConnection(t, parent, func(h *Host) {
		h.cfg.ConnectionUpdateVersion = 0
		data, err := json.Marshal(h.cfg)
		if err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(h.cfg.InstallRoot, "connection.json")
		if err = writeAtomic(file, data, 0600); err != nil {
			t.Fatal(err)
		}
		h.connectionInfo, err = os.Lstat(file)
		if err != nil {
			t.Fatal(err)
		}
	})
	b, bw, br := openConnection(t, parent)
	if a.cfg.ConnectionID == b.cfg.ConnectionID {
		t.Fatal("active Native connections share an identity")
	}

	if _, err = SetupAutomatic("", "", "", updated.Executable); err == nil || err.Error() != "E_SOCKET_IN_USE" {
		t.Fatalf("active connections must reject replacement: %v", err)
	}
	assertPreimages(t, files)
	current, err := Load()
	if err != nil || current != parent {
		t.Fatalf("rejected update changed installation: %v", err)
	}
	for _, host := range []*Host{a, b} {
		selected, err := LoadConnection(host.cfg.ConnectionID)
		if err != nil || selected.ConnectionID != host.cfg.ConnectionID {
			t.Fatalf("rejected update retired an active connection: %v", err)
		}
	}
	securityRoundTrip(t, a, aw, ar)
	securityRoundTrip(t, b, bw, br)
}

func TestRollingNativeUpdatePreservesInFlightAndNewConnections(t *testing.T) {
	updated, _ := transactionFixture(t)
	parent, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	a, aw, ar := openConnection(t, parent)
	b, bw, br := openConnection(t, parent)
	client, err := dialConnection(a.cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	request := MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": "rolling-inflight", "method": "bridge.status", "params": map[string]any{}})
	if err = WriteLine(client, request); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadFrame(ar); err != nil || !bytes.Equal(got, request) {
		t.Fatalf("request: %s %v", got, err)
	}
	scopeFiles := map[string][]byte{}
	for _, host := range []*Host{a, b} {
		file := filepath.Join(host.cfg.InstallRoot, "connection.json")
		scopeFiles[file], err = os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
	}
	result, err := SetupAutomatic("", "", "", updated.Executable)
	if err != nil || result["activeConnectionsPreserved"] != 2 || result["runtimeActivation"] != "new-connections" {
		t.Fatalf("rolling update: %v %v", result, err)
	}
	current, err := Load()
	if err != nil || current.Executable != updated.Executable || current.ClientCredential != parent.ClientCredential {
		t.Fatalf("updated parent drift: %v", err)
	}
	for file, before := range scopeFiles {
		after, err := os.ReadFile(file)
		if err != nil || !bytes.Equal(before, after) {
			t.Fatalf("updated live scope %s: %v", file, err)
		}
	}
	reply := MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": "rolling-inflight", "result": map[string]any{"completed": true}})
	if err = WriteFrame(aw, reply); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadLine(bufio.NewReader(client)); err != nil || !bytes.Equal(got, reply) {
		t.Fatalf("in-flight reply: %s %v", got, err)
	}
	securityRoundTrip(t, b, bw, br)
	c, cw, cr := openConnection(t, current)
	if c.cfg.Executable != updated.Executable || c.cfg.RetainedConnections != "" || c.cfg.ClientCredential == a.cfg.ClientCredential || c.cfg.InstallRoot == b.cfg.InstallRoot {
		t.Fatal("new connection inherited another runtime identity")
	}
	securityRoundTrip(t, c, cw, cr)
	if _, err = NewConnectionHost(parent, a.origin, bytes.NewReader(nil), io.Discard); err == nil || err.Error() != "E_CONNECTION_REVOKED" {
		t.Fatalf("stale launcher admitted after update: %v", err)
	}
	a.Close()
	if _, err = SetupAutomatic("", "", "", parent.Executable); err != nil {
		t.Fatal(err)
	}
	next, err := Load()
	if err != nil || retainedConnectionCount(next.RetainedConnections) != 2 || strings.Contains(next.RetainedConnections, a.cfg.ConnectionID) {
		t.Fatalf("retired scope retained across update: %v", err)
	}
	securityRoundTrip(t, b, bw, br)
	securityRoundTrip(t, c, cw, cr)
	if _, err = LoadConnection(a.cfg.ConnectionID); err == nil {
		t.Fatal("closed scope fell back to a surviving browser")
	}
}

func TestRollingNativeUpdateRollbackPreservesConnections(t *testing.T) {
	updated, files := transactionFixture(t)
	parent, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	a, aw, ar := openConnection(t, parent)
	b, bw, br := openConnection(t, parent)
	if _, err = SetupAutomatic("", "", "", updated.Executable); err != nil {
		t.Fatal(err)
	}
	retained, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	for i := range files {
		files[i].Before, err = os.ReadFile(files[i].Path)
		if err != nil {
			t.Fatal(err)
		}
	}
	wrapper, _, err := expectedWrapper(parent.Executable)
	if err != nil {
		t.Fatal(err)
	}
	publication := installMutation{Path: files[0].Path, Data: []byte(wrapper), Mode: 0700}
	_, err = SetupAutomaticContext(cancelAfterMutation{context.Background(), publication}, "", "", "", parent.Executable)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("update cancellation: %v", err)
	}
	assertPreimages(t, files)
	current, err := Load()
	if err != nil || current != retained {
		t.Fatalf("rollback parent drift: %v", err)
	}
	securityRoundTrip(t, a, aw, ar)
	securityRoundTrip(t, b, bw, br)
}

func TestRollingNativeUpdateRejectsUnverifiableLiveScope(t *testing.T) {
	updated, files := transactionFixture(t)
	parent, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	a, aw, ar := openConnection(t, parent)
	file := filepath.Join(a.cfg.InstallRoot, "connection.json")
	before, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if err = writeAtomic(file, []byte("{"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = SetupAutomatic("", "", "", updated.Executable); err == nil || err.Error() != "E_CONNECTION_NOT_READY" {
		t.Fatalf("unverifiable live scope ignored: %v", err)
	}
	assertPreimages(t, files)
	if err = writeAtomic(file, before, 0600); err != nil {
		t.Fatal(err)
	}
	securityRoundTrip(t, a, aw, ar)
}

func TestRollingNativeUpdateBindsExactScopeAndPreservesRevocation(t *testing.T) {
	updated, _ := transactionFixture(t)
	secondary := strings.Repeat("b", 32)
	if _, err := ExtensionApprove(secondary); err != nil {
		t.Fatal(err)
	}
	parent, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	a, aw, ar := openConnection(t, parent)
	b, _, _ := openConnection(t, parent, secondary)
	if _, err = SetupAutomatic("", "", "", updated.Executable); err != nil {
		t.Fatal(err)
	}
	current, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	missing := current
	missing.RetainedConnections = ""
	if validateConnectionParent(a.cfg, missing) == nil {
		t.Fatal("old runtime accepted without retained binding")
	}
	wrong := current
	wrong.RetainedConnections = a.cfg.ConnectionID + ":" + strings.Repeat("0", 64)
	if validateConnectionParent(a.cfg, wrong) == nil {
		t.Fatal("wrong retained digest accepted")
	}
	claimed := a.cfg
	claimed.Executable = current.Executable
	if validateConnectionParent(claimed, current) == nil {
		t.Fatal("same executable bypassed pinned scope digest")
	}
	for name, mutate := range map[string]func(*Installation){
		"parent credential": func(c *Installation) { c.ParentCredentialDigest = strings.Repeat("0", 64) },
		"extension":         func(c *Installation) { c.ExtensionID = strings.Repeat("c", 32) },
		"provider":          func(c *Installation) { c.Provider = "other" },
		"profile":           func(c *Installation) { c.UserDataDir = "/other" },
		"parent root":       func(c *Installation) { c.ParentRoot = "/other" },
		"scope path":        func(c *Installation) { c.SocketPath = "/other/agent.sock" },
		"unknown version":   func(c *Installation) { c.ConnectionUpdateVersion = 2 },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := a.cfg
			mutate(&candidate)
			forged := current
			forged.RetainedConnections = connectionRuntimeBinding(candidate)
			if validateConnectionParent(candidate, forged) == nil {
				t.Fatal("matching digest bypassed identity boundary")
			}
		})
	}
	if _, err = ExtensionRevoke(secondary); err != nil {
		t.Fatal(err)
	}
	if _, err = ExtensionApprove(secondary); err != nil {
		t.Fatal(err)
	}
	if _, err = LoadConnection(b.cfg.ConnectionID); err == nil {
		t.Fatal("reapproval revived retained old scope")
	}
	securityRoundTrip(t, a, aw, ar)
}

func TestConnectionRuntimeBindingV1GoldenAndCanonicalList(t *testing.T) {
	cfg := Installation{ConnectionUpdateVersion: 1, ConnectionID: strings.Repeat("a", 32), Executable: "/opt/OpenDesk/opendesk"}
	const want = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:a8e275e276c94457632eedeca7c1f8aeea598ea2d1ea09bcb04d36405aba48e7"
	if got := connectionRuntimeBinding(cfg); got != want {
		t.Fatalf("v1 runtime wire contract changed: %s", got)
	}
	if !validRetainedConnections(want) {
		t.Fatal("valid binding rejected")
	}
	for _, value := range []string{want + "," + want, want + ",", strings.ToUpper(want), "bad", strings.Repeat(want+",", MaxClients) + want} {
		if validRetainedConnections(value) {
			t.Fatalf("invalid retained list accepted: %q", value)
		}
	}
}

func TestRollingNativeUpdateExcludesVerifiedOtherInstance(t *testing.T) {
	updated, _ := transactionFixture(t)
	parent, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	// Allocation holds a real lifetime lock without a watcher depending on
	// this test process's subsequently changed instance environment.
	other, err := NewConnectionHost(parent, "chrome-extension://"+parent.ExtensionID+"/", bytes.NewReader(nil), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(other.Close)
	file := filepath.Join(other.cfg.InstallRoot, "connection.json")
	before, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENDESK_NATIVE_INSTANCE", "rolling")
	profile := cftProfile(t, os.Getenv("HOME"), "rolling-profile")
	if _, err = Setup(testExtensionID, "cft", profile, parent.Executable); err != nil {
		t.Fatal(err)
	}
	current, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !connectionBelongsToOtherInstallation(other.cfg.ConnectionID, current) {
		t.Fatal("healthy other instance not verified")
	}
	local, w, r := openConnection(t, current)
	result, err := SetupAutomatic("", "", "", updated.Executable)
	if err != nil || result["activeConnectionsPreserved"] != 1 {
		t.Fatalf("other instance blocked update: %v %v", result, err)
	}
	after, err := os.ReadFile(file)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatalf("other instance mutated: %v", err)
	}
	securityRoundTrip(t, local, w, r)
	forged := other.cfg
	forged.ParentCredentialDigest = strings.Repeat("0", 64)
	data, _ := json.Marshal(forged)
	if err = writeAtomic(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	if connectionBelongsToOtherInstallation(other.cfg.ConnectionID, current) {
		t.Fatal("unverified foreign ownership claim trusted")
	}
	if _, err = SetupAutomatic("", "", "", parent.Executable); err == nil || err.Error() != "E_CONNECTION_NOT_READY" {
		t.Fatalf("forged foreign scope ignored: %v", err)
	}
}
