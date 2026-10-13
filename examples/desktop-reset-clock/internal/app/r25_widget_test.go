package app

import (
    "path/filepath"
    "strings"
    "testing"
    "time"

    "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
    "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
    "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
    "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/news"
)

// R2.5 V1 presentation must never infer a future reset from a historical
// third-party observation. All three active items remain visible offline.
func TestV1ThirdPartyTimelineAndThreeSourceLinkedNews(t *testing.T) {
    now:=time.Date(2026,10,13,12,0,0,0,time.UTC)
    checked:=now.Add(-time.Minute)
    previous:=now.Add(-12*time.Hour)
    a,err:=New(filepath.Join(t.TempDir(),"state.json"),feed.Client{},func()time.Time{return now})
    if err!=nil{t.Fatal(err)}
    source:="https://codex-reset.com/"
    items:=make([]news.Item,0,4)
    for i, title:=range []string{"官方消息来源汇总","第三方重置回顾","新增储备记录","撤回的旧动态"} {
        state:="active"
        if i==3 {state="withdrawn"}
        items=append(items,news.Item{
            ID:string(rune('a'+i)),Revision:1,Title:title,Summary:title,
            PublishedAt:previous,UpdatedAt:previous.Add(time.Duration(i)*time.Minute),
            SourceURL:source,Category:"reset",SourceType:"third_party",State:state,
        })
    }
    a.s.Snapshot=&events.Snapshot{
        SchemaVersion:1,ChannelID:"codex",FeedVersion:1,GeneratedAt:now,
        SourceHealth:events.SourceHealth{Status:"ok",LastCheckedAt:&checked},
        DataSourceURL:source,News:items,HistoryURL:"https://bridge.example/archive",
        HistoryVersion:3,
    }
    a.s.ArchiveSource=a.s.Snapshot.HistoryURL
    a.s.Archive=&history.Archive{
        ChannelID:"codex",ArchiveVersion:3,Complete:false,
        CoverageStart:now.Add(-20*24*time.Hour),CoverageEnd:now,
        Records:[]history.Record{
            {ID:"r1",Kind:"third_party_reset",Revision:1,State:"active",SourceType:"third_party",
              Audience:"all_users",ProviderReportedAt:&previous,SourceURL:source,Summary:"历史全员重置"},
            {ID:"r2",Kind:"third_party_credits",Revision:1,State:"active",SourceType:"third_party",
              Audience:"all_users",ProviderReportedAt:&previous,SourceURL:source,Summary:"储备重置"},
            {ID:"r3",Kind:"service_incident",Revision:1,State:"active",SourceType:"third_party",
              Audience:"all_users",ProviderReportedAt:&previous,SourceURL:source,Summary:"服务故障"},
        },
    }
    a.s.Health.LastSourceCheckedAt=&checked
    a.s.Health.LastValidFeedAt=&checked
    view:=a.Display()
    if view.HasUpcoming||view.Countdown!=""||view.CardValue!="下一次时间待公布" {
        t.Fatalf("tracker history must not create a future reset: %+v",view)
    }
    if !strings.Contains(view.CardMeta,"最近一次第三方重置")||
        !view.HasSourceURL||view.SourceURL!=source||view.DataSourceURL!=source {
        t.Fatalf("latest dated reset and credit are missing: %+v",view)
    }
    if len(view.TickerItems)!=3||view.TickerCached||view.TickerExpanded {
        t.Fatalf("must render exactly three active news rows: %+v",view)
    }
    if len(view.HistoryRows)!=3||len(view.HistoryEvidence)!=3||
        !strings.Contains(view.HistoryRows[1].Kind,"储备重置")||
        !strings.Contains(view.HistoryRows[2].Kind,"服务故障") {
        t.Fatalf("history must separate resets, banked credits and outages: %+v",view)
    }
    if len(view.Stats30)!=4||view.Stats30[0].Value!="数据不足"||
        view.StatsMonth[1].Value!="数据不足" {
        t.Fatalf("incomplete archive cannot publish counts: %+v",view)
    }
    now=now.Add(37*time.Minute)
    cached:=a.Display()
    if !cached.TickerCached||len(cached.TickerItems)!=3||cached.HasUpcoming {
        t.Fatalf("stale status must retain previously verified cache, without new reset: %+v",cached)
    }
}
