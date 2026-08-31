package automation

import (
	"os"
	"path/filepath"
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
