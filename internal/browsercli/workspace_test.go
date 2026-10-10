//go:build darwin || linux

package browsercli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"opendesk/internal/browserbridge"
)

func TestWorkspaceCLIExplicitGrantListAndRevoke(t *testing.T) {
	home, err := os.MkdirTemp("/tmp", "od-workspace-cli-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(home) })
	// macOS /tmp is a symlink; authorize the actual canonical test directory.
	home, err = filepath.EvalSymlinks(home)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := browserbridge.Setup(cliTestExtensionID, "chrome", "", binary); err != nil {
		t.Fatal(err)
	}
	directory := filepath.Join(home, "demo")
	if err := os.Mkdir(directory, 0700); err != nil {
		t.Fatal(err)
	}
	var out, diagnostics bytes.Buffer
	if code := Execute([]string{"browser", "workspace", "add", "--path", directory}, &out, &diagnostics); code == 0 {
		t.Fatal("missing explicit access silently granted writes")
	}
	out.Reset()
	diagnostics.Reset()
	if code := Execute([]string{"browser", "workspace", "add", "--path", directory, "--access", "read-write"}, &out, &diagnostics); code != 0 {
		t.Fatalf("explicit workspace grant failed: %s", diagnostics.String())
	}
	var grant map[string]any
	if err := json.Unmarshal(out.Bytes(), &grant); err != nil {
		t.Fatal(err)
	}
	id, ok := grant["workspaceId"].(string)
	if !ok || grant["access"] != "read-write" || bytes.Contains(out.Bytes(), []byte(directory)) {
		t.Fatalf("invalid public grant: %s", out.String())
	}
	out.Reset()
	diagnostics.Reset()
	if code := Execute([]string{"browser", "workspace", "list"}, &out, &diagnostics); code != 0 || !bytes.Contains(out.Bytes(), []byte(id)) {
		t.Fatalf("workspace list failed: %s %s", out.String(), diagnostics.String())
	}
	out.Reset()
	diagnostics.Reset()
	if code := Execute([]string{"browser", "workspace", "revoke", "--workspace-id", id}, &out, &diagnostics); code != 0 {
		t.Fatalf("workspace revoke failed: %s", diagnostics.String())
	}
	listed, err := browserbridge.WorkspaceList()
	if err != nil || len(listed["workspaces"].([]map[string]any)) != 0 {
		t.Fatalf("revocation not persisted: %v %v", listed, err)
	}
}
