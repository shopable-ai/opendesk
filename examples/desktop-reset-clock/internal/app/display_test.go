package app

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/mock"
)

func TestR11CardViewModelTransitionAndStatusTruth(t *testing.T) {
	instant := time.Date(2026, 10, 12, 8, 30, 0, 0, time.UTC)
	now := func() time.Time { return instant }
	server := mock.New(now)
	h := httptest.NewServer(server.Handler())
	defer h.Close()
	a, err := New(filepath.Join(t.TempDir(), "cache.json"), feed.Client{AllowLocalHTTP: true}, now)
	if err != nil {
		t.Fatal(err)
	}
	a.DemoSwitch = func(i int) { server.Set(i) }
	if err := a.ConfigureFeed(h.URL+"/feed", true); err != nil {
		t.Fatal(err)
	}
	if err := a.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	v1 := a.Display()
	if v1.StatusKind != "active" || !v1.HasUpcoming || v1.CardValue == "" ||
		!strings.Contains(v1.Badge, "模拟") || !v1.HasSourceURL ||
		v1.LastRequest == "未知" || v1.LastChecked == "未知" || v1.LastChanged == "未知" ||
		v1.LocalTime != "08:30:00" && v1.LocalTime == "" {
		t.Fatalf("wrong V1 presentation: %+v", v1)
	}
	if v1.CardMeta == "" || v1.CardSummary == "" || v1.Countdown == "" {
		t.Fatal("missing V1 visible metadata")
	}
	server.Set(2)
	if err := a.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	v2 := a.Display()
	if v2.StatusKind != "revised" || !strings.Contains(v2.Badge, "更正") || v2.CardValue == v1.CardValue || !v2.HasUpcoming {
		t.Fatalf("V2 should visibly change countdown without losing the stable event: %+v", v2)
	}
	server.Set(3)
	if err := a.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	v3 := a.Display()
	if v3.StatusKind != "withdrawn" || v3.HasUpcoming || v3.Countdown != "" ||
		v3.CardValue != "公告已撤回" || !v3.HasSourceURL || !strings.Contains(v3.Badge, "已撤回") {
		t.Fatalf("V3 cannot keep a live countdown: %+v", v3)
	}
}

func TestR11EmptyStaleAndSafeCardSummary(t *testing.T) {
	instant := time.Date(2026, 10, 12, 8, 30, 0, 0, time.UTC)
	now := func() time.Time { return instant }
	a, err := New(filepath.Join(t.TempDir(), "empty.json"), feed.Client{}, now)
	if err != nil {
		t.Fatal(err)
	}
	empty := a.Display()
	if empty.HasUpcoming || empty.HasSourceURL || empty.LastChecked != "未知" || empty.CardValue != "暂无确定的下一次重置" {
		t.Fatalf("empty: %+v", empty)
	}
	m := mock.New(now)
	srv := httptest.NewServer(m.Handler())
	defer srv.Close()
	if err := a.ConfigureFeed(srv.URL+"/feed", true); err != nil {
		t.Fatal(err)
	}
	if err := a.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	instant = instant.Add(35 * time.Minute)
	v := a.Display()
	if v.HasUpcoming || v.Countdown != "" || v.StatusKind != "stale" || !strings.Contains(v.Badge, "过期") || v.CardValue != "暂无确定的下一次重置" {
		t.Fatalf("stale upstream must not show an actionable countdown: %+v", v)
	}
	long := "【模拟数据】" + strings.Repeat("这是一条很长的公告", 25)
	x := cardText(long, true)
	if !strings.HasSuffix(x, "…") || len([]rune(x)) > 64 || strings.Contains(x, "【模拟数据】") {
		t.Fatalf("long card text: %s", x)
	}
}
