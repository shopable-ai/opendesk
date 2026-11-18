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

func TestWindowListPIDCoreGraphicsMerge(t *testing.T) {
	jxa := []macWindow{{PID: 42, Handle: 10, Title: "JXA title"}}
	cg := func() ([]macWindow, error) {
		return []macWindow{
			{PID: 41, Handle: 20}, {PID: 42, Handle: 10, Title: "CG title"}, {PID: 42, Handle: 30},
		}, nil
	}
	rows, err := mergeMacWindowCoreGraphics(jxa, 42, cg)
	if err != nil || len(rows) != 2 || rows[0].Title != "JXA title" || rows[1].Handle != 30 {
		t.Fatalf("scoped merge=%v err=%v", rows, err)
	}
	rows, err = mergeMacWindowCoreGraphics([]macWindow{}, 99, cg)
	if err != nil || rows == nil || len(rows) != 0 {
		t.Fatalf("absent merge=%v err=%v", rows, err)
	}
	rows, err = mergeMacWindowCoreGraphics(jxa, 0, cg)
	if err != nil || len(rows) != 3 {
		t.Fatalf("default merge=%v err=%v", rows, err)
	}
	cause := errors.New("CG enumeration denied")
	broken := func() ([]macWindow, error) { return nil, cause }
	for _, initial := range [][]macWindow{jxa, {}} {
		rows, err = mergeMacWindowCoreGraphics(initial, 42, broken)
		if !errors.Is(err, cause) || rows != nil {
			t.Fatalf("scoped error suppressed: rows=%v err=%v", rows, err)
		}
	}
	rows, err = mergeMacWindowCoreGraphics(jxa, 0, broken)
	if err != nil || len(rows) != 1 {
		t.Fatalf("default degradation changed: rows=%v err=%v", rows, err)
	}
}

func TestWindowListPIDNormalizationFailsClosed(t *testing.T) {
	for _, item := range []macWindow{
		{PID: 42, Width: 230, Height: 408}, // No title or fallback name.
		{PID: 0, Title: "Fixture", Width: 230, Height: 408},
		{PID: 41, Title: "Fixture", Width: 230, Height: 408},
		{PID: 42, Title: "Fixture", Width: 0, Height: 408},
		{PID: 42, Title: "Fixture", Width: 230, Height: -1},
	} {
		if keep, err := normalizeMacWindowListRow(&item, 42); err == nil || keep {
			t.Fatalf("invalid candidate omitted: item=%+v keep=%v err=%v", item, keep, err)
		}
	}
	unnamed := macWindow{PID: 42, Width: 230, Height: 408, AppName: "Calculator", X: -100}
	if keep, err := normalizeMacWindowListRow(&unnamed, 42); !keep || err != nil || unnamed.Title != "Calculator" {
		t.Fatalf("title fallback changed: %+v keep=%v err=%v", unnamed, keep, err)
	}
	// Original full-desktop normalization still permits bad geometry in rows and
	// silently skips a row with no title/name; the scoped path alone is stricter.
	badBounds := macWindow{Title: "Fixture"}
	if keep, err := normalizeMacWindowListRow(&badBounds, 0); !keep || err != nil {
		t.Fatalf("default bounds behavior changed: %v", err)
	}
	empty := macWindow{}
	if keep, err := normalizeMacWindowListRow(&empty, 0); keep || err != nil {
		t.Fatalf("default empty-title behavior changed: %v", err)
	}
}

// These callbacks model native calls that can return successfully after their
// budget. They never inspect windows or invoke AppleEvents/GUI APIs.
func TestDarwinActivateTotalBudget(t *testing.T) {
	for _, scenario := range []struct {
		name           string
		lateStage      string
		initialFocused bool
		focusAfter     int
		wantRefreshes  int
		wantActivates  int
		wantTimeout    bool
	}{
		{"initial_late_success", "initial", true, 0, 1, 0, true},
		{"initial_late_unfocused_no_submission", "initial", false, 0, 1, 0, true},
		{"activation_late_success", "activation", false, 2, 1, 1, true},
		{"late_readback", "readback", false, 2, 2, 1, true},
		{"no_duplicate_activation", "", false, 0, 0, 1, true},
		{"timely_already_focused", "", true, 0, 1, 0, false},
		{"timely_activation", "", false, 2, 2, 1, false},
		{"timely_retry_without_reactivation", "", false, 3, 3, 1, false},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			budget := 100 * time.Millisecond
			target := WindowInfo{ID: "42:99", ProcessID: 42, Handle: 99}
			refreshes, activations := 0, 0
			var contexts []context.Context
			late := func() { time.Sleep(budget + 10*time.Millisecond) }
			current, err := activateDarwinWindowWithCallbacks(target, budget,
				func(ctx context.Context, got WindowInfo) (*WindowInfo, error) {
					refreshes++
					contexts = append(contexts, ctx)
					if got != target {
						t.Fatalf("refresh target changed: %+v", got)
					}
					if (refreshes == 1 && scenario.lateStage == "initial") ||
						(refreshes > 1 && scenario.lateStage == "readback") {
						late()
					}
					item := target
					item.IsForeground = (refreshes == 1 && scenario.initialFocused) ||
						(scenario.focusAfter > 0 && refreshes >= scenario.focusAfter)
					item.HasFocus = item.IsForeground
					return &item, nil
				},
				func(got WindowInfo, remaining time.Duration) error {
					activations++
					if got != target || remaining <= 0 || remaining > budget {
						t.Errorf("invalid activation target/budget: %+v %s", got, remaining)
					}
					if scenario.lateStage == "activation" {
						late()
					}
					return nil
				})
			if scenario.wantTimeout {
				var windowErr *WindowError
				if current != nil || !errors.As(err, &windowErr) || windowErr.Code != WindowVerificationFailed {
					t.Errorf("expected total-budget verification failure, got current=%+v err=%v", current, err)
				}
			} else if err != nil || current == nil || !current.IsForeground || !current.HasFocus {
				t.Errorf("expected timely focused result, got current=%+v err=%v", current, err)
			}
			if activations != scenario.wantActivates || (scenario.wantRefreshes > 0 && refreshes != scenario.wantRefreshes) {
				t.Errorf("calls: refresh=%d activate=%d; want refresh=%d activate=%d", refreshes, activations, scenario.wantRefreshes, scenario.wantActivates)
			}
			for _, ctx := range contexts {
				if _, ok := ctx.Deadline(); !ok || ctx != contexts[0] {
					t.Error("refreshes must share one total deadline context")
				}
			}
		})
	}
}
