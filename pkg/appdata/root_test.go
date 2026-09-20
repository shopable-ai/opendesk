package appdata

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveUsesExplicitOverride(t *testing.T) {
	configured := filepath.Join(t.TempDir(), "product-data")
	root, err := Resolve(DesktopPackageID, map[string]string{RootEnvironment: configured})
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(configured)
	if root != filepath.Clean(want) {
		t.Fatalf("root = %q, want %q", root, want)
	}
	if info, err := os.Stat(root); err != nil || !info.IsDir() {
		t.Fatalf("root was not created: info=%v err=%v", info, err)
	}
}

func TestResolveUsesOpenDeskPackageNamespace(t *testing.T) {
	home := t.TempDir()
	root, err := Resolve("com.example.product", map[string]string{"HOME": home, RootEnvironment: ""})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, ".opendesk", "apps", "com.example.product")
	if root != want {
		t.Fatalf("root = %q, want %q", root, want)
	}
}

func TestDefaultRootForHomeIgnoresDevelopmentOverrideModel(t *testing.T) {
	home := t.TempDir()
	root, err := defaultRootForHome(DesktopPackageID, home)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, ".opendesk", "apps", DesktopPackageID)
	if root != want {
		t.Fatalf("default root = %q, want %q", root, want)
	}
	if info, err := os.Lstat(root); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		t.Fatalf("default root is not a real directory: info=%v err=%v", info, err)
	}
}
