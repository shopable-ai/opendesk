package automation

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestFileWriteNewNeverReplacesExistingPath(t *testing.T) {
	root := t.TempDir()
	fs, err := NewFileSystemWithWorkDir(root)
	if err != nil { t.Fatal(err) }
	if err := fs.WriteNew("candidate.js", "first"); err != nil { t.Fatal(err) }
	if err := fs.WriteNew("candidate.js", "second"); err == nil { t.Fatal("WriteNew replaced an existing file") }
	data, err := os.ReadFile(filepath.Join(root, "candidate.js")); if err != nil { t.Fatal(err) }
	if string(data) != "first" { t.Fatalf("content=%q", data) }
	protected := filepath.Join(root, "protected.js")
	if err := os.WriteFile(protected, []byte("protected"), 0o600); err != nil { t.Fatal(err) }
	link := filepath.Join(root, "alias.js")
	if err := os.Symlink(protected, link); err == nil {
		if err := fs.WriteNew(link, "replacement"); err == nil { t.Fatal("WriteNew followed/replaced an existing final symlink") }
		data, readErr := os.ReadFile(protected); if readErr != nil { t.Fatal(readErr) }
		if string(data) != "protected" { t.Fatalf("protected content=%q", data) }
	}
	if runtime.GOOS != "windows" {
		outside := t.TempDir()
		parentAlias := filepath.Join(root, "redirect")
		if err := os.Symlink(outside, parentAlias); err != nil { t.Fatal(err) }
		if err := fs.WriteNew(filepath.Join(parentAlias, "candidate.js"), "redirected"); err == nil {
			t.Fatal("WriteNew accepted a symbolic-link parent directory")
		}
		if _, err := os.Stat(filepath.Join(outside, "candidate.js")); !os.IsNotExist(err) {
			t.Fatalf("redirected candidate unexpectedly exists: %v", err)
		}
	}
}

func TestFileRealPathReturnsCanonicalAbsolutePath(t *testing.T) {
	root := t.TempDir()
	fs, err := NewFileSystemWithWorkDir(root)
	if err != nil { t.Fatal(err) }

	dir := filepath.Join(root, "real")
	if err := os.MkdirAll(dir, 0o755); err != nil { t.Fatal(err) }
	got, err := fs.RealPath("real")
	if err != nil { t.Fatal(err) }
	want, err := filepath.Abs(dir)
	if err != nil { t.Fatal(err) }
	if filepath.Clean(got) != filepath.Clean(want) {
		t.Fatalf("realPath=%q want=%q", got, want)
	}

	if runtime.GOOS != "windows" {
		alias := filepath.Join(root, "alias-dir")
		if err := os.Symlink(dir, alias); err != nil { t.Fatal(err) }
		resolved, err := fs.RealPath(alias)
		if err != nil { t.Fatal(err) }
		if filepath.Clean(resolved) != filepath.Clean(want) {
			t.Fatalf("symlink realPath=%q want=%q", resolved, want)
		}
	}
}
