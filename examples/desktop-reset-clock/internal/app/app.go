package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/clock"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/catalog"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/desktop"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/health"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/news"
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
	tickerIndex int
	tickerPaused bool
	tickerLast time.Time
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
	a := &App{file: file, s: s, client: c, now: now, reminders: reminder.New(s.Fired), wakeup: make(chan struct{}, 1), tickerLast: now()}
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
		a.s.Archive = nil
		a.s.ArchiveSource = ""
		a.s.ArchiveError = ""
		a.s.Health = health.Status{}
		a.tickerIndex = 0
		a.s.Config.TickerExpanded = false
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
	previousArchive := a.s.Archive
	previousArchiveSource := a.s.ArchiveSource
	previousSnapshot := a.s.Snapshot
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
	var archive *history.Archive
	var archiveErr error
	var archiveSource string
	if err==nil {
		accepted:=res.Snapshot
		if res.NotModified && previousSnapshot!=nil {accepted=*previousSnapshot}
		archiveSource=accepted.HistoryURL
		if archiveSource!="" {
			if previousArchive!=nil && previousArchiveSource==archiveSource &&
			  previousArchive.ArchiveVersion==accepted.HistoryVersion &&
			  previousArchive.ChannelID==accepted.ChannelID {
				archive=previousArchive
			} else {
				var loaded history.Archive
				loaded,archiveErr=c.FetchArchive(ctx,raw,archiveSource,accepted.ChannelID,accepted.HistoryVersion)
				if archiveErr==nil {archive=&loaded}
			}
		}
	}
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
	future.Archive=archive
	future.ArchiveSource=archiveSource
	future.ArchiveError=""
	if archiveErr!=nil {future.ArchiveError="外部历史归档暂不可用"}
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

// Rotating curated headlines is local-only and does not poll the network.
func (a *App) advanceTickerLocked(now time.Time) {
 count:=0
 if a.s.Snapshot!=nil {count=len(news.Top(a.s.Snapshot.News,3))}
 if count<2 {a.tickerIndex=0;a.tickerLast=now;return}
 if a.tickerLast.IsZero()||now.Before(a.tickerLast) {a.tickerLast=now;return}
 if a.tickerPaused||a.s.Config.TickerExpanded {a.tickerLast=now;return}
 if now.Sub(a.tickerLast)>=6*time.Second {
   a.tickerIndex=(a.tickerIndex+1)%count
   a.tickerLast=now
 }
}
// Display-only precision. Scheduling still uses exact source instants.
func formatCardRemaining(now,target time.Time) string {
 left:=target.Sub(now)
 if left<=0{return "预计时间已到"}
 minutes:=int64(left/time.Minute)
 if left%time.Minute>0 {minutes++}
 days:=minutes/(24*60)
 hours:=(minutes%(24*60))/60
 mins:=minutes%60
 if days>0{return fmt.Sprintf("%d 天 %d 小时 %d 分",days,hours,mins)}
 if hours>0{return fmt.Sprintf("%d 小时 %d 分",hours,mins)}
 return fmt.Sprintf("%d 分",minutes)
}
func (a *App) Tick() {
 a.mu.Lock()
 now := a.now()
 a.advanceTickerLocked(now)
	// Staleness and time changes are checked at delivery, not only at schedule creation.
	oldPlans := make(map[string]reminder.Plan, len(a.reminders.Plans))
	for k, v := range a.reminders.Plans {
		oldPlans[k] = v
	}
	oldMembership := a.s.Membership.Clone()
	oldManual := append([]reminder.Plan(nil),a.s.Manual...)
	oldSavedAt := a.s.SavedAt
	oldFired := make(map[string]bool, len(a.reminders.Fired))
	for k, v := range a.reminders.Fired {
		oldFired[k] = v
	}
	due := a.reminders.Due(now, a.s.Health.AllowAuto(now), a.s.Config.Quiet)
	// Suppressed and stale plans are terminal decisions too: persist their IDs.
	if len(a.reminders.Plans)!=len(oldPlans) || len(due)>0 {
		filtered := make([]reminder.Plan,0,len(due))
		for _,p := range due {
			if p.Premium {
				allowed,_ := a.s.Membership.Consume(p.Key,now,a.DemoSwitch!=nil)
				if !allowed {continue}
			}
			filtered=append(filtered,p)
		}
		if err := a.saveLocked(); err != nil {
			log.Printf("reminder persistence failed: %v; notifications suppressed", err)
			a.reminders.Plans=oldPlans
			a.reminders.Fired=oldFired
			a.s.Fired=oldFired
			a.s.Manual=oldManual
			a.s.Membership=oldMembership
			a.s.SavedAt=oldSavedAt
			due=nil
		} else {
			due=filtered
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

// shortDate follows the same user-selected clock zone, never the feed server's.
func shortDate(t *time.Time, zone string) string {
	if t == nil {
		return "未知"
	}
	loc := time.Local
	if zone != "" {
		if v, err := time.LoadLocation(zone); err == nil {
			loc = v
		}
	}
	return t.In(loc).Format("01-02 15:04")
}

// cardText limits untrusted feed summaries in compact native surfaces. The
// complete summary is retained in the validated snapshot and diagnostic view.
func cardText(s string, demo bool) string {
	s = strings.Join(strings.Fields(s), " ")
	if demo {
		s = strings.TrimPrefix(s, "【模拟数据】")
	}
	r := []rune(strings.TrimSpace(s))
	if len(r) > 64 {
		return string(r[:63]) + "…"
	}
	return string(r)
}

func (a *App) displayLocked() desktop.Display {
	s := a.s
	now := a.now()
	parts, err := clock.LocalParts(now, s.Config.Zone, s.Config.Clock24)
	if err != nil {
		parts, _ = clock.LocalParts(now, "", s.Config.Clock24)
	}
	state := s.Health.Grade(now)
	demo := a.DemoSwitch != nil
	d := desktop.Display{
		Demo: demo, LocalTime: parts.Time, LocalDate: parts.Date + " · " + parts.Zone,
		Clock: parts.Date + " " + parts.Time + " " + parts.Zone,
		Title: "暂无确定的下一次重置", Summary: "尚无有效来源公告",
		Badge: "暂无确定公告", StatusKind: "empty", CardHint: "当前公告状态",
		CardValue: "暂无确定的下一次重置", CardSummary: "尚无有效来源公告",
		CardFoot: state, Health: state, FeedURL: s.Config.FeedURL,
		Show: s.Config.Show, Locked: s.Config.Locked, Quiet: s.Config.Quiet,
		Advance10: s.Config.Advance10, Clock24: s.Config.Clock24,
		X: s.Config.X, Y: s.Config.Y,
		LastRequest: shortDate(s.Health.LastAttemptAt, s.Config.Zone),
		LastChecked: shortDate(s.Health.LastSourceCheckedAt, s.Config.Zone),
		LastChanged: shortDate(s.Health.LastEventChangedAt, s.Config.Zone),
	}
	d.Diagnostics = fmt.Sprintf("本机请求: %s | 有效数据: %s\n上游检查: %s | 本地发现公告变化: %s\n最后失败: %s (%s)",
		timeLabel(s.Health.LastAttemptAt), timeLabel(s.Health.LastValidFeedAt),
		timeLabel(s.Health.LastSourceCheckedAt), timeLabel(s.Health.LastEventChangedAt),
		timeLabel(s.Health.LastFailureAt), s.Health.LastError)
	if demo {
		d.Badge = "【模拟数据】暂无确定公告"
	}
	d.MemberStatus=s.Membership.Status(now,demo)
	d.TickerExpanded=s.Config.TickerExpanded
	for i,item:=range catalog.Default() {
		if i>=len(d.ResourceURLs){break}
		d.ResourceURLs[i]=item.URL
		if d.DetailsResources!=""{d.DetailsResources+=" · "}
		d.DetailsResources+=item.Title
	}

	d.DetailsHistory="最近 30 天：数据不足；当前自然月：数据不足。\n未提供可信完整归档，不等于 0 次。"
	d.DetailsNews="暂无精选资讯。请检查来源 Feed。"
 d.DetailsOverviewNews="暂无有效资讯。"
 d.DetailsFullNews="暂无资讯记录。"
 for _,name:=range []string{"来源预告","确认完成","赠送机会","用户观察"} {
   row:=desktop.MetricRow{Name:name,Value:"数据不足",Detail:"归档未完整覆盖统计窗口"}
   d.Stats30=append(d.Stats30,row)
   d.StatsMonth=append(d.StatsMonth,row)
 }
	var loc *time.Location=time.Local
	if s.Config.Zone!="" {if chosen,err:=time.LoadLocation(s.Config.Zone);err==nil{loc=chosen}}
	if s.Archive!=nil && s.Snapshot!=nil && s.Archive.ChannelID==s.Snapshot.ChannelID &&
	   s.Archive.ArchiveVersion==s.Snapshot.HistoryVersion {
		stats:=history.Analyze(s.Archive,now,loc)
		format:=func(w history.Window)string{
			if !s.Membership.IsMockPro(now,demo) {
				return fmt.Sprintf("预告 %s · 确认 %s（Free 摘要）",w.Announcements.Label(),w.Confirmations.Label())
			}
			return fmt.Sprintf("预告 %s · 确认 %s · 赠送 %s · 个人观察 %s",
				w.Announcements.Label(),w.Confirmations.Label(),w.Gifts.Label(),w.Observations.Label())
		}
		d.DetailsHistory="最近 30 天："+format(stats.Last30Days)+"\n当前自然月："+format(stats.CurrentMonth)+
			"\n基于提供方声明的完整归档；尚未独立证明官方身份，个人观察不代表个人额度恢复。"
        // Every displayed count retains clickable record-level evidence.
        // Free shows forecast and completion; mock Pro also shows extra and observation.
        pro:=s.Membership.IsMockPro(now,demo)
        makeMetrics:=func(w history.Window)[]desktop.MetricRow{
          data:=[]struct{name,desc string;m history.Metric}{
            {"来源预告","来源发布，不等于实际完成",w.Announcements},
            {"确认完成","独立完成声明",w.Confirmations},
            {"赠送机会","不能推断所有账号适用",w.Gifts},
            {"用户观察","不等于官方确认",w.Observations},
          }
          rows:=make([]desktop.MetricRow,0,len(data))
          for i,x:=range data {
             value:=x.m.Label()
             if !pro && i>1 {value="未开放"}
             rows=append(rows,desktop.MetricRow{Name:x.name,Value:value,Detail:x.desc})
          }
          return rows
        }
        d.Stats30=makeMetrics(stats.Last30Days)
        d.StatsMonth=makeMetrics(stats.CurrentMonth)
        type namedMetric struct{name string; metric history.Metric}
        add:=func(period string,w history.Window){
          metrics:=[]namedMetric{{"来源标注官方预告",w.Announcements},{"来源标注确认完成",w.Confirmations}}
          if pro {metrics=append(metrics,namedMetric{"赠送机会",w.Gifts},namedMetric{"用户观察",w.Observations})}
          for _,item:=range metrics{
            if !item.metric.Known {continue}
            for _,ev:=range item.metric.Evidence{
              entry:=desktop.SourceEvidence{Label:fmt.Sprintf("%s · %s · %s · 修订 %d",period,item.name,ev.ID,ev.Revision),URL:ev.SourceURL}
              d.HistoryEvidence=append(d.HistoryEvidence,entry)
              if d.HistorySourceURL=="" {d.HistorySourceURL=entry.URL}
            }
          }
        }
        add("最近30天",stats.Last30Days)
        add("当前月",stats.CurrentMonth)
        // Show revisions and tombstones chronologically, even if no longer counted.
        records:=append([]history.Record(nil),s.Archive.Records...)
        recordAt:=func(r history.Record)time.Time{
           if r.SourceUpdatedAt!=nil{return *r.SourceUpdatedAt}
           if r.SourcePublishedAt!=nil{return *r.SourcePublishedAt}
           if r.ObservedAt!=nil{return *r.ObservedAt}
           return time.Time{}
        }
        sort.SliceStable(records,func(i,j int)bool{return recordAt(records[i]).After(recordAt(records[j]))})
        for _,r:=range records{
           if !pro && r.Kind!="reset_announcement" && r.Kind!="reset_completed" {continue}
           if len(d.HistoryRows)>=64 {break}
           kind:=map[string]string{"reset_announcement":"来源预告","reset_completed":"确认完成","extra_opportunity":"赠送机会","observed_reset":"用户观察"}[r.Kind]
           state:=map[string]string{"active":"有效","withdrawn":"已撤回","superseded":"已更正"}[r.State]
           at:=recordAt(r)
           row:=desktop.HistoryRow{When:shortDate(&at,s.Config.Zone),Kind:kind,State:state,
               Title:kind+" · "+state,Summary:cardText(r.Summary,demo),Revision:r.Revision,URL:r.SourceURL}
           d.HistoryRows=append(d.HistoryRows,row)
           d.HistoryEvidence=append(d.HistoryEvidence,desktop.SourceEvidence{
               Label:fmt.Sprintf("%s · %s · 修订 %d",row.When,row.Title,row.Revision),URL:row.URL})
        }
	}
	if s.ArchiveError!="" {d.DetailsHistory+="\n"+s.ArchiveError+"；统计显示数据不足。"}
	if s.Snapshot!=nil {
        var full strings.Builder
		for _,n:=range news.Ordered(s.Snapshot.News) {
			state:=map[string]string{"active":"有效","withdrawn":"已撤回","source_unavailable":"来源失效"}[n.State]
			source:=map[string]string{"official":"来源标注官方","third_party":"第三方","editorial":"编辑分析"}[n.SourceType]
			label:=fmt.Sprintf("%s · %s · %s · 修订 %d",state,source,n.Title,n.Revision)
			link:=n.SourceURL
			if n.State=="source_unavailable"{link=""}
			d.AllNews=append(d.AllNews,desktop.SourceEvidence{Label:cardText(label,demo),URL:link})
            full.WriteString(fmt.Sprintf("%s · %s · 修订 %d · 更新 %s\n%s\n%s\n原始来源：%s\n\n",
             state,source,n.Revision,shortDate(&n.UpdatedAt,s.Config.Zone),n.Title,n.Summary,link))
		}
        if full.Len()>0 {d.DetailsFullNews=strings.TrimSpace(full.String())}
		top:=news.Top(s.Snapshot.News,3)
		if len(top)>0 {d.DetailsNews=""}
		for i,n:=range top {
			typ:=map[string]string{"official":"来源标注官方","third_party":"第三方","editorial":"编辑分析"}[n.SourceType]
			d.DetailsNews+=fmt.Sprintf("%d. %s｜%s\n   %s\n",i+1,typ,cardText(n.Title,demo),shortDate(&n.UpdatedAt,s.Config.Zone))
			d.NewsURLs[i]=n.SourceURL
		}
        if len(top)>0 {d.DetailsOverviewNews=d.DetailsNews}
	}
	if s.Snapshot == nil {
        d.TickerExpanded=false
		if s.Health.LastError != "" {
			d.StatusKind = "error"
			d.Badge = "连接异常 · 未读取有效数据"
		}
		return d
	}
	var chosen *time.Time
	var fallback *events.Event
	var withdrawn *events.Event
	for i := range s.Snapshot.Events {
		e := &s.Snapshot.Events[i]
		if e.State == "withdrawn" {
			if withdrawn == nil || e.Revision > withdrawn.Revision {
				withdrawn = e
			}
			continue
		}
		if fallback == nil {
			fallback = e
		}
		if !events.Eligible(*e, now, s.Health.LastSourceCheckedAt) {
			continue
		}
		if chosen != nil && !e.EffectiveAt.Before(*chosen) {
			continue
		}
		chosen = e.EffectiveAt
		d.Title, d.Summary, d.SourceURL = "来源预告 · 预计重置", e.Summary, e.SourceURL
		d.Published = timeLabel(e.SourcePublishedAt)
		d.Effective = timeLabel(e.EffectiveAt)
		d.Countdown = clock.Countdown(now, *e.EffectiveAt)
		d.HasUpcoming, d.HasSourceURL = true, true
		d.CardHint, d.CardValue = "距离下一次预计重置", formatCardRemaining(now, *e.EffectiveAt)
		d.CardSummary = cardText(e.Summary, demo)
		d.CardMeta = "预计 " + shortDate(e.EffectiveAt, s.Config.Zone) + " · 本地时间"
		d.StatusKind, d.Badge = "active", "来源预告重置"
		if e.Revision > 1 {
			d.StatusKind, d.Badge = "revised", fmt.Sprintf("时间已更正 · 修订 %d", e.Revision)
		}
	}
	if chosen == nil {
		if withdrawn != nil {
			d.Summary, d.SourceURL = withdrawn.Summary, withdrawn.SourceURL
			d.Published, d.HasSourceURL = timeLabel(withdrawn.SourcePublishedAt), true
			d.StatusKind, d.Badge = "withdrawn", "公告已撤回"
			d.CardValue, d.CardSummary = "公告已撤回", cardText(withdrawn.Summary, demo)
			d.CardMeta = "原预计时间已取消 · 不再倒计时"
		} else if fallback != nil {
			d.Summary, d.SourceURL = fallback.Summary, fallback.SourceURL
			d.Published, d.HasSourceURL = timeLabel(fallback.SourcePublishedAt), true
			d.CardSummary = cardText(fallback.Summary, demo)
			d.CardMeta = "发布 " + shortDate(fallback.SourcePublishedAt, s.Config.Zone)
		}
	}
    // Source lag/error invalidates a live actionable forecast, even when an
    // event's original effective_at remains in the future. Audit metadata
    // and HTTPS evidence stay visible in the detail window.
    if chosen!=nil && state!="已检查，无新公告或缓存有效" {
        d.HasUpcoming=false
        d.Countdown=""
        d.CardHint="当前来源状态"
        d.CardValue="预计时间待核验"
        d.CardMeta="上游信息异常，暂不展示可行动的倒计时"
    }
	if state == "来源可能过期（停止自动公告提醒）" || state == "来源严重异常（缓存）" || state == "来源更新延迟" {
		if d.StatusKind != "withdrawn" {
			d.StatusKind, d.Badge = "stale", state
		}
	} else if s.Health.LastError != "" && d.StatusKind != "withdrawn" {
		d.StatusKind = "error"
		if chosen == nil {
			d.Badge = "连接异常 · 缓存数据"
		}
	}
    // Keep withdrawn and unavailable stories in the full audit list, but
    // never promote them (or stale cached headlines) to the active ticker.
    if s.Health.Grade(now)=="已检查，无新公告或缓存有效" {
      for _,item:=range news.Top(s.Snapshot.News,3) {
        source:=map[string]string{"official":"来源标注官方","third_party":"第三方","editorial":"编辑分析"}[item.SourceType]
        d.TickerItems=append(d.TickerItems,desktop.TickerItem{
          ID:item.ID,Title:cardText(item.Title,demo),
          Source:source,Updated:shortDate(&item.UpdatedAt,s.Config.Zone),URL:item.SourceURL,
        })
      }
    }
    if len(d.TickerItems)>0 {d.TickerIndex=a.tickerIndex%len(d.TickerItems)}else {d.TickerExpanded=false}
	if demo {
		d.Badge = "【模拟】" + d.Badge
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
	case "mock_pay", "mock_cancel", "mock_refund", "mock_restore":
		// Explicitly limited to the synthetic Demo. A local flag never grants production Pro.
		if a.DemoSwitch==nil{return}
		a.mu.Lock()
		now:=a.now()
		order:=a.s.Membership.Mock.CurrentOrder
		kind:="restore"
		switch action.Name {
		case "mock_pay":kind="checkout_completed";order=fmt.Sprintf("demo-order-%d",now.UnixNano())
		case "mock_cancel":kind="subscription_canceled"
		case "mock_refund":kind="refunded"
		}
		if order!="" {
			id:=fmt.Sprintf("demo-event-%s-%d",kind,now.UnixNano())
			e:=a.s.Membership.ApplyMockEvent(id,order,kind,now.Add(30*24*time.Hour))
			if e!=nil{log.Printf("mock checkout: %v",e)}else if e=a.saveLocked();e!=nil{log.Printf("mock checkout state save: %v",e)}
		}
		a.mu.Unlock()
		a.Tick()
    case "ticker_pause","ticker_resume","ticker_prev","ticker_next","ticker_toggle":
        a.mu.Lock()
        now:=a.now()
        switch action.Name {
        case "ticker_pause": a.tickerPaused=true
        case "ticker_resume": a.tickerPaused=false;a.tickerLast=now
        case "ticker_toggle":
            a.s.Config.TickerExpanded=!a.s.Config.TickerExpanded
            if err:=a.saveLocked();err!=nil {
                a.s.Config.TickerExpanded=!a.s.Config.TickerExpanded
                log.Printf("ticker expansion save failed: %v",err)
            }
            a.tickerLast=now
        case "ticker_prev","ticker_next":
            count:=0
            if a.s.Snapshot!=nil {count=len(news.Top(a.s.Snapshot.News,3))}
            if count>0 {
                step:=-1
                if action.Name=="ticker_next" {step=1}
                a.tickerIndex=(a.tickerIndex+count+step)%count
            }
            a.tickerLast=now
        }
        a.mu.Unlock()
        a.Tick()
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
