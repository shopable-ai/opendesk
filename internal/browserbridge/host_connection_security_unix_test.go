//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Keep these tests on real Native pipes and authenticated Unix sockets: an
// in-memory dispatcher cannot prove Port selection or revocation isolation.
func securityStartHost(t *testing.T, cfg Installation, scoped bool) (*Host, *io.PipeWriter, *io.PipeReader, <-chan error) {
	t.Helper()
	in, w := io.Pipe()
	r, out := io.Pipe()
	var h *Host
	var err error
	origin := "chrome-extension://" + cfg.ExtensionID + "/"
	if scoped {
		h, err = NewConnectionHost(cfg, origin, in, out)
	} else {
		h, err = NewHost(cfg, origin, in, out)
	}
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { err := h.Run(); out.CloseWithError(err); done <- err; close(done) }()
	t.Cleanup(func() {
		h.Close()
		w.Close()
		r.Close()
		out.Close()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Error("Native host did not exit")
		}
	})
	hello := make(chan error, 1)
	go func() {
		raw, err := ReadFrame(r)
		if err == nil {
			var f Fields
			f, err = Decode(raw)
			if err == nil && String(f, "kind") != "hello" {
				err = ErrSchema
			}
		}
		hello <- err
	}()
	select {
	case err := <-hello:
		if err != nil {
			t.Fatalf("hello: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("hello timeout")
	}
	return h, w, r, done
}

func securityRoundTrip(t *testing.T, h *Host, w *io.PipeWriter, r *io.PipeReader) {
	t.Helper()
	c, err := dialConnection(h.cfg)
	if err != nil {
		t.Fatalf("authenticate surviving Port: %v", err)
	}
	defer c.Close()
	request := MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": "security-probe", "method": "bridge.status", "params": map[string]any{}})
	if err = WriteLine(c, request); err != nil {
		t.Fatal(err)
	}
	received := make(chan error, 1)
	go func() {
		raw, err := ReadFrame(r)
		if err == nil && !bytes.Equal(raw, request) {
			err = ErrSchema
		}
		received <- err
	}()
	select {
	case err = <-received:
		if err != nil {
			t.Fatalf("Native request: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Native request timeout")
	}
	reply := MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": "security-probe", "result": map[string]any{"alive": true}})
	if err = WriteFrame(w, reply); err != nil {
		t.Fatal(err)
	}
	raw, err := ReadLine(bufio.NewReader(c))
	if err != nil || !bytes.Equal(raw, reply) {
		t.Fatalf("socket reply: %s %v", raw, err)
	}
}

func TestConnectionSecurityLegacyAndScopedLoadClientAmbiguity(t *testing.T) {
	cfg := connectionInstallation(t)
	// Preserve an inherited selector while exercising the unselected path.
	t.Setenv(ConnectionEnvironment, "")
	if err := os.Unsetenv(ConnectionEnvironment); err != nil {
		t.Fatal(err)
	}
	legacy, lw, _, _ := securityStartHost(t, cfg, false)
	welcome(t, legacy, lw, false)
	selected, err := LoadClient()
	if err != nil || selected != cfg {
		t.Fatalf("legacy selection: %+v %v", selected, err)
	}
	scoped, _, _ := openConnection(t, cfg)
	if _, err = LoadClient(); err == nil || err.Error() != "E_CONNECTION_REQUIRED" {
		t.Fatalf("legacy plus scoped must be ambiguous: %v", err)
	}
	t.Setenv(ConnectionEnvironment, scoped.cfg.ConnectionID)
	selected, err = LoadClient()
	if err != nil || selected.ConnectionID != scoped.cfg.ConnectionID {
		t.Fatalf("explicit scope selection: %+v %v", selected, err)
	}
	scoped.Close()
	if _, err = LoadClient(); err == nil || err.Error() != "E_CONNECTION_GONE" {
		t.Fatalf("retired explicit scope fell back to legacy: %v", err)
	}
}

func TestConnectionSecurityGrantStoresAndSharedOperationLock(t *testing.T) {
	parent := connectionInstallation(t)
	a, _, _ := openConnection(t, parent)
	b, _, _ := openConnection(t, parent)
	dir := filepath.Join(parent.InstallRoot, "source")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	dir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(dir, "entry.js")
	if err := os.WriteFile(source, []byte("export default async function main() {}\n"), 0600); err != nil {
		t.Fatal(err)
	}
	// Seed the parent as well: a new Port must not inherit legacy grants.
	t.Setenv(ConnectionEnvironment, "")
	if err := os.Unsetenv(ConnectionEnvironment); err != nil {
		t.Fatal(err)
	}
	// Public writes require an explicit selection while two Ports are live.
	for _, cfg := range []Installation{parent, a.cfg} {
		f, info, err := secureSourcePath(source)
		if err != nil {
			t.Fatal(err)
		}
		f.Close()
		dev, ino, err := inodeIdentity(info)
		if err != nil {
			t.Fatal(err)
		}
		state := newProjectStore(cfg)
		state.Projects = []ProjectGrant{{BindingID: "local-" + strings.Repeat("a", 20), Name: "entry.js", Path: source, RuntimeKind: "controller", EntryFormat: "async-main", SiteOrigin: "https://example.test", Device: dev, Inode: ino}}
		if err = writeProjectStore(cfg, state); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv(ConnectionEnvironment, a.cfg.ConnectionID)
	if _, err := WorkspaceAdd(dir, "read-write"); err != nil {
		t.Fatal(err)
	}
	for _, cfg := range []Installation{parent, b.cfg} {
		ws, err := readWorkspaceStore(cfg)
		if err != nil || len(ws.Workspaces) != 0 {
			t.Fatalf("workspace grant leaked into %s: %+v %v", cfg.InstallRoot, ws, err)
		}
	}
	projects, err := readProjectStore(b.cfg)
	if err != nil || len(projects.Projects) != 0 {
		t.Fatalf("project grant leaked: %+v %v", projects, err)
	}
	// Copying an authorized store to another Port still cannot transfer authority.
	for _, pair := range [][2]string{{projectStoreFile(a.cfg), projectStoreFile(b.cfg)}, {workspaceStorePath(a.cfg), workspaceStorePath(b.cfg)}} {
		data, err := os.ReadFile(pair[0])
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(pair[1], data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = readProjectStore(b.cfg); err == nil {
		t.Fatal("copied project credential accepted")
	}
	if _, err = readWorkspaceStore(b.cfg); err == nil {
		t.Fatal("copied workspace credential accepted")
	}
	// All three scopes contend on the parent's operation lock, in both directions.
	for _, owner := range []Installation{parent, a.cfg, b.cfg} {
		release, err := lockWorkspaceStore(owner)
		if err != nil {
			t.Fatal(err)
		}
		for _, contender := range []Installation{parent, a.cfg, b.cfg} {
			unlock, err := lockWorkspaceStore(contender)
			if err == nil {
				unlock()
				release()
				t.Fatalf("operation lock bypass: %s -> %s", owner.InstallRoot, contender.InstallRoot)
			}
			if err.Error() != "E_FILES_BUSY" {
				release()
				t.Fatalf("unexpected lock failure: %v", err)
			}
		}
		release()
	}
	release, err := lockWorkspaceStore(b.cfg)
	if err != nil {
		t.Fatalf("lock not released: %v", err)
	}
	release()
}

func TestConnectionSecurityApproveAndRevokeOnlySecondary(t *testing.T) {
	parent := connectionInstallation(t)
	primary, pw, pr := openConnection(t, parent)
	secondaryID := strings.Repeat("b", 32)
	if _, err := ExtensionApprove(secondaryID); err != nil {
		t.Fatal(err)
	}
	approved, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(approved.ApprovedExtensions, secondaryID) {
		t.Fatalf("approval not persisted: %+v", approved)
	}
	secondary, _, _ := openConnection(t, approved, secondaryID)
	if secondary.cfg.ParentRoot != parent.InstallRoot || secondary.cfg.InstallRoot == primary.cfg.InstallRoot {
		t.Fatal("secondary did not receive an independent scope")
	}
	if _, err = ExtensionRevoke(secondaryID); err != nil {
		t.Fatal(err)
	}
	select {
	case <-secondary.done:
	case <-time.After(2 * time.Second):
		t.Fatal("250ms authorization watcher did not close revoked Port")
	}
	if _, err = LoadConnection(secondary.cfg.ConnectionID); err == nil {
		t.Fatal("revoked Port remains selectable")
	}
	select {
	case <-primary.done:
		t.Fatal("secondary revoke closed primary Port")
	default:
	}
	securityRoundTrip(t, primary, pw, pr)
	revoked, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if h, err := NewConnectionHost(revoked, "chrome-extension://"+secondaryID+"/", bytes.NewReader(nil), io.Discard); err == nil {
		h.Close()
		t.Fatal("revoked origin reopened a Port")
	}
}

func TestConnectionSecurityForbiddenOriginAndWrongWelcome(t *testing.T) {
	parent := connectionInstallation(t)
	for _, origin := range []string{"chrome-extension://" + strings.Repeat("b", 32) + "/", "https://example.test/", "chrome-extension://" + parent.ExtensionID, "chrome-extension://" + parent.ExtensionID + "/extra"} {
		if h, err := NewConnectionHost(parent, origin, bytes.NewReader(nil), io.Discard); err == nil {
			h.Close()
			t.Fatalf("forbidden origin accepted: %q", origin)
		}
	}
	h, w, _, done := securityStartHost(t, parent, true)
	if err := WriteFrame(w, MustEncode(map[string]any{"v": 1, "kind": "welcome", "extensionId": strings.Repeat("b", 32), "extensionVersion": "1"})); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err == nil || err.Error() != "E_NATIVE_HANDSHAKE" {
			t.Fatalf("wrong welcome: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("wrong welcome did not terminate Port")
	}
	h.mu.Lock()
	ready := h.ready
	h.mu.Unlock()
	if ready {
		t.Fatal("wrong welcome marked Port ready")
	}
	if _, err := LoadConnection(h.cfg.ConnectionID); err == nil {
		t.Fatal("wrong-welcome Port remains selectable")
	}
}

func TestConnectionSecurityRetirementPreservesUnknownFiles(t *testing.T) {
	parent := connectionInstallation(t)
	h, _, _ := openConnection(t, parent)
	known := []string{projectStoreName, "project-grants.lock", workspaceStoreName, workspaceLockName}
	for _, name := range known {
		if err := os.WriteFile(filepath.Join(h.cfg.InstallRoot, name), []byte("private grant"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	unknown := filepath.Join(h.cfg.InstallRoot, "keep-user-data.txt")
	if err := os.WriteFile(unknown, []byte("preserve me"), 0600); err != nil {
		t.Fatal(err)
	}
	parentSentinel := filepath.Join(parent.InstallRoot, projectStoreName)
	if err := os.WriteFile(parentSentinel, []byte("parent grants"), 0600); err != nil {
		t.Fatal(err)
	}
	h.Close()
	for _, name := range append(known, "connection.json", "agent.sock", "host-lifecycle.lock", connectionLockName) {
		if _, err := os.Lstat(filepath.Join(h.cfg.InstallRoot, name)); !os.IsNotExist(err) {
			t.Fatalf("retired artifact %s: %v", name, err)
		}
	}
	for path, want := range map[string]string{unknown: "preserve me", parentSentinel: "parent grants"} {
		got, err := os.ReadFile(path)
		if err != nil || string(got) != want {
			t.Fatalf("retirement changed %s: %q %v", path, got, err)
		}
	}
}

func TestConnectionSecurityApprovalBoundAndPrimaryProtection(t *testing.T) {
	parent := connectionInstallation(t)
	for _, invalid := range []string{"", strings.Repeat("z", 32), "chrome-extension://" + parent.ExtensionID + "/"} {
		if _, err := ExtensionApprove(invalid); err == nil {
			t.Fatalf("invalid approval accepted: %q", invalid)
		}
	}
	for _, ch := range "bcdefgh" {
		if _, err := ExtensionApprove(strings.Repeat(string(ch), 32)); err != nil {
			t.Fatal(err)
		}
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(strings.Split(cfg.ApprovedExtensions, ",")) != 7 {
		t.Fatalf("approved list: %q", cfg.ApprovedExtensions)
	}
	if _, err = ExtensionApprove(strings.Repeat("i", 32)); err == nil {
		t.Fatal("ninth total origin accepted")
	}
	if _, err = ExtensionApprove(strings.Repeat("b", 32)); err != nil {
		t.Fatalf("idempotent approval at quota: %v", err)
	}
	if _, err = ExtensionRevoke(parent.ExtensionID); err == nil {
		t.Fatal("primary extension revoked")
	}
	current, err := Load()
	if err != nil || current.ApprovedExtensions != cfg.ApprovedExtensions || current.ExtensionID != parent.ExtensionID {
		t.Fatalf("rejected changes mutated authorization: %+v %v", current, err)
	}
}

// A real inbound response overlaps the exclusive installer snapshot lock.
func TestConnectionSecurityInstallContentionPreservesInboundFrame(t *testing.T) {
	parent := connectionInstallation(t)
	h, w, r := openConnection(t, parent)
	entry := &pendingCall{answer: make(chan []byte, 1)}
	h.mu.Lock()
	h.pending["install-overlap"] = entry
	h.mu.Unlock()
	locked, release := make(chan struct{}), make(chan struct{})
	lockDone := make(chan error, 1)
	go func() {
		_, err := withInstallationLock(context.Background(), func() (map[string]any, error) {
			close(locked)
			<-release
			return nil, nil
		})
		lockDone <- err
	}()
	released := false
	defer func() {
		if !released {
			close(release)
		}
	}()
	select {
	case <-locked:
	case err := <-lockDone:
		t.Fatalf("installation lock: %v", err)
	case <-time.After(time.Second):
		t.Fatal("installation lock timeout")
	}
	if _, err := Load(); err == nil || err.Error() != "E_INSTALL_BUSY" {
		t.Fatalf("fixture did not contend: %v", err)
	}
	reply := MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": "install-overlap", "result": map[string]any{"alive": true}})
	if err := WriteFrame(w, reply); err != nil {
		t.Fatal(err)
	}
	select {
	case <-h.done:
		t.Fatal("install contention closed an authorized Host")
	case <-entry.answer:
		t.Fatal("response bypassed the installation snapshot lock")
	case <-time.After(2200 * time.Millisecond):
	}
	close(release)
	released = true
	if err := <-lockDone; err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-entry.answer:
		if !bytes.Equal(got, reply) {
			t.Fatalf("response changed: %s", got)
		}
	case <-h.done:
		t.Fatal("Host closed instead of retrying installation snapshot")
	case <-time.After(time.Second):
		t.Fatal("inbound response did not resume")
	}
	securityRoundTrip(t, h, w, r)
}

func TestConnectionSecurityReapproveBeforeWatcherCannotReviveScope(t *testing.T) {
	parent := connectionInstallation(t)
	id := strings.Repeat("b", 32)
	if _, err := ExtensionApprove(id); err != nil {
		t.Fatal(err)
	}
	approved, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	// Do not Run: no watcher can observe the intermediate revoked generation.
	old, err := NewConnectionHost(approved, "chrome-extension://"+id+"/", bytes.NewReader(nil), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	// These are store-format fixtures, not grants used for filesystem access.
	for _, cfg := range []Installation{parent, old.cfg} {
		ps := newProjectStore(cfg)
		ps.Projects = []ProjectGrant{{BindingID: "local-" + strings.Repeat("a", 20), Name: "entry.js", Path: "/fixture/entry.js", RuntimeKind: "controller", EntryFormat: "async-main", SiteOrigin: "https://example.test", Device: 1, Inode: 1}}
		if err := writeProjectStore(cfg, ps); err != nil {
			t.Fatal(err)
		}
		ws := emptyWorkspaceStore(cfg)
		ws.Workspaces = []workspaceGrant{{WorkspaceID: "workspace-00000000-0000-0000-0000-000000000001", Name: "fixture", Path: "/fixture", Access: "read-only", Device: 1, Inode: 1}}
		if err := writeWorkspaceStore(cfg, ws); err != nil {
			t.Fatal(err)
		}
		if got, err := readProjectStore(cfg); err != nil || len(got.Projects) != 1 {
			t.Fatalf("project fixture: %+v %v", got, err)
		}
		if got, err := readWorkspaceStore(cfg); err != nil || len(got.Workspaces) != 1 {
			t.Fatalf("workspace fixture: %+v %v", got, err)
		}
	}
	if _, err = ExtensionRevoke(id); err != nil {
		t.Fatal(err)
	}
	if _, err = ExtensionApprove(id); err != nil {
		t.Fatal(err)
	}
	current, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !InstallationAllowsExtension(current, id) {
		t.Fatal("reapproval not published")
	}
	if _, err = readConnection(current, old.cfg.ConnectionID); err == nil || err.Error() != "E_CONNECTION_REVOKED" {
		t.Fatalf("old publication revived: %v", err)
	}
	if err = verifyClientInstallation(old.cfg); err == nil || err.Error() != "E_CONNECTION_REVOKED" {
		t.Fatalf("old authority revived: %v", err)
	}
	welcome := MustEncode(map[string]any{"v": 1, "kind": "welcome", "extensionId": id, "extensionVersion": "1"})
	if err = old.handleChrome(welcome); err == nil || err.Error() != "E_CONNECTION_REVOKED" {
		t.Fatalf("old inbound frame accepted: %v", err)
	}
	fresh, err := NewConnectionHost(current, "chrome-extension://"+id+"/", bytes.NewReader(nil), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer fresh.Close()
	if fresh.cfg.ConnectionID == old.cfg.ConnectionID || fresh.cfg.ClientCredential == old.cfg.ClientCredential {
		t.Fatal("reapproval reused scope authority")
	}
	if err = fresh.handleChrome(welcome); err != nil {
		t.Fatalf("fresh welcome: %v", err)
	}
	if got, err := readProjectStore(fresh.cfg); err != nil || len(got.Projects) != 0 {
		t.Fatalf("fresh scope inherited projects: %+v %v", got, err)
	}
	if got, err := readWorkspaceStore(fresh.cfg); err != nil || len(got.Workspaces) != 0 {
		t.Fatalf("fresh scope inherited workspaces: %+v %v", got, err)
	}
	if err = verifyClientInstallation(old.cfg); err == nil {
		t.Fatal("fresh allocation revived old authority")
	}
}

func TestConnectionSecurityPublicationUsesCurrentInstallationGeneration(t *testing.T) {
	parent := connectionInstallation(t)
	id := strings.Repeat("b", 32)
	if _, err := ExtensionApprove(id); err != nil {
		t.Fatal(err)
	}
	stale, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ExtensionRevoke(id); err != nil {
		t.Fatal(err)
	}
	// The exclusive owner's retirement scan is complete, but publication of
	// its next approval is still blocked. A stale launcher must not publish here.
	_, err = withInstallationLock(context.Background(), func() (map[string]any, error) {
		h, createErr := NewConnectionHost(stale, "chrome-extension://"+id+"/", bytes.NewReader(nil), io.Discard)
		if h != nil {
			h.Close()
		}
		if createErr == nil || createErr.Error() != "E_INSTALL_BUSY" {
			t.Errorf("scope published during exclusive installation transaction: %v", createErr)
		}
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ExtensionApprove(id); err != nil {
		t.Fatal(err)
	}
	old, err := NewConnectionHost(stale, "chrome-extension://"+id+"/", bytes.NewReader(nil), io.Discard)
	if old != nil {
		old.Close()
	}
	if err == nil || err.Error() != "E_CONNECTION_REVOKED" {
		t.Fatalf("old installation generation admitted after reapproval: %v", err)
	}
	fresh, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	h, err := NewConnectionHost(fresh, "chrome-extension://"+id+"/", bytes.NewReader(nil), io.Discard)
	if err != nil {
		t.Fatalf("current installation rejected: %v", err)
	}
	h.Close()
	if fresh.ExtensionID != parent.ExtensionID {
		t.Fatal("primary installation changed")
	}
}

func TestConnectionSecurityRevokePreflightFailurePreservesScope(t *testing.T) {
	parent := connectionInstallation(t)
	id := strings.Repeat("b", 32)
	if _, err := ExtensionApprove(id); err != nil {
		t.Fatal(err)
	}
	approved, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	h, w, r := openConnection(t, approved, id)
	manifest, err := ManifestFor(approved.Browser, approved.UserDataDir)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(manifest, 0400); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(manifest, 0600)
	if _, err = ExtensionRevoke(id); err == nil {
		t.Fatal("non-writable manifest accepted")
	}
	if _, err = os.Lstat(filepath.Join(h.cfg.InstallRoot, "revoked")); !os.IsNotExist(err) {
		t.Fatalf("deterministic preflight failure retired scope: %v", err)
	}
	current, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !InstallationAllowsExtension(current, id) {
		t.Fatal("failed transaction changed approved identities")
	}
	securityRoundTrip(t, h, w, r)
	if current.ExtensionID != parent.ExtensionID {
		t.Fatal("primary identity changed")
	}
}

func TestConnectionSecurityRevokeCommitFailureReportsRetirement(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("permission fixture requires an unprivileged user")
	}
	parent := connectionInstallation(t)
	id := strings.Repeat("b", 32)
	if _, err := ExtensionApprove(id); err != nil {
		t.Fatal(err)
	}
	approved, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	// No watcher: inspect the permanent marker after transaction rollback.
	h, err := NewConnectionHost(approved, "chrome-extension://"+id+"/", bytes.NewReader(nil), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	manifest, err := ManifestFor(approved.Browser, approved.UserDataDir)
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Dir(manifest)
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(dir, 0500); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, info.Mode().Perm())
	_, err = ExtensionRevoke(id)
	if err == nil || !strings.Contains(err.Error(), "E_EXTENSION_UPDATE_INCOMPLETE") || !strings.Contains(err.Error(), "extension="+id) || !strings.Contains(err.Error(), "retiredConnections=1") {
		t.Fatalf("partial retirement not reported: %v", err)
	}
	if _, err = os.Lstat(filepath.Join(h.cfg.InstallRoot, "revoked")); err != nil {
		t.Fatalf("rollback erased retirement: %v", err)
	}
	if err = os.Chmod(dir, info.Mode().Perm()); err != nil {
		t.Fatal(err)
	}
	current, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !InstallationAllowsExtension(current, id) {
		t.Fatal("fixture did not roll back installation approval")
	}
	if _, err = readConnection(current, h.cfg.ConnectionID); err == nil || err.Error() != "E_CONNECTION_REVOKED" {
		t.Fatalf("failed transaction revived old scope: %v", err)
	}
	if current.ExtensionID != parent.ExtensionID {
		t.Fatal("primary identity changed")
	}
}
