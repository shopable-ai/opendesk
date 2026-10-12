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
 "github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/settings"
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

func TestQuietDecisionPersistedAndWriteFailureRollback(t *testing.T) {
 now:=time.Now().UTC()
 file:=filepath.Join(t.TempDir(),"state.json")
 a,err:=New(file,feed.Client{},func()time.Time{return now})
 if err!=nil{t.Fatal(err)}
 key:="quiet-premium"
 a.mu.Lock()
 a.s.Config.Quiet=true
 a.reminders.Plans[key]=reminder.Plan{Key:key,At:now.Add(-time.Second),Premium:true,Automatic:false}
 a.mu.Unlock()
 a.Tick()
 state,err:=settings.Load(file)
 if err!=nil{t.Fatal(err)}
 if !state.Fired[key] || state.Membership.Remaining()!=2 {
   t.Fatalf("quiet suppression must be durable without charging: %+v",state)
 }
 reopened,err:=New(file,feed.Client{},func()time.Time{return now})
 if err!=nil || reopened.reminders.Pending()!=0 || !reopened.reminders.Fired[key] {
   t.Fatalf("quiet plan replayed on restart: %v",err)
 }
 reopened.file=filepath.Dir(file) // os.Rename(temp, directory) fails.
 reopened.mu.Lock()
 reopened.s.Config.Quiet=false
 failKey:="failed-persist-premium"
 reopened.reminders.Plans[failKey]=reminder.Plan{Key:failKey,At:now.Add(-time.Second),Premium:true}
 reopened.mu.Unlock()
 reopened.Tick()
 if reopened.reminders.Fired[failKey] || reopened.reminders.Plans[failKey].Key!=failKey ||
   reopened.s.Membership.Remaining()!=2 {
    t.Fatal("failed persistent save consumed or lost a premium reminder")
 }
}
