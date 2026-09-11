package recorderbundle

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
	} {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(relative))); err != nil {
			t.Fatalf("missing embedded Recorder UI asset %s: %v", relative, err)
		}
	}

	controller, err := os.ReadFile(filepath.Join(root, "recording-console-simple", "controller.js"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(controller), "examples/custom-ui/recording-console-simple") {
		t.Fatal("embedded Recorder UI must not fall back to the source examples tree")
	}

	entryContent, err := os.ReadFile(entry)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(entryContent), "System.getExecutablePath()") {
		t.Fatal("embedded Recorder entry must use the released OpenDesk executable path for replay")
	}
}
