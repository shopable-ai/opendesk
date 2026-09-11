package appshell

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func writePackageFixture(t *testing.T, root, manifest string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "main.js"), []byte("console.log('ok')"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "assets", "tray.ico"), []byte("icon"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ManifestFileName), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
}

func packageManifest(entry, icon string) string {
	return `{"entry":"` + entry + `","tray":{"enabled":true,"icon":"` + icon + `","primaryAction":"opendesk.open","menu":[{"id":"status","label":"Idle","enabled":false}]}}`
}

func TestResolvePackageValidatesFilesystemSeparately(t *testing.T) {
	root := t.TempDir()
	writePackageFixture(t, root, packageManifest("main.js", "assets/tray.ico"))
	pkg, err := ResolvePackage(root)
	if err != nil {
		t.Fatal(err)
	}
	if pkg.Root == "" || pkg.EntryPath != filepath.Join(pkg.Root, "main.js") || pkg.IconPath != filepath.Join(pkg.Root, "assets", "tray.ico") {
		t.Fatalf("package=%+v", pkg)
	}
	if pkg.Identity == "" {
		t.Fatal("identity is empty")
	}
}

func TestResolvePackageRejectsMissingFiles(t *testing.T) {
	root := t.TempDir()
	writePackageFixture(t, root, packageManifest("missing.js", "assets/tray.ico"))
	if _, err := ResolvePackage(root); err == nil || !strings.Contains(err.Error(), "entry") {
		t.Fatalf("expected missing entry, got %v", err)
	}
	writePackageFixture(t, root, packageManifest("main.js", "assets/missing.ico"))
	if _, err := ResolvePackage(root); err == nil || !strings.Contains(err.Error(), "tray.icon") {
		t.Fatalf("expected missing icon, got %v", err)
	}
}

func TestResolvePackageRejectsSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation is not reliably permitted on Windows test hosts")
	}
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.js")
	if err := os.WriteFile(outside, []byte("bad"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "main.js")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ManifestFileName), []byte(packageManifest("main.js", "")), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolvePackage(root); err == nil || !strings.Contains(err.Error(), "escapes") {
		t.Fatalf("expected symlink escape, got %v", err)
	}
}

func TestPackageIdentityCanonicalizesAliasesAndIgnoresManifestEdits(t *testing.T) {
	root := t.TempDir()
	writePackageFixture(t, root, packageManifest("main.js", "assets/tray.ico"))
	first, err := PackageIdentity(root)
	if err != nil {
		t.Fatal(err)
	}
	alias, err := PackageIdentity(filepath.Join(root, ".", "assets", ".."))
	if err != nil {
		t.Fatal(err)
	}
	if first != alias {
		t.Fatalf("identity differs for same package: %q != %q", first, alias)
	}
	if err := os.WriteFile(filepath.Join(root, ManifestFileName), []byte(packageManifest("main.js", "assets/tray.ico")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	second, err := PackageIdentity(root)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("manifest edit changed package identity: %q != %q", first, second)
	}
	other := t.TempDir()
	writePackageFixture(t, other, packageManifest("main.js", "assets/tray.ico"))
	third, err := PackageIdentity(other)
	if err != nil {
		t.Fatal(err)
	}
	if first == third {
		t.Fatal("different package roots collided")
	}
}
