package mock

import (
 "time"

 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/history"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/news"
)

// Synthetic-only news: three separate provenance classes, with a retraction on V3.
func(s *Server) curated(v int)[]news.Item{
 s.mu.Lock()
 created:=s.created
 s.mu.Unlock()
 n:=func(id,title,source string,hours int)news.Item{
  when:=created.Add(-time.Duration(hours)*time.Hour)
  return news.Item{ID:id,Revision:1,Title:title,Summary:"【模拟数据】仅用于测试原始链接与来源分类",
   PublishedAt:when,UpdatedAt:when,SourceURL:"https://example.org/reset-clock-demo/"+id,
   Category:"codex",SourceType:source,State:"active",VerifiedAt:created}
 }
 arr:=[]news.Item{
  n("official-demo","模拟官方公告：重置时间说明","official",2),
  n("third-party-demo","第三方资讯：客户端使用技巧","third_party",5),
  n("editorial-demo","编辑分析：不代表官方或个人额度","editorial",7),
 }
 if v>=2{
  arr[0].Revision=int64(v)
  arr[0].UpdatedAt=created.Add(time.Duration(v)*time.Minute)
  arr[0].Title="模拟公告修订：请核对原文"
 }
 if v>=3{
  arr[2].Revision=int64(v)
  arr[2].State="withdrawn"
  arr[2].UpdatedAt=created.Add(time.Duration(v)*time.Minute)
 }
 return arr
}
func(s *Server) archivePage(v int,cursor string)history.Page{
 s.mu.Lock()
 created:=s.created
 s.mu.Unlock()
 rec:=func(id,kind,source string,ago time.Duration)history.Record{
  at:=created.Add(-ago)
  return history.Record{ID:id,Revision:1,Kind:kind,State:"active",SourceType:source,Audience:"public",
   SourcePublishedAt:&at,ObservedAt:&at,ConfirmedAt:&at,VerifiedAt:&at,
   SourceURL:"https://example.org/reset-clock-demo/history/"+id,Summary:"【模拟数据】虚构的历史案例"}
 }
 r:=[]history.Record{
  rec("announcement-20d","reset_announcement","official",20*24*time.Hour),
  rec("completed-18d","reset_completed","official",18*24*time.Hour),
  rec("gift-8d","extra_opportunity","official",8*24*time.Hour),
  rec("observed-3d","observed_reset","user_observation",3*24*time.Hour),
  rec("old-45d","reset_announcement","official",45*24*time.Hour),
  rec("retracted-5d","reset_announcement","official",5*24*time.Hour),
 }
 w:=r[5];w.Revision=2;w.State="withdrawn";r=append(r,w)
 pub:=created.Add(-72*time.Hour)
 next:=created.Add(40*time.Minute)
 if v>=2{next=created.Add(90*time.Minute)}
 main:=history.Record{ID:"demo-official-history-001",Revision:int64(v),Kind:"reset_announcement",
  State:"active",SourceType:"official",Audience:"all_users",SourcePublishedAt:&pub,EffectiveAt:&next,VerifiedAt:&pub,
  SourceURL:"https://example.org/reset-clock-demo-not-an-official-feed",Summary:"【模拟数据】主事件历史"}
 if v==3{main.State="withdrawn";main.EffectiveAt=nil}
 r=append(r,main)
 page:=history.Page{SchemaVersion:1,ChannelID:"demo-synthetic-announcements",ArchiveVersion:int64(v),
  CoverageStart:created.Add(-65*24*time.Hour),CoverageEnd:created.Add(2*time.Hour),Complete:true}
 if cursor==""{page.Records=r[:4];page.NextCursor="more"}else{page.Records=r[4:]}
 return page
}
