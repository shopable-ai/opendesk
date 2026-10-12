// Package events implements the external JSON snapshot contract. It never scrapes sources.
package events

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"reflect"
	"strings"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/news"
)

type SourceHealth struct {
	Status        string     `json:"status,omitempty"`
	LastCheckedAt *time.Time `json:"last_checked_at,omitempty"`
}
type Event struct {
	ID                string     `json:"id"`
	Revision          int64      `json:"revision"`
	Type              string     `json:"type"`
	State             string     `json:"state"`
	Audience          string     `json:"audience"`
	SourcePublishedAt *time.Time `json:"source_published_at,omitempty"`
	SourceUpdatedAt   *time.Time `json:"source_updated_at,omitempty"`
	EffectiveAt       *time.Time `json:"effective_at"`
	VerifiedAt        *time.Time `json:"verified_at,omitempty"`
	SourceURL         string     `json:"source_url"`
	Summary           string     `json:"summary,omitempty"`
}
type Snapshot struct {
	SchemaVersion int          `json:"schema_version"`
	ChannelID     string       `json:"channel_id"`
	FeedVersion   int64        `json:"feed_version"`
	GeneratedAt   time.Time    `json:"generated_at"`
	SourceHealth  SourceHealth `json:"source_health"`
	Events        []Event      `json:"events"`
	HistoryURL    string       `json:"history_url,omitempty"`
	HistoryVersion int64       `json:"history_version,omitempty"`
	News          []news.Item  `json:"news,omitempty"`
}

func Decode(data []byte) (Snapshot, error) {
	var s Snapshot
	dec := json.NewDecoder(bytes.NewReader(data))
	if err := dec.Decode(&s); err != nil {
		return s, fmt.Errorf("invalid JSON: %w", err)
	}
	var extra any
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		return s, errors.New("extra data after JSON")
	}
	if err := Validate(s); err != nil {
		return s, err
	}
	return s, nil
}

func Validate(s Snapshot) error {
	if s.SchemaVersion != 1 || s.FeedVersion < 1 || strings.TrimSpace(s.ChannelID) == "" || len(s.ChannelID) > 128 || s.GeneratedAt.IsZero() {
		return errors.New("invalid schema/channel/version/generated_at")
	}
	if len(s.Events) > 256 {
		return errors.New("too many events")
	}
	now := time.Now()
	if s.GeneratedAt.After(now.Add(24 * time.Hour)) {
		return errors.New("generated_at in the future")
	}
	if s.SourceHealth.LastCheckedAt != nil && s.SourceHealth.LastCheckedAt.After(now.Add(24*time.Hour)) {
		return errors.New("upstream check timestamp in the future")
	}
	if (s.HistoryURL=="") != (s.HistoryVersion==0) || s.HistoryVersion<0 {
		return errors.New("history_url and positive history_version must appear together")
	}
	if s.HistoryURL!="" {
		u,err:=url.Parse(s.HistoryURL)
		if err!=nil || u==nil || u.Host=="" || u.User!=nil || u.Fragment!="" || u.Opaque!="" ||
			(u.Scheme!="https" && !(u.Scheme=="http" && (u.Hostname()=="localhost" || u.Hostname()=="127.0.0.1" || u.Hostname()=="::1"))) {
			return errors.New("invalid archive URL")
		}
	}
	if err:=news.Validate(s.News);err!=nil{return fmt.Errorf("invalid news: %w",err)}
	ids := map[string]bool{}
	for _, e := range s.Events {
		if e.ID == "" || len(e.ID) > 160 || e.Revision < 1 || ids[e.ID] {
			return fmt.Errorf("invalid or repeated event id: %q", e.ID)
		}
		ids[e.ID] = true
		if !oneOf(e.State, "active", "withdrawn", "superseded") {
			return fmt.Errorf("event %s invalid state", e.ID)
		}
		if !oneOf(e.Type, "reset_announcement", "reset_completed", "extra_opportunity", "policy_change", "multiplier_event") {
			return fmt.Errorf("event %s invalid type", e.ID)
		}
		if e.Audience == "" || len(e.Audience) > 128 || len(e.Summary) > 2048 {
			return fmt.Errorf("event %s invalid audience/summary", e.ID)
		}
		u, err := url.Parse(e.SourceURL)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" {
			return fmt.Errorf("event %s requires HTTPS source_url", e.ID)
		}
		if e.VerifiedAt != nil && e.VerifiedAt.After(now.Add(24*time.Hour)) {
			return fmt.Errorf("event %s invalid verified_at", e.ID)
		}
	}
	return nil
}
func oneOf(s string, vals ...string) bool {
	for _, v := range vals {
		if s == v {
			return true
		}
	}
	return false
}

// Reconcile requires monotonically increasing content revisions. A 200 may only
// refresh generated_at/source_health without changing events at the same version.
// Missing events must be represented explicitly as withdrawn tombstones.
func Reconcile(old *Snapshot, next Snapshot) (changed bool, err error) {
	if old == nil {
		return len(next.Events) > 0, nil
	}
	if next.ChannelID != old.ChannelID {
		return false, errors.New("channel identity changed")
	}
	if next.FeedVersion < old.FeedVersion {
		return false, errors.New("feed version regression")
	}
	previous := map[string]Event{}
	for _, e := range old.Events {
		previous[e.ID] = e
	}
	for _, e := range next.Events {
		if was, ok := previous[e.ID]; ok {
			delete(previous, e.ID)
			if e.Revision < was.Revision {
				return false, fmt.Errorf("event %s revision regression", e.ID)
			}
			if e.Revision == was.Revision && !reflect.DeepEqual(e, was) {
				return false, fmt.Errorf("event %s changed without revision", e.ID)
			}
			if e.Revision != was.Revision {
				changed = true
			}
		} else {
			changed = true
		}
	}
	if len(previous) > 0 {
		return false, errors.New("event disappeared without withdrawn tombstone")
	}
	if next.HistoryVersion<old.HistoryVersion && next.HistoryURL==old.HistoryURL {
		return false,errors.New("archive version regression")
	}
	newsChanged,err:=news.Reconcile(old.News,next.News)
	if err!=nil{return false,err}
	if newsChanged || next.HistoryURL!=old.HistoryURL || next.HistoryVersion!=old.HistoryVersion {
		changed=true
	}
	if next.FeedVersion == old.FeedVersion && changed {
		return false, errors.New("same feed_version with different events")
	}
	return changed, nil
}

// Eligible is deliberately conservative: a public reset prediction does not
// mean a particular user's personal account quota has changed.
func Eligible(e Event, now time.Time, upstreamChecked *time.Time) bool {
	if e.Type != "reset_announcement" || e.State != "active" || (e.Audience != "all_users" && e.Audience != "public") || e.EffectiveAt == nil || !e.EffectiveAt.After(now) || e.VerifiedAt == nil {
		return false
	}
	return upstreamChecked != nil && !upstreamChecked.After(now.Add(time.Minute)) && now.Sub(*upstreamChecked) <= 30*time.Minute
}
