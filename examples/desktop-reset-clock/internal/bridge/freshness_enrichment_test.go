package bridge

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
)

// A serve process can be blocked by the network or the scheduler while the
// last published check ages out. A read must never advertise old data as fresh.
func TestReadTimeExpiryInvalidatesHTTPFeedAndHealth(t *testing.T) {
	e, _, clock, stop := setup(t)
	defer stop()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := bridgeServer(t, e)
	defer server.Close()
	c := feed.Client{AllowLocalHTTP: true}
	original, err := c.Fetch(context.Background(), server.URL+"/feed", "", false)
	if err != nil || original.Snapshot.SourceHealth.Status != "ok" {
		t.Fatalf("healthy snapshot: %+v %v", original, err)
	}
	if original.ETag == "" {
		t.Fatal("missing etag")
	}
	if err := clock.Wait(context.Background(), 31*time.Minute); err != nil {
		t.Fatal(err)
	}
	expired, err := c.Fetch(context.Background(), server.URL+"/feed", original.ETag, true)
	if err != nil || expired.NotModified || expired.Snapshot.SourceHealth.Status != "stale" {
		t.Fatalf("stale source must invalidate 304: %+v %v", expired, err)
	}
	if expired.Snapshot.FeedVersion != original.Snapshot.FeedVersion {
		t.Fatal("passive health expiry forged a content revision")
	}
	if len(expired.Snapshot.Events) != len(original.Snapshot.Events) {
		t.Fatal("expiry discarded cache")
	}
	for _, e := range expired.Snapshot.Events {
		if events.Eligible(e, clock.Now(), expired.Snapshot.SourceHealth.LastCheckedAt) {
			t.Fatal("stale source caused actionable alert")
		}
	}
	resp, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("stale health endpoint returned %d", resp.StatusCode)
	}
}

// The original post timestamp may be absent in the first provider timeline
// round, then appear in its short feed later. Retain the newly evidenced time
// as a real revision; never overwrite an already captured original timestamp.
func TestLatePostTimestampEnrichesRevisionsOnlyOnce(t *testing.T) {
	e, src, clock, stop := setup(t)
	defer stop()
	src.mu.Lock()
	src.omitResetTweet = true
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	prior := e.Report()
	find := func(d Disk) (*events.Event, *history.Record) {
		var ev *events.Event
		var rec *history.Record
		for i := range d.Snapshot.Events {
			if strings.HasSuffix(d.Snapshot.Events[i].ID, "res1") {
				ev = &d.Snapshot.Events[i]
			}
		}
		for i := range d.Archive.Records {
			if strings.HasSuffix(d.Archive.Records[i].ID, "res1") && (rec == nil || d.Archive.Records[i].Revision > rec.Revision) {
				rec = &d.Archive.Records[i]
			}
		}
		return ev, rec
	}
	firstEvent, firstRecord := find(prior)
	if firstEvent == nil || firstRecord == nil || firstEvent.SourcePublishedAt != nil || firstRecord.SourcePublishedAt != nil {
		t.Fatalf("initial source incorrectly invented original post time: %+v %+v", firstEvent, firstRecord)
	}
	src.mu.Lock()
	src.omitResetTweet = false
	src.mu.Unlock()
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	second := e.Report()
	enriched, historic := find(second)
	if enriched == nil || historic == nil || enriched.Revision != 2 || historic.Revision != 2 || enriched.SourcePublishedAt == nil || historic.SourcePublishedAt == nil {
		t.Fatalf("late evidence was silently lost: %+v %+v", enriched, historic)
	}
	if !enriched.SourcePublishedAt.Equal(src.at) || !historic.SourcePublishedAt.Equal(src.at) {
		t.Fatalf("timestamp changed: %+v %+v", enriched, historic)
	}
	if second.Snapshot.FeedVersion <= prior.Snapshot.FeedVersion || second.Archive.ArchiveVersion <= prior.Archive.ArchiveVersion {
		t.Fatal("source evidence did not increment versions")
	}
	if err := history.ValidateArchive(second.Archive); err != nil {
		t.Fatalf("enriched archive rejected: %v", err)
	}
	if _, err := e.Poll(context.Background()); err != nil {
		t.Fatal(err)
	}
	third := e.Report()
	if third.Snapshot.FeedVersion != second.Snapshot.FeedVersion || third.Archive.ArchiveVersion != second.Archive.ArchiveVersion {
		t.Fatal("unchanged evidence generated another revision")
	}
	_ = clock
}