package feed

import (
	"context"
	"encoding/json"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func valid() events.Snapshot {
	now := time.Now().UTC()
	future := now.Add(time.Hour)
	return events.Snapshot{SchemaVersion: 1, ChannelID: "test", FeedVersion: 1, GeneratedAt: now, SourceHealth: events.SourceHealth{LastCheckedAt: &now}, Events: []events.Event{{ID: "one", Revision: 1, Type: "reset_announcement", State: "active", Audience: "public", EffectiveAt: &future, VerifiedAt: &now, SourceURL: "https://example.org/official"}}}
}
func TestHTTPVariants(t *testing.T) {
	ctx := context.Background()
	if CheckURL("http://example.com/feed", true) == nil || CheckURL("http://127.0.0.1/x", false) == nil || CheckURL("https://user:password@example.com/x", false) == nil {
		t.Fatal("unsafe URL accepted")
	}
	code := 200
	calls := 0
	force304 := false
	h := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if force304 {
			w.WriteHeader(304)
			return
		}
		if code != 200 {
			if code == 429 {
				w.Header().Set("Retry-After", "120")
			}
			w.WriteHeader(code)
			return
		}
		if r.Header.Get("If-None-Match") == `"one"` {
			w.WriteHeader(304)
			return
		}
		w.Header().Set("ETag", `"one"`)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(valid())
	}))
	defer h.Close()
	c := Client{AllowLocalHTTP: true}
	x, e := c.Fetch(ctx, h.URL, "", false)
	if e != nil || x.Snapshot.FeedVersion != 1 {
		t.Fatalf("GET: %v", e)
	}
	x, e = c.Fetch(ctx, h.URL, `"one"`, true)
	if e != nil || !x.NotModified {
		t.Fatalf("304: %v", e)
	}
	calls = 0
	force304 = true
	_, e = c.Fetch(ctx, h.URL, `"one"`, false)
	if e == nil || calls != 2 {
		t.Fatalf("304 no cache: %d %v", calls, e)
	}
	force304 = false
	for _, status := range []int{401, 403, 429, 500, 503} {
		code = status
		_, err := c.Fetch(ctx, h.URL, "", false)
		he, ok := err.(*HTTPError)
		if !ok || he.Status != status {
			t.Fatalf("%d error %v", status, err)
		}
		if status == 429 && he.RetryAt.Before(time.Now().Add(time.Minute)) {
			t.Fatal("ignored Retry-After")
		}
	}
}
func TestInvalidAndCancelled(t *testing.T) {
	h := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html>login</html>"))
	}))
	defer h.Close()
	_, err := (Client{AllowLocalHTTP: true}).Fetch(context.Background(), h.URL, "", false)
	if err == nil {
		t.Fatal("HTML accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = (Client{AllowLocalHTTP: true}).Fetch(ctx, h.URL, "", false)
	if err == nil {
		t.Fatal("cancel not honored")
	}
}
