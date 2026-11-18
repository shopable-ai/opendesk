//go:build darwin && cgo

package browserbridge

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func mcpDarwinACL(t *testing.T, p, entry string) {
	t.Helper()
	if output, e := exec.Command("/bin/chmod", "+a", entry, p).CombinedOutput(); e != nil {
		t.Fatalf("set fixture ACL: %v %s", e, output)
	}
	t.Cleanup(func() { _ = exec.Command("/bin/chmod", "-N", p).Run() })
}
func TestFilesMCPPrivateACLRejectsReadableCredentialAndApproval(t *testing.T) {
	for _, name := range []string{"credential.json", "approval.json"} {
		t.Run(name, func(t *testing.T) {
			dir, e := filepath.EvalSymlinks(t.TempDir())
			if e != nil {
				t.Fatal(e)
			}
			os.Chmod(dir, 0700)
			p := filepath.Join(dir, name)
			if e = os.WriteFile(p, []byte(`{"fixture":true}`), 0600); e != nil {
				t.Fatal(e)
			}
			mcpDarwinACL(t, p, "everyone allow read,readattr,readextattr")
			if info, e := os.Stat(p); e != nil || info.Mode().Perm() != 0600 {
				t.Fatal("ACL fixture did not retain 0600")
			}
			if _, e = filesMCPReadPrivate(p); e == nil {
				t.Fatal("0600 private JSON with extended read ACL accepted")
			}
		})
	}
}
func TestFilesMCPPrivateACLRejectsParentAndInheritedSecretBeforeWrite(t *testing.T) {
	dir, e := filepath.EvalSymlinks(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	os.Chmod(dir, 0700)
	mcpDarwinACL(t, dir, "everyone allow read,search,file_inherit,directory_inherit")
	if info, e := os.Stat(dir); e != nil || info.Mode().Perm() != 0700 {
		t.Fatal("ACL fixture did not retain 0700")
	}
	target := filepath.Join(dir, "credential.json")
	if e = filesMCPWritePrivate(target, []byte("secret-test-fixture")); e == nil {
		t.Fatal("ACL-inheriting credential creation accepted")
	}
	raw, e := os.ReadFile(target)
	if e == nil && len(raw) > 0 {
		t.Fatal("secret bytes written before inherited ACL rejection")
	}
}

func TestFilesMCPACLRejectsInheritedOpenedFile(t *testing.T) {
	dir, e := filepath.EvalSymlinks(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	os.Chmod(dir, 0700)
	mcpDarwinACL(t, dir, "everyone allow read,readattr,readextattr,file_inherit,directory_inherit")
	file, e := os.OpenFile(filepath.Join(dir, "new.json"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		t.Fatal(e)
	}
	defer file.Close()
	if info, e := file.Stat(); e != nil || info.Mode().Perm() != 0600 {
		t.Fatal("inherited ACL fixture mode changed")
	}
	if e = filesMCPCheckACL(file); e == nil {
		t.Fatal("newly opened 0600 inode with inherited ACL passed")
	}
	if info, e := file.Stat(); e != nil || info.Size() != 0 {
		t.Fatal("fixture wrote bytes before ACL validation")
	}
}
