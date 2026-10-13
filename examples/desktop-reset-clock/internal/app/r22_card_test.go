package app

import (
 "context"
 "net/http/httptest"
 "path/filepath"
 "strings"
 "testing"
 "time"

 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/desktop"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/mock"
)

func TestR22MinutesPresentation(t *testing.T) {
 now:=time.Date(2026,10,12,8,30,0,0,time.UTC)
 cases:=[]struct{advance time.Duration;want string}{
  {90*time.Minute,"1 小时 30 分"},
  {90*time.Minute+time.Second,"1 小时 31 分"},
  {45*time.Second,"1 分"},
  {26*time.Hour,"1 天 2 小时 0 分"},
  {-time.Second,"预计时间已到"},
 }
 for _,tc:=range cases {
  got:=formatCardRemaining(now,now.Add(tc.advance))
  if got!=tc.want {t.Fatalf("remaining %s: got %q want %q",tc.advance,got,tc.want)}
 }
}

func TestR25AlwaysVisibleThreeHeadlinesAndCachedWithdrawals(t *testing.T) {
 now:=time.Date(2026,10,12,8,30,0,0,time.UTC)
 clock:=func()time.Time{return now}
 mockServer:=mock.New(clock)
 server:=httptest.NewServer(mockServer.Handler())
 defer server.Close()
 path:=filepath.Join(t.TempDir(),"state.json")
 a,err:=New(path,feed.Client{AllowLocalHTTP:true},clock)
 if err!=nil{t.Fatal(err)}
 a.DemoSwitch=mockServer.Set
 if err=a.ConfigureFeed(server.URL+"/feed",true);err!=nil{t.Fatal(err)}
 if err=a.Refresh(context.Background());err!=nil{t.Fatal(err)}
 initial:=a.Display()
 if len(initial.TickerItems)!=3 || initial.TickerCached || initial.TickerExpanded {
  t.Fatalf("three rows must always be visible: %+v",initial)
 }
 a.Action(context.Background(),desktop.Action{Name:"ticker_toggle"})
 if a.Display().TickerExpanded {t.Fatal("old expansion may not alter V1 presentation")}
 now=now.Add(6*time.Second)
 a.Tick()
 if a.Display().TickerIndex!=0 {t.Fatal("V1 must not rotate headlines")}
 restored,err:=New(path,feed.Client{AllowLocalHTTP:true},clock)
 if err!=nil{t.Fatal(err)}
 if restored.Display().TickerExpanded {t.Fatal("obsolete expansion restored in V1")}
 mockServer.Set(3)
 if err=a.Refresh(context.Background());err!=nil{t.Fatal(err)}
 after:=a.Display()
 if len(after.TickerItems)!=2||len(after.AllNews)!=3 {
  t.Fatalf("withdrawn stories must remain only in audit: %+v",after)
 }
 now=now.Add(36*time.Minute)
 stale:=a.Display()
 if len(stale.TickerItems)!=2||!stale.TickerCached||stale.HasUpcoming||
  !strings.Contains(stale.Health,"过期")||stale.StatusKind!="withdrawn" {
  t.Fatalf("source failure must label historical cache: %+v",stale)
 }
}

func TestR22SourceLagSuppressesFutureCountdown(t *testing.T) {
 instant:=time.Date(2026,10,12,8,30,0,0,time.UTC)
 clock:=func()time.Time{return instant}
 server:=httptest.NewServer(mock.New(clock).Handler())
 defer server.Close()
 app,err:=New(filepath.Join(t.TempDir(),"state.json"),feed.Client{AllowLocalHTTP:true},clock)
 if err!=nil{t.Fatal(err)}
 if err=app.ConfigureFeed(server.URL+"/feed",true);err!=nil{t.Fatal(err)}
 if err=app.Refresh(context.Background());err!=nil{t.Fatal(err)}
 if d:=app.Display();!d.HasUpcoming{t.Fatalf("expected healthy future forecast: %+v",d)}
 instant=instant.Add(16*time.Minute)
 after:=app.Display()
 if after.HasUpcoming||after.Countdown!=""||after.StatusKind!="stale"||
  after.CardValue!="下一次时间待公布"||len(after.TickerItems)!=3||!after.TickerCached{
  t.Fatalf("source lag must suppress actionable countdown and live news: %+v",after)
 }
}
