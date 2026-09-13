package inspectorwebpayload

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func writeAsset(t *testing.T, root, relative string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(relative), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestStageCopiesExactRuntimeClosure(t *testing.T) {
	source := t.TempDir()
	for _, relative := range RuntimeFiles {
		writeAsset(t, source, relative)
	}
	writeAsset(t, source, "README.md")
	writeAsset(t, source, "accessibility-workbench/index.html")
	destination := filepath.Join(t.TempDir(), "inspector_web")
	files, err := Stage(source, destination)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(files, "\n") != strings.Join(RuntimeFiles, "\n") {
		t.Fatalf("staged files=%v, want=%v", files, RuntimeFiles)
	}
	for _, relative := range RuntimeFiles {
		if _, err := os.Stat(filepath.Join(destination, filepath.FromSlash(relative))); err != nil {
			t.Fatalf("missing staged asset %s: %v", relative, err)
		}
	}
	for _, excluded := range []string{"README.md", "accessibility-workbench/index.html"} {
		if _, err := os.Stat(filepath.Join(destination, filepath.FromSlash(excluded))); !os.IsNotExist(err) {
			t.Fatalf("non-runtime Inspector source leaked into payload: %s", excluded)
		}
	}
}

func TestStageFailsClosedForMissingOrLinkedAsset(t *testing.T) {
	source := t.TempDir()
	for _, relative := range RuntimeFiles[:len(RuntimeFiles)-1] {
		writeAsset(t, source, relative)
	}
	if _, err := Stage(source, filepath.Join(t.TempDir(), "missing")); err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("missing asset error=%v", err)
	}
	if runtime.GOOS == "windows" {
		return
	}
	target := filepath.Join(source, "real.js")
	if err := os.WriteFile(target, []byte("asset"), 0o644); err != nil {
		t.Fatal(err)
	}
	linked := filepath.Join(source, filepath.FromSlash(RuntimeFiles[len(RuntimeFiles)-1]))
	if err := os.MkdirAll(filepath.Dir(linked), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, linked); err != nil {
		t.Fatal(err)
	}
	if _, err := Stage(source, filepath.Join(t.TempDir(), "linked")); err == nil || !strings.Contains(err.Error(), "regular file") {
		t.Fatalf("linked asset error=%v", err)
	}
}

func TestRepositoryInspectorFrontendMatchesRuntimeClosure(t *testing.T) {
	source := filepath.Join("..", "..", "apps", "inspector_web")
	destination := filepath.Join(t.TempDir(), "inspector_web")
	files, err := Stage(source, destination)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 4 {
		t.Fatalf("repository Inspector runtime closure=%v", files)
	}
}
