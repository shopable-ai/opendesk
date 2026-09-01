//go:build darwin

package automation

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDarwinNativeBackendRequiresAppBundle(t *testing.T) {
	err := notifyDarwinNative("OpenDesk", "test process has no app bundle", false)
	if !errors.Is(err, errDarwinNativeNotificationUnavailable) {
		t.Fatalf("notifyDarwinNative error = %v, want native-unavailable sentinel", err)
	}
}

func TestDarwinNativeNotificationInteractionRequiresAppBundle(t *testing.T) {
	if _, err := notificationInteractionDarwinListNative(); !errors.Is(err, errDarwinNativeNotificationUnavailable) {
		t.Fatalf("notificationInteractionDarwinListNative error = %v, want native-unavailable sentinel", err)
	}
	if _, err := notificationInteractionDarwinDismissNative("missing"); !errors.Is(err, errDarwinNativeNotificationUnavailable) {
		t.Fatalf("notificationInteractionDarwinDismissNative error = %v, want native-unavailable sentinel", err)
	}
}

func TestDecodeMacOSNotificationHelperRequestValidatesShapeAndText(t *testing.T) {
	request, err := decodeMacOSNotificationHelperRequest(strings.NewReader(`{"title":"OpenDesk","message":"done","sound":true}`))
	if err != nil {
		t.Fatal(err)
	}
	if request.Title != "OpenDesk" || request.Message != "done" || !request.Sound {
		t.Fatalf("unexpected request: %+v", request)
	}

	for name, raw := range map[string]string{
		"unknown field":      `{"title":"OpenDesk","message":"done","unknown":true}`,
		"multiple values":    `{"title":"OpenDesk","message":"done"} {}`,
		"NUL title":          "{\"title\":\"bad\\u0000title\",\"message\":\"done\"}",
		"list with content":  `{"operation":"list","message":"not allowed"}`,
		"dismiss without id": `{"operation":"dismiss"}`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeMacOSNotificationHelperRequest(strings.NewReader(raw)); err == nil {
				t.Fatalf("request %q unexpectedly passed", raw)
			}
		})
	}
}

func TestDarwinAppHelperInteractionProtocol(t *testing.T) {
	dir := t.TempDir()
	helper := filepath.Join(dir, "opendesk")
	captureRequest := filepath.Join(dir, "request.json")
	script := "#!/bin/sh\ncat > \"$CAPTURE_REQUEST\"\nprintf '{\"ok\":true,\"notifications\":[{\"id\":\"fixture\",\"appId\":\"com.opendesk.cli\",\"deliveredAt\":\"2026-09-02T00:00:00.000Z\",\"title\":\"title\",\"message\":\"body\"}]}\\n'\n"
	if err := os.WriteFile(helper, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CAPTURE_REQUEST", captureRequest)
	response, err := runMacOSNotificationHelperAtPath(context.Background(), helper, macOSNotificationHelperRequest{Operation: "list"})
	if err != nil {
		t.Fatal(err)
	}
	if len(response.Notifications) != 1 || response.Notifications[0].ID != "fixture" {
		t.Fatalf("unexpected interaction response: %+v", response)
	}
	raw, err := os.ReadFile(captureRequest)
	if err != nil {
		t.Fatal(err)
	}
	var request macOSNotificationHelperRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		t.Fatal(err)
	}
	if request.Operation != "list" || request.ID != "" {
		t.Fatalf("unexpected interaction request: %+v", request)
	}
}

func TestDarwinAppHelperPreservesDeadlineCause(t *testing.T) {
	dir := t.TempDir()
	helper := filepath.Join(dir, "opendesk")
	if err := os.WriteFile(helper, []byte("#!/bin/sh\nsleep 1\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, err := runMacOSNotificationHelperAtPath(ctx, helper, macOSNotificationHelperRequest{Operation: "list"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("helper deadline error=%v", err)
	}
}

func TestDarwinAppHelperUsesPrivateModeAndJSONStdin(t *testing.T) {
	dir := t.TempDir()
	helper := filepath.Join(dir, "opendesk")
	captureArg := filepath.Join(dir, "arg.txt")
	captureRequest := filepath.Join(dir, "request.json")
	script := "#!/bin/sh\nprintf '%s' \"$1\" > \"$CAPTURE_ARG\"\ncat > \"$CAPTURE_REQUEST\"\nprintf '{\"ok\":true}\\n'\n"
	if err := os.WriteFile(helper, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CAPTURE_ARG", captureArg)
	t.Setenv("CAPTURE_REQUEST", captureRequest)

	if err := notifyDarwinViaAppHelperAtPath(helper, `ti"tle`, "custom body", true); err != nil {
		t.Fatal(err)
	}
	arg, err := os.ReadFile(captureArg)
	if err != nil {
		t.Fatal(err)
	}
	if string(arg) != internalMacOSNotificationHelperArgument {
		t.Fatalf("helper argument = %q", string(arg))
	}
	raw, err := os.ReadFile(captureRequest)
	if err != nil {
		t.Fatal(err)
	}
	var request macOSNotificationHelperRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		t.Fatal(err)
	}
	if request.Title != `ti"tle` || request.Message != "custom body" || !request.Sound {
		t.Fatalf("unexpected helper request: %+v", request)
	}
}

func TestDarwinAppHelperReportsExitStderrAndBackendError(t *testing.T) {
	dir := t.TempDir()
	helper := filepath.Join(dir, "opendesk")
	script := "#!/bin/sh\nprintf '{\"ok\":false,\"error\":\"notifications denied\"}\\n'\nprintf 'backend exit detail\\n' >&2\nexit 7\n"
	if err := os.WriteFile(helper, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	err := notifyDarwinViaAppHelperAtPath(helper, "OpenDesk", "backend error", false)
	if err == nil || !strings.Contains(err.Error(), "notifications denied") || !strings.Contains(err.Error(), "backend exit detail") {
		t.Fatalf("unexpected helper error: %v", err)
	}
}

func TestDarwinAppHelperRejectsMalformedSuccess(t *testing.T) {
	dir := t.TempDir()
	helper := filepath.Join(dir, "opendesk")
	if err := os.WriteFile(helper, []byte("#!/bin/sh\nprintf 'not-json\\n'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := notifyDarwinViaAppHelperAtPath(helper, "OpenDesk", "backend error", false); err == nil || !strings.Contains(err.Error(), "decode notification helper response") {
		t.Fatalf("unexpected malformed response error: %v", err)
	}
}

func TestDarwinAppHelperReportsMalformedExitStderr(t *testing.T) {
	dir := t.TempDir()
	helper := filepath.Join(dir, "opendesk")
	script := "#!/bin/sh\nprintf 'not-json\\n'\nprintf 'backend exit detail\\n' >&2\nexit 7\n"
	if err := os.WriteFile(helper, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := notifyDarwinViaAppHelperAtPath(helper, "OpenDesk", "backend error", false); err == nil || !strings.Contains(err.Error(), "backend exit detail") {
		t.Fatalf("unexpected malformed exit response error: %v", err)
	}
}
