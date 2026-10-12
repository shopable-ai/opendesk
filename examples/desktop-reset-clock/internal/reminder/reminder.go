package reminder

import (
	"fmt"
	"sort"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
)

type Plan struct {
	Key       string    `json:"key"`
	At        time.Time `json:"at"`
	Text      string    `json:"text"`
	Automatic bool      `json:"automatic"`
	Premium   bool      `json:"premium,omitempty"`
}

// Engine derives cancellable plans from the newest complete snapshot.
// Fired IDs live in the atomic state file so a restart never replays them.
type Engine struct {
	Plans map[string]Plan
	Fired map[string]bool
}

func New(fired map[string]bool) *Engine {
	if fired == nil {
		fired = map[string]bool{}
	}
	return &Engine{Plans: map[string]Plan{}, Fired: fired}
}
func (e *Engine) SetEvents(s events.Snapshot, now time.Time, advance bool) {
	next := map[string]Plan{}
	for _, ev := range s.Events {
		if ev.Type != "reset_announcement" || ev.State != "active" || ev.EffectiveAt == nil || ev.VerifiedAt == nil || (ev.Audience != "public" && ev.Audience != "all_users") {
			continue
		}
		key := fmt.Sprintf("auto:%s:%d:%d", ev.ID, ev.Revision, ev.EffectiveAt.Unix())
		item := Plan{Key: key + ":at", At: ev.EffectiveAt.UTC(), Text: "官方公告预计重置时间已到（未验证个人额度）", Automatic: true}
		if item.At.After(now) && !e.Fired[item.Key] {
			next[item.Key] = item
		}
		if advance {
			item.Key = key + ":early"
			item.Premium = true
			item.At = ev.EffectiveAt.Add(-10 * time.Minute).UTC()
			item.Text = "官方公告预计时间还有 10 分钟"
			if item.At.After(now) && !e.Fired[item.Key] {
				next[item.Key] = item
			}
		}
	}
	for key, p := range e.Plans {
		if !p.Automatic && p.At.After(now) && !e.Fired[key] {
			next[key] = p
		}
	}
	e.Plans = next
}
func (e *Engine) Manual(now time.Time, after time.Duration) Plan {
	at := now.Add(after).UTC()
	p := Plan{Key: fmt.Sprintf("manual:%d", at.UnixNano()), At: at, Text: "您设置的手动提醒时间已到", Automatic: false}
	e.Plans[p.Key] = p
	return p
}
func (e *Engine) Due(now time.Time, allowAuto, quiet bool) []Plan {
	var due []Plan
	for key, p := range e.Plans {
		if now.Before(p.At) {
			continue
		}
		// Sleep catchup is intentionally bounded: do not replay long-expired notices.
		if now.Sub(p.At) <= 90*time.Second && !quiet && (!p.Automatic || allowAuto) && !e.Fired[key] {
			due = append(due, p)
		}
		e.Fired[key] = true
		delete(e.Plans, key)
	}
	sort.Slice(due, func(i, j int) bool { return due[i].Key < due[j].Key })
	return due
}
func (e *Engine) Pending() int { return len(e.Plans) }
