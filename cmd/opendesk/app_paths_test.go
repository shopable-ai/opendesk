package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAppModeDataRootUsesExplicitOverride(t *testing.T) {
	configured := filepath.Join(t.TempDir(), "product-data")
	root, err := appModeDataRoot("com.opendesk.desktop", map[string]string{
		appDataRootEnv: configured,
	})
	if err != nil {
		t.Fatal(err)
	}
	want, err := filepath.Abs(configured)
	if err != nil {
		t.Fatal(err)
	}
	if root != filepath.Clean(want) {
		t.Fatalf("data root = %q, want %q", root, want)
	}
	if info, err := os.Stat(root); err != nil || !info.IsDir() {
		t.Fatalf("data root was not created: info=%v err=%v", info, err)
	}
}

func TestAppModeDataRootUsesOpenDeskPackageNamespace(t *testing.T) {
	home := t.TempDir()
	root, err := appModeDataRoot("com.example.product", map[string]string{"HOME": home})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, ".opendesk", "apps", "com.example.product")
	if root != want {
		t.Fatalf("data root = %q, want %q", root, want)
	}
}

func TestAppRecorderWorkDirOnlyMovesBundledPackageToWritableDataRoot(t *testing.T) {
	root := t.TempDir()
	packageRoot := filepath.Join(root, "OpenDesk.app", "Contents", "Resources", "AppMode")
	dataRoot := filepath.Join(root, "data")

	got, err := appRecorderWorkDirForPackage(packageRoot, packageRoot, "com.opendesk.desktop", map[string]string{
		appDataRootEnv: dataRoot,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != dataRoot {
		t.Fatalf("bundled workdir = %q, want %q", got, dataRoot)
	}

	developmentRoot := filepath.Join(root, "source-package")
	got, err = appRecorderWorkDirForPackage(developmentRoot, packageRoot, "com.opendesk.desktop", map[string]string{
		appDataRootEnv: dataRoot,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != developmentRoot {
		t.Fatalf("development workdir = %q, want %q", got, developmentRoot)
	}
}
