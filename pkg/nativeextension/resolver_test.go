package nativeextension

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestResolveDefaultExecutableUsesCurrentExecutableDirectory(t *testing.T) {
	currentExecutable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	currentExecutable, err = filepath.Abs(currentExecutable)
	if err != nil {
		t.Fatal(err)
	}
	currentExecutable, err = filepath.EvalSymlinks(currentExecutable)
	if err != nil {
		t.Fatal(err)
	}

	resolved, err := ResolveDefaultExecutable("native-ext-go-basic")
	if err != nil {
		t.Fatalf("ResolveDefaultExecutable returned error: %v", err)
	}
	want := filepath.Join(filepath.Dir(currentExecutable), defaultExecutableDirectory, "native-ext-go-basic")
	if resolved != want {
		t.Fatalf("resolved executable = %q, want %q", resolved, want)
	}
	if !filepath.IsAbs(resolved) {
		t.Fatalf("resolved executable is not absolute: %q", resolved)
	}
}

func TestDefaultExecutableResolversFollowSymlink(t *testing.T) {
	const executableEnv = "OPENDESK_TEST_CANONICAL_EXECUTABLE"
	if executable := os.Getenv(executableEnv); executable != "" {
		resolved, err := ResolveDefaultExecutable("native-ext-go-basic")
		if err != nil {
			t.Fatal(err)
		}
		want := filepath.Join(filepath.Dir(executable), defaultExecutableDirectory, "native-ext-go-basic")
		if resolved != want {
			t.Errorf("resolved executable = %q, want %q", resolved, want)
		}

		roots, err := DefaultDiscoveryRoots(DiscoveryOptions{})
		if err != nil {
			t.Fatal(err)
		}
		wantRoot := DiscoveryRoot{Kind: RootPortable, Path: filepath.Dir(want)}
		if runtime.GOOS == "darwin" {
			wantRoot = DiscoveryRoot{Kind: RootAppBundled, Path: filepath.Join(filepath.Dir(filepath.Dir(executable)), "Resources", "NativeExtensions")}
		}
		if len(roots) != 1 || roots[0] != wantRoot {
			t.Errorf("discovery roots = %#v, want %#v", roots, []DiscoveryRoot{wantRoot})
		}
		return
	}

	currentExecutable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	binary, err := os.ReadFile(currentExecutable)
	if err != nil {
		t.Fatal(err)
	}
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	relativeExecutable := filepath.Join("OpenDesk.app", "Contents", "MacOS", "opendesk")
	executable := filepath.Join(dir, relativeExecutable)
	if err := os.MkdirAll(filepath.Dir(executable), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(executable, binary, 0700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "opendesk")
	if err := os.Symlink(relativeExecutable, link); err != nil {
		if runtime.GOOS == "windows" {
			t.Skipf("symlink unavailable: %v", err)
		}
		t.Fatal(err)
	}
	cmd := exec.Command(link, "-test.run=^TestDefaultExecutableResolversFollowSymlink$")
	cmd.Env = append(os.Environ(), executableEnv+"="+executable)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("symlinked executable failed: %v\n%s", err, output)
	}
}

func TestResolveDefaultExecutableRejectsUnsafeBasenames(t *testing.T) {
	for _, name := range []string{
		"",
		"   ",
		".",
		"..",
		"../native-ext",
		"./native-ext",
		"nested/native-ext",
		`nested\native-ext`,
		"/absolute/native-ext",
		"native\x00ext",
	} {
		t.Run(name, func(t *testing.T) {
			if resolved, err := ResolveDefaultExecutable(name); err == nil {
				t.Fatalf("ResolveDefaultExecutable(%q) = %q, want error", name, resolved)
			}
		})
	}
}
