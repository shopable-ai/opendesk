package runtimeenv_test

import (
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"opendesk/pkg/runtimeenv"
)

func TestResolveProjectFilesAndInheritedPrecedence(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, ".env"), []byte("LOW=from-env\nSHARED=env\nLITERAL=${LOW}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, ".opendesk.env"), []byte("export SHARED='opendesk'\nEMPTY=\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	result, err := runtimeenv.Resolve(runtimeenv.Options{
		WorkingDirectory: directory,
		Inherited:        []string{"SHARED=shell", "HOST_ONLY=host"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Files) != 2 {
		t.Fatalf("files = %v", result.Files)
	}
	want := map[string]string{
		"LOW": "from-env", "SHARED": "shell", "LITERAL": "${LOW}", "EMPTY": "", "HOST_ONLY": "host",
	}
	for key, expected := range want {
		if actual := result.Values[key]; actual != expected {
			t.Fatalf("%s = %q, want %q", key, actual, expected)
		}
	}
}

func TestResolveExplicitFileReplacesDiscovery(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, ".env"), []byte("DEFAULT=ignored\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "ci.env"), []byte("SELECTED=yes\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	result, err := runtimeenv.Resolve(runtimeenv.Options{WorkingDirectory: directory, File: "ci.env"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Values["SELECTED"] != "yes" || result.Values["DEFAULT"] != "" || len(result.Files) != 1 {
		t.Fatalf("unexpected explicit environment: %#v", result)
	}
}

func TestParseRejectsAmbiguousEnvironmentSyntax(t *testing.T) {
	for _, source := range []string{"NOT_AN_ASSIGNMENT\n", "1INVALID=value\n", "VALUE='unterminated\n", "VALUE=bad\x00value\n"} {
		if _, err := runtimeenv.Parse(strings.NewReader(source)); err == nil {
			t.Fatalf("Parse(%q) succeeded", source)
		}
	}
}

func TestCloneReturnsDetachedValidatedSnapshot(t *testing.T) {
	source := map[string]string{"VALID": "value"}
	cloned, err := runtimeenv.Clone(source)
	if err != nil {
		t.Fatal(err)
	}
	source["VALID"] = "changed"
	if cloned["VALID"] != "value" {
		t.Fatalf("clone changed with source: %#v", cloned)
	}
	if _, err := runtimeenv.Clone(map[string]string{"INVALID=NAME": "value"}); err == nil {
		t.Fatal("invalid name was accepted")
	}
}

func TestSystemEnvironmentValuesAndCommandOverrides(t *testing.T) {
	baseName := "PATH"
	if runtime.GOOS == "windows" {
		baseName = "Path"
	}
	base := []string{baseName + "=system-path", "SYSTEM_ONLY=a=b", "1INVALID=ignored"}
	values := runtimeenv.FromEnviron(base)
	if values["PATH"] != "system-path" || values["SYSTEM_ONLY"] != "a=b" {
		t.Fatalf("system environment = %#v", values)
	}
	if _, found := values["1INVALID"]; found {
		t.Fatalf("invalid system environment key was exposed: %#v", values)
	}

	merged, err := runtimeenv.MergeEnviron(base, map[string]string{"PATH": "override-path", "ADDED": "yes"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"ADDED=yes", "PATH=override-path", "SYSTEM_ONLY=a=b"}
	if !slices.Equal(merged, want) {
		t.Fatalf("merged environment = %#v, want %#v", merged, want)
	}
}

func TestWindowsEnvironmentNamesAreUnambiguous(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows environment names are case-insensitive")
	}
	if _, err := runtimeenv.ToEnviron(map[string]string{"Path": "one", "PATH": "two"}); err == nil {
		t.Fatal("case-insensitive duplicate environment names were accepted")
	}
}

func TestLookupUsesPlatformEnvironmentNameSemantics(t *testing.T) {
	values, err := runtimeenv.Clone(map[string]string{"LOOKUP_VALUE": "", "PRESENT": "yes"})
	if err != nil {
		t.Fatal(err)
	}
	if value, found := runtimeenv.Lookup(values, "LOOKUP_VALUE"); !found || value != "" {
		t.Fatalf("empty value lookup = %q, %v", value, found)
	}
	if value, found := runtimeenv.Lookup(values, "PRESENT"); !found || value != "yes" {
		t.Fatalf("present lookup = %q, %v", value, found)
	}
	if _, found := runtimeenv.Lookup(values, "INVALID-NAME"); found {
		t.Fatal("invalid environment name was found")
	}
	if runtime.GOOS == "windows" {
		if value, found := runtimeenv.Lookup(values, "present"); !found || value != "yes" {
			t.Fatalf("case-insensitive Windows lookup = %q, %v", value, found)
		}
	}
}
