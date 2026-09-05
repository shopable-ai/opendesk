//go:build darwin

package automation

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestRunJXAWithOptionsTimesOutAndKillsCommand(t *testing.T) {
	started := time.Now()
	_, err := runJXAWithOptions(
		75*time.Millisecond,
		jxaHelperCommand("hang"),
		"return 'never'",
	)
	if err == nil || !strings.Contains(err.Error(), "osascript timed out after 75ms") {
		t.Fatalf("expected bounded JXA timeout, got %v", err)
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("JXA timeout did not stop the helper promptly: %s", elapsed)
	}
}

func TestRunJXAWithOptionsReturnsTrimmedOutput(t *testing.T) {
	out, err := runJXAWithOptions(
		time.Second,
		jxaHelperCommand("success"),
		"return 'ok'",
	)
	if err != nil {
		t.Fatalf("runJXAWithOptions: %v", err)
	}
	if out != "ok" {
		t.Fatalf("unexpected output %q", out)
	}
}

func TestRunJXAWithOptionsClassifiesAppleEventsPermission(t *testing.T) {
	_, err := runJXAWithOptions(
		time.Second,
		jxaHelperCommand("appleevents-denied"),
		"return 'blocked'",
	)
	if err == nil {
		t.Fatal("expected AppleEvents permission error")
	}
	if !strings.Contains(err.Error(), "隐私与安全性 -> 自动化") ||
		!strings.Contains(err.Error(), "System Events") {
		t.Fatalf("expected Automation-specific remediation, got %v", err)
	}
}

func TestFallbackMacWindowListReturnsIdentifiableActiveWindow(t *testing.T) {
	items, err := fallbackMacWindowListWithResolver(errors.New("JXA timeout"), func() (*macWindow, error) {
		return &macWindow{
			Title:   "Calculator",
			PID:     42,
			Width:   232,
			Height:  321,
			AppName: "Calculator",
		}, nil
	})
	if err != nil {
		t.Fatalf("fallbackMacWindowListWithResolver: %v", err)
	}
	if len(items) != 1 || items[0].Title != "Calculator" || items[0].PID != 42 {
		t.Fatalf("unexpected fallback rows: %#v", items)
	}
	if !items[0].IsForeground || !items[0].HasFocus || items[0].Index != 0 {
		t.Fatalf("fallback row must be marked active: %#v", items[0])
	}
}

func TestFallbackMacWindowListPreservesPrimaryAndFallbackErrors(t *testing.T) {
	_, err := fallbackMacWindowListWithResolver(errors.New("JXA timeout"), func() (*macWindow, error) {
		return nil, errors.New("CoreGraphics unavailable")
	})
	if err == nil {
		t.Fatal("expected combined fallback error")
	}
	if !strings.Contains(err.Error(), "JXA timeout") ||
		!strings.Contains(err.Error(), "CoreGraphics unavailable") {
		t.Fatalf("expected both causes, got %v", err)
	}
}

func TestMacWindowIdentityKeyUsesNativeHandleWhenAvailable(t *testing.T) {
	withHandle := macWindow{PID: 42, Handle: 99, X: 1, Y: 2, Width: 3, Height: 4}
	if got := macWindowIdentityKey(withHandle); got != "42:99" {
		t.Fatalf("expected handle identity key, got %q", got)
	}
	withoutHandle := macWindow{PID: 42, X: 1, Y: 2, Width: 3, Height: 4}
	if got := macWindowIdentityKey(withoutHandle); got != "42:1:2:3:4" {
		t.Fatalf("expected bounds identity key, got %q", got)
	}
}

func TestNormalizeMacWindowTitleUsesExecutableName(t *testing.T) {
	item := &macWindow{
		Title:   "",
		ExeName: "Calculator",
		AppName: "计算器",
	}
	if !normalizeMacWindowTitle(item) {
		t.Fatal("expected a titleless Calculator window to remain identifiable")
	}
	if item.Title != "Calculator" {
		t.Fatalf("expected executable-name fallback, got %q", item.Title)
	}
}

func TestNormalizeMacWindowTitleFallsBackToOwnerName(t *testing.T) {
	item := &macWindow{AppName: "计算器"}
	if !normalizeMacWindowTitle(item) {
		t.Fatal("expected owner-name fallback to identify the window")
	}
	if item.Title != "计算器" {
		t.Fatalf("expected owner-name fallback, got %q", item.Title)
	}
}

func TestNormalizeMacWindowTitleRejectsMissingWindowIdentity(t *testing.T) {
	if normalizeMacWindowTitle(&macWindow{}) {
		t.Fatal("expected a window without title or process identity to be rejected")
	}
}

func TestTitlelessWindowActionMatcherUsesExactProcessName(t *testing.T) {
	if titlelessWindowMatchJXA != `name === target || (!name && appName === target)` {
		t.Fatalf("titleless window action matcher no longer preserves the process-name guard: %q", titlelessWindowMatchJXA)
	}
}

func TestResolvedWindowActionMatcherUsesExactPIDForTitlelessWindow(t *testing.T) {
	if resolvedWindowMatchJXA != `name === target || (!name && pid === targetPid)` {
		t.Fatalf("resolved window matcher no longer preserves the PID guard: %q", resolvedWindowMatchJXA)
	}
}

func TestWaitForFocusedMacWindowRetriesUntilExactIdentity(t *testing.T) {
	calls := 0
	err := waitForFocusedMacWindowWithResolver("Calculator", 42, time.Second, func() (*macWindow, error) {
		calls++
		if calls == 1 {
			return &macWindow{Title: "Codex", PID: 7}, nil
		}
		return &macWindow{Title: "Calculator", PID: 42}, nil
	})
	if err != nil {
		t.Fatalf("waitForFocusedMacWindowWithResolver: %v", err)
	}
	if calls != 2 {
		t.Fatalf("expected one retry, got %d calls", calls)
	}
}

func TestWaitForFocusedMacWindowRejectsWrongPID(t *testing.T) {
	err := waitForFocusedMacWindowWithResolver("Calculator", 42, 20*time.Millisecond, func() (*macWindow, error) {
		return &macWindow{Title: "Calculator", PID: 99}, nil
	})
	if err == nil || !strings.Contains(err.Error(), `active title="Calculator" pid=99`) {
		t.Fatalf("expected exact PID verification failure, got %v", err)
	}
}

func TestGetActiveMacWindowCoreGraphicsLive(t *testing.T) {
	if os.Getenv("OPENDESK_LIVE_WINDOW_TEST") != "1" {
		t.Skip("set OPENDESK_LIVE_WINDOW_TEST=1 for a read-only live foreground-window probe")
	}
	item, err := getActiveMacWindowCoreGraphics()
	if err != nil {
		t.Fatalf("getActiveMacWindowCoreGraphics: %v", err)
	}
	if item == nil || item.PID == 0 || strings.TrimSpace(item.Title) == "" || item.Width <= 0 || item.Height <= 0 {
		t.Fatalf("foreground window is not identifiable: %#v", item)
	}
	t.Logf("active pid=%d title=%q app=%q exe=%q bounds=%dx%d+%d+%d handle=%d",
		item.PID, item.Title, item.AppName, item.ExeName,
		item.Width, item.Height, item.X, item.Y, item.Handle)
}

func TestGetMacWindowForPIDCoreGraphicsLive(t *testing.T) {
	rawPID := os.Getenv("OPENDESK_LIVE_WINDOW_PID")
	if rawPID == "" {
		t.Skip("set OPENDESK_LIVE_WINDOW_PID for a read-only live PID-window probe")
	}
	pid, err := strconv.Atoi(rawPID)
	if err != nil || pid <= 0 {
		t.Fatalf("invalid OPENDESK_LIVE_WINDOW_PID %q", rawPID)
	}
	item, err := getMacWindowForPIDCoreGraphics(pid)
	if err != nil {
		t.Fatalf("getMacWindowForPIDCoreGraphics(%d): %v", pid, err)
	}
	if item == nil || item.PID != uint32(pid) || strings.TrimSpace(item.Title) == "" || item.Width <= 0 || item.Height <= 0 {
		t.Fatalf("PID window is not identifiable: %#v", item)
	}
	t.Logf("pid window pid=%d title=%q app=%q exe=%q bounds=%dx%d+%d+%d handle=%d",
		item.PID, item.Title, item.AppName, item.ExeName,
		item.Width, item.Height, item.X, item.Y, item.Handle)
}

func jxaHelperCommand(mode string) jxaCommandFactory {
	return func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=TestJXACommandHelperProcess")
		cmd.Env = append(os.Environ(),
			"OPENDESK_JXA_HELPER=1",
			"OPENDESK_JXA_HELPER_MODE="+mode,
		)
		return cmd
	}
}

func TestJXACommandHelperProcess(t *testing.T) {
	if os.Getenv("OPENDESK_JXA_HELPER") != "1" {
		return
	}
	switch os.Getenv("OPENDESK_JXA_HELPER_MODE") {
	case "hang":
		time.Sleep(10 * time.Second)
	case "success":
		fmt.Fprintln(os.Stdout, "  ok  ")
	case "appleevents-denied":
		fmt.Fprintln(os.Stderr, "Not authorized to send Apple events to System Events")
		os.Exit(1)
	default:
		fmt.Fprintln(os.Stderr, "unknown helper mode")
		os.Exit(2)
	}
	os.Exit(0)
}
