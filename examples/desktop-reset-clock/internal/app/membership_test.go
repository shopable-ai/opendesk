package app

import(
 "context"
 "path/filepath"
 "testing"
 "time"

 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/feed"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/health"
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/reminder"
)
func TestPremiumTrialPersistsWithoutStoppingFreeClock(t *testing.T){
 now:=time.Now().UTC()
 a,e:=New(filepath.Join(t.TempDir(),"state.json"),feed.Client{},func()time.Time{return now})
 if e!=nil{t.Fatal(e)}
 a.DemoSwitch=func(int){}
 a.mu.Lock()
 a.s.Health.LastSourceCheckedAt=health.Ptr(now)
 a.s.Health.LastValidFeedAt=health.Ptr(now)
 a.s.Config.Advance10=true
 a.mu.Unlock()
 for i:=0;i<4;i++ {
  at:=now.Add(-30*time.Second)
  p:=reminder.Plan{Key:"premium-"+string(rune('0'+i)),At:at,Premium:true,Automatic:false}
  a.mu.Lock();a.reminders.Plans[p.Key]=p;a.mu.Unlock()
  a.Tick()
 }
 if got:=a.State().Membership.Remaining();got!=0{t.Fatalf("remaining: %d",got)}
 a.mu.Lock()
 key:="free-final"
 a.reminders.Plans[key]=reminder.Plan{Key:key,At:now.Add(-time.Second),Automatic:false}
 a.mu.Unlock()
 a.Tick()
 if !a.State().Fired[key] {t.Fatal("free reminder stopped after premium trial")}
 again,e:=New(a.file,feed.Client{},func()time.Time{return now})
 if e!=nil || again.State().Membership.Remaining()!=0 {t.Fatalf("restart restores premium trial: %v",e)}
 if again.Display().CardValue=="" {t.Fatal("base clock missing")}
}
func TestPlanPremiumAndAudienceIsolation(t *testing.T){
 now:=time.Now().UTC()
 at:=now.Add(15*time.Minute)
 r:=reminder.New(nil)
 e:=events.Event{ID:"private",Revision:1,Type:"reset_announcement",State:"active",
 Audience:"unknown",VerifiedAt:&now,EffectiveAt:&at,SourceURL:"https://example.org/test"}
 r.SetEvents(events.Snapshot{Events:[]events.Event{e}},now,true)
 if r.Pending()!=0{t.Fatal("unknown audience scheduled")}
 e.Audience="public"
 r.SetEvents(events.Snapshot{Events:[]events.Event{e}},now,true)
 if r.Pending()!=2 {t.Fatalf("expected base and premium plans; got %d",r.Pending())}
 var premium,base int
 for _,p:=range r.Plans {if p.Premium {premium++}else {base++}}
 if premium!=1 || base!=1 {t.Fatal("premium/base flags incorrect")}
 _=context.Background()
}
