package app

import (
 "context"
 "net/http/httptest"
 "path/filepath"
 "strings"
 "testing"
 "time"

 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/mock"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/desktop"
)
func TestR2DemoHistoryNewsAndCorrection(t *testing.T){
 now:=time.Date(2026,10,12,9,0,0,0,time.UTC)
 clock:=func()time.Time{return now}
 mockServer:=mock.New(clock)
 server:=httptest.NewServer(mockServer.Handler())
 defer server.Close()
 a,e:=New(filepath.Join(t.TempDir(),"state.json"),feed.Client{AllowLocalHTTP:true},clock)
 if e!=nil{t.Fatal(e)}
 a.DemoSwitch=mockServer.Set
 if e=a.ConfigureFeed(server.URL+"/feed",true);e!=nil{t.Fatal(e)}
 if e=a.Refresh(context.Background());e!=nil{t.Fatal(e)}
 s:=a.State()
 if s.Archive==nil || !s.Archive.Complete || len(s.Archive.Records)<7 || len(s.Snapshot.News)!=3 || len(a.Display().AllNews)!=3{
  t.Fatalf("incomplete R2 mock state: %+v",s)
 }
 view:=a.Display()
 if !strings.Contains(view.DetailsHistory,"最近 30 天") || len(view.HistoryEvidence)==0 || view.HistoryEvidence[0].URL=="" ||
  view.NewsURLs[0]=="" ||
  !strings.Contains(view.DetailsNews,"来源标注官方") || !strings.Contains(view.MemberStatus,"Free") {
  t.Fatalf("incomplete R2 display: %+v",view)
 }
 mockServer.Set(2)
 if e=a.Refresh(context.Background());e!=nil{t.Fatal(e)}
 if a.State().Archive.ArchiveVersion!=2 || a.State().Snapshot.News[0].Revision!=2{
  t.Fatal("V2 history/news revision not applied")
 }
 mockServer.Set(3)
 if e=a.Refresh(context.Background());e!=nil{t.Fatal(e)}
 if a.State().Archive.ArchiveVersion!=3 || a.State().Snapshot.News[2].State!="withdrawn" ||
 len(a.State().Archive.Records)<7 {
  t.Fatal("V3 retraction absent")
 }
 if strings.Contains(a.Display().DetailsNews,"编辑分析"){t.Fatal("withdrawn news displayed")}
 if len(a.Display().AllNews)!=3 || !strings.Contains(a.Display().AllNews[0].Label,"已撤回") {
  t.Fatal("full news list must retain withdrawn records for audit")
 }
 a.Action(context.Background(),desktop.Action{Name:"mock_pay"})
 if !strings.Contains(a.Display().MemberStatus,"模拟 Pro"){t.Fatal("mock Pro not displayed")}
 if !strings.Contains(a.Display().DetailsHistory,"个人观察"){t.Fatal("Pro history missing observation")}
 var seenObservation bool
 for _,ev:=range a.Display().HistoryEvidence {if strings.Contains(ev.Label,"用户观察"){seenObservation=true}}
 if !seenObservation{t.Fatal("Pro per-observation source inaccessible")}
 a.Action(context.Background(),desktop.Action{Name:"mock_refund"})
 if strings.Contains(a.Display().MemberStatus,"模拟 Pro"){t.Fatal("mock refund didn't revoke Pro")}
}
