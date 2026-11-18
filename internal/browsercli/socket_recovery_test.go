//go:build darwin || linux

package browsercli

import (
	"bytes"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"

	"opendesk/internal/browserbridge"
)

// Build an inert installation fixture without setup or starting a Native Host.
func socketRecoveryFixture(t *testing.T) (string, []string, map[string][]byte) {
	t.Helper()
	home, err := os.MkdirTemp("/tmp", "od-sock-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(home) })
	t.Setenv("HOME", home)
	t.Setenv("OPENDESK_NATIVE_INSTANCE", "cli")
	root := filepath.Join(home, ".opendesk-browser", "native-agent-instances", "cli")
	profile := filepath.Join(home, "profile")
	manifest := filepath.Join(profile, "NativeMessagingHosts", browserbridge.HostName+".json")
	for _, dir := range []string{root, filepath.Dir(manifest)} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	executable := filepath.Join(home, "inert-opendesk")
	wrapper := filepath.Join(root, "native-host")
	cfg := browserbridge.Installation{
		Name: browserbridge.HostName, ExtensionID: cliTestExtensionID,
		Browser: "cft", UserDataDir: profile, SocketPath: filepath.Join(root, "agent.sock"),
		ClientCredential: strings.Repeat("a", 64), InstallRoot: root,
		Provider: "opendesk", Executable: executable,
	}
	configBytes, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	manifestBytes, err := json.Marshal(map[string]any{
		"name": cfg.Name, "description": "OpenDesk Browser Native Agent", "type": "stdio",
		"path": wrapper, "allowed_origins": []string{"chrome-extension://" + cliTestExtensionID + "/"},
	})
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{
		executable:                          []byte("#!/bin/sh\nexit 99\n"),
		wrapper:                             []byte("#!/bin/sh\nOPENDESK_NATIVE_INSTANCE='cli'\nexport OPENDESK_NATIVE_INSTANCE\nexec '" + executable + "' browser native-host \"$@\"\n"),
		filepath.Join(root, "install.json"): configBytes,
		manifest:                            manifestBytes,
		filepath.Join(root, "unknown-ai-request.json"): []byte(`{"requestId":"preserve-unknown","outcome":"OUTCOME_UNKNOWN"}`),
	}
	for path, data := range files {
		mode := os.FileMode(0600)
		if path == executable || path == wrapper {
			mode = 0700
		}
		if err := os.WriteFile(path, data, mode); err != nil {
			t.Fatal(err)
		}
	}
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: cfg.SocketPath, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	listener.SetUnlinkOnClose(false)
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(cfg.SocketPath, 0600); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(cfg.SocketPath)
	if err != nil {
		t.Fatal(err)
	}
	stat := info.Sys().(*syscall.Stat_t)
	args := []string{"--extension-id", cliTestExtensionID,
		"--expected-device", strconv.FormatUint(uint64(stat.Dev), 10),
		"--expected-inode", strconv.FormatUint(uint64(stat.Ino), 10),
		"--legacy-quiesced", "true"}
	return cfg.SocketPath, args, files
}

func assertRecoveryFiles(t *testing.T, files map[string][]byte) {
	t.Helper()
	for path, want := range files {
		got, err := os.ReadFile(path)
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("recovery changed %s: %v", path, err)
		}
	}
}

func TestSocketRecoveryRejectsInvalidOptionsWithoutMutation(t *testing.T) {
	socket, valid, files := socketRecoveryFixture(t)
	before, err := os.Lstat(socket)
	if err != nil {
		t.Fatal(err)
	}
	cases := [][]string{
		nil, {"--extension-id"}, {"--extension-id", ""}, {"--extension-id", "invalid"},
		{"--dry-run", "true"}, {"--extension-id=" + cliTestExtensionID},
	}
	for _, flag := range []string{"--extension-id", "--expected-device", "--expected-inode", "--dry-run", "--legacy-quiesced"} {
		cases = append(cases, append(append([]string{}, valid...), flag))
		value := "true"
		if flag == "--extension-id" {
			value = cliTestExtensionID
		}
		if flag == "--expected-device" || flag == "--expected-inode" {
			value = "1"
		}
		base := append([]string{}, valid...)
		if flag == "--dry-run" {
			base = append(base, flag, value)
		}
		cases = append(cases, append(base, flag, value))
	}
	for _, flag := range []string{"--dry-run", "--legacy-quiesced"} {
		for _, value := range []string{"", "1", "0", "TRUE", "False", "yes"} {
			cases = append(cases, []string{"--extension-id", cliTestExtensionID, flag, value})
		}
	}
	for _, flag := range []string{"--expected-device", "--expected-inode"} {
		for _, value := range []string{"", "0", "-1", "+1", "0x10", "1.0", " 1", "1 ", "18446744073709551616"} {
			cases = append(cases, []string{"--extension-id", cliTestExtensionID, "--dry-run", "true", flag, value})
		}
	}
	cases = append(cases, []string{"--extension-id", cliTestExtensionID, "--force", "true"})
	for _, fields := range cases {
		t.Run(strings.Join(fields, " "), func(t *testing.T) {
			var out, diagnostics bytes.Buffer
			code := Execute(append([]string{"browser", "socket", "recover"}, fields...), &out, &diagnostics)
			if code != 1 || out.Len() != 0 || !strings.Contains(diagnostics.String(), "E_SCHEMA") {
				t.Fatalf("invalid input: code=%d stdout=%s stderr=%s", code, &out, &diagnostics)
			}
			after, err := os.Lstat(socket)
			if err != nil || !os.SameFile(before, after) {
				t.Fatalf("invalid options changed socket: %v", err)
			}
			assertRecoveryFiles(t, files)
		})
	}
}

func TestSocketRecoveryDryRunAndApply(t *testing.T) {
	socket, valid, files := socketRecoveryFixture(t)
	before, err := os.Lstat(socket)
	if err != nil {
		t.Fatal(err)
	}
	// Applying defaults to false dry-run, so missing acknowledgments must fail.
	for _, fields := range [][]string{
		{"--extension-id", cliTestExtensionID}, valid[:6],
		append(append([]string{}, valid[:6]...), "--legacy-quiesced", "false"),
		{"--extension-id", cliTestExtensionID, "--expected-device", valid[3], "--legacy-quiesced", "true"},
		{"--extension-id", cliTestExtensionID, "--expected-inode", valid[5], "--legacy-quiesced", "true"},
	} {
		var out, diagnostics bytes.Buffer
		if Execute(append([]string{"browser", "socket", "recover"}, fields...), &out, &diagnostics) != 1 || out.Len() != 0 {
			t.Fatalf("unsafe apply accepted: %v stdout=%s stderr=%s", fields, &out, &diagnostics)
		}
		after, err := os.Lstat(socket)
		if err != nil || !os.SameFile(before, after) {
			t.Fatalf("unsafe apply changed socket: %v", err)
		}
		assertRecoveryFiles(t, files)
	}
	for _, tc := range []struct {
		fields []string
		dryRun bool
	}{
		{[]string{"--extension-id", cliTestExtensionID, "--dry-run", "true", "--legacy-quiesced", "false"}, true},
		{append(append([]string{}, valid...), "--dry-run", "true"), true},
		{valid, false},
	} {
		fields := tc.fields
		var out, diagnostics bytes.Buffer
		if code := Execute(append([]string{"browser", "socket", "recover"}, fields...), &out, &diagnostics); code != 0 {
			t.Fatalf("recovery failed: %v code=%d stderr=%s", fields, code, &diagnostics)
		}
		var result map[string]any
		if err := json.Unmarshal(out.Bytes(), &result); err != nil || result == nil || diagnostics.Len() != 0 {
			t.Fatalf("invalid recovery output: %s stderr=%s err=%v", &out, &diagnostics, err)
		}
		assertRecoveryFiles(t, files)
		if !tc.dryRun {
			if result["changed"] != true || result["requestReconciled"] != false || result["state"] != "socket-retired" {
				t.Fatalf("invalid apply receipt: %v", result)
			}
			if _, err := os.Lstat(socket); !os.IsNotExist(err) {
				t.Fatalf("apply left orphan: %v", err)
			}
		} else {
			if result["changed"] != false || result["legacyQuiescenceRequired"] != true {
				t.Fatalf("invalid dry-run receipt: %v", result)
			}
			after, err := os.Lstat(socket)
			if err != nil || !os.SameFile(before, after) {
				t.Fatalf("dry-run changed socket: %v", err)
			}
		}
	}
}

func TestSocketRecoveryHelp(t *testing.T) {
	for _, action := range []string{"help", "--help"} {
		var out, diagnostics bytes.Buffer
		if code := Execute([]string{"browser", "socket", action}, &out, &diagnostics); code != 0 {
			t.Fatalf("help: %d %s", code, &diagnostics)
		}
		for _, text := range []string{"browser socket recover", "--extension-id", "--expected-device", "--expected-inode", "--dry-run", "--legacy-quiesced", "old Host", "launchers", "connection refusal", "new lock", "AI", "socket"} {
			if !strings.Contains(out.String(), text) {
				t.Fatalf("help missing %q: %s", text, &out)
			}
		}
	}
	for _, rest := range [][]string{nil, {"unknown"}, {"help", "extra"}, {"--help", "extra"}} {
		var out, diagnostics bytes.Buffer
		if Execute(append([]string{"browser", "socket"}, rest...), &out, &diagnostics) != 1 || out.Len() != 0 {
			t.Fatalf("invalid socket action accepted: %v", rest)
		}
	}
}
