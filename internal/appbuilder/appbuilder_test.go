package appbuilder

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/appshell"
)

const testManifest = `{
  "schemaVersion": 1,
  "id": "com.example.builder-test",
  "name": "Builder Test",
  "version": "1.2.3",
  "runtime": {"minVersion": "0.1.0"},
  "entry": "main.js",
  "window": {"mainId": "main"},
  "tray": {"enabled": false}
}`

func TestBuildMacOSFromInstalledTemplateStagesPortableAppWithoutExecutingEntry(t *testing.T) {
	packageRoot := writePackage(t)
	runtimeExecutable := writeRuntimeTemplate(t, TargetMacOS)
	output := filepath.Join(t.TempDir(), "Builder Test.app")

	result, err := Build(Options{
		PackageDir:        packageRoot,
		Target:            TargetMacOS,
		Output:            output,
		RuntimeExecutable: runtimeExecutable,
		Now:               fixedNow,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Target != TargetMacOS || result.Output != output || result.Signing.Status != "unsigned" || result.Signing.Notarization != "not-notarized" {
		t.Fatalf("unexpected build result: %+v", result)
	}
	if !result.BuiltAt.Equal(fixedNow()) || result.Package.ID != "com.example.builder-test" || result.Package.SHA256 == "" || result.Runtime.ExecutableSHA256 == "" || result.Runtime.TemplateSHA256 == "" {
		t.Fatalf("missing deterministic build facts: %+v", result)
	}
	appMode := filepath.Join(output, "Contents", "Resources", "AppMode")
	if _, err := appshell.ValidatePackage(appMode); err != nil {
		t.Fatalf("built payload must remain Runtime-valid: %v", err)
	}
	mainSource, err := os.ReadFile(filepath.Join(appMode, "main.js"))
	if err != nil {
		t.Fatal(err)
	}
	if string(mainSource) != "throw new Error('this must never execute during build');\n" {
		t.Fatalf("unexpected staged entry: %q", mainSource)
	}
	info, err := os.ReadFile(filepath.Join(output, "Contents", "Info.plist"))
	if err != nil {
		t.Fatal(err)
	}
	for _, fragment := range []string{
		"<key>CFBundleIdentifier</key>\n  <string>com.example.builder-test</string>",
		"<key>CFBundleDisplayName</key>\n  <string>Builder Test</string>",
		"<key>CFBundleShortVersionString</key>\n  <string>1.2.3</string>",
	} {
		if !strings.Contains(string(info), fragment) {
			t.Fatalf("Info.plist missing %q:\n%s", fragment, info)
		}
	}
	if _, err := os.Stat(filepath.Join(output, "Contents", "_CodeSignature")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("derived app must not retain copied code signature, err=%v", err)
	}
	provenance := decodeProvenance(t, result.Provenance)
	if provenance.Output != output || provenance.Provenance != result.Provenance || provenance.Runtime.Source == "" {
		t.Fatalf("provenance must describe published artifact: %+v", provenance)
	}

	// The final artifact does not depend on the source template's location.
	moved := filepath.Join(t.TempDir(), "Moved.app")
	if err := os.Rename(output, moved); err != nil {
		t.Fatal(err)
	}
	if _, err := appshell.ValidatePackage(filepath.Join(moved, "Contents", "Resources", "AppMode")); err != nil {
		t.Fatalf("moved macOS artifact is not self-contained: %v", err)
	}
}

func TestBuildWindowsFromInstalledTemplateStagesPortableDirectory(t *testing.T) {
	packageRoot := writePackage(t)
	runtimeExecutable := writeRuntimeTemplate(t, TargetWindows)
	output := filepath.Join(t.TempDir(), "builder-test-portable")

	result, err := Build(Options{PackageDir: packageRoot, Target: TargetWindows, Output: output, RuntimeExecutable: runtimeExecutable, Now: fixedNow})
	if err != nil {
		t.Fatal(err)
	}
	if result.Signing.Status != "not-signed-by-builder" || result.Signing.Notarization != "" || filepath.Base(result.Provenance) != "app-build-provenance.json" {
		t.Fatalf("unexpected Windows signing/provenance result: %+v", result)
	}
	for _, relative := range []string{"opendesk.exe", "ui-host/opendesk-ui-host.exe", "polyfills/000.js", "jslibs/runtime.js", "app-mode/opendesk.app.json", "app-build-provenance.json"} {
		if _, err := os.Stat(filepath.Join(output, filepath.FromSlash(relative))); err != nil {
			t.Fatalf("portable artifact missing %s: %v", relative, err)
		}
	}
	if _, err := os.Stat(filepath.Join(output, "app-mode", "old.js")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("template's old App Mode payload leaked into result, err=%v", err)
	}
	if _, err := appshell.ValidatePackage(filepath.Join(output, "app-mode")); err != nil {
		t.Fatalf("built Windows payload must remain Runtime-valid: %v", err)
	}

	moved := filepath.Join(t.TempDir(), "moved-portable")
	if err := os.Rename(output, moved); err != nil {
		t.Fatal(err)
	}
	if _, err := appshell.ValidatePackage(filepath.Join(moved, "app-mode")); err != nil {
		t.Fatalf("moved Windows portable artifact is not self-contained: %v", err)
	}
}

func TestBuildProtectsExistingOutputAndRejectsTemplateMismatch(t *testing.T) {
	packageRoot := writePackage(t)
	runtimeExecutable := writeRuntimeTemplate(t, TargetMacOS)
	output := filepath.Join(t.TempDir(), "already-there.app")
	if err := os.Mkdir(output, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(output, "keep"), []byte("do not overwrite"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := Build(Options{PackageDir: packageRoot, Target: TargetMacOS, Output: output, RuntimeExecutable: runtimeExecutable})
	assertBuildError(t, err, "APP_BUILD_OUTPUT_EXISTS")
	kept, readErr := os.ReadFile(filepath.Join(output, "keep"))
	if readErr != nil || string(kept) != "do not overwrite" {
		t.Fatalf("existing artifact was changed: data=%q err=%v", kept, readErr)
	}

	badRuntime := writeRuntimeTemplate(t, TargetWindows)
	if err := os.WriteFile(filepath.Join(filepath.Dir(badRuntime), windowsTemplateFilename), []byte(`{"schemaVersion":1,"kind":"opendesk-app-builder-template","target":"macos"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = Build(Options{PackageDir: packageRoot, Target: TargetWindows, Output: filepath.Join(t.TempDir(), "out"), RuntimeExecutable: badRuntime})
	assertBuildError(t, err, "APP_BUILD_RUNTIME_TEMPLATE_INVALID")
}

func TestBuildRejectsUnsafeOutputAndPreservesRuntimeAuthority(t *testing.T) {
	runtimeExecutable := writeRuntimeTemplate(t, TargetWindows)
	packageRoot := writePackage(t)
	_, err := Build(Options{PackageDir: packageRoot, Target: TargetWindows, Output: filepath.Join(packageRoot, "out"), RuntimeExecutable: runtimeExecutable})
	assertBuildError(t, err, "APP_BUILD_OUTPUT_INVALID")

	if err := os.WriteFile(filepath.Join(packageRoot, appshell.ManifestFileName), []byte(`{"schemaVersion":1,"id":"bad","version":"1.0.0","entry":"main.js","window":{"mainId":"main"},"tray":{"enabled":false}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = Build(Options{PackageDir: packageRoot, Target: TargetWindows, Output: filepath.Join(t.TempDir(), "out"), RuntimeExecutable: runtimeExecutable})
	var packageErr *appshell.PackageError
	if !errors.As(err, &packageErr) || packageErr.Code != appshell.ErrPackageIDInvalid {
		t.Fatalf("Build must return Runtime package validation error unchanged, got %T %v", err, err)
	}
}

func TestBuildRejectsUnsupportedTargetBeforeInspectingRuntime(t *testing.T) {
	_, err := Build(Options{Target: "linux", PackageDir: "/not-read", Output: "/not-written"})
	assertBuildError(t, err, "APP_BUILD_TARGET_INVALID")
}

func writePackage(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, appshell.ManifestFileName), []byte(testManifest), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "main.js"), []byte("throw new Error('this must never execute during build');\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return root
}

func writeRuntimeTemplate(t *testing.T, target string) string {
	t.Helper()
	root := t.TempDir()
	if target == TargetMacOS {
		app := filepath.Join(root, "OpenDesk.app")
		writeFixture(t, app, "Contents/MacOS/opendesk", "runtime")
		writeFixture(t, app, "Contents/Helpers/opendesk-ui-host", "ui host")
		writeFixture(t, app, "Contents/MacOS/polyfills/000.js", "polyfill")
		writeFixture(t, app, "Contents/Resources/OpenDeskAppBuilder/template.json", `{"schemaVersion":1,"kind":"opendesk-app-builder-template","target":"macos"}`)
		writeFixture(t, app, "Contents/Resources/AppMode/old.js", "old user payload")
		writeFixture(t, app, "Contents/_CodeSignature/CodeResources", "obsolete signature")
		writeFixture(t, app, "Contents/Info.plist", testInfoPlist)
		if err := os.Chmod(filepath.Join(app, "Contents", "MacOS", "opendesk"), 0o755); err != nil {
			t.Fatal(err)
		}
		return filepath.Join(app, "Contents", "MacOS", "opendesk")
	}
	writeFixture(t, root, "opendesk.exe", "runtime")
	writeFixture(t, root, "ui-host/opendesk-ui-host.exe", "ui host")
	writeFixture(t, root, "polyfills/000.js", "polyfill")
	writeFixture(t, root, "jslibs/runtime.js", "library")
	writeFixture(t, root, windowsTemplateFilename, `{"schemaVersion":1,"kind":"opendesk-app-builder-template","target":"windows"}`)
	writeFixture(t, root, "app-mode/old.js", "old user payload")
	return filepath.Join(root, "opendesk.exe")
}

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

func decodeProvenance(t *testing.T, filename string) Result {
	t.Helper()
	data, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var result Result
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func assertBuildError(t *testing.T, err error, code string) {
	t.Helper()
	var buildErr *Error
	if !errors.As(err, &buildErr) || buildErr.Code != code {
		t.Fatalf("error=%T %v, want builder code %s", err, err, code)
	}
}

func fixedNow() time.Time { return time.Date(2026, 9, 12, 1, 2, 3, 0, time.UTC) }

const testInfoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key>
  <string>com.opendesk.template</string>
  <key>CFBundleDisplayName</key>
  <string>OpenDesk</string>
  <key>CFBundleName</key>
  <string>OpenDesk</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
</dict></plist>
`
