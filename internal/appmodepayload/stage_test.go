package appmodepayload

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func writeFixture(t *testing.T, root, relative, content string) {
	t.Helper()
	filename := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(filename), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filename, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestStageReleasePolicyCopiesOnlyApprovedRuntimeFiles(t *testing.T) {
	source := t.TempDir()
	destination := filepath.Join(t.TempDir(), "app-mode")
	for _, relative := range []string{"opendesk.app.json", "main.js", "recorder/controller.js"} {
		writeFixture(t, source, relative, relative)
	}
	writeFixture(t, source, "README.md", "development docs")
	writeFixture(t, source, "recorder/embed.go", "package recorder")
	writeFixture(t, source, "recorder/icons/render.swift", "// build helper")
	writeFixture(t, source, ReleasePolicyPath, strings.Join([]string{
		"# runtime closure",
		"opendesk.app.json",
		"main.js",
		"recorder/controller.js",
		"",
	}, "\n"))

	result, err := Stage(source, destination)
	if err != nil {
		t.Fatal(err)
	}
	if !result.PolicyApplied {
		t.Fatal("expected release policy to be applied")
	}
	for _, relative := range []string{"opendesk.app.json", "main.js", "recorder/controller.js"} {
		if _, err := os.Stat(filepath.Join(destination, filepath.FromSlash(relative))); err != nil {
			t.Fatalf("missing staged runtime file %s: %v", relative, err)
		}
	}
	for _, relative := range []string{"README.md", "recorder/embed.go", "recorder/icons/render.swift", ReleasePolicyPath} {
		if _, err := os.Stat(filepath.Join(destination, filepath.FromSlash(relative))); !os.IsNotExist(err) {
			t.Fatalf("development file leaked into release payload: %s", relative)
		}
	}
}

func TestStageWithoutReleasePolicyPreservesGenericPackage(t *testing.T) {
	source := t.TempDir()
	destination := filepath.Join(t.TempDir(), "app-mode")
	writeFixture(t, source, "opendesk.app.json", "{}")
	writeFixture(t, source, "README.md", "allowed for generic package without repository policy")
	writeFixture(t, source, "native.go", "runtime-owned file for compatibility proof")
	writeFixture(t, source, ".runtime/local.log", "developer runtime state")

	result, err := Stage(source, destination)
	if err != nil {
		t.Fatal(err)
	}
	if result.PolicyApplied {
		t.Fatal("generic package should retain full-package staging semantics")
	}
	for _, relative := range []string{"README.md", "native.go"} {
		if _, err := os.Stat(filepath.Join(destination, relative)); err != nil {
			t.Fatalf("generic package file should be preserved (%s): %v", relative, err)
		}
	}
	if _, err := os.Stat(filepath.Join(destination, ".runtime", "local.log")); !os.IsNotExist(err) {
		t.Fatal("generic release staging must not copy .runtime developer state")
	}
}

func TestStageRejectsDevelopmentFileInReleasePolicy(t *testing.T) {
	source := t.TempDir()
	writeFixture(t, source, "opendesk.app.json", "{}")
	writeFixture(t, source, "embed.go", "package fixture")
	writeFixture(t, source, ReleasePolicyPath, "opendesk.app.json\nembed.go\n")

	_, err := Stage(source, filepath.Join(t.TempDir(), "app-mode"))
	if err == nil || !strings.Contains(err.Error(), "build-time source file") {
		t.Fatalf("expected build-time source rejection, got %v", err)
	}
}

func TestStageRejectsLiteralScriptDirDependencyMissingFromReleasePolicy(t *testing.T) {
	source := t.TempDir()
	writeFixture(t, source, "opendesk.app.json", "{}")
	writeFixture(t, source, "main.js", `const moduleFile = File.join(Execution.scriptDir, 'developer-tools.js'); File.read(moduleFile);`)
	writeFixture(t, source, "developer-tools.js", "// runtime module")
	writeFixture(t, source, ReleasePolicyPath, "opendesk.app.json\nmain.js\n")

	_, err := Stage(source, filepath.Join(t.TempDir(), "app-mode"))
	if err == nil || !strings.Contains(err.Error(), "omits literal package dependency developer-tools.js") {
		t.Fatalf("expected literal dependency closure rejection, got %v", err)
	}

	writeFixture(t, source, ReleasePolicyPath, "opendesk.app.json\nmain.js\ndeveloper-tools.js\n")
	if _, err := Stage(source, filepath.Join(t.TempDir(), "complete")); err != nil {
		t.Fatalf("complete literal dependency closure rejected: %v", err)
	}
}

func TestStageRejectsLiteralPackageDependencyMissingFromReleasePolicy(t *testing.T) {
	source := t.TempDir()
	writeFixture(t, source, "opendesk.app.json", "{}")
	writeFixture(t, source, "main.js", "const moduleFile = File.join(Execution.scriptDir, 'developer-tools.js');\nFile.read(moduleFile);\n")
	writeFixture(t, source, "developer-tools.js", "// runtime module")
	writeFixture(t, source, ReleasePolicyPath, "opendesk.app.json\nmain.js\n")

	_, err := Stage(source, filepath.Join(t.TempDir(), "app-mode"))
	if err == nil || !strings.Contains(err.Error(), "omits literal package dependency developer-tools.js") {
		t.Fatalf("expected literal dependency closure rejection, got %v", err)
	}
}

func TestLiteralPackageDependenciesIncludeNestedRuntimeResources(t *testing.T) {
	content := []byte(`
const one = File.join(Execution.scriptDir, 'developer-tools.js');
const two = file.join(execution.scriptDir, 'flow-runner', 'controller.js');
const three = file.join(execution.scriptDir, dynamicName);
const runtimeDirectory = file.join(execution.scriptDir, 'recording-console-simple');
`)
	got := literalPackageDependencies(content)
	want := []string{"developer-tools.js", "flow-runner/controller.js"}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("literal dependencies=%v, want=%v", got, want)
	}
}

func TestStageRejectsDestinationContainingSource(t *testing.T) {
	parent := t.TempDir()
	source := filepath.Join(parent, "package")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFixture(t, source, "opendesk.app.json", "{}")

	_, err := Stage(source, parent)
	if err == nil || !strings.Contains(err.Error(), "must not contain source") {
		t.Fatalf("expected ancestor destination rejection, got %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(source, "opendesk.app.json")); statErr != nil {
		t.Fatalf("source must remain intact after rejected staging: %v", statErr)
	}
}

func TestStageRejectsSymlinkedPackageContent(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows CI may not grant symlink creation privilege; product contract is exercised by source-tree staging instead")
	}
	source := t.TempDir()
	writeFixture(t, source, "opendesk.app.json", "{}")
	target := filepath.Join(source, "main.js")
	writeFixture(t, source, "real.js", "ok")
	if err := os.Symlink(filepath.Join(source, "real.js"), target); err != nil {
		t.Fatal(err)
	}
	_, err := Stage(source, filepath.Join(t.TempDir(), "app-mode"))
	if err == nil || !strings.Contains(err.Error(), "rejects symlink") {
		t.Fatalf("expected symlink rejection, got %v", err)
	}
}

func TestOpenDeskProductReleasePolicy(t *testing.T) {
	repoRoot := filepath.Clean(filepath.Join("..", ".."))
	source := filepath.Join(repoRoot, "apps", "opendesk")
	destination := filepath.Join(t.TempDir(), "app-mode")
	result, err := Stage(source, destination)
	if err != nil {
		t.Fatal(err)
	}
	if !result.PolicyApplied {
		t.Fatal("apps/opendesk must opt into explicit release payload closure")
	}

	expected := []string{
		"opendesk.app.json",
		"main.js",
		"localization.js",
		"assistant/store.js",
		"assistant/model-channel.js",
		"assistant/task-service.js",
		"assistant/session.js",
		"assistant/controller.js",
		"capabilities/calculator.js",
		"official-shell.js",
		"scheduler-client.js",
		"scheduler-center.js",
		"permissions-center.js",
		"about.js",
		"inspector-launcher.js",
		"app-controller.js",
		"developer-tools.js",
		"runtime-log.js",
		"promotions/core.js",
		"promotions/controller.js",
		"promotions/integration.js",
		"promotions/official-creative.js",
		"promotions/owner.js",
		"flow-runner.js",
		"flow-runner/controller.js",
		"flow-runner/player-controller.js",
		"flow-runner/shortcut-controller.js",
		"assets/product.odcfg",
		"assets/help-questionmark.png",
		"assets/opendesk-logo.png",
		"assets/flow-previous.png",
		"assets/flow-next.png",
		"assets/tray-template.png",
		"assets/tray.ico",
		"recorder/controller.js",
		"recorder/controller-core.js",
		"recorder/recording-history.js",
		"locales/zh-CN.json",
		"locales/en-US.json",
	}
	if len(result.Files) != len(expected) {
		t.Fatalf("unexpected product payload file count: got %d want %d: %v", len(result.Files), len(expected), result.Files)
	}
	for index, relative := range expected {
		if result.Files[index] != relative {
			t.Fatalf("product payload policy drift at %d: got %q want %q", index, result.Files[index], relative)
		}
		if _, err := os.Stat(filepath.Join(destination, filepath.FromSlash(relative))); err != nil {
			t.Fatalf("missing product runtime file %s: %v", relative, err)
		}
	}

	for _, relative := range []string{
		"README.md",
		"recorder/embed.go",
		"recorder/embed_test.go",
		"recorder/icons/render-countdown-icons.swift",
	} {
		if _, err := os.Stat(filepath.Join(destination, filepath.FromSlash(relative))); !os.IsNotExist(err) {
			t.Fatalf("product development file leaked into release payload: %s", relative)
		}
	}
	if err := filepath.WalkDir(destination, func(current string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext == ".go" || ext == ".swift" {
			relative, _ := filepath.Rel(destination, current)
			t.Fatalf("build-time source leaked into product release payload: %s", filepath.ToSlash(relative))
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
