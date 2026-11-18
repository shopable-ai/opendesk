package automation

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeAppStorageNameMapsHistoricalDefaults(t *testing.T) {
	for _, name := range []string{"", "opendesk", "clawdesk", "CLAWDESK", "testMonkey"} {
		if got := normalizeAppStorageName(name); got != appStorageDefaultName {
			t.Fatalf("normalizeAppStorageName(%q) = %q, want %q", name, got, appStorageDefaultName)
		}
	}
	if got := normalizeAppStorageName("custom-app"); got != "custom-app" {
		t.Fatalf("normalizeAppStorageName(custom-app) = %q, want custom-app", got)
	}
}

func TestMigrateLegacyStoragePrefersPreviousBrandPath(t *testing.T) {
	homeDir := t.TempDir()
	previousPath := filepath.Join(homeDir, previousAppStorageRootDir, previousAppStorageDefaultName, "storage.json")
	legacyPath := filepath.Join(homeDir, legacyAppStorageRootDir, legacyAppStorageDefaultName, "storage.json")
	destination := filepath.Join(homeDir, appStorageRootDir, appStorageDefaultName, "storage.json")
	for _, path := range []string{previousPath, legacyPath, destination} {
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(previousPath, []byte(`{"source":"previous-brand"}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyPath, []byte(`{"source":"testmonkey"}`), 0644); err != nil {
		t.Fatal(err)
	}

	storage := &AppStorage{filePath: destination}
	storage.migrateLegacyStorage(homeDir, "")

	content, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(content); got != `{"source":"previous-brand"}` {
		t.Fatalf("migrated content = %s, want previous-brand data", got)
	}
	if _, err := os.Stat(previousPath); err != nil {
		t.Fatalf("previous storage should remain in place: %v", err)
	}
}

// Diagnostic routing is an internal seam: exercising a corrupt default store
// through public JS would require changing the user's persistent storage.
func TestAppStorageDiagnosticsKeepProtocolStdoutClean(t *testing.T) {
	base := filepath.Join("..", ".runtime", "tests", "app-storage")
	if err := os.MkdirAll(base, 0700); err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp(base, "diagnostics-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	stdout, err := os.Create(filepath.Join(dir, "stdout.log"))
	if err != nil {
		t.Fatal(err)
	}
	stderr, err := os.Create(filepath.Join(dir, "stderr.log"))
	if err != nil {
		stdout.Close()
		t.Fatal(err)
	}
	previousOut, previousErr := os.Stdout, os.Stderr
	os.Stdout, os.Stderr = stdout, stderr
	t.Cleanup(func() {
		os.Stdout, os.Stderr = previousOut, previousErr
		stdout.Close()
		stderr.Close()
	})
	fixture := filepath.Join(dir, "storage.json")
	if err := os.WriteFile(fixture, []byte("{invalid-json"), 0600); err != nil {
		t.Fatal(err)
	}
	storage := &AppStorage{filePath: fixture}
	storage.load()
	if storage.GetLength() != 0 {
		t.Fatal("invalid storage must retain the existing empty-store behavior")
	}
	out, err := os.ReadFile(stdout.Name())
	if err != nil {
		t.Fatal(err)
	}
	diagnostic, err := os.ReadFile(stderr.Name())
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 0 || !strings.Contains(string(diagnostic), "Failed to parse storage file") {
		t.Fatalf("diagnostic polluted protocol stdout: stdout=%q stderr=%q", out, diagnostic)
	}
}
