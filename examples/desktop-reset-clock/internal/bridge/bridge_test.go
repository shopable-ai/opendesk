package bridge

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/news"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/provider/codexreset"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *fakeClock) Wait(_ context.Context, d time.Duration) error {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
	return nil
}

type source struct {
	mu             sync.Mutex
	summary        string
	withdrawn      bool
	httpStatus     int
	requests       []time.Time
	clk            *fakeClock
	notModified    bool
	omitResetTweet bool
	at             time.Time
}

func (s *source) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.requests = append(s.requests, s.clk.Now())
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("ETag", "\"v1\"")
	w.Header().Set("Cache-Control", "max-age=60")
	if s.httpStatus != 0 {
		w.WriteHeader(s.httpStatus)
		return
	}
	if s.notModified && r.Header.Get("If-None-Match") != "" {
		w.WriteHeader(304)
		return
	}
	now := s.clk.Now().Add(-time.Minute).UTC().Format(time.RFC3339Nano)
	eventAt := s.at.Format(time.RFC3339Nano)
	payload := map[string]any{}
	switch r.URL.Path {
	case "/api/forecast":
		payload = map[string]any{"updated_at": now, "last_reset_at": now, "confidence": "low", "probabilities": map[string]any{"rounded_24h": 19, "rounded_48h": 34}, "official_signal": nil}
	case "/api/timeline":
		payload = map[string]any{"updated_at": now, "events": []any{
			map[string]any{"id": "res1", "group": "reset", "type": "reset", "announcement_state": resetState(s.withdrawn), "announced_at": eventAt, "url": "https://x.com/person/status/res1", "summary": s.summary},
			map[string]any{"id": "gift1", "group": "credits", "type": "credits", "announcement_state": "none", "announced_at": eventAt, "url": "https://x.com/person/status/gift1", "summary": "额外机会"},
			map[string]any{"id": "pending1", "group": "credits", "type": "credits", "announcement_state": "none", "announced_at": eventAt, "summary": "无链接"},
			map[string]any{"id": "candidate", "group": "reset", "type": "reset", "announcement_state": "none", "announced_at": eventAt, "url": "https://x.com/person/status/candidate", "summary": "不应计数"}}}
	case "/api/feed":
		tweets := []any{map[string]any{"id": "ordinary", "at": eventAt, "text": "普通消息", "url": "https://x.com/person/status/ordinary"}}
		if !s.omitResetTweet {
			tweets = append([]any{map[string]any{"id": "res1", "at": eventAt, "text": "重置进展", "url": "https://x.com/person/status/res1"}}, tweets...)
		}
		payload = map[string]any{"fetched_at": now, "stale": false, "signal": nil, "events": []any{}, "newest_post_at": now, "tweets": tweets}
	case "/api/status-history":
		payload = map[string]any{"checked_at": now, "stale": false, "current": map[string]any{"indicator": "minor"}, "surfaces": []any{}, "compensation_links": []any{}, "stats": map[string]any{"days": 90}, "incidents": []any{map[string]any{"id": "inc1", "name": "服务故障", "status": "monitoring", "started_at": eventAt, "source_url": "https://status.openai.com/incidents/inc1"}}}
	default:
		http.NotFound(w, r)
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}
func setup(t *testing.T) (*Engine, *source, *fakeClock, func()) {
	t.Helper()
	clk := &fakeClock{t: time.Now().UTC().Add(-5 * time.Minute)}
	src := &source{summary: "第三方已确认重置", clk: clk, at: clk.Now().Add(-time.Minute)}
	up := httptest.NewServer(src)
	state := filepath.Join(t.TempDir(), "state.json")
	eng, err := New(state, codexreset.Collector{BaseURL: up.URL, AllowTestHTTP: true, Now: clk.Now, Wait: clk.Wait, HTTP: up.Client()}, clk.Now)
	if err != nil {
		t.Fatal(err)
	}
	return eng, src, clk, up.Close
}
func bridgeServer(t *testing.T, e *Engine) *httptest.Server {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := httptest.NewUnstartedServer(nil)
	s.Listener = ln
	h, err := e.Handler("http://" + ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	s.Config.Handler = h
	s.Start()
	return s
}
func TestEndToEndRealClient(t *testing.T) {
	e, src, clk, closeUp := setup(t)
	defer closeUp()
	results, err := e.Poll(context.Background())
	if err != nil {
		t.Fatalf("collector: %v (%+v)", err, results)
	}
	d := e.Report()
	if len(d.Snapshot.Events) != 2 {
		t.Fatalf("only reset+credits should be published: %+v", d.Snapshot.Events)
	}
	if len(d.Pending) != 1 {
		t.Fatalf("missing source must be review candidate: %+v", d.Pending)
	}
	if len(d.Archive.Records) != 3 {
		t.Fatalf("reset + credits + outage must be separate: %+v", d.Archive.Records)
	}
	if len(d.Snapshot.News) != 2 {
		t.Fatalf("duplicate timeline/feed post must appear once in news: %+v", d.Snapshot.News)
	}
	if d.Archive.Complete {
		t.Fatal("no full historical coverage proof")
	}
	for _, ev := range d.Snapshot.Events {
		if ev.SourceType != "third_party" || ev.VerifiedAt != nil || ev.EffectiveAt != nil || events.Eligible(ev, clk.Now(), d.Snapshot.SourceHealth.LastCheckedAt) {
			t.Fatalf("false official/actionable event: %+v", ev)
		}
	}
	for _, record := range d.Archive.Records {
		if record.SourceType != "third_party" || record.ConfirmedAt != nil || record.VerifiedAt != nil {
			t.Fatalf("false official record: %+v", record)
		}
	}
	server := bridgeServer(t, e)
	defer server.Close()
	client := feed.Client{AllowLocalHTTP: true}
	output, err := client.Fetch(context.Background(), server.URL+"/feed", "", false)
	if err != nil {
		t.Fatal(err)
	}
	if output.Snapshot.DataSourceURL != codexreset.SourceURL || output.Snapshot.FeedVersion != d.Snapshot.FeedVersion {
		t.Fatal("data-source attribution or version lost")
	}
	archive, err := client.FetchArchive(context.Background(), server.URL+"/feed", output.Snapshot.HistoryURL, output.Snapshot.ChannelID, output.Snapshot.HistoryVersion)
	if err != nil {
		t.Fatal(err)
	}
	summary := history.Analyze(&archive, clk.Now(), time.UTC)
	if summary.Last30Days.Confirmations.Known || summary.Last30Days.Confirmations.Label() != "数据不足" {
		t.Fatal("incomplete third party archive must not produce 0 or official counts")
	}
	if got := news.Top(output.Snapshot.News, 3); len(got) != 2 {
		t.Fatal("news.Top does not see observed items")
	}
	again, err := client.Fetch(context.Background(), server.URL+"/feed", output.ETag, true)
	if err != nil || !again.NotModified {
		t.Fatalf("ETag conditional GET broken: %+v %v", again, err)
	}
	before := d.Snapshot.FeedVersion
	beforeHistory := d.Archive.ArchiveVersion
	src.mu.Lock()
	src.notModified = true
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	d = e.Report()
	if d.Snapshot.FeedVersion != before || d.Archive.ArchiveVersion != beforeHistory {
		t.Fatal("304/repeated content changed versions")
	}
	src.mu.Lock()
	src.notModified = false
	src.summary = "更正后的第三方确认"
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	d = e.Report()
	if d.Snapshot.FeedVersion <= before || d.Archive.ArchiveVersion <= beforeHistory {
		t.Fatal("genuine revision not versioned")
	}
	var revision int64
	for _, ev := range d.Snapshot.Events {
		if strings.HasSuffix(ev.ID, "res1") {
			revision = ev.Revision
		}
	}
	if revision != 2 {
		t.Fatalf("revision expected 2 got %d", revision)
	}
	src.mu.Lock()
	src.withdrawn = true
	src.omitResetTweet = true // withdrawn post has also scrolled out of the short feed
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	d = e.Report()
	for _, n := range news.Top(d.Snapshot.News, 3) {
		if strings.HasSuffix(n.ID, "res1") {
			t.Fatal("withdrawn news is still active")
		}
	}
	for _, ev := range d.Snapshot.Events {
		if strings.HasSuffix(ev.ID, "res1") {
			if ev.State != "withdrawn" || ev.Revision != 3 {
				t.Fatalf("withdrawn tombstone missing: %+v", ev)
			}
		}
	}
	// Simulate upstream outage and restart: old evidence stays, health goes stale.
	src.mu.Lock()
	src.httpStatus = 503
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err == nil {
		t.Fatal("source outage not reported")
	}
	d = e.Report()
	if d.Snapshot.SourceHealth.Status != "stale" {
		t.Fatal("source outage not marked stale")
	}
	reopened, err := New(e.path, e.collector, clk.Now)
	if err != nil {
		t.Fatal(err)
	}
	if len(reopened.Report().Archive.Records) != 5 {
		t.Fatalf("restart lost original/revision/withdrawn history: %+v", reopened.Report().Archive.Records)
	}
	s2 := bridgeServer(t, reopened)
	defer s2.Close()
	res2, err := client.Fetch(context.Background(), s2.URL+"/feed", "", false)
	if err != nil || res2.Snapshot.SourceHealth.Status != "stale" {
		t.Fatalf("client cannot load cached stale feed %v", err)
	}
	src.mu.Lock()
	calls := append([]time.Time(nil), src.requests...)
	src.mu.Unlock()
	for i := 1; i < len(calls); i++ {
		if d := calls[i].Sub(calls[i-1]); d < time.Minute {
			t.Fatalf("requests too close: %v", d)
		}
	}
}
func TestStateSafetyAndLease(t *testing.T) {
	e, _, clk, closeUp := setup(t)
	defer closeUp()
	release, err := Acquire(e.path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Acquire(e.path); err == nil {
		t.Fatal("second process acquired same state")
	}
	_ = release()
	if err := e.Save(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(e.path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := New(e.path, e.collector, clk.Now); err == nil {
		t.Fatal("corruption silently reset version history")
	}
}
func TestArchiveCursorValidation(t *testing.T) {
	e, _, _, closeUp := setup(t)
	defer closeUp()
	server := bridgeServer(t, e)
	defer server.Close()
	resp, err := http.Get(server.URL + "/archive?cursor=999-200")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatal("stale archive cursor not rejected")
	}
}

func resetState(withdrawn bool) string {
	if withdrawn {
		return "withdrawn"
	}
	return "announced"
}