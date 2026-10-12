package app

import (
	"context"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/mock"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/settings"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestHTTPHistoryRevisionWithdrawAndRecovery(t *testing.T) {
	n := time.Now().UTC()
	now := func() time.Time { return n }
	m := mock.New(now)
	srv := httptest.NewServer(m.Handler())
	defer srv.Close()
	path := filepath.Join(t.TempDir(), "state.json")
	a, e := New(path, feed.Client{AllowLocalHTTP: true}, now)
	if e != nil {
		t.Fatal(e)
	}
	if e = a.ConfigureFeed(srv.URL+"/feed", true); e != nil {
		t.Fatal(e)
	}
	if e = a.Refresh(context.Background()); e != nil {
		t.Fatal(e)
	}
	old := a.State()
	if old.Snapshot == nil || old.Snapshot.Events[0].Revision != 1 || old.Health.LastSourceCheckedAt == nil {
		t.Fatal("V1 missing")
	}
	if got := a.Display().Countdown; got == "" {
		t.Fatal("no future countdown")
	}
	if a.reminders.Pending() != 1 {
		t.Fatalf("V1 plans: %d", a.reminders.Pending())
	}
	firstChanged := old.Health.LastEventChangedAt
	if e = a.Refresh(context.Background()); e != nil {
		t.Fatal(e)
	}
	stable := a.State()
	if stable.Health.LastEventChangedAt == nil || !stable.Health.LastEventChangedAt.Equal(*firstChanged) {
		t.Fatal("304 changed content timestamp")
	}
	m.Set(2)
	if e = a.Refresh(context.Background()); e != nil {
		t.Fatal(e)
	}
	newer := a.State()
	if newer.Snapshot.Events[0].Revision != 2 || newer.Snapshot.FeedVersion != 2 || a.reminders.Pending() != 1 {
		t.Fatal("revision not applied")
	}
	if newer.Snapshot.Events[0].ID != old.Snapshot.Events[0].ID {
		t.Fatal("V2 is a new event")
	}
	if newer.Snapshot.Events[0].SourcePublishedAt.Unix() != old.Snapshot.Events[0].SourcePublishedAt.Unix() {
		t.Fatal("original publishing time changed")
	}
	m.Set(3)
	if e = a.Refresh(context.Background()); e != nil {
		t.Fatal(e)
	}
	if a.reminders.Pending() != 0 || a.Display().Countdown != "" {
		t.Fatal("withdrawn still scheduled")
	}
	a2, e := New(path, feed.Client{AllowLocalHTTP: true}, now)
	if e != nil {
		t.Fatal(e)
	}
	if a2.State().Snapshot.Events[0].State != "withdrawn" || a2.reminders.Pending() != 0 {
		t.Fatal("restart restored old plan")
	}
	srv.Close()
	if e = a2.Refresh(context.Background()); e == nil {
		t.Fatal("network failure ignored")
	}
	if a2.State().Snapshot.Events[0].Revision != 3 {
		t.Fatal("network replaced valid cache")
	}
}
func TestUnauthorizedAndHealthyHeartbeat(t *testing.T) {
	n := time.Now().UTC()
	now := func() time.Time { return n }
	m := mock.New(now)
	h := httptest.NewServer(m.Handler())
	defer h.Close()
	a, _ := New(filepath.Join(t.TempDir(), "a.json"), feed.Client{AllowLocalHTTP: true}, now)
	a.ConfigureFeed(h.URL+"/feed", true)
	a.Refresh(context.Background())
	prev := a.State().Health.LastSourceCheckedAt
	n = n.Add(time.Minute)
	a.Refresh(context.Background())
	if a.State().Health.LastSourceCheckedAt.Unix() != prev.Unix() {
		t.Fatal("304 pretended source check")
	}
	auth := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(403) }))
	defer auth.Close()
	b, _ := New(filepath.Join(t.TempDir(), "b.json"), feed.Client{AllowLocalHTTP: true}, now)
	b.ConfigureFeed(auth.URL, true)
	if e := b.Refresh(context.Background()); e == nil || !b.State().Health.PausedUnauthorized {
		t.Fatal("403 not paused")
	}
	s, e := settings.Load(filepath.Join(t.TempDir(), "missing"))
	if e != nil || s.Config.PollSeconds != 300 {
		t.Fatal("defaults")
	}
}
