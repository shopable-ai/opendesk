package feed

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
)

const maxBytes = 2 << 20

type Client struct {
	HTTP           *http.Client
	AllowLocalHTTP bool
}
type Result struct {
	Snapshot    events.Snapshot
	ETag        string
	NotModified bool
	Status      int
}
type HTTPError struct {
	Kind    string
	Status  int
	RetryAt time.Time
}

func (e *HTTPError) Error() string { return fmt.Sprintf("feed request %s (%d)", e.Kind, e.Status) }

func CheckURL(raw string, local bool) error {
	u, e := url.Parse(raw)
	if e != nil || u == nil || u.Host == "" || u.User != nil || u.Fragment != "" || u.Opaque != "" {
		return errors.New("invalid feed URL")
	}
	if u.Scheme == "https" {
		return nil
	}
	if u.Scheme != "http" || !local {
		return errors.New("production feed requires HTTPS")
	}
	host := strings.ToLower(u.Hostname())
	if host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return errors.New("HTTP demo restricted to loopback")
	}
	return nil
}
func (c Client) Fetch(ctx context.Context, raw, etag string, hasCache bool) (Result, error) {
	if err := CheckURL(raw, c.AllowLocalHTTP); err != nil {
		return Result{}, err
	}
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	clone := *client
	orig, _ := url.Parse(raw)
	clone.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) > 3 || req.URL.Scheme != orig.Scheme || !strings.EqualFold(req.URL.Host, orig.Host) {
			return errors.New("feed cross-origin redirect denied")
		}
		return CheckURL(req.URL.String(), c.AllowLocalHTTP)
	}
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
		if err != nil {
			return Result{}, err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "OpenDesk-Reset-Clock/1")
		if hasCache && attempt == 0 && etag != "" {
			req.Header.Set("If-None-Match", etag)
		}
		res, err := clone.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return Result{}, ctx.Err()
			}
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				return Result{}, &HTTPError{Kind: "timeout"}
			}
			return Result{}, &HTTPError{Kind: "network"}
		}
		if res.StatusCode == http.StatusNotModified {
			res.Body.Close()
			if hasCache {
				return Result{NotModified: true, Status: 304}, nil
			}
			// 304 without a valid same-origin cached snapshot -> retry once without ETag.
			continue
		}
		if res.StatusCode != http.StatusOK {
			res.Body.Close()
			e := &HTTPError{Status: res.StatusCode, Kind: "http_error"}
			switch res.StatusCode {
			case 401, 403:
				e.Kind = "unauthorized"
			case 429:
				e.Kind = "rate_limited"
				e.RetryAt = retryAfter(res.Header.Get("Retry-After"), time.Now())
			default:
				if res.StatusCode >= 500 {
					e.Kind = "server"
				}
			}
			return Result{}, e
		}
		contentType := res.Header.Get("Content-Type")
		if contentType != "" && !strings.Contains(strings.ToLower(contentType), "json") {
			res.Body.Close()
			return Result{}, &HTTPError{Kind: "invalid_content_type", Status: 200}
		}
		b, err := io.ReadAll(io.LimitReader(res.Body, maxBytes+1))
		res.Body.Close()
		if err != nil {
			return Result{}, fmt.Errorf("read feed: %w", err)
		}
		if len(b) > maxBytes {
			return Result{}, &HTTPError{Kind: "oversized", Status: 200}
		}
		snap, err := events.Decode(b)
		if err != nil {
			return Result{}, &HTTPError{Kind: "invalid_feed", Status: 200}
		}
		return Result{Snapshot: snap, ETag: res.Header.Get("ETag"), Status: 200}, nil
	}
	return Result{}, &HTTPError{Kind: "304_without_cache", Status: 304}
}
func retryAfter(raw string, now time.Time) time.Time {
	if n, e := strconv.Atoi(strings.TrimSpace(raw)); e == nil {
		if n < 0 {
			n = 0
		}
		if n > 86400 {
			n = 86400
		}
		return now.Add(time.Duration(n) * time.Second)
	}
	if t, e := http.ParseTime(raw); e == nil {
		if t.Before(now) {
			return now
		}
		if t.After(now.Add(24 * time.Hour)) {
			return now.Add(24 * time.Hour)
		}
		return t
	}
	return now.Add(time.Minute)
}
