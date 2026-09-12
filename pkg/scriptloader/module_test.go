package scriptloader

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestModuleScriptLoaderBundlesRelativeImportAndMain(t *testing.T) {
	dir := t.TempDir()
	helperPath := filepath.Join(dir, "helper.mjs")
	entryPath := filepath.Join(dir, "main.mjs")
	if err := os.WriteFile(helperPath, []byte(`export const answer = 42;`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(entryPath, []byte(`
import { answer } from "./helper.mjs";
export async function main() {
  if (answer !== 42) throw new Error("unexpected answer");
}
`), 0o600); err != nil {
		t.Fatal(err)
	}

	source, err := (ModuleScriptLoader{}).Load(context.Background(), entryPath)
	if err != nil {
		t.Fatal(err)
	}
	if source.Ext != ".js" || source.Protection.Mode != ProtectionPlain {
		t.Fatalf("unexpected module source metadata: %#v", source)
	}
	bundled := string(source.Content)
	if strings.Contains(bundled, `from "./helper.mjs"`) {
		t.Fatalf("static import was not linked: %s", bundled)
	}
	if !strings.Contains(bundled, moduleEntryGlobal) || !strings.Contains(bundled, "__opendeskESMMain") {
		t.Fatalf("module entry bootstrap is missing: %s", bundled)
	}
}

func TestModuleScriptLoaderReportsBuildError(t *testing.T) {
	entryPath := filepath.Join(t.TempDir(), "main.mjs")
	if err := os.WriteFile(entryPath, []byte(`import { missing } from "./does-not-exist.mjs"; console.log(missing);`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := (ModuleScriptLoader{}).Load(context.Background(), entryPath)
	if ErrorCodeOf(err) != "module_build_failed" {
		t.Fatalf("module build error code = %q, err=%v", ErrorCodeOf(err), err)
	}
	if err == nil || !strings.Contains(err.Error(), "does-not-exist") {
		t.Fatalf("module build error lost dependency context: %v", err)
	}
}

func TestProductionFileLoaderAcceptsMJS(t *testing.T) {
	dir := t.TempDir()
	entryPath := filepath.Join(dir, "main.mjs")
	if err := os.WriteFile(entryPath, []byte(`export function main() { globalThis.__moduleLoaded = true; }`), 0o600); err != nil {
		t.Fatal(err)
	}

	source, err := NewProductionFileLoader().Load(context.Background(), entryPath)
	if err != nil {
		t.Fatal(err)
	}
	if source.Ext != ".js" || source.Source != "file:"+entryPath {
		t.Fatalf("unexpected module source: %#v", source)
	}
}
