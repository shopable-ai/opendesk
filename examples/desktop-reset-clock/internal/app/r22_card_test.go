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

func TestR22LocalTickerPausePersistAndRetraction(t *testing.T) {
 now:=time.Date(2026,10,12,8,30,0,0,time.UTC)
 clock:=func()time.Time{return now}
 mockServer:=mock.New(clock)
 server:=httptest.NewServer(mockServer.Handler())
 defer server.Close()
 path:=filepath.Join(t.TempDir(),"state.json")
 app,err:=New(path,feed.Client{AllowLocalHTTP:true},clock)
 if err!=nil {t.Fatal(err)}
 app.DemoSwitch=mockServer.Set
 if err=app.ConfigureFeed(server.URL+"/feed",true);err!=nil {t.Fatal(err)}
 if err=app.Refresh(context.Background());err!=nil {t.Fatal(err)}
 initial:=app.Display()
 if len(initial.TickerItems)!=3 || initial.TickerIndex!=0 || initial.TickerExpanded {
  t.Fatalf("expected 3 collapsed active items: %+v",initial)
 }
 app.Action(context.Background(),desktop.Action{Name:"ticker_next"})
 if got:=app.Display().TickerIndex;got!=1 {t.Fatalf("manual next: %d",got)}
 app.Action(context.Background(),desktop.Action{Name:"ticker_prev"})
 if got:=app.Display().TickerIndex;got!=0 {t.Fatalf("manual previous: %d",got)}
 now=now.Add(6*time.Second)
 app.Tick()
 if got:=app.Display().TickerIndex;got!=1 {t.Fatalf("6-second rotation: %d",got)}
 app.Action(context.Background(),desktop.Action{Name:"ticker_pause"})
 now=now.Add(30*time.Second)
 app.Tick()
 if got:=app.Display().TickerIndex;got!=1 {t.Fatalf("paused rotation: %d",got)}
 app.Action(context.Background(),desktop.Action{Name:"ticker_resume"})
 app.Action(context.Background(),desktop.Action{Name:"ticker_toggle"})
 if !app.Display().TickerExpanded {t.Fatal("expand action failed")}
 now=now.Add(30*time.Second)
 app.Tick()
 if got:=app.Display().TickerIndex;got!=1 {t.Fatalf("expanded rotation: %d",got)}
 restored,err:=New(path,feed.Client{AllowLocalHTTP:true},clock)
 if err!=nil {t.Fatal(err)}
 if !restored.Display().TickerExpanded {t.Fatal("expanded state lost on restart")}
 app.Action(context.Background(),desktop.Action{Name:"ticker_toggle"})
 mockServer.Set(3)
 if err=app.Refresh(context.Background());err!=nil {t.Fatal(err)}
 after:=app.Display()
 if len(after.TickerItems)!=2 || len(after.AllNews)!=3 {
  t.Fatalf("withdrawn item should leave rotation, remain in audit: %+v",after)
 }
 now=now.Add(36*time.Minute)
 app.Tick()
 stale:=app.Display()
 // Withdrawal remains the primary event state; source staleness is
 // independently visible in Health and must suppress all live ticker items.
 if len(stale.TickerItems)!=0 || stale.HasUpcoming ||
  !strings.Contains(stale.Health,"过期") || stale.StatusKind!="withdrawn" {
   t.Fatalf("stale source promoted actionable information: %+v",stale)
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
  after.CardValue!="预计时间待核验"||len(after.TickerItems)!=0{
  t.Fatalf("source lag must suppress actionable countdown and live news: %+v",after)
 }
}
