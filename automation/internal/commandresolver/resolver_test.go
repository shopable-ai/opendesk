package commandresolver

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestWindowsEnvironmentAndPATHEXTSemantics(t *testing.T) {
	environment := []string{
		"Path=C:\\first",
		"PATHEXT=.EXE;.Cmd;.EXE",
		"PATH=C:\\second",
	}
	if got, ok := environmentValue(environment, "path", true); !ok || got != `C:\second` {
		t.Fatalf("case-insensitive PATH lookup = %q, %v", got, ok)
	}
	if _, ok := environmentValue(environment, "path", false); ok {
		t.Fatal("Unix-style lookup unexpectedly folded environment-name case")
	}
	extensions := windowsExecutableExtensions(".EXE;.Cmd;.EXE")
	if want := []string{".EXE", ".CMD"}; !reflect.DeepEqual(extensions, want) {
		t.Fatalf("PATHEXT normalization = %#v, want %#v", extensions, want)
	}
	if got, want := windowsExecutableNames("codex", extensions), []string{"codex.EXE", "codex.CMD"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("Windows executable names = %#v, want %#v", got, want)
	}
	if got := windowsExecutableNames("CODEX.cmd", extensions); !reflect.DeepEqual(got, []string{"CODEX.cmd"}) {
		t.Fatalf("existing PATHEXT suffix was not matched case-insensitively: %#v", got)
	}
}

func TestResolverUsesControlledPATHAndValidatesUnixFiles(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix permission semantics are covered on Unix; Windows has its platform test")
	}
	root := t.TempDir()
	first := filepath.Join(root, "first")
	second := filepath.Join(root, "second")
	if err := os.MkdirAll(first, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(second, 0o755); err != nil {
		t.Fatal(err)
	}
	firstCodex := filepath.Join(first, "codex")
	secondCodex := filepath.Join(second, "codex")
	if err := os.WriteFile(firstCodex, []byte("first"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secondCodex, []byte("second"), 0o755); err != nil {
		t.Fatal(err)
	}

	resolved := Resolve("codex", []string{"PATH=" + first + string(os.PathListSeparator) + second})
	if resolved.Status != StatusOK || resolved.Path != firstCodex {
		t.Fatalf("PATH priority resolution = %#v, want first executable", resolved)
	}
	resolved = Resolve("codex", []string{"PATH=relative" + string(os.PathListSeparator) + second})
	if resolved.Status != StatusOK || resolved.Path != secondCodex {
		t.Fatalf("relative PATH entry was not ignored: %#v", resolved)
	}

	if err := os.Chmod(firstCodex, 0o644); err != nil {
		t.Fatal(err)
	}
	resolved = Resolve("codex", []string{"PATH=" + first})
	if resolved.Status != StatusNotExecutable {
		t.Fatalf("non-executable file status = %#v", resolved)
	}
	resolved = Resolve(firstCodex, nil)
	if resolved.Status != StatusNotExecutable {
		t.Fatalf("absolute non-executable file status = %#v", resolved)
	}
	if err := os.Remove(firstCodex); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(firstCodex, 0o755); err != nil {
		t.Fatal(err)
	}
	if resolved = Resolve(firstCodex, nil); resolved.Status != StatusNotExecutable {
		t.Fatalf("directory status = %#v", resolved)
	}
	if resolved = Resolve("codex", []string{"PATH=" + filepath.Join(root, "missing")}); resolved.Status != StatusNotFound {
		t.Fatalf("missing status = %#v", resolved)
	}
	if resolved = Resolve("./codex", []string{"PATH=" + second}); resolved.Status != StatusInvalid {
		t.Fatalf("relative command path status = %#v", resolved)
	}
}
