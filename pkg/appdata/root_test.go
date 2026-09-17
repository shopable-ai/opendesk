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
