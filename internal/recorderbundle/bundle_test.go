package recorderbundle

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var recorderJavaScriptFiles = []string{
	"controller.js",
	"controller-core.js",
	"recording-history.js",
}

func TestWriteToDirIsSelfContained(t *testing.T) {
	root := t.TempDir()
	entry, err := WriteToDir(root)
	if err != nil {
		t.Fatal(err)
	}

	for _, relative := range []string{
		"recording-console-simple/controller.js",
		"recording-console-simple/controller-core.js",
		"recording-console-simple/recording-history.js",
		"recording-console-simple/icons/countdown-1.png",
		"recording-console-simple/icons/countdown-2.png",
		"recording-console-simple/icons/countdown-3.png",
		"recording-console-simple/icons/opendesk-logo.png",
	} {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(relative))); err != nil {
			t.Fatalf("missing embedded Recorder UI asset %s: %v", relative, err)
		}
	}

	controller, err := os.ReadFile(filepath.Join(root, "recording-console-simple", "controller.js"))
	if err != nil {
		t.Fatal(err)
	}
	canonicalController, err := os.ReadFile(filepath.Join("..", "..", "apps", "opendesk", "recorder", "controller.js"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(controller, canonicalController) {
		t.Fatal("materialized Recorder controller must match the canonical product resource")
	}
	if strings.Contains(string(controller), "workflows/human-to-recipe/recording-console-simple") {
		t.Fatal("embedded Recorder UI must not fall back to the source workflow tree")
	}

	entryContent, err := os.ReadFile(entry)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(entryContent), "System.getExecutablePath()") {
		t.Fatal("embedded Recorder entry must use the released OpenDesk executable path for replay")
	}
}

func TestGeneratedJavaScriptMatchesCanonicalSources(t *testing.T) {
	for _, name := range recorderJavaScriptFiles {
		embedded, err := runtimeAssets.ReadFile("assets/" + name)
		if err != nil {
			t.Fatalf("read embedded %s: %v", name, err)
		}
		canonical, err := os.ReadFile(filepath.Join("..", "..", "apps", "opendesk", "recorder", name))
		if err != nil {
			t.Fatalf("read canonical %s: %v", name, err)
		}
		if !bytes.Equal(embedded, canonical) {
			t.Fatalf("embedded %s drifted from apps/opendesk/recorder/%s; run go generate ./internal/recorderbundle", name, name)
		}
	}
}

func TestOfficialAppSourceTreeContainsNoGoSource(t *testing.T) {
	appRoot := filepath.Join("..", "..", "apps", "opendesk")
	if err := filepath.WalkDir(appRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && strings.EqualFold(filepath.Ext(entry.Name()), ".go") {
			t.Fatalf("Go implementation source must not live in official App package tree: %s", path)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func TestRecorderSourceHasNoPrivateIconDirectory(t *testing.T) {
	path := filepath.Join("..", "..", "apps", "opendesk", "recorder", "icons")
	if _, err := os.Stat(path); err == nil || !os.IsNotExist(err) {
		t.Fatalf("Recorder App source must use program-owned icon resources; unexpected directory %s (err=%v)", path, err)
	}
}
