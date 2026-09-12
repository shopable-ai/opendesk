package main

import (
	"bytes"
	"encoding/json"
	"opendesk/automation"
	"strings"
	"testing"
)

func permissionCLIReport(overall automation.PermissionOverall) automation.RuntimePermissionReport {
	return automation.RuntimePermissionReport{
		Platform: "darwin",
		Feature:  "desktop-automation",
		Overall:  overall,
		Identity: automation.RuntimePermissionIdentity{
			ProcessID:  42,
			Executable: "/Applications/OpenDesk.app/Contents/MacOS/opendesk",
			BundlePath: "/Applications/OpenDesk.app",
			LaunchKind: "app-bundle",
		},
		Permissions: []automation.RuntimePermission{
			{
				ID: "accessibility", Platform: "darwin", DisplayName: "Accessibility",
				Description: "desktop UI", Requirement: automation.PermissionRequired,
				Status: automation.PermissionGranted, CanOpenSettings: true,
			},
			{
				ID: "screen-capture", Platform: "darwin", DisplayName: "Screen Recording",
				Description: "screenshots", Requirement: automation.PermissionRequired,
				Status: automation.PermissionUnknown, CanOpenSettings: true,
				Remediation: "Open System Settings.",
			},
		},
		CheckedAt: "2026-09-12T00:00:00Z",
	}
}

func withPermissionCLIFakes(t *testing.T, report automation.RuntimePermissionReport, open func(string) error) {
	t.Helper()
	previousReport := permissionReportForCLI
	previousOpen := openPermissionSettingsForCLI
	permissionReportForCLI = func(feature string) automation.RuntimePermissionReport {
		result := report
		result.Feature = feature
		return result
	}
	openPermissionSettingsForCLI = open
	t.Cleanup(func() {
		permissionReportForCLI = previousReport
		openPermissionSettingsForCLI = previousOpen
	})
}

func TestPermissionsStatusText(t *testing.T) {
	withPermissionCLIFakes(t, permissionCLIReport(automation.PermissionUnknownOverall), func(string) error { return nil })
	var stdout, stderr bytes.Buffer
	if code := executePermissionsCLI([]string{"permissions", "status"}, &stdout, &stderr); code != 0 {
		t.Fatalf("status exit = %d stderr=%s", code, stderr.String())
	}
	for _, expected := range []string{"OpenDesk Permissions", "app-bundle", "Accessibility", "Screen Recording", "Overall             UNKNOWN"} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("status output missing %q:\n%s", expected, stdout.String())
		}
	}
}

func TestPermissionsStatusJSON(t *testing.T) {
	withPermissionCLIFakes(t, permissionCLIReport(automation.PermissionReady), func(string) error { return nil })
	var stdout, stderr bytes.Buffer
	if code := executePermissionsCLI([]string{"permissions", "status", "--json", "--feature", "recorder"}, &stdout, &stderr); code != 0 {
		t.Fatalf("json status exit = %d stderr=%s", code, stderr.String())
	}
	var report automation.RuntimePermissionReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("status JSON is invalid: %v\n%s", err, stdout.String())
	}
	if report.Feature != "recorder" || report.Identity.ProcessID != 42 || report.Overall != automation.PermissionReady {
		t.Fatalf("unexpected JSON report: %#v", report)
	}
}

func TestPermissionsDoctorReturnsFailureForUnknownRequiredState(t *testing.T) {
	withPermissionCLIFakes(t, permissionCLIReport(automation.PermissionUnknownOverall), func(string) error { return nil })
	var stdout, stderr bytes.Buffer
	if code := executePermissionsCLI([]string{"permissions", "doctor"}, &stdout, &stderr); code != 1 {
		t.Fatalf("doctor exit = %d, want 1; stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Open System Settings") || !strings.Contains(stdout.String(), "permissions open screen-capture") {
		t.Fatalf("doctor did not print remediation:\n%s", stdout.String())
	}
}

func TestPermissionsOpenAndInvalidID(t *testing.T) {
	opened := ""
	withPermissionCLIFakes(t, permissionCLIReport(automation.PermissionReady), func(id string) error {
		opened = id
		return nil
	})
	var stdout, stderr bytes.Buffer
	if code := executePermissionsCLI([]string{"permissions", "open", "accessibility"}, &stdout, &stderr); code != 0 {
		t.Fatalf("open exit = %d stderr=%s", code, stderr.String())
	}
	if opened != "accessibility" {
		t.Fatalf("opened %q, want accessibility", opened)
	}

	stdout.Reset()
	stderr.Reset()
	opened = ""
	if code := executePermissionsCLI([]string{"permissions", "open", "not-a-permission"}, &stdout, &stderr); code != 2 {
		t.Fatalf("invalid id exit = %d, want 2", code)
	}
	if opened != "" {
		t.Fatalf("invalid id unexpectedly opened settings for %q", opened)
	}
}

func TestPermissionsStatusRejectsUnknownOption(t *testing.T) {
	withPermissionCLIFakes(t, permissionCLIReport(automation.PermissionReady), func(string) error { return nil })
	var stdout, stderr bytes.Buffer
	if code := executePermissionsCLI([]string{"permissions", "status", "--wat"}, &stdout, &stderr); code != 2 {
		t.Fatalf("unknown option exit = %d, want 2", code)
	}
	if !strings.Contains(stderr.String(), "unknown option") {
		t.Fatalf("unexpected stderr: %s", stderr.String())
	}
}
