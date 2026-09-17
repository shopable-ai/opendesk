package main

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestStripLeadingMacOSLaunchServicesPSN(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want []string
	}{
		{name: "finder launch", args: []string{"-psn_0_12345"}, want: []string{}},
		{name: "finder launch with script", args: []string{"-psn_0_12345", "-script", "fixture.js"}, want: []string{"-script", "fixture.js"}},
		{name: "ai command remains intact", args: []string{"-psn_0_12345", "ai", "run"}, want: []string{"ai", "run"}},
		{name: "malformed token remains intact", args: []string{"-psn_not-a-launchservices-token"}, want: []string{"-psn_not-a-launchservices-token"}},
		{name: "later text value remains intact", args: []string{"-script-text", "-psn_0_12345"}, want: []string{"-script-text", "-psn_0_12345"}},
		{name: "double dash value remains intact", args: []string{"--", "-psn_0_12345"}, want: []string{"--", "-psn_0_12345"}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := stripLeadingMacOSLaunchServicesPSN(test.args); !reflect.DeepEqual(got, test.want) {
				t.Fatalf("stripLeadingMacOSLaunchServicesPSN(%q) = %q, want %q", test.args, got, test.want)
			}
		})
	}
}

func TestFlowDocumentPathsRegistersOnlyRealODFlowFiles(t *testing.T) {
	root := t.TempDir()
	flowPath := filepath.Join(root, "中文 flow [1] #$.odflow")
	scriptPath := filepath.Join(root, "plain file.js")
	for _, path := range []string{flowPath, scriptPath} {
		if err := os.WriteFile(path, []byte("fixture"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	got := flowDocumentPaths([]string{scriptPath, flowPath, flowPath, filepath.Join(root, "missing.odflow")})
	if !reflect.DeepEqual(got, []string{flowPath}) {
		t.Fatalf("flowDocumentPaths() = %#v, want %#v", got, []string{flowPath})
	}
	if normalized, err := normalizeFlowInstallPath(scriptPath); err != nil || normalized != scriptPath {
		t.Fatalf("native picker/drop JS path = %q, err = %v", normalized, err)
	}
	if _, err := normalizeFlowInstallPath(strings.Repeat("x", maxFlowDocumentPathSize+1)); err == nil {
		t.Fatal("oversized Flow path unexpectedly accepted")
	}
}

func TestFlowDocumentPathsIsBounded(t *testing.T) {
	root := t.TempDir()
	args := make([]string, maxFlowDocumentPaths+3)
	for index := range args {
		args[index] = filepath.Join(root, fmt.Sprintf("flow-%02d.odflow", index))
		if err := os.WriteFile(args[index], []byte("fixture"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if got := flowDocumentPaths(args); len(got) != maxFlowDocumentPaths {
		t.Fatalf("flowDocumentPaths() returned %d paths, want %d", len(got), maxFlowDocumentPaths)
	}
}
