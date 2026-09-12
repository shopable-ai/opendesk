package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"opendesk/pkg/officialconfig"
)

const officialProductWebsiteLiteral = "https://github.com/shopable-ai/opendesk"

func readOfficialProductFile(t *testing.T, relative string) []byte {
	t.Helper()
	path := filepath.Join("..", "..", filepath.FromSlash(relative))
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", relative, err)
	}
	return data
}

func TestOfficialProductWebsiteHasOneRuntimeOwnedSource(t *testing.T) {
	runtimeSource := readOfficialProductFile(t, "polyfills/000-systemBase.js")
	if count := bytes.Count(runtimeSource, []byte(officialProductWebsiteLiteral)); count != 1 {
		t.Fatalf("runtime product website literal count=%d, want 1", count)
	}
	if !bytes.Contains(runtimeSource, []byte("System, 'product'")) ||
		!bytes.Contains(runtimeSource, []byte("Object.freeze")) {
		t.Fatal("Runtime product identity must remain an immutable System.product object")
	}

	for _, relative := range []string{
		"apps/opendesk/official-shell.js",
		"apps/opendesk/script-runner-simple.js",
		"apps/opendesk/recorder/controller.js",
		"apps/opendesk/recorder/controller-core.js",
	} {
		source := readOfficialProductFile(t, relative)
		if bytes.Contains(source, []byte(officialProductWebsiteLiteral)) {
			t.Fatalf("%s duplicated the Runtime-owned product website literal", relative)
		}
	}

	officialShell := readOfficialProductFile(t, "apps/opendesk/official-shell.js")
	if !bytes.Contains(officialShell, []byte("system.product.website")) {
		t.Fatal("Official Shell homepage must resolve from System.product.website")
	}
	recorder := readOfficialProductFile(t, "apps/opendesk/recorder/controller-core.js")
	if !bytes.Contains(recorder, []byte("system.product.website")) {
		t.Fatal("Recorder homepage must resolve from System.product.website")
	}
}

func TestOfficialShellSourceCompilesToCommittedReleaseAsset(t *testing.T) {
	source := readOfficialProductFile(t, "configs/official-shell.json")
	config, err := officialconfig.ParseSource(source)
	if err != nil {
		t.Fatalf("parse official-shell source: %v", err)
	}
	if _, ok := config.Actions["home"]; ok {
		t.Fatal("official-shell source must not own the home action")
	}
	encoded, err := officialconfig.Encode(config)
	if err != nil {
		t.Fatalf("encode official-shell source: %v", err)
	}
	committed := readOfficialProductFile(t, "apps/opendesk/assets/official-shell.odcfg")
	if !bytes.Equal(encoded, committed) {
		t.Fatal("committed official-shell.odcfg is stale; run `opendesk config compile`")
	}
}

func TestOfficialShellReleasePayloadShipsProtectedConfigOnly(t *testing.T) {
	allowlist := string(readOfficialProductFile(t, "apps/opendesk/.release/app-mode-runtime-files.txt"))
	if !strings.Contains(allowlist, "assets/official-shell.odcfg") {
		t.Fatal("OpenDesk AppMode release payload must include assets/official-shell.odcfg")
	}
	for _, forbidden := range []string{
		"configs/official-shell.json",
		"assets/official-shell.json",
	} {
		if strings.Contains(allowlist, forbidden) {
			t.Fatalf("OpenDesk AppMode release payload must not include plaintext official config %q", forbidden)
		}
	}
}
