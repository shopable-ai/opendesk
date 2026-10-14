package app

import (
	"context"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/desktop"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/mock"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/settings"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

type lifecycleUI struct {
	run    func(context.Context, func(desktop.Action)) error
	update func(desktop.Display)
}

func (u lifecycleUI) Run(ctx context.Context, handle func(desktop.Action)) error {
	if u.run != nil {
		return u.run(ctx, handle)
	}
	<-ctx.Done()
	return nil
}
func (u lifecycleUI) Update(d desktop.Display) {
	if u.update != nil {
		u.update(d)
	}
}
func (lifecycleUI) Notify(string) {}

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

func TestRunPollsWhileHiddenAndRestoresPositionState(t *testing.T) {
	now := time.Date(2026, 10, 12, 8, 30, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	mockServer := mock.New(clock)
	server := httptest.NewServer(mockServer.Handler())
	defer server.Close()

	path := filepath.Join(t.TempDir(), "state.json")
	a, err := New(path, feed.Client{AllowLocalHTTP: true}, clock)
	if err != nil {
		t.Fatal(err)
	}
	if err := a.ConfigureFeed(server.URL+"/feed", true); err != nil {
		t.Fatal(err)
	}
	a.Action(context.Background(), desktop.Action{Name: "show"})
	a.Action(context.Background(), desktop.Action{Name: "lock"})
	a.Action(context.Background(), desktop.Action{Name: "position", Value: "321,654"})

	refreshed := make(chan struct{}, 1)
	ui := lifecycleUI{update: func(d desktop.Display) {
		if !d.Show && d.HasUpcoming {
			select {
			case refreshed <- struct{}{}:
			default:
			}
		}
	}, run: func(ctx context.Context, handle func(desktop.Action)) error {
		select {
		case <-refreshed:
			handle(desktop.Action{Name: "quit"})
		case <-time.After(2 * time.Second):
			t.Fatal("hidden app did not poll in the background")
		}
		<-ctx.Done()
		return nil
	}}
	if err := a.Run(context.Background(), ui); err != nil {
		t.Fatal(err)
	}

	restored, err := New(path, feed.Client{AllowLocalHTTP: true}, clock)
	if err != nil {
		t.Fatal(err)
	}
	display := restored.Display()
	if display.Show || display.Locked || display.X != 321 || display.Y != 654 {
		t.Fatalf("config and position were not restored: %+v", display)
	}
	if restored.State().Snapshot == nil {
		t.Fatal("hidden background poll did not persist refreshed state")
	}
}

func TestQuitCancelsAndWaitsForInFlightRefresh(t *testing.T) {
	released := make(chan struct{})
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-r.Context().Done()
		close(released)
	}))
	defer server.Close()

	a, err := New(filepath.Join(t.TempDir(), "state.json"), feed.Client{AllowLocalHTTP: true}, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if err := a.ConfigureFeed(server.URL, true); err != nil {
		t.Fatal(err)
	}

	ui := lifecycleUI{run: func(ctx context.Context, handle func(desktop.Action)) error {
		handle(desktop.Action{Name: "refresh"})
		select {
		case <-started:
		case <-time.After(2 * time.Second):
			t.Fatal("refresh request did not start")
		}
		handle(desktop.Action{Name: "quit"})
		<-ctx.Done()
		return nil
	}}
	if err := a.Run(context.Background(), ui); err != nil {
		t.Fatal(err)
	}
	if a.State().Health.LastFailureAt.IsZero() {
		t.Fatal("Run returned before the client recorded the canceled refresh")
	}
	select {
	case <-released:
	case <-time.After(2 * time.Second):
		t.Fatal("server did not observe refresh cancellation")
	}
}

func TestRefreshActionAfterRunReturnsIsIgnored(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	a, err := New(filepath.Join(t.TempDir(), "state.json"), feed.Client{AllowLocalHTTP: true}, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	ui := lifecycleUI{run: func(ctx context.Context, handle func(desktop.Action)) error {
		handle(desktop.Action{Name: "quit"})
		<-ctx.Done()
		return nil
	}}
	if err := a.Run(context.Background(), ui); err != nil {
		t.Fatal(err)
	}

	a.mu.Lock()
	a.s.Config.FeedURL = server.URL
	a.s.Config.AllowLocalHTTP = true
	a.client.AllowLocalHTTP = true
	a.mu.Unlock()
	a.Action(context.Background(), desktop.Action{Name: "refresh"})
	time.Sleep(50 * time.Millisecond)
	if got := requests.Load(); got != 0 {
		t.Fatalf("late refresh action started %d request(s) after Run returned", got)
	}
}
