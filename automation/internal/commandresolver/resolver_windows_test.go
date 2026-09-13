//go:build windows

package commandresolver

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWindowsResolverUsesPATHPATHEXTAndCaseInsensitiveNames(t *testing.T) {
	root := t.TempDir()
	first := filepath.Join(root, "first")
	second := filepath.Join(root, "second")
	if err := os.MkdirAll(first, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(second, 0o755); err != nil {
		t.Fatal(err)
	}
	shadow := filepath.Join(first, "codex.CMD")
	fallback := filepath.Join(second, "codex.EXE")
	if err := os.WriteFile(shadow, []byte("@exit /b 0\r\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fallback, []byte("fixture"), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved := Resolve("codex", []string{
		"Path=" + first + ";" + second,
		"PathExt=.cMd;.eXe",
	})
	if resolved.Status != StatusOK || resolved.Path != shadow {
		t.Fatalf("Windows PATH/PATHEXT resolution = %#v, want %s", resolved, shadow)
	}
	if missing := Resolve("codex", []string{"PATH=" + filepath.Join(root, "missing"), "PATHEXT=.EXE"}); missing.Status != StatusNotFound {
		t.Fatalf("Windows missing status = %#v", missing)
	}
	if directory := Resolve(first, []string{"PATHEXT=.EXE"}); directory.Status != StatusNotExecutable {
		t.Fatalf("Windows directory status = %#v", directory)
	}
	if relative := Resolve(`.\\codex`, []string{"PATH=" + first, "PATHEXT=.CMD"}); relative.Status != StatusInvalid {
		t.Fatalf("Windows relative candidate status = %#v", relative)
	}
}
