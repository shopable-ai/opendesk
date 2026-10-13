package codexreset

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
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