package bridge

import (
	"context"
	"encoding/json"
	"fmt"
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
	omitResetURL   bool
	omitResetState bool
	nullResetTime  bool
	resetConfirmed *bool
	contradictory  bool
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
		var resetTime any = eventAt
		if s.nullResetTime {
			resetTime = nil
		}
		reset := map[string]any{"id": "res1", "group": "reset", "type": "reset", "announced_at": resetTime, "summary": s.summary}
		if !s.omitResetState {
			reset["announcement_state"] = resetState(s.withdrawn)
		}
		if s.resetConfirmed != nil {
			reset["confirmed"] = *s.resetConfirmed
		}
		if !s.omitResetURL {
			reset["url"] = "https://x.com/person/status/res1"
		}
		events := []any{
			reset,
			map[string]any{"id": "gift1", "group": "credits", "type": "credits", "announcement_state": "none", "announced_at": eventAt, "url": "https://x.com/person/status/gift1", "summary": "额外机会"},
			map[string]any{"id": "pending1", "group": "credits", "type": "credits", "announcement_state": "none", "announced_at": eventAt, "summary": "无链接"},
			map[string]any{"id": "candidate", "group": "reset", "type": "reset", "announcement_state": "none", "announced_at": eventAt, "url": "https://x.com/person/status/candidate", "summary": "不应计数"}}
		if s.contradictory {
			events = append(events, map[string]any{"id": "conflict1", "group": "reset", "type": "reset", "announcement_state": "announced", "confirmed": false, "announced_at": eventAt, "url": "https://x.com/person/status/conflict1", "summary": "追踪状态声称已确认但记录又标记 confirmed false"})
		}
		payload = map[string]any{"updated_at": now, "events": events}
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

// The archive is paginated using the existing production Go client, not a
// standalone HTTP status-only test. It must work past one 200-record page.
func TestArchiveMultiPageAndConditionalGet(t *testing.T) {
	e, _, clk, stopUp := setup(t)
	defer stopUp()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	e.mu.Lock()
	for i := 0; i < 405; i++ {
		observed := clk.Now().Add(-time.Duration(i+1) * time.Minute)
		e.disk.Archive.Records = append(e.disk.Archive.Records, history.Record{
			ID: fmt.Sprintf("codex-reset:historical:%04d", i), Revision: 1, Kind: "third_party_reset",
			State: "active", SourceType: "third_party", Audience: "public",
			ProviderReportedAt: &observed, SourceURL: "https://codex-reset.com/",
			Summary: "第三方历史追踪记录，不是 OpenAI 官方证据",
		})
	}
	e.disk.Archive.ArchiveVersion++
	e.disk.Snapshot.FeedVersion++
	e.mu.Unlock()
	if err := e.Save(); err != nil {
		t.Fatal(err)
	}
	server := bridgeServer(t, e)
	defer server.Close()
	c := feed.Client{AllowLocalHTTP: true}
	got, err := c.Fetch(context.Background(), server.URL+"/feed", "", false)
	if err != nil {
		t.Fatal(err)
	}
	all, err := c.FetchArchive(context.Background(), server.URL+"/feed", got.Snapshot.HistoryURL, got.Snapshot.ChannelID, got.Snapshot.HistoryVersion)
	if err != nil {
		t.Fatal(err)
	}
	if len(all.Records) != 408 || all.Complete {
		t.Fatalf("wrong merged history count/completeness: %d complete=%v", len(all.Records), all.Complete)
	}
	if sum := history.Analyze(&all, clk.Now(), time.UTC); sum.Last30Days.Confirmations.Known {
		t.Fatal("incomplete third-party history claimed full official coverage")
	}
	resp, err := http.Get(server.URL + "/archive")
	if err != nil {
		t.Fatal(err)
	}
	tag := resp.Header.Get("ETag")
	resp.Body.Close()
	if resp.StatusCode != 200 || tag == "" {
		t.Fatalf("archive did not send etag: %d %q", resp.StatusCode, tag)
	}
	req, err := http.NewRequest(http.MethodGet, server.URL+"/archive", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("If-None-Match", tag)
	conditional, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	conditional.Body.Close()
	if conditional.StatusCode != http.StatusNotModified {
		t.Fatalf("archive 304 expected, got %d", conditional.StatusCode)
	}
	stale, err := http.Get(server.URL + "/archive?cursor=1-200")
	if err != nil {
		t.Fatal(err)
	}
	stale.Body.Close()
	if stale.StatusCode != http.StatusBadRequest {
		t.Fatalf("stale cursor not rejected: %d", stale.StatusCode)
	}
}

// Some live responses expose "announcement_state=announced" alongside an
// explicit "confirmed=false". Such contradicting evidence stays under review.
func TestConflictingResetEvidenceIsNotConfirmed(t *testing.T) {
	e, src, _, stop := setup(t)
	defer stop()
	src.mu.Lock()
	src.contradictory = true
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	d := e.Report()
	if len(d.Snapshot.Events) != 2 {
		t.Fatalf("contradiction appeared as confirmed reset: %+v", d.Snapshot.Events)
	}
	found := false
	for _, p := range d.Pending {
		if strings.HasSuffix(p.ID, "conflict1") && p.Reason == "contradictory_confirmation" {
			found = true
		}
	}
	if !found {
		t.Fatalf("contradictory event missing review evidence: %+v", d.Pending)
	}
	for _, r := range d.Archive.Records {
		if strings.HasSuffix(r.ID, "conflict1") {
			t.Fatal("conflicting event entered archive as confirmed")
		}
	}
}

func TestWithdrawnTimelineKeepsSavedSourceWhenURLMissing(t *testing.T) {
	e, src, _, stop := setup(t)
	defer stop()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	src.mu.Lock()
	src.withdrawn = true
	src.omitResetTweet = true
	src.omitResetURL = true
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	d := e.Report()
	foundEvent := false
	for _, ev := range d.Snapshot.Events {
		if strings.HasSuffix(ev.ID, "res1") {
			foundEvent = true
			if ev.State != "withdrawn" || ev.Revision != 2 || ev.SourceURL != "https://x.com/person/status/res1" {
				t.Fatalf("withdrawal did not preserve saved event source: %+v", ev)
			}
		}
	}
	if !foundEvent {
		t.Fatal("withdrawn event missing")
	}
	var latest *history.Record
	for i := range d.Archive.Records {
		if strings.HasSuffix(d.Archive.Records[i].ID, "res1") && (latest == nil || d.Archive.Records[i].Revision > latest.Revision) {
			latest = &d.Archive.Records[i]
		}
	}
	if latest == nil || latest.State != "withdrawn" || latest.Revision != 2 || latest.SourceURL != "https://x.com/person/status/res1" {
		t.Fatalf("withdrawal did not preserve saved archive source: %+v", latest)
	}
	for _, n := range news.Top(d.Snapshot.News, 3) {
		if strings.HasSuffix(n.ID, "res1") {
			t.Fatal("withdrawn post remained in active top news")
		}
	}
}

func TestResetWithoutAnnouncementStateStaysPending(t *testing.T) {
	e, src, _, stop := setup(t)
	defer stop()
	confirmed := true
	src.mu.Lock()
	src.omitResetState = true
	src.resetConfirmed = &confirmed
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	d := e.Report()
	for _, ev := range d.Snapshot.Events {
		if strings.HasSuffix(ev.ID, "res1") {
			t.Fatalf("reset without announcement_state was published: %+v", ev)
		}
	}
	foundPending := false
	for _, p := range d.Pending {
		if strings.HasSuffix(p.ID, "res1") && p.Reason == "missing_announcement_state" {
			foundPending = true
		}
	}
	if !foundPending {
		t.Fatalf("missing announcement_state was not retained for review: %+v", d.Pending)
	}
}

func TestTimelineNullAnnouncedAtDoesNotRejectWholeFeed(t *testing.T) {
	e, src, _, stop := setup(t)
	defer stop()
	confirmed := true
	src.mu.Lock()
	src.resetConfirmed = &confirmed
	src.nullResetTime = true
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	d := e.Report()
	for _, ev := range d.Snapshot.Events {
		if strings.HasSuffix(ev.ID, "res1") {
			t.Fatalf("reset with missing timestamp was published: %+v", ev)
		}
	}
	foundPending := false
	for _, p := range d.Pending {
		if strings.HasSuffix(p.ID, "res1") && p.Reason == "missing_provider_timestamp" {
			foundPending = true
		}
	}
	if !foundPending {
		t.Fatalf("missing timestamp was not retained for review: %+v", d.Pending)
	}
	if len(d.Snapshot.Events) == 0 || len(d.Archive.Records) == 0 {
		t.Fatal("one malformed timeline row discarded the whole feed")
	}
}
