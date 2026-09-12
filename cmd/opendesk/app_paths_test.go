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

func TestAppModeRuntimeArtifactsRootUsesPackageWorkspaceOrWritableData(t *testing.T) {
	root := t.TempDir()
	bundledPackage := filepath.Join(root, "OpenDesk.app", "Contents", "Resources", "AppMode")
	home := filepath.Join(root, "home")

	got, configured, err := appModeRuntimeArtifactsRootForPackage(bundledPackage, bundledPackage, "com.opendesk.desktop", "", map[string]string{
		"HOME": home,
	})
	if err != nil {
		t.Fatal(err)
	}
	if configured {
		t.Fatal("default runtime artifacts root must not be marked configured")
	}
	want := filepath.Join(home, ".opendesk", "apps", "com.opendesk.desktop", ".runtime", "runs")
	if got != want {
		t.Fatalf("bundled runtime artifacts root = %q, want %q", got, want)
	}

	developmentPackage := filepath.Join(root, "source-package")
	got, configured, err = appModeRuntimeArtifactsRootForPackage(developmentPackage, bundledPackage, "com.opendesk.desktop", "", map[string]string{
		"HOME": home,
	})
	if err != nil {
		t.Fatal(err)
	}
	if configured {
		t.Fatal("development default must not be marked configured")
	}
	want = filepath.Join(developmentPackage, ".runtime", "runs")
	if got != want {
		t.Fatalf("development runtime artifacts root = %q, want %q", got, want)
	}
}

func TestAppModeRuntimeArtifactsRootPreservesExplicitLogDir(t *testing.T) {
	configuredLogDir := filepath.Join(t.TempDir(), "custom-logs")
	got, configured, err := appModeRuntimeArtifactsRoot("/package", "com.opendesk.desktop", configuredLogDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !configured || got != configuredLogDir {
		t.Fatalf("explicit root = %q configured=%v, want %q true", got, configured, configuredLogDir)
	}
}
