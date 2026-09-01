package nativeextension

import (
	"os"
	"path/filepath"
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
