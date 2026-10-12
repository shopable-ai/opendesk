package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/clock"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/desktop"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/health"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/reminder"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/settings"
)

type App struct {
	mu         sync.Mutex
	fetchMu    sync.Mutex
	file       string
	s          settings.State
	reminders  *reminder.Engine
	client     feed.Client
	now        func() time.Time
	ui         desktop.UI
	cancel     context.CancelFunc
	failures   int
	DemoSwitch func(int)
	wakeup     chan struct{}
}

func New(file string, c feed.Client, now func() time.Time) (*App, error) {
	if now == nil {
		now = time.Now
	}
	s, err := settings.Load(file)
	if err != nil {
		log.Printf("state cache unavailable: %v; using clean state", err)
		s = settings.Default()
	}
	a := &App{file: file, s: s, client: c, now: now, reminders: reminder.New(s.Fired), wakeup: make(chan struct{}, 1)}
	a.reminders.SetEvents(eventsOrEmpty(s.Snapshot), now(), s.Config.Advance10)
	for _, p := range s.Manual {
		if p.At.After(now()) && !a.reminders.Fired[p.Key] {
			a.reminders.Plans[p.Key] = p
		}
	}
	return a, nil
}
func eventsOrEmpty(s *events.Snapshot) events.Snapshot {
	if s == nil {
		return events.Snapshot{}
	}
	return *s
}
func (a *App) ConfigureFeed(raw string, allowLocal bool) error {
	if err := feed.CheckURL(raw, allowLocal); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if raw != a.s.Config.FeedURL {
		a.s.Snapshot = nil
		a.s.ETag = ""
		a.s.SourceIdentity = ""
		a.s.Health = health.Status{}
		a.reminders.SetEvents(events.Snapshot{}, a.now(), a.s.Config.Advance10)
	}
	a.s.Config.FeedURL = raw
	a.s.Config.AllowLocalHTTP = allowLocal
	a.client.AllowLocalHTTP = allowLocal
	if err := a.saveLocked(); err != nil {
		return err
	}
	select {
	case a.wakeup <- struct{}{}:
	default:
	}
	return nil
}
func (a *App) saveLocked() error {
	a.s.Fired = a.reminders.Fired
	a.s.Manual = nil
	for _, p := range a.reminders.Plans {
		if !p.Automatic {
			a.s.Manual = append(a.s.Manual, p)
		}
	}
	a.s.SavedAt = health.Ptr(a.now())
	return settings.Save(a.file, a.s)
}
func (a *App) State() settings.State { a.mu.Lock(); defer a.mu.Unlock(); return a.s }

// Refresh serializes conditional HTTP fetches; stale in-flight results cannot
// overwrite a subsequently chosen feed URL. Persist-before-publish is mandatory.
func (a *App) Refresh(ctx context.Context) error {
	a.fetchMu.Lock()
	defer a.fetchMu.Unlock()
	a.mu.Lock()
	raw := a.s.Config.FeedURL
	etag := a.s.ETag
	cached := a.s.Snapshot != nil && a.s.SourceIdentity == raw
	allowLocal := a.s.Config.AllowLocalHTTP
	a.mu.Unlock()
	if raw == "" {
		return errors.New("feed URL not configured")
	}
	t := a.now().UTC()
	a.mu.Lock()
	a.s.Health.LastAttemptAt = health.Ptr(t)
	a.mu.Unlock()
	c := a.client
	c.AllowLocalHTTP = allowLocal
	res, err := c.Fetch(ctx, raw, etag, cached)
	a.mu.Lock()
	defer a.mu.Unlock()
	if raw != a.s.Config.FeedURL {
		return errors.New("feed switched during refresh; obsolete response ignored")
	}
	if err != nil {
		var he *feed.HTTPError
		if errors.As(err, &he) && he.Status >= 200 && he.Status < 400 {
			a.s.Health.LastHTTPSuccessAt = health.Ptr(a.now())
		}
		a.failures++
		a.s.Health.LastFailureAt = health.Ptr(a.now())
		a.s.Health.LastError = errorKind(err)
		backoff := time.Duration(1<<uint(min(a.failures, 5))) * 15 * time.Second
		if backoff > 15*time.Minute {
			backoff = 15 * time.Minute
		}
		if e, ok := err.(*feed.HTTPError); ok {
			if e.Kind == "unauthorized" {
				a.s.Health.PausedUnauthorized = true
			}
			if e.Kind == "rate_limited" && e.RetryAt.After(a.now().Add(backoff)) {
				backoff = e.RetryAt.Sub(a.now())
			}
		}
		a.s.Health.NextRetryAt = health.Ptr(a.now().Add(backoff))
		if saveErr := a.saveLocked(); saveErr != nil {
			return fmt.Errorf("%v (state save: %w)", err, saveErr)
		}
		return err
	}
	future := a.s
	future.Health.LastHTTPSuccessAt = health.Ptr(a.now())
	future.Health.LastValidFeedAt = health.Ptr(a.now())
	future.Health.LastError = ""
	future.Health.NextRetryAt = nil
	future.Health.PausedUnauthorized = false
	changed := false
	if !res.NotModified {
		changed, err = events.Reconcile(a.s.Snapshot, res.Snapshot)
		if err != nil {
			// 200 with conflicting version is not a valid feed confirmation.
			a.failures++
			a.s.Health.LastHTTPSuccessAt = health.Ptr(a.now())
			a.s.Health.LastFailureAt = health.Ptr(a.now())
			a.s.Health.LastError = "protocol_conflict"
			a.s.Health.NextRetryAt = health.Ptr(a.now().Add(time.Minute))
			_ = a.saveLocked()
			return err
		}
		future.Snapshot = &res.Snapshot
		future.ETag = res.ETag
		future.SourceIdentity = raw
		// Do not manufacture upstream checking timestamps from HTTP success.
		future.Health.LastSourceCheckedAt = res.Snapshot.SourceHealth.LastCheckedAt
		if changed {
			future.Health.LastEventChangedAt = health.Ptr(a.now())
		}
	}
	// Atomic commit before updating UI and plans; a failed write preserves old state.
	if err := a.savedFrom(future); err != nil {
		return fmt.Errorf("persist validated feed: %w", err)
	}
	a.failures = 0
	a.reminders.SetEvents(eventsOrEmpty(a.s.Snapshot), a.now(), a.s.Config.Advance10)
	return nil
}
func (a *App) savedFrom(future settings.State) error { // called under a.mu
	future.Fired = a.reminders.Fired
	future.Manual = a.s.Manual
	future.SavedAt = health.Ptr(a.now())
	if err := settings.Save(a.file, future); err != nil {
		return err
	}
	a.s = future
	return nil
}
func errorKind(err error) string {
	var h *feed.HTTPError
	if errors.As(err, &h) {
		return h.Kind
	}
	if errors.Is(err, context.Canceled) {
		return "canceled"
	}
	return "invalid_feed_or_protocol"
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (a *App) Tick() {
	a.mu.Lock()
	now := a.now()
	// Staleness and time changes are checked at delivery, not only at schedule creation.
	oldPlans := make(map[string]reminder.Plan, len(a.reminders.Plans))
	for k, v := range a.reminders.Plans {
		oldPlans[k] = v
	}
	oldFired := make(map[string]bool, len(a.reminders.Fired))
	for k, v := range a.reminders.Fired {
		oldFired[k] = v
	}
	due := a.reminders.Due(now, a.s.Health.AllowAuto(now), a.s.Config.Quiet)
	if len(due) > 0 {
		if err := a.saveLocked(); err != nil {
			log.Printf("reminder persistence failed: %v; notifications suppressed", err)
			due = nil
		}
	}
	ui := a.ui
	view := a.displayLocked()
	a.mu.Unlock()
	if ui != nil {
		ui.Update(view)
		for _, p := range due {
			ui.Notify(p.Text)
		}
	}
}
func timeLabel(t *time.Time) string {
	if t == nil {
		return "未知"
	}
	return t.Local().Format("2006-01-02 15:04:05 MST")
}
func (a *App) displayLocked() desktop.Display {
	s := a.s
	now := a.now()
	d := desktop.Display{Demo: a.DemoSwitch != nil, Title: "暂无确定的下一次重置", Summary: "尚无有效官方公告", Health: s.Health.Grade(now), FeedURL: s.Config.FeedURL, Show: s.Config.Show, Locked: s.Config.Locked, Quiet: s.Config.Quiet, Advance10: s.Config.Advance10, X: s.Config.X, Y: s.Config.Y}
	d.Clock, _ = clock.Display(now, s.Config.Zone, s.Config.Clock24)
	d.Diagnostics = fmt.Sprintf("本机请求: %s | 有效数据: %s\n上游检查: %s | 本地发现公告变化: %s\n最后失败: %s (%s)", timeLabel(s.Health.LastAttemptAt), timeLabel(s.Health.LastValidFeedAt), timeLabel(s.Health.LastSourceCheckedAt), timeLabel(s.Health.LastEventChangedAt), timeLabel(s.Health.LastFailureAt), s.Health.LastError)
	if s.Snapshot == nil {
		return d
	}
	var chosen *time.Time
	for _, e := range s.Snapshot.Events {
		if e.State == "withdrawn" {
			if d.Summary == "尚无有效官方公告" {
				d.Summary = "已撤回公告：" + e.Summary
			}
			continue
		}
		if d.Summary == "尚无有效官方公告" {
			d.Summary = e.Summary
			d.SourceURL = e.SourceURL
			d.Published = timeLabel(e.SourcePublishedAt)
		}
		if !events.Eligible(e, now, s.Health.LastSourceCheckedAt) {
			continue
		}
		if chosen != nil && !e.EffectiveAt.Before(*chosen) {
			continue
		}
		d.Title = "官方公告 · 预计重置"
		d.Summary = e.Summary
		d.SourceURL = e.SourceURL
		d.Published = timeLabel(e.SourcePublishedAt)
		d.Effective = timeLabel(e.EffectiveAt)
		d.Countdown = clock.Countdown(now, *e.EffectiveAt)
		chosen = e.EffectiveAt
	}
	return d
}
func (a *App) Display() desktop.Display { a.mu.Lock(); defer a.mu.Unlock(); return a.displayLocked() }

func (a *App) Action(ctx context.Context, action desktop.Action) {
	switch action.Name {
	case "demo_v1", "demo_v2", "demo_v3":
		if a.DemoSwitch != nil {
			var v int
			fmt.Sscanf(action.Name, "demo_v%d", &v)
			a.DemoSwitch(v)
			go a.Action(ctx, desktop.Action{Name: "refresh"})
		}
	case "refresh":
		go func() {
			if err := a.Refresh(ctx); err != nil {
				log.Printf("refresh: %v", err)
			}
			a.Tick()
		}()
	case "quit":
		if a.cancel != nil {
			a.cancel()
		}
	case "url":
		if err := a.ConfigureFeed(strings.TrimSpace(action.Value), strings.HasPrefix(action.Value, "http://")); err != nil {
			log.Printf("feed URL rejected: %v", err)
		} else {
			go a.Action(ctx, desktop.Action{Name: "refresh"})
		}
	default:
		a.mu.Lock()
		switch action.Name {
		case "show":
			a.s.Config.Show = !a.s.Config.Show
		case "lock":
			a.s.Config.Locked = !a.s.Config.Locked
		case "clock":
			a.s.Config.Clock24 = !a.s.Config.Clock24
		case "quiet":
			a.s.Config.Quiet = !a.s.Config.Quiet
		case "advance":
			a.s.Config.Advance10 = !a.s.Config.Advance10
			a.reminders.SetEvents(eventsOrEmpty(a.s.Snapshot), a.now(), a.s.Config.Advance10)
		case "manual":
			a.reminders.Manual(a.now(), 10*time.Minute)
		case "position":
			var x, y int
			if _, err := fmt.Sscanf(action.Value, "%d,%d", &x, &y); err == nil {
				a.s.Config.X = x
				a.s.Config.Y = y
			}
		}
		if err := a.saveLocked(); err != nil {
			log.Printf("save settings: %v", err)
		}
		a.mu.Unlock()
		a.Tick()
	}
}
func (a *App) Run(ctx context.Context, ui desktop.UI) error {
	ctx, cancel := context.WithCancel(ctx)
	a.cancel = cancel
	defer cancel()
	a.mu.Lock()
	a.ui = ui
	a.mu.Unlock()
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		a.Tick()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.Tick()
			}
		}
	}()
	go a.poll(ctx)
	return ui.Run(ctx, func(ac desktop.Action) { a.Action(ctx, ac) })
}
func (a *App) poll(ctx context.Context) {
	for {
		a.mu.Lock()
		paused := a.s.Health.PausedUnauthorized
		raw := a.s.Config.FeedURL
		a.mu.Unlock()
		if raw != "" && !paused {
			if err := a.Refresh(ctx); err != nil && ctx.Err() == nil {
				log.Printf("feed request failed: %v", err)
			}
			a.Tick()
		}
		a.mu.Lock()
		delay := time.Duration(a.s.Config.PollSeconds) * time.Second
		if delay <= 0 {
			delay = 5 * time.Minute
		}
		if a.s.Health.PausedUnauthorized {
			delay = -1
		} else if a.s.Health.LastError != "" && a.s.Health.NextRetryAt != nil {
			delay = a.s.Health.NextRetryAt.Sub(a.now())
			if delay < time.Second {
				delay = time.Second
			}
		}
		a.mu.Unlock()
		if delay < 0 {
			select {
			case <-ctx.Done():
				return
			case <-a.wakeup:
				continue
			}
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return
		case <-a.wakeup:
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
		case <-timer.C:
		}
	}
}
