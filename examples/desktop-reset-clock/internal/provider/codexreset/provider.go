// Package codexreset collects four public read-only JSON endpoints without credentials.
// This is a third-party tracker, not an OpenAI official confirmation source.
package codexreset

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	SourceURL   = "https://codex-reset.com/"
	UserAgent   = "OpenDesk-Reset-Clock-Bridge/2.4 (+https://github.com/shopable-ai/opendesk)"
	MinInterval = time.Minute // global limit per upstream host, never per endpoint
	maxResponse = 2 << 20
	maxAge      = 30 * time.Minute // our freshness ceiling, not an upstream guarantee
)

var Endpoints = [...]string{"forecast", "timeline", "feed", "status-history"}

type Cache struct {
	Body         json.RawMessage `json:"body,omitempty"`
	ETag         string          `json:"etag,omitempty"`
	LastModified string          `json:"last_modified,omitempty"`
	CacheControl string          `json:"cache_control,omitempty"`
	CheckedAt    time.Time       `json:"checked_at,omitempty"` // upstream claim, not local HTTP request time
	ExpiresAt    time.Time       `json:"expires_at,omitempty"`
	NextFetchAt  time.Time       `json:"next_fetch_at,omitempty"` // per-resource Cache-Control; NOT the host limiter
}
type State struct {
	NextAllowedAt time.Time        `json:"next_allowed_at,omitempty"`
	Cache         map[string]Cache `json:"cache,omitempty"`
}
type Result struct {
	Name        string `json:"name"`
	Status      string `json:"status"` // ok, stale, invalid, rate_limited, unavailable
	Error       string `json:"error,omitempty"`
	HTTPStatus  int    `json:"http_status,omitempty"`
	DurationMS  int64  `json:"duration_ms"`
	Cache       Cache  `json:"-"`
	NotModified bool   `json:"not_modified,omitempty"`
	FromCache   bool   `json:"from_cache,omitempty"`
}
type Collector struct {
	HTTP *http.Client
	Now  func() time.Time
	Wait func(context.Context, time.Duration) error
	// BaseURL may be overridden ONLY for an explicit loopback httptest server.
	BaseURL       string
	AllowTestHTTP bool
}

func (c Collector) now() time.Time {
	if c.Now != nil {
		return c.Now().UTC()
	}
	return time.Now().UTC()
}
func (c Collector) wait(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	if c.Wait != nil {
		return c.Wait(ctx, d)
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (c Collector) base() (string, error) {
	if c.BaseURL == "" {
		return SourceURL, nil
	}
	if !c.AllowTestHTTP {
		return "", errors.New("upstream override forbidden")
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || u == nil || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" || u.Host == "" {
		return "", errors.New("invalid upstream override")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", errors.New("invalid upstream scheme")
	}
	host := strings.ToLower(u.Hostname())
	if host != "127.0.0.1" && host != "localhost" && host != "::1" {
		return "", errors.New("non-loopback override denied")
	}
	return strings.TrimRight(c.BaseURL, "/") + "/", nil
}
func (c Collector) client() *http.Client {
	cl := c.HTTP
	if cl == nil {
		cl = &http.Client{Timeout: 12 * time.Second}
	}
	clone := *cl
	clone.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return errors.New("upstream redirect forbidden") }
	return &clone
}
func parseTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, errors.New("timestamp missing")
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil || t.Year() < 2020 {
		return time.Time{}, errors.New("timestamp invalid")
	}
	return t.UTC(), nil
}
func obj(raw json.RawMessage) map[string]json.RawMessage {
	var x map[string]json.RawMessage
	if json.Unmarshal(raw, &x) != nil {
		return nil
	}
	return x
}
func timeField(x map[string]json.RawMessage, key string) (time.Time, error) {
	var v string
	if x == nil || json.Unmarshal(x[key], &v) != nil {
		return time.Time{}, fmt.Errorf("%s missing", key)
	}
	return parseTime(v)
}
func required(x map[string]json.RawMessage, key string) bool {
	v, ok := x[key]
	return ok && len(v) > 0 && !bytes.Equal(bytes.TrimSpace(v), []byte("null"))
}
func arrayField(x map[string]json.RawMessage, key string) ([]json.RawMessage, bool) {
	var a []json.RawMessage
	err := json.Unmarshal(x[key], &a)
	return a, err == nil && a != nil
}

// ValidatePayload reads only documented minimum fields; raw evidence is retained verbatim.
func ValidatePayload(name string, body []byte) (time.Time, bool, error) {
	x := obj(body)
	if x == nil {
		return time.Time{}, false, errors.New("JSON object required")
	}
	key := ""
	switch name {
	case "forecast":
		key = "updated_at"
		var p map[string]float64
		_ = json.Unmarshal(x["probabilities"], &p)
		var confidence string
		_ = json.Unmarshal(x["confidence"], &confidence)
		if _, ok := p["rounded_24h"]; !ok {
			return time.Time{}, false, errors.New("missing 24h probability")
		}
		if _, ok := p["rounded_48h"]; !ok {
			return time.Time{}, false, errors.New("missing 48h probability")
		}
		if len(p) == 0 || p["rounded_24h"] < 0 || p["rounded_24h"] > 100 || p["rounded_48h"] < 0 || p["rounded_48h"] > 100 || confidence == "" || !required(x, "official_signal") && x["official_signal"] == nil {
			return time.Time{}, false, errors.New("invalid forecast fields")
		}
		if raw := x["last_reset_at"]; len(raw) > 0 && !bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			var v string
			if json.Unmarshal(raw, &v) != nil {
				return time.Time{}, false, errors.New("invalid last_reset_at")
			}
			if _, err := parseTime(v); err != nil {
				return time.Time{}, false, err
			}
		}
	case "timeline":
		key = "updated_at"
		items, ok := arrayField(x, "events")
		if !ok {
			return time.Time{}, false, errors.New("invalid timeline events")
		}
		for _, raw := range items {
			e := obj(raw)
			var id, group, state, typ, summary string
			_ = json.Unmarshal(e["id"], &id)
			_ = json.Unmarshal(e["group"], &group)
			_ = json.Unmarshal(e["announcement_state"], &state)
			_ = json.Unmarshal(e["type"], &typ)
			_ = json.Unmarshal(e["summary"], &summary)
			if id == "" || group == "" || state == "" || typ == "" || e["summary"] == nil {
				return time.Time{}, false, errors.New("invalid timeline event")
			}
			if _, err := timeField(e, "announced_at"); err != nil {
				return time.Time{}, false, err
			}
		}
	case "feed":
		key = "fetched_at"
		tweets, ok := arrayField(x, "tweets")
		if !ok {
			return time.Time{}, false, errors.New("invalid feed tweets")
		}
		if _, ok = arrayField(x, "events"); !ok || x["signal"] == nil {
			return time.Time{}, false, errors.New("invalid feed events/signal")
		}
		for _, raw := range tweets {
			e := obj(raw)
			var id string
			_ = json.Unmarshal(e["id"], &id)
			if id == "" {
				return time.Time{}, false, errors.New("invalid tweet id")
			}
			if _, err := timeField(e, "at"); err != nil {
				return time.Time{}, false, err
			}
		}
	case "status-history":
		key = "checked_at"
		if obj(x["current"]) == nil || x["compensation_links"] == nil || x["stats"] == nil {
			return time.Time{}, false, errors.New("invalid status payload")
		}
		if _, ok := arrayField(x, "surfaces"); !ok {
			return time.Time{}, false, errors.New("invalid status surfaces")
		}
		if _, ok := arrayField(x, "incidents"); !ok {
			return time.Time{}, false, errors.New("invalid status incidents")
		}
	default:
		return time.Time{}, false, errors.New("unapproved endpoint")
	}
	t, err := timeField(x, key)
	if err != nil {
		return time.Time{}, false, err
	}
	var stale bool
	if raw := x["stale"]; raw != nil {
		if err := json.Unmarshal(raw, &stale); err != nil {
			return time.Time{}, false, errors.New("invalid stale flag")
		}
	}
	return t, stale, nil
}
func retryAfter(v string, now time.Time) time.Time {
	// Respect long Retry-After delays. Do not turn a 2-hour 429 into an
	// optimistic 1-hour retry. Bound pathological input to one month.
	const max = 30 * 24 * time.Hour
	if s, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64); err == nil {
		if s < 60 {
			s = 60
		}
		if s > int64(max/time.Second) {
			s = int64(max / time.Second)
		}
		return now.Add(time.Duration(s) * time.Second)
	}
	if t, err := http.ParseTime(v); err == nil {
		if t.Before(now.Add(MinInterval)) {
			return now.Add(MinInterval)
		}
		if t.After(now.Add(max)) {
			return now.Add(max)
		}
		return t
	}
	return now.Add(MinInterval)
}
func cacheDelay(v string) time.Duration {
	for _, item := range strings.Split(strings.ToLower(v), ",") {
		item = strings.TrimSpace(item)
		if strings.HasPrefix(item, "max-age=") {
			n, err := strconv.ParseInt(strings.TrimSpace(strings.TrimPrefix(item, "max-age=")), 10, 64)
			if err == nil && n > 0 {
				if n > 30*24*3600 {
					n = 30 * 24 * 3600
				}
				return time.Duration(n) * time.Second
			}
		}
	}
	return 0
}
func directive(v, token string) bool {
	for _, part := range strings.Split(strings.ToLower(v), ",") {
		if strings.TrimSpace(part) == token {
			return true
		}
	}
	return false
}
func validateCache(ca Cache, now time.Time) error {
	if len(ca.Body) == 0 {
		return errors.New("no cached body")
	}
	if ca.CheckedAt.IsZero() || ca.CheckedAt.After(now.Add(5*time.Minute)) || now.Sub(ca.CheckedAt) > maxAge {
		return errors.New("published check stale")
	}
	if !ca.ExpiresAt.IsZero() && now.After(ca.ExpiresAt) {
		return errors.New("published copy expired")
	}
	return nil
}

// Poll obeys a single domain-wide 60s lease stored BEFORE every request. It
// never creates valid new facts from a failed or partial four-endpoint round.
func (c Collector) Poll(ctx context.Context, state *State, persist func() error) (map[string]Result, error) {
	if _, err := c.base(); err != nil {
		return nil, err
	}
	if state == nil || persist == nil {
		return nil, errors.New("state and durable writer required")
	}
	if state.Cache == nil {
		state.Cache = map[string]Cache{}
	}
	results := map[string]Result{}
	var first error
	for _, name := range Endpoints {
		if err := ctx.Err(); err != nil {
			return results, err
		}
		result, err := c.get(ctx, name, state, persist)
		results[name] = result
		if err != nil && first == nil {
			first = fmt.Errorf("%s: %w", name, err)
		}
		if result.Status == "rate_limited" {
			break
		} // no further requests on 429
	}
	return results, first
}
func (c Collector) get(ctx context.Context, name string, st *State, persist func() error) (Result, error) {
	base, _ := c.base()
	last := st.Cache[name]
	out := Result{Name: name, Status: "unavailable", Cache: last}
	// Cache-Control controls rereads of THIS resource. Other paths must still
	// be polled in order, one request per minute domain-wide. An unexpired
	// cached copy is safe only while the independent source freshness limit
	// and publisher expiry both remain valid.
	if c.now().Before(last.NextFetchAt) {
		if _, stale, err := ValidatePayload(name, last.Body); err == nil && !stale {
			if err := validateCache(last, c.now()); err == nil {
				out.Status = "ok"
				out.FromCache = true
				return out, nil
			}
		}
		out.Status = "stale"
		out.Error = "cache_control_blocks_fresh_observation"
		return out, errors.New(out.Error)
	}
	for attempt := 0; attempt < 2; attempt++ {
		if d := st.NextAllowedAt.Sub(c.now()); d > 0 {
			if err := c.wait(ctx, d); err != nil {
				out.Error = "wait_cancelled"
				return out, err
			}
		}
		now := c.now()
		st.NextAllowedAt = now.Add(MinInterval)
		if err := persist(); err != nil {
			return out, fmt.Errorf("persist limit before request: %w", err)
		}
		reqCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
		req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, base+"api/"+name, nil)
		if err != nil {
			cancel()
			return out, err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", UserAgent)
		if last.ETag != "" {
			req.Header.Set("If-None-Match", last.ETag)
		}
		if last.LastModified != "" {
			req.Header.Set("If-Modified-Since", last.LastModified)
		}
		res, err := c.client().Do(req)
		out.DurationMS += c.now().Sub(now).Milliseconds()
		if err != nil {
			cancel()
			out.Error = "network"
			if errors.Is(err, context.DeadlineExceeded) {
				out.Error = "timeout"
			} else {
				var ne net.Error
				if errors.As(err, &ne) && ne.Timeout() {
					out.Error = "timeout"
				}
			}
			if attempt == 0 {
				continue
			}
			return out, fmt.Errorf("%s", out.Error)
		}
		out.HTTPStatus = res.StatusCode
		if res.StatusCode == http.StatusNotModified {
			res.Body.Close()
			cancel()
			if len(last.Body) == 0 {
				out.Error = "304_without_cache"
				return out, errors.New(out.Error)
			}
			if _, stale, err := ValidatePayload(name, last.Body); err != nil || stale {
				out.Error = "304_invalid_cache"
				return out, errors.New(out.Error)
			}
			if err := validateCache(last, c.now()); err != nil {
				out.Status = "stale"
				out.Error = err.Error()
				return out, err
			}
			out.Status = "ok"
			out.NotModified = true
			out.Cache = last
			return out, nil
		}
		if res.StatusCode == http.StatusTooManyRequests {
			res.Body.Close()
			cancel()
			out.Status = "rate_limited"
			out.Error = "upstream_429"
			st.NextAllowedAt = retryAfter(res.Header.Get("Retry-After"), c.now())
			if err := persist(); err != nil {
				return out, err
			}
			return out, errors.New(out.Error)
		}
		if res.StatusCode != http.StatusOK {
			res.Body.Close()
			cancel()
			out.Error = fmt.Sprintf("http_%d", res.StatusCode)
			if res.StatusCode >= 500 && attempt == 0 {
				continue
			}
			return out, errors.New(out.Error)
		}
		if ct := res.Header.Get("Content-Type"); !strings.Contains(strings.ToLower(ct), "json") {
			res.Body.Close()
			cancel()
			out.Status = "invalid"
			out.Error = "non_json"
			return out, errors.New(out.Error)
		}
		b, err := io.ReadAll(io.LimitReader(res.Body, maxResponse+1))
		res.Body.Close()
		cancel()
		if err != nil || len(b) > maxResponse {
			out.Status = "invalid"
			out.Error = "read_or_oversized"
			return out, errors.New(out.Error)
		}
		checked, stale, err := ValidatePayload(name, b)
		if err != nil {
			out.Status = "invalid"
			out.Error = "invalid_json_fields"
			return out, err
		}
		if header := res.Header.Get("X-Published-Checked-At"); header != "" {
			checked, err = parseTime(header)
			if err != nil {
				out.Status = "invalid"
				out.Error = "invalid_checked_header"
				return out, err
			}
		}
		expires := time.Time{}
		if header := res.Header.Get("X-Published-Expires-At"); header != "" {
			expires, err = parseTime(header)
			if err != nil {
				out.Status = "invalid"
				out.Error = "invalid_expiry_header"
				return out, err
			}
		}
		if directive(res.Header.Get("Cache-Control"), "no-store") {
			out.Status = "invalid"
			out.Error = "upstream_no_store"
			return out, errors.New(out.Error)
		}
		updated := Cache{Body: append(json.RawMessage(nil), b...), ETag: res.Header.Get("ETag"), LastModified: res.Header.Get("Last-Modified"), CacheControl: res.Header.Get("Cache-Control"), CheckedAt: checked, ExpiresAt: expires}
		updated.NextFetchAt = c.now().Add(cacheDelay(updated.CacheControl))
		if stale {
			out.Status = "stale"
			out.Error = "provider_stale"
			return out, errors.New(out.Error)
		}
		if err := validateCache(updated, c.now()); err != nil {
			out.Status = "stale"
			out.Error = err.Error()
			return out, err
		}
		st.Cache[name] = updated
		// Keep the global host limiter independent of each response's max-age.
		// Otherwise one long forecast TTL can block timeline/feed/status for hours.
		if err := persist(); err != nil {
			return out, fmt.Errorf("persist fetched data: %w", err)
		}
		out.Status = "ok"
		out.Cache = updated
		return out, nil
	}
	return out, errors.New("request failed")
}
