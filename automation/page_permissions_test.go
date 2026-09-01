package automation

import (
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestRunCommandProbeWithTimeout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses /bin/sh")
	}

	ok, msg := runCommandProbeWithTimeout(100*time.Millisecond, "/bin/sh", "-c", "sleep 1")
	if ok {
		t.Fatalf("expected timeout failure")
	}
	if !strings.Contains(msg, "timed out") {
		t.Fatalf("expected timeout message, got %q", msg)
	}
}

func TestNormalizeMacPrivacySectionsGlobalShortcut(t *testing.T) {
	sections, err := normalizeMacPrivacySections("globalShortcut")
	if err != nil {
		t.Fatalf("normalize globalShortcut: %v", err)
	}
	want := []string{"accessibility", "inputMonitoring"}
	if len(sections) != len(want) {
		t.Fatalf("sections=%v, want=%v", sections, want)
	}
	for index := range want {
		if sections[index] != want[index] {
			t.Fatalf("sections=%v, want=%v", sections, want)
		}
	}
}

func TestMacPermissionSectionsReadyScopesGlobalShortcutAndFailsClosedForInputMonitoring(t *testing.T) {
	snapshot := map[string]interface{}{
		"screenCapture": false,
		"accessibility": true,
	}
	probes := map[string]interface{}{
		"automationProbe": map[string]interface{}{"ok": true},
	}
	if !macPermissionSectionsReady([]string{"accessibility"}, snapshot, probes) {
		t.Fatal("accessibility-only request should not inherit an unrelated screen-capture denial")
	}
	if macPermissionSectionsReady([]string{"accessibility", "inputMonitoring"}, snapshot, probes) {
		t.Fatal("globalShortcut request must not claim unknown Input Monitoring is authorized")
	}
	if macPermissionSectionsReady([]string{"inputMonitoring"}, snapshot, probes) {
		t.Fatal("Input Monitoring must remain fail-closed")
	}
}
