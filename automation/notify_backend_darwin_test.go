//go:build darwin

package automation

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppleScriptStringEscapesNotificationText(t *testing.T) {
	got := appleScriptString("quote \" slash \\ line\ncarriage\rtab\t")
	want := `"quote \" slash \\ line\ncarriage\rtab\t"`
	if got != want {
		t.Fatalf("appleScriptString() = %q, want %q", got, want)
	}
}

func TestAppleScriptBackendReportsMissingExecutable(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	err := notifyDarwinWithAppleScript("OpenDesk", "backend error", false)
	if err == nil || !strings.Contains(err.Error(), "osascript lookup failed") {
		t.Fatalf("unexpected missing backend error: %v", err)
	}
}

func TestAppleScriptBackendCapturesArgumentsAndSoundRequest(t *testing.T) {
	dir := t.TempDir()
	capture := filepath.Join(dir, "args.txt")
	fakeOSA := filepath.Join(dir, "osascript")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$CAPTURE\"\n"
	if err := os.WriteFile(fakeOSA, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	t.Setenv("CAPTURE", capture)

	title := `ti"tle`
	message := "line\nbody\\"
	if err := notifyDarwinWithAppleScript(title, message, true); err != nil {
		t.Fatalf("notifyDarwinWithAppleScript returned error: %v", err)
	}
	raw, err := os.ReadFile(capture)
	if err != nil {
		t.Fatal(err)
	}
	want := fmt.Sprintf("-e\ndisplay notification %s with title %s sound name \"default\"\n", appleScriptString(message), appleScriptString(title))
	if string(raw) != want {
		t.Fatalf("osascript arguments = %q, want %q", string(raw), want)
	}
}

func TestAppleScriptBackendCapturesStderrOnNonzeroExit(t *testing.T) {
	dir := t.TempDir()
	fakeOSA := filepath.Join(dir, "osascript")
	script := "#!/bin/sh\nprintf 'permission denied by test\\n' >&2\nexit 7\n"
	if err := os.WriteFile(fakeOSA, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)

	err := notifyDarwinWithAppleScript("OpenDesk", "backend error", false)
	if err == nil || !strings.Contains(err.Error(), "osascript failed: permission denied by test") {
		t.Fatalf("unexpected process error: %v", err)
	}
}
