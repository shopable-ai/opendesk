package customui

import (
	"context"
	"encoding/json"
	"math"
	"opendesk/pkg/customui/toolbar"
	"strings"
	"testing"
)

func TestNotificationNormalizationAndAtomicPatch(t *testing.T) {
	spec := DefaultNotificationSpec()
	spec.Message = "正在读取界面"
	for _, bad := range []NotificationPatch{
		{Message: notificationString("")}, {Level: notificationString("unknown")}, {TimeoutMS: notificationInt(-1)},
		{Progress: json.RawMessage(`{"min":0,"max":2,"value":3}`)}, {Progress: json.RawMessage(`{"wat":1}`)},
		{Position: &NotificationPosition{Mode: "absolute", X: notificationFloat(0)}},
		{Position: &NotificationPosition{Mode: "auto", Target: "toolbar"}},
		{Position: &NotificationPosition{Mode: "absolute", X: notificationFloat(math.Inf(1)), Y: notificationFloat(0)}},
	} {
		if _, err := MergeNotification(spec, bad); err == nil {
			t.Fatalf("invalid patch accepted: %#v", bad)
		}
		if spec.Message != "正在读取界面" || spec.TimeoutMS != 3000 {
			t.Fatal("failed patch changed original")
		}
	}
	next, err := MergeNotification(spec, NotificationPatch{Progress: json.RawMessage(`{"min":5,"max":10}`)})
	if err != nil || next.Progress.Value != 5 {
		t.Fatalf("progress default: %#v, %v", next.Progress, err)
	}
	next, err = MergeNotification(next, NotificationPatch{Progress: json.RawMessage(`null`), TimeoutMS: notificationInt(0)})
	if err != nil || next.Progress != nil || next.TimeoutMS != 0 || !next.Closable {
		t.Fatalf("clear progress/persist: %#v %v", next, err)
	}
	timed := DefaultNotificationSpec()
	timed.Message = "short"
	if timed.Closable {
		t.Fatal("ordinary timed notification unexpectedly became interactive")
	}
}
func notificationString(v string) *string  { return &v }
func notificationInt(v int64) *int64       { return &v }
func notificationFloat(v float64) *float64 { return &v }

func TestNotificationPlacementNineAnchorsAndRelativeFallback(t *testing.T) {
	work := Bounds{X: -1440, Y: -100, Width: 1440, Height: 900}
	size := Bounds{Width: 360, Height: 76}
	for _, h := range []string{"left", "center", "right"} {
		for _, v := range []string{"top", "center", "bottom"} {
			b, _, err := NotificationRectangle(NotificationPosition{Mode: "anchor", Horizontal: h, Vertical: v}, work, nil, size)
			if err != nil || b.X < work.X || b.Y < work.Y || b.X+b.Width > work.X+work.Width || b.Y+b.Height > work.Y+work.Height {
				t.Fatalf("%s/%s: %#v %v", h, v, b, err)
			}
		}
	}
	p := NotificationPosition{Mode: "relative", Target: "toolbar", Side: "bottom"}
	parent := Bounds{X: -900, Y: 730, Width: 200, Height: 60}
	b, why, err := NotificationRectangle(p, work, &parent, size)
	if err != nil || why != "flipped-top" || b.Y != 646 {
		t.Fatalf("relative flip: %#v %s %v", b, why, err)
	}
	_, why, err = NotificationRectangle(p, work, nil, size)
	if err != nil || why != "target-unavailable" {
		t.Fatalf("missing target: %s %v", why, err)
	}
	if _, _, err = NotificationRectangle(NotificationPosition{Mode: "absolute"}, work, nil, size); err == nil {
		t.Fatal("invalid position panicked or accepted")
	}
}

func TestNotificationPreferredSizeIsCompactAndBounded(t *testing.T) {
	short := DefaultNotificationSpec()
	short.Message = "完成"
	shortSize := NotificationPreferredSize(short)
	if shortSize.Width != NotificationMinimumWidth || shortSize.Height != NotificationMinimumHeight {
		t.Fatalf("short notification is not compact: %#v", shortSize)
	}
	long := DefaultNotificationSpec()
	long.Message = strings.Repeat("这是一段需要受控换行的通知内容", 20)
	long.Caption = strings.Repeat("补充说明", 40)
	long.Progress = &NotificationProgress{Min: 0, Max: 1, Value: 0.5}
	longSize := NotificationPreferredSize(long)
	if longSize.Width != NotificationMaximumWidth || longSize.Height <= shortSize.Height || longSize.Height > NotificationMaximumHeight {
		t.Fatalf("long notification size is not bounded: short=%#v long=%#v", shortSize, longSize)
	}
	medium := DefaultNotificationSpec()
	medium.Message = strings.Repeat("width ", 8)
	mediumSize := NotificationPreferredSize(medium)
	if mediumSize.Width <= NotificationMinimumWidth || mediumSize.Width >= NotificationMaximumWidth {
		t.Fatalf("medium notification did not use an intermediate width: %#v", mediumSize)
	}
	work := Bounds{Width: 1440, Height: 900}
	for _, invalid := range []Bounds{
		{Width: NotificationMinimumWidth - 1, Height: NotificationMinimumHeight},
		{Width: NotificationMaximumWidth + 1, Height: NotificationMaximumHeight},
	} {
		if _, _, err := NotificationRectangle(short.Position, work, nil, invalid); err == nil {
			t.Fatalf("out-of-range notification size accepted: %#v", invalid)
		}
	}
}

func TestNotificationUpdateReflowsWidthInPlace(t *testing.T) {
	ctx := context.Background()
	session, err := NewSession("notification-reflow", t.TempDir(), NewMemoryDriver(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close(ctx)
	spec := DefaultNotificationSpec()
	spec.Message = "short"
	spec.TimeoutMS = 0
	window, err := session.Create(ctx, WindowSpec{ID: "reflow", Kind: "notification", Notification: &spec})
	if err != nil {
		t.Fatal(err)
	}
	initial, err := window.State(ctx)
	if err != nil || initial.Bounds.Width != NotificationMinimumWidth {
		t.Fatalf("initial state did not use minimum width: %#v %v", initial, err)
	}
	longMessage := strings.Repeat("bounded native notification width ", 20)
	expanded, err := window.UpdateNotification(ctx, NotificationPatch{Message: notificationString(longMessage)})
	if err != nil || !expanded.Applied || expanded.State.NativeWindowID != initial.NativeWindowID || expanded.State.Bounds.Width != NotificationMaximumWidth {
		t.Fatalf("long update did not expand in place: %#v %v", expanded, err)
	}
	shrunk, err := window.UpdateNotification(ctx, NotificationPatch{Message: notificationString("short")})
	if err != nil || !shrunk.Applied || shrunk.State.NativeWindowID != initial.NativeWindowID || shrunk.State.Bounds.Width != NotificationMinimumWidth {
		t.Fatalf("short update did not shrink in place: %#v %v", shrunk, err)
	}
}

func TestNotificationSessionOwnershipQuotaAndCloseRace(t *testing.T) {
	ctx := context.Background()
	driver := NewMemoryDriver()
	s, err := NewSession("owned", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close(ctx)
	spec := DefaultNotificationSpec()
	spec.Message = "working"
	spec.TimeoutMS = 0
	var windows []*Window
	for _, id := range []string{"one", "two", "three"} {
		w, err := s.Create(ctx, WindowSpec{ID: id, Kind: "notification", Notification: &spec})
		if err != nil {
			t.Fatal(err)
		}
		windows = append(windows, w)
	}
	if _, err := s.Create(ctx, WindowSpec{ID: "four", Kind: "notification", Notification: &spec}); err == nil {
		t.Fatal("unbounded notification quota")
	}
	if _, err := windows[0].Close(ctx); err != nil {
		t.Fatal(err)
	}
	if result, err := windows[0].UpdateNotification(ctx, NotificationPatch{Message: notificationString("late")}); err != nil || result.Applied || result.Reason != "closed" {
		t.Fatalf("late update: %#v %v", result, err)
	}
	if s.WindowCount() != 2 {
		t.Fatalf("closed notification retained: %d", s.WindowCount())
	}
	if _, err := s.Create(ctx, WindowSpec{ID: "replacement", Kind: "notification", Notification: &spec}); err != nil {
		t.Fatal(err)
	}
	// Cross-session/public native ids are not references to owned toolbar objects.
	if err := s.validateNotificationTarget(NotificationPosition{Mode: "relative", Target: "other"}); err == nil {
		t.Fatal("foreign target accepted")
	}
	if err := s.validateNotificationTarget(NotificationPosition{Mode: "relative", Target: "two"}); err == nil {
		t.Fatal("notification accepted as toolbar")
	}
}

func TestNotificationTargetIsOwnedToolbar(t *testing.T) {
	ctx := context.Background()
	s, _ := NewSession("targets", t.TempDir(), NewMemoryDriver(), nil)
	defer s.Close(ctx)
	_, err := s.Create(ctx, WindowSpec{ID: "tools", Title: "Toolbar", Toolbar: &toolbar.ToolbarSpec{SchemaVersion: toolbar.SchemaVersion, Revision: 1, Orientation: "horizontal", Items: []toolbar.ToolbarItemSpec{toolbar.ButtonItem(toolbar.ButtonSpec{ID: "run", Label: "Run", Icon: "play.fill", State: toolbar.ButtonState{Revision: 1}})}}})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.validateNotificationTarget(NotificationPosition{Mode: "relative", Target: "tools"}); err != nil {
		t.Fatal(err)
	}
}

func TestNotificationCaptureRestoresOnlyVisibleLiveHints(t *testing.T) {
	ctx := context.Background()
	session, _ := NewSession("capture-notifications", t.TempDir(), NewMemoryDriver(), nil)
	defer session.Close(ctx)
	spec := DefaultNotificationSpec()
	spec.Message = "OCR must not see this"
	spec.TimeoutMS = 0
	w, err := session.Create(ctx, WindowSpec{ID: "hint", Kind: "notification", Notification: &spec})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = w.Show(ctx); err != nil {
		t.Fatal(err)
	}
	restore, err := SuspendNotifications(ctx)
	if err != nil {
		t.Fatal(err)
	}
	state, _ := w.State(ctx)
	if state.Visible {
		t.Fatal("notification not hidden")
	}
	if err = restore(); err != nil {
		t.Fatal(err)
	}
	state, _ = w.State(ctx)
	if !state.Visible {
		t.Fatal("notification not restored")
	}
	if err = restore(); err != nil {
		t.Fatal("restore not idempotent")
	}
	restore, err = SuspendNotifications(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = w.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if err = restore(); err != nil {
		t.Fatal(err)
	}
	if w.Status() != StatusClosed {
		t.Fatal("restore resurrected a closed notification")
	}
}
