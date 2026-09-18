package automation

import (
	"os"
	"path/filepath"
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
}
