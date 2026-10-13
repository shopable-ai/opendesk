package codexreset

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestErrorsAndLimits(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		header string
		kind   string
	}{
		{"not_found", 404, "{}", "application/json", "unavailable"},
		{"rate_limited", 429, "{}", "application/json", "rate_limited"},
		{"server", 503, "{}", "application/json", "unavailable"},
		{"bad_json", 200, "{broken", "application/json", "invalid"},
		{"html", 200, "<html>x</html>", "text/html", "invalid"},
		{"oversized", 200, fmt.Sprintf("%0*s", (2<<20)+1, "a"), "application/json", "invalid"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			now := time.Now().UTC()
			var requests int
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" || r.Header.Get("User-Agent") != UserAgent {
					t.Error("unsafe headers")
				}
				w.Header().Set("Content-Type", tc.header)
				w.Header().Set("Retry-After", "120")
				w.WriteHeader(tc.status)
				fmt.Fprint(w, tc.body)
			}))
			defer up.Close()
			state := State{Cache: map[string]Cache{}}
			saves := 0
			c := Collector{BaseURL: up.URL, AllowTestHTTP: true, Now: func() time.Time { return now }, Wait: func(_ context.Context, d time.Duration) error { now = now.Add(d); return nil }}
			out, err := c.get(context.Background(), "forecast", &state, func() error { saves++; return nil })
			if err == nil || out.Status != tc.kind {
				t.Fatalf("unexpected result: %+v err=%v", out, err)
			}
			if saves < 1 || requests < 1 {
				t.Fatal("not requested or limiter not saved")
			}
			if tc.status == 429 && state.NextAllowedAt.Sub(now) < 120*time.Second {
				t.Fatal("Retry-After ignored")
			}
		})
	}
}
func TestRejectRedirectAndUnsafeOverride(t *testing.T) {
	external := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://other.example/api/forecast", 302)
	}))
	defer external.Close()
	c := Collector{BaseURL: external.URL, AllowTestHTTP: true, Wait: func(context.Context, time.Duration) error { return nil }}
	s := State{Cache: map[string]Cache{}}
	r, err := c.get(context.Background(), "forecast", &s, func() error { return nil })
	if err == nil || r.Status == "ok" {
		t.Fatal("redirect unexpectedly accepted")
	}
	if _, err = (Collector{BaseURL: "http://example.com", AllowTestHTTP: true}).base(); err == nil {
		t.Fatal("SSRF override allowed")
	}
	if _, err = (Collector{BaseURL: external.URL}).base(); err == nil {
		t.Fatal("unauthorized test override accepted")
	}
}
func TestValidation(t *testing.T) {
	if _, _, err := ValidatePayload("timeline", []byte(`{"updated_at":"2026-10-13T11:00:00Z","events":[{"id":"a"}]}`)); err == nil {
		t.Fatal("missing documented fields")
	}
	if _, _, err := ValidatePayload("forecast", []byte(`{"updated_at":"2026-10-13T11:00:00Z","official_signal":null,"confidence":"low","probabilities":{"rounded_24h":5,"rounded_48h":7}}`)); err != nil {
		t.Fatal(err)
	}
}

// Cache-Control is scoped to each endpoint, while the 60-second rate limit
// is scoped to the whole host. A one-hour forecast TTL must not postpone the
// other three endpoint requests for three hours.
func TestEndpointCacheControlDoesNotBlockOtherEndpoints(t *testing.T) {
	var mu sync.Mutex
	now := time.Now().UTC().Add(-10 * time.Minute)
	calls := []struct {
		path string
		at   time.Time
	}{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls = append(calls, struct {
			path string
			at   time.Time
		}{r.URL.Path, now})
		captured := now
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "max-age=60")
		if r.URL.Path == "/api/forecast" {
			w.Header().Set("Cache-Control", "max-age=3600")
		}
		observed := captured.Add(-time.Minute).Format(time.RFC3339Nano)
		var body any
		switch r.URL.Path {
		case "/api/forecast":
			body = map[string]any{"updated_at": observed, "last_reset_at": observed, "confidence": "low", "probabilities": map[string]any{"rounded_24h": 19, "rounded_48h": 34}, "official_signal": nil}
		case "/api/timeline":
			body = map[string]any{"updated_at": observed, "events": []any{}}
		case "/api/feed":
			body = map[string]any{"fetched_at": observed, "stale": false, "signal": nil, "tweets": []any{}, "events": []any{}}
		case "/api/status-history":
			body = map[string]any{"checked_at": observed, "stale": false, "current": map[string]any{}, "surfaces": []any{}, "incidents": []any{}, "compensation_links": []any{}, "stats": map[string]any{}}
		default:
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(body)
	}))
	defer server.Close()
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	wait := func(_ context.Context, d time.Duration) error { mu.Lock(); now = now.Add(d); mu.Unlock(); return nil }
	state := State{Cache: map[string]Cache{}}
	collector := Collector{BaseURL: server.URL, AllowTestHTTP: true, HTTP: server.Client(), Now: clock, Wait: wait}
	results, err := collector.Poll(context.Background(), &state, func() error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range Endpoints {
		if results[name].Status != "ok" {
			t.Fatalf("%s: %+v", name, results[name])
		}
	}
	mu.Lock()
	original := append([]struct {
		path string
		at   time.Time
	}{}, calls...)
	mu.Unlock()
	if len(original) != 4 {
		t.Fatalf("first round called %d endpoints", len(original))
	}
	if elapsed := original[3].at.Sub(original[0].at); elapsed != 3*MinInterval {
		t.Fatalf("per-resource cache-control blocked other paths: %v", elapsed)
	}
	for i := 1; i < len(original); i++ {
		if gap := original[i].at.Sub(original[i-1].at); gap < MinInterval {
			t.Fatalf("global limiter failed: %v", gap)
		}
	}
	results, err = collector.Poll(context.Background(), &state, func() error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	if !results["forecast"].FromCache || results["forecast"].HTTPStatus != 0 {
		t.Fatalf("forecast cache not reused: %+v", results["forecast"])
	}
	mu.Lock()
	defer mu.Unlock()
	if len(calls) != 7 {
		t.Fatalf("forecast should be reused while other endpoints refresh: %v calls", len(calls))
	}
	for i := 1; i < len(calls); i++ {
		if gap := calls[i].at.Sub(calls[i-1].at); gap < MinInterval {
			t.Fatalf("host limiter broken: %v", gap)
		}
	}
}

func TestExpiredPublisherCopyAndNoStore(t *testing.T) {
	tests := []struct{ name, cacheControl, expires, kind string }{
		{name: "expired", cacheControl: "max-age=60", expires: "past", kind: "stale"},
		{name: "no_store", cacheControl: "no-store, max-age=120", kind: "invalid"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			now := time.Now().UTC()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Cache-Control", tc.cacheControl)
				if tc.expires == "past" {
					w.Header().Set("X-Published-Expires-At", now.Add(-time.Minute).Format(time.RFC3339Nano))
				}
				fmt.Fprintf(w, `{"updated_at":%q,"official_signal":null,"confidence":"low","probabilities":{"rounded_24h":19,"rounded_48h":34}}`, now.Add(-time.Minute).Format(time.RFC3339Nano))
			}))
			defer server.Close()
			state := State{Cache: map[string]Cache{}}
			out, err := (Collector{BaseURL: server.URL, AllowTestHTTP: true, HTTP: server.Client(), Now: func() time.Time { return now }}).get(context.Background(), "forecast", &state, func() error { return nil })
			if err == nil || out.Status != tc.kind {
				t.Fatalf("result %+v err %v", out, err)
			}
			if len(state.Cache) != 0 {
				t.Fatalf("rejected data persisted: %+v", state.Cache)
			}
		})
	}
}

func TestRetryAfterLongAndConditional304(t *testing.T) {
	now := time.Now().UTC()
	if got := retryAfter("7200", now); got.Sub(now) != 2*time.Hour {
		t.Fatalf("two-hour Retry-After was shortened: %s", got.Sub(now))
	}
	if got := retryAfter(now.Add(3*time.Hour).Format(http.TimeFormat), now); got.Sub(now) < 2*time.Hour {
		t.Fatalf("date Retry-After shortened: %s", got.Sub(now))
	}
	var requestedETag string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedETag = r.Header.Get("If-None-Match")
		w.WriteHeader(http.StatusNotModified)
	}))
	defer server.Close()
	body := fmt.Sprintf(`{"updated_at":%q,"official_signal":null,"confidence":"low","probabilities":{"rounded_24h":19,"rounded_48h":34}}`, now.Add(-time.Minute).Format(time.RFC3339Nano))
	state := State{Cache: map[string]Cache{"forecast": {Body: json.RawMessage(body), ETag: `"original"`, CheckedAt: now.Add(-time.Minute)}}}
	out, err := (Collector{BaseURL: server.URL, AllowTestHTTP: true, HTTP: server.Client(), Now: func() time.Time { return now }}).get(context.Background(), "forecast", &state, func() error { return nil })
	if err != nil || out.Status != "ok" || !out.NotModified || requestedETag != `"original"` {
		t.Fatalf("304 %v %+v tag=%q", err, out, requestedETag)
	}
}
