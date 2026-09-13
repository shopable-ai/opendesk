package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	officialassets "opendesk/internal/officialassets"
	"opendesk/pkg/officialconfig"
)

const (
	officialActionsSourcePath = "configs/" + officialconfig.BaseName + ".json"
	officialActionsOutputPath = "apps/opendesk/assets/" + officialconfig.BaseName + ".odcfg"
)

func readOfficialProductFile(t *testing.T, relative string) []byte {
	t.Helper()
	path := filepath.Join("..", "..", filepath.FromSlash(relative))
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", relative, err)
	}
	return data
}

func TestOfficialProductWebsiteComesFromOfficialActionsSource(t *testing.T) {
	config, err := officialconfig.ParseSource(readOfficialProductFile(t, officialActionsSourcePath))
	if err != nil {
		t.Fatalf("parse official-actions source: %v", err)
	}
	home := config.Actions["home"]
	if !home.Visible || !strings.HasPrefix(home.URL, "https://") {
		t.Fatalf("official home action must be visible with an HTTPS URL: %+v", home)
	}

	for _, relative := range []string{
		"polyfills/000-systemBase.js",
		"apps/opendesk/official-shell.js",
		"apps/opendesk/script-runner-simple.js",
		"apps/opendesk/script-runner/controller.js",
		"apps/opendesk/recorder/controller.js",
		"apps/opendesk/recorder/controller-core.js",
	} {
		source := readOfficialProductFile(t, relative)
		if bytes.Contains(source, []byte(home.URL)) {
			t.Fatalf("%s duplicated the configured product website literal", relative)
		}
	}

	runtimeSource := readOfficialProductFile(t, "polyfills/000-systemBase.js")
	if !bytes.Contains(runtimeSource, []byte("nativeSystem.product")) ||
		!bytes.Contains(runtimeSource, []byte("Object.freeze")) {
		t.Fatal("Runtime product identity must freeze the native configuration-backed System.product object")
	}
	automationSource := readOfficialProductFile(t, "automation/utils.go")
	if !bytes.Contains(automationSource, []byte("officialassets.ProductWebsite()")) {
		t.Fatal("Runtime bootstrap must derive System.product.website from the embedded generated config")
	}
	officialShell := readOfficialProductFile(t, "apps/opendesk/official-shell.js")
	if !bytes.Contains(officialShell, []byte("config.actions.home.url !== productWebsite")) {
		t.Fatal("Official Shell must fail closed when its staged home URL differs from System.product.website")
	}
	recorder := readOfficialProductFile(t, "apps/opendesk/recorder/controller-core.js")
	if !bytes.Contains(recorder, []byte("system.product.website")) {
		t.Fatal("Recorder homepage must resolve from System.product.website")
	}
}

func TestOfficialProductBuildersShareAppModePayloadOwnership(t *testing.T) {
	for _, relative := range []string{
		"scripts/build_macos_app.sh",
		"scripts/build_windows_app.ps1",
	} {
		source := readOfficialProductFile(t, relative)
		if !bytes.Contains(source, []byte("scripts/tools/app-mode-payload")) {
			t.Fatalf("%s must stage App Mode through the shared payload owner", relative)
		}
	}
	windowsDistribution := readOfficialProductFile(t, "scripts/build_windows_distribution.ps1")
	for _, required := range []string{
		"[string]$AppModePackage",
		"$appBuildArguments.AppModePackage = $AppModePackage",
		"./scripts/build_windows_app.ps1 @appBuildArguments",
	} {
		if !strings.Contains(string(windowsDistribution), required) {
			t.Fatalf("Windows distribution must pass AppModePackage through the Windows app builder; missing %q", required)
		}
	}
}

func TestOfficialActionsSourceCompilesToCommittedReleaseAsset(t *testing.T) {
	source := readOfficialProductFile(t, officialActionsSourcePath)
	config, err := officialconfig.ParseSource(source)
	if err != nil {
		t.Fatalf("parse official-actions source: %v", err)
	}
	if home, ok := config.Actions["home"]; !ok || !home.Visible || !strings.HasPrefix(home.URL, "https://") {
		t.Fatalf("official-actions source must own the visible HTTPS home action: %+v", home)
	}
	encoded, err := officialconfig.Encode(config)
	if err != nil {
		t.Fatalf("encode official-actions source: %v", err)
	}
	committed := readOfficialProductFile(t, officialActionsOutputPath)
	if !bytes.Equal(encoded, committed) {
		t.Fatalf("committed official-actions.odcfg is stale; run `opendesk config compile --input %s --output %s`", officialActionsSourcePath, officialActionsOutputPath)
	}
	embeddedConfig, err := officialassets.Config()
	if err != nil {
		t.Fatalf("decode Runtime-embedded official-actions.odcfg: %v", err)
	}
	embedded, err := officialconfig.Encode(embeddedConfig)
	if err != nil {
		t.Fatalf("re-encode Runtime-embedded official-actions.odcfg: %v", err)
	}
	if !bytes.Equal(committed, embedded) {
		t.Fatal("Runtime-embedded official-actions.odcfg is stale; run `go generate ./internal/officialassets`")
	}
}

func TestOfficialActionsReleasePayloadShipsProtectedConfigOnly(t *testing.T) {
	allowlist := string(readOfficialProductFile(t, "apps/opendesk/.release/app-mode-runtime-files.txt"))
	protectedAsset := "assets/" + officialconfig.BaseName + ".odcfg"
	if !strings.Contains(allowlist, protectedAsset) {
		t.Fatalf("OpenDesk AppMode release payload must include %s", protectedAsset)
	}
	for _, forbidden := range []string{
		officialActionsSourcePath,
		"configs/official-shell.json",
		"assets/" + officialconfig.BaseName + ".json",
		"assets/official-shell.odcfg",
		"assets/official-shell.json",
	} {
		if strings.Contains(allowlist, forbidden) {
			t.Fatalf("OpenDesk AppMode release payload must not include plaintext or legacy official config %q", forbidden)
		}
	}
}

func TestOfficialActionsRuntimeBasenameMatchesCompiler(t *testing.T) {
	officialShell := readOfficialProductFile(t, "apps/opendesk/official-shell.js")
	expected := []byte("const CONFIG_BASENAME = '" + officialconfig.BaseName + "';")
	if !bytes.Contains(officialShell, expected) {
		t.Fatalf("Official Shell Runtime basename must match compiler basename %q", officialconfig.BaseName)
	}
}
