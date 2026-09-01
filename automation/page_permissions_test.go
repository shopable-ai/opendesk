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

func TestMacPermissionSectionsReadyScopesGlobalShortcutToReportedInputMonitoringState(t *testing.T) {
	snapshot := map[string]interface{}{
		"screenCapture":         false,
		"accessibility":         true,
		"inputMonitoring":       false,
		"inputMonitoringStatus": "unknown",
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
		t.Fatal("unknown Input Monitoring must remain fail-closed")
	}

	snapshot["inputMonitoring"] = true
	snapshot["inputMonitoringStatus"] = "granted"
	if !macPermissionSectionsReady([]string{"accessibility", "inputMonitoring"}, snapshot, probes) {
		t.Fatal("globalShortcut should be ready after both permissions are reported granted")
	}
}

func TestMacPermissionSectionsNeedingActionOnlyReturnsMissingSections(t *testing.T) {
	snapshot := map[string]interface{}{
		"screenCapture":         false,
		"accessibility":         true,
		"inputMonitoring":       false,
		"inputMonitoringStatus": "denied",
	}
	got := macPermissionSectionsNeedingAction(
		[]string{"accessibility", "inputMonitoring", "screenCapture"},
		snapshot,
	)
	want := []string{"inputMonitoring", "screenCapture"}
	if len(got) != len(want) {
		t.Fatalf("pending=%v, want=%v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("pending=%v, want=%v", got, want)
		}
	}
}

func TestReserveMacPermissionSettingsSectionsDeduplicatesUnlessForced(t *testing.T) {
	sections := []string{"testAccessibility", "testInputMonitoring"}
	macPermissionPromptState.mu.Lock()
	for _, section := range sections {
		delete(macPermissionPromptState.settingsOpened, section)
	}
	macPermissionPromptState.mu.Unlock()
	t.Cleanup(func() {
		macPermissionPromptState.mu.Lock()
		defer macPermissionPromptState.mu.Unlock()
		for _, section := range sections {
			delete(macPermissionPromptState.settingsOpened, section)
		}
	})

	reserved, skipped := reserveMacPermissionSettingsSections(sections, false)
	if len(reserved) != 2 || len(skipped) != 0 {
		t.Fatalf("first reservation reserved=%v skipped=%v", reserved, skipped)
	}
	reserved, skipped = reserveMacPermissionSettingsSections(sections, false)
	if len(reserved) != 0 || len(skipped) != 2 {
		t.Fatalf("repeated reservation reserved=%v skipped=%v", reserved, skipped)
	}
	releaseMacPermissionSettingsSections(sections[:1])
	reserved, skipped = reserveMacPermissionSettingsSections(sections, false)
	if len(reserved) != 1 || reserved[0] != sections[0] || len(skipped) != 1 || skipped[0] != sections[1] {
		t.Fatalf("released reservation reserved=%v skipped=%v", reserved, skipped)
	}
	reserved, skipped = reserveMacPermissionSettingsSections(sections, true)
	if len(reserved) != 2 || len(skipped) != 0 {
		t.Fatalf("forced reservation reserved=%v skipped=%v", reserved, skipped)
	}
}
