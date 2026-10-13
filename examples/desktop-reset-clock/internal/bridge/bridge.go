// Package bridge converts third-party tracker observations to the existing
// OpenDesk Feed and history contracts. It never manufactures official evidence.
package bridge

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/news"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/provider/codexreset"
)

const channelID = "codex-reset-third-party-v1"

type Review struct {
	ID         string    `json:"id"`
	Reason     string    `json:"reason"`
	Source     string    `json:"source"`
	ObservedAt time.Time `json:"observed_at"`
}
type Disk struct {
	Format    int              `json:"format"`
	Provider  codexreset.State `json:"provider"`
	Snapshot  events.Snapshot  `json:"snapshot"`
	Archive   history.Archive  `json:"archive"`
	Pending   []Review         `json:"pending,omitempty"`
	LastError string           `json:"last_error,omitempty"`
}
type Engine struct {
	mu        sync.RWMutex
	pollMu    sync.Mutex
	disk      Disk
	path      string
	collector codexreset.Collector
	now       func() time.Time
}

func (e *Engine) currentTime() time.Time {
	if e.now != nil {
		return e.now().UTC()
	}
	return time.Now().UTC()
}

// New rejects corrupted saved state. Silently discarding corruption would lose
// revisions and might re-issue old notifications or bypass upstream rate limits.
func New(path string, collector codexreset.Collector, now func() time.Time) (*Engine, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("state path required")
	}
	e := &Engine{path: path, collector: collector, now: now}
	data, err := os.ReadFile(path)
	switch {
	case err == nil:
		if err = json.Unmarshal(data, &e.disk); err != nil {
			return nil, fmt.Errorf("invalid existing state: %w", err)
		}
		if e.disk.Format != 1 {
			return nil, errors.New("unsupported persisted state format")
		}
		if err := e.validateState(); err != nil {
			return nil, fmt.Errorf("persisted state rejected: %w", err)
		}
	case errors.Is(err, os.ErrNotExist):
		t := e.currentTime()
		e.disk = Disk{Format: 1, Provider: codexreset.State{Cache: map[string]codexreset.Cache{}}, Snapshot: events.Snapshot{SchemaVersion: 1, ChannelID: channelID, FeedVersion: 1, GeneratedAt: t, Events: []events.Event{}, DataSourceURL: codexreset.SourceURL, SourceHealth: events.SourceHealth{Status: "unavailable"}}, Archive: history.Archive{ChannelID: channelID, ArchiveVersion: 1, CoverageStart: t.Add(-time.Second), CoverageEnd: t, Complete: false, Records: []history.Record{}}}
	default:
		return nil, err
	}
	return e, nil
}
func (e *Engine) validateState() error {
	d := e.disk
	if d.Snapshot.ChannelID != channelID || d.Archive.ChannelID != channelID {
		return errors.New("unexpected channel")
	}
	if d.Snapshot.HistoryURL != "" || d.Snapshot.HistoryVersion != 0 {
		return errors.New("saved snapshot must not have deployment-specific history URL")
	}
	if err := events.Validate(d.Snapshot); err != nil {
		return err
	}
	return history.ValidateArchive(d.Archive)
}
func writeAtomic(path string, record Disk) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".bridge-*.tmp")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(append(b, '\n'))
	}
	if err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Rename(name, path); err != nil {
		return err
	}
	if d, err := os.Open(filepath.Dir(path)); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}
func (e *Engine) Save() error  { e.mu.RLock(); defer e.mu.RUnlock(); return writeAtomic(e.path, e.disk) }
func (e *Engine) Report() Disk { e.mu.RLock(); defer e.mu.RUnlock(); return e.disk }
func (e *Engine) Poll(ctx context.Context) (map[string]codexreset.Result, error) {
	e.pollMu.Lock()
	defer e.pollMu.Unlock()
	e.mu.RLock()
	p := e.disk.Provider
	e.mu.RUnlock()
	// No aliasing of the cache map into the read-only HTTP snapshot.
	p.Cache = cloneCache(p.Cache)
	persist := func() error {
		e.mu.Lock()
		defer e.mu.Unlock()
		d := e.disk
		d.Provider = p
		if err := writeAtomic(e.path, d); err != nil {
			return err
		}
		e.disk = d
		return nil
	}
	results, pollErr := e.collector.Poll(ctx, &p, persist)
	e.mu.Lock()
	defer e.mu.Unlock()
	next := e.disk
	next.Snapshot.Events = append([]events.Event(nil), next.Snapshot.Events...)
	next.Snapshot.News = append([]news.Item(nil), next.Snapshot.News...)
	next.Archive.Records = append([]history.Record(nil), next.Archive.Records...)
	next.Pending = append([]Review(nil), next.Pending...)
	next.Provider = p
	allOK := true
	for _, name := range codexreset.Endpoints {
		if results[name].Status != "ok" {
			allOK = false
		}
	}
	if !allOK {
		next.Snapshot.SourceHealth.Status = "stale"
		if pollErr != nil {
			next.LastError = pollErr.Error()
		} else {
			next.LastError = "upstream_partial_response"
		}
		// Preserve last source-check clock, events, news and historical records.
		next.Snapshot.GeneratedAt = e.currentTime()
	} else {
		// A 304 reuses a validated cached payload, not a fictional new check time.
		checked := minChecked(p.Cache)
		if checked.IsZero() {
			allOK = false
			next.LastError = "missing_source_clock"
		} else {
			next.Snapshot.SourceHealth = events.SourceHealth{Status: "ok", LastCheckedAt: &checked}
			next.Snapshot.GeneratedAt = e.currentTime()
			next.LastError = ""
			if err := merge(&next, e.currentTime()); err != nil {
				allOK = false
				next.LastError = err.Error()
				next.Snapshot.SourceHealth.Status = "stale"
				pollErr = err
			}
		}
	}
	if err := writeAtomic(e.path, next); err != nil {
		return results, err
	}
	e.disk = next
	if !allOK {
		if pollErr == nil {
			pollErr = errors.New(next.LastError)
		}
		return results, pollErr
	}
	return results, nil
}
func cloneCache(m map[string]codexreset.Cache) map[string]codexreset.Cache {
	c := map[string]codexreset.Cache{}
	for k, v := range m {
		c[k] = v
	}
	return c
}
func minChecked(m map[string]codexreset.Cache) time.Time {
	var oldest time.Time
	for _, n := range codexreset.Endpoints {
		t := m[n].CheckedAt
		if t.IsZero() {
			return time.Time{}
		}
		if oldest.IsZero() || t.Before(oldest) {
			oldest = t
		}
	}
	return oldest
}

type timelineItem struct {
	ID                string `json:"id"`
	Group             string `json:"group"`
	Type              string `json:"type"`
	Summary           string `json:"summary"`
	AnnouncedAt       string `json:"announced_at"`
	AnnouncementState string `json:"announcement_state"`
	URL               string `json:"url"`
}
type tweet struct {
	ID   string `json:"id"`
	At   string `json:"at"`
	Text string `json:"text"`
	URL  string `json:"url"`
}
type incident struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	StartedAt string `json:"started_at"`
	SourceURL string `json:"source_url"`
}

func validURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil && u.Fragment == "" && u.Opaque == ""
}
func safeSummary(v string, max int) string {
	s := strings.Join(strings.Fields(v), " ")
	r := []rune(s)
	if len(r) > max {
		return string(r[:max])
	}
	return s
}
func clock(v string) (time.Time, error) { return time.Parse(time.RFC3339Nano, v) }
func merge(d *Disk, now time.Time) error {
	var timeline struct {
		Events []timelineItem `json:"events"`
	}
	var feed struct {
		Tweets []tweet `json:"tweets"`
	}
	var status struct {
		Incidents []incident `json:"incidents"`
	}
	if err := json.Unmarshal(d.Provider.Cache["timeline"].Body, &timeline); err != nil {
		return err
	}
	if err := json.Unmarshal(d.Provider.Cache["feed"].Body, &feed); err != nil {
		return err
	}
	if err := json.Unmarshal(d.Provider.Cache["status-history"].Body, &status); err != nil {
		return err
	}
	byTweet := map[string]tweet{}
	for _, t := range feed.Tweets {
		if t.ID != "" {
			byTweet[t.ID] = t
		}
	}
	changed := false
	historyChanged := false
	// Track a source's ID, not its calendar day: multiple genuine events per day are possible.
	for _, x := range timeline.Events {
		if x.ID == "" {
			continue
		}
		kind := ""
		typ := ""
		switch {
		case x.Group == "reset" && (x.AnnouncementState == "announced" || x.AnnouncementState == "withdrawn"):
			kind = "third_party_reset"
			typ = "reset_completed"
		case x.Group == "credits":
			kind = "third_party_credits"
			typ = "extra_opportunity"
		default:
			continue
		}
		id := "codex-reset:post:" + x.ID
		at, err := clock(x.AnnouncedAt)
		if err != nil {
			return err
		}
		at = at.UTC()
		if at.After(now.Add(5 * time.Minute)) {
			d.Pending = addReview(d.Pending, Review{id, "future_provider_timestamp", "timeline", now})
			continue
		}
		if !validURL(x.URL) {
			d.Pending = addReview(d.Pending, Review{id, "missing_https_original", "timeline", now})
			continue
		}
		withdrawn := x.AnnouncementState == "withdrawn"
		state := "active"
		if withdrawn {
			state = "withdrawn"
		}
		// No claim of verified_at, effective_at, official provenance or exact completion time.
		summary := safeSummary("第三方追踪 · "+x.Summary, 700)
		ev := events.Event{ID: id, Type: typ, State: state, Audience: "public", SourceType: "third_party", SourceURL: x.URL, Summary: summary}
		rec := history.Record{ID: id, Kind: kind, State: state, SourceType: "third_party", Audience: "public", ProviderReportedAt: &at, SourceURL: x.URL, Summary: summary}
		if t, ok := byTweet[x.ID]; ok && t.URL == x.URL {
			if stamp, err := clock(t.At); err == nil {
				stamp = stamp.UTC()
				rec.SourcePublishedAt = &stamp
				ev.SourcePublishedAt = &stamp
			}
		}
		if evChanged, err := upsertEvent(&d.Snapshot.Events, ev); err != nil {
			return err
		} else if evChanged {
			changed = true
		}
		if recChanged, err := upsertRecord(&d.Archive.Records, rec); err != nil {
			return err
		} else if recChanged {
			historyChanged = true
		}
	}
	for _, x := range status.Incidents {
		if x.ID == "" || !validURL(x.SourceURL) {
			if x.ID != "" {
				d.Pending = addReview(d.Pending, Review{"incident:" + x.ID, "missing_incident_source", "status-history", now})
			}
			continue
		}
		at, err := clock(x.StartedAt)
		if err != nil {
			d.Pending = addReview(d.Pending, Review{"incident:" + x.ID, "missing_started_at", "status-history", now})
			continue
		}
		at = at.UTC()
		if at.After(now.Add(5 * time.Minute)) {
			continue
		}
		rec := history.Record{ID: "codex-reset:incident:" + x.ID, Kind: "service_incident", State: "active", SourceType: "third_party", Audience: "public", ProviderReportedAt: &at, SourceURL: x.SourceURL, Summary: safeSummary("服务状态 · "+x.Name+" · "+x.Status, 700)}
		if yes, err := upsertRecord(&d.Archive.Records, rec); err != nil {
			return err
		} else if yes {
			historyChanged = true
		}
	}
	for _, t := range feed.Tweets {
		if t.ID == "" || !validURL(t.URL) {
			d.Pending = addReview(d.Pending, Review{"tweet:" + t.ID, "missing_https_original", "feed", now})
			continue
		}
		at, err := clock(t.At)
		if err != nil {
			return err
		}
		at = at.UTC()
		if at.After(now.Add(5 * time.Minute)) {
			continue
		}
		kind := "update"
		newsState := "active"
		for _, e := range timeline.Events {
			if e.ID == t.ID {
				if e.Group == "reset" && e.AnnouncementState == "announced" {
					kind = "reset_tracking"
				}
				if e.Group == "credits" {
					kind = "credits_tracking"
				}
				if e.AnnouncementState == "withdrawn" {
					newsState = "withdrawn"
				}
				break
			}
		}
		title := safeSummary(t.Text, 120)
		if title == "" {
			continue
		}
		it := news.Item{ID: "codex-reset:post:" + t.ID, Title: title, Summary: "第三方公开动态，不代表官方重置或个人额度变化", PublishedAt: at, UpdatedAt: at, SourceURL: t.URL, Category: kind, SourceType: "third_party", State: newsState}
		if yes, err := upsertNews(&d.Snapshot.News, it); err != nil {
			return err
		} else if yes {
			changed = true
		}
	}
	if historyChanged {
		d.Archive.ArchiveVersion++
		changed = true
	}
	if changed {
		d.Snapshot.FeedVersion++
	}
	if len(d.Snapshot.Events) > 256 || len(d.Snapshot.News) > 64 || len(d.Archive.Records) > history.MaxPageRecords*12 {
		return errors.New("history/feed capacity reached; refusing untracked truncation")
	}
	if err := history.ValidateArchive(d.Archive); err != nil {
		return err
	}
	if err := events.Validate(d.Snapshot); err != nil {
		return err
	}
	return nil
}
func addReview(items []Review, v Review) []Review {
	for _, x := range items {
		if x.ID == v.ID && x.Reason == v.Reason {
			return items
		}
	}
	if len(items) < 200 {
		return append(items, v)
	}
	return items
}
func upsertEvent(items *[]events.Event, next events.Event) (bool, error) {
	for i, old := range *items {
		if old.ID != next.ID {
			continue
		}
		if old.Type != next.Type || old.SourceType != next.SourceType {
			return false, errors.New("event type/provenance changed for " + old.ID)
		}
		if old.State == "withdrawn" && next.State == "active" {
			return false, nil
		}
		next.Revision = old.Revision
		// Never rewrite known original post-publication timestamps on new revisions.
		next.SourcePublishedAt = old.SourcePublishedAt
		if reflect.DeepEqual(old, next) {
			return false, nil
		}
		next.Revision++
		(*items)[i] = next
		return true, nil
	}
	next.Revision = 1
	*items = append(*items, next)
	return true, nil
}
func upsertRecord(items *[]history.Record, next history.Record) (bool, error) {
	index := -1
	for i, r := range *items {
		if r.ID == next.ID && (index < 0 || r.Revision > (*items)[index].Revision) {
			index = i
		}
	}
	if index >= 0 {
		old := (*items)[index]
		if old.Kind != next.Kind || old.SourceType != next.SourceType {
			return false, errors.New("record kind/provenance changed for " + old.ID)
		}
		if old.State == "withdrawn" && next.State == "active" {
			return false, nil
		}
		next.Revision = old.Revision
		next.SourcePublishedAt = old.SourcePublishedAt
		if reflect.DeepEqual(old, next) {
			return false, nil
		}
		next.Revision++
	} else {
		next.Revision = 1
	}
	*items = append(*items, next)
	return true, nil
}
func upsertNews(items *[]news.Item, next news.Item) (bool, error) {
	for i, old := range *items {
		if old.ID != next.ID {
			continue
		}
		if old.SourceType != next.SourceType {
			return false, errors.New("news provenance changed")
		}
		if old.State == "withdrawn" && next.State == "active" {
			return false, nil
		}
		next.PublishedAt = old.PublishedAt
		next.Revision = old.Revision
		if reflect.DeepEqual(old, next) {
			return false, nil
		}
		next.Revision++
		(*items)[i] = next
		return true, nil
	}
	next.Revision = 1
	*items = append(*items, next)
	return true, nil
}
func (e *Engine) Handler(origin string) (http.Handler, error) {
	parsed, err := url.Parse(origin)
	if err != nil || parsed == nil || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" || parsed.Path != "" || (parsed.Scheme != "https" && !(parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1"))) {
		return nil, errors.New("invalid bridge origin")
	}
	origin = strings.TrimRight(origin, "/")
	mux := http.NewServeMux()
	mux.HandleFunc("/feed", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		e.mu.RLock()
		d := e.disk
		e.mu.RUnlock()
		s := d.Snapshot
		s.HistoryURL = origin + "/archive"
		s.HistoryVersion = d.Archive.ArchiveVersion
		jsonResponse(w, r, s)
	})
	mux.HandleFunc("/archive", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		e.mu.RLock()
		a := e.disk.Archive
		e.mu.RUnlock()
		cursor := r.URL.Query().Get("cursor")
		offset := 0
		if cursor != "" {
			parts := strings.Split(cursor, "-")
			if len(parts) != 2 {
				http.Error(w, "invalid cursor", 400)
				return
			}
			version, err1 := strconv.ParseInt(parts[0], 10, 64)
			n, err2 := strconv.Atoi(parts[1])
			if err1 != nil || err2 != nil || version != a.ArchiveVersion || n <= 0 || n%history.MaxPageRecords != 0 || n > len(a.Records) {
				http.Error(w, "stale/invalid cursor", 400)
				return
			}
			offset = n
		}
		end := offset + history.MaxPageRecords
		if end > len(a.Records) {
			end = len(a.Records)
		}
		records := append([]history.Record{}, a.Records[offset:end]...)
		page := history.Page{SchemaVersion: 1, ChannelID: a.ChannelID, ArchiveVersion: a.ArchiveVersion, CoverageStart: a.CoverageStart, CoverageEnd: a.CoverageEnd, Complete: false, Records: records}
		if end < len(a.Records) {
			page.NextCursor = fmt.Sprintf("%d-%d", a.ArchiveVersion, end)
		}
		jsonResponse(w, r, page)
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		e.mu.RLock()
		d := e.disk
		e.mu.RUnlock()
		if d.Snapshot.SourceHealth.Status != "ok" {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"source_health": d.Snapshot.SourceHealth, "last_error": d.LastError, "data_source_url": codexreset.SourceURL})
	})
	return mux, nil
}
func jsonResponse(w http.ResponseWriter, r *http.Request, p any) {
	b, err := json.Marshal(p)
	if err != nil {
		http.Error(w, "encode", 500)
		return
	}
	hash := sha256.Sum256(b)
	tag := fmt.Sprintf("\"%x\"", hash[:])
	w.Header().Set("ETag", tag)
	w.Header().Set("Cache-Control", "private, max-age=60, must-revalidate")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Data-Source", "https://codex-reset.com/")
	if r.Header.Get("If-None-Match") == tag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	_, _ = w.Write(append(b, '\n'))
}

// Lease prevents multiple independent Bridge processes using the same state
// file. A crash leaves an explicit lock requiring operator inspection.
func Acquire(path string) (func() error, error) {
	lock := path + ".lock"
	if err := os.MkdirAll(filepath.Dir(lock), 0700); err != nil {
		return nil, err
	}
	if err := os.Mkdir(lock, 0700); err != nil {
		return nil, fmt.Errorf("bridge state already locked or unavailable: %w", err)
	}
	return func() error { return os.Remove(lock) }, nil
}

// SortedEvents is for deterministic inspect output, not publication filtering.
func SortedEvents(s events.Snapshot) []events.Event {
	items := append([]events.Event(nil), s.Events...)
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	return items
}