package membership

import(
 "encoding/json"
 "testing"
 "time"
)
func TestTrialStableIDsPersistenceAndClockRollback(t *testing.T){
 now:=time.Date(2026,10,12,10,0,0,0,time.UTC)
 var s State
 for _,key:=range []string{"early:one","early:two"}{
  ok,trial:=s.Consume(key,now,false);if !ok||!trial{t.Fatalf("trial %s",key)}
  ok,trial=s.Consume(key,now.Add(-24*time.Hour),false)
  if !ok || trial{t.Fatalf("duplicate charged: %s",key)}
 }
 if ok,_:=s.Consume("early:three",now.Add(-100*24*time.Hour),false);ok {t.Fatal("clock rollback recreated free trial")}
 if s.Remaining()!=0{t.Fatal("trial remaining was restored")}
 b,_:=json.Marshal(s)
 var r State
 if err:=json.Unmarshal(b,&r);err!=nil{t.Fatal(err)}
 if r.Remaining()!=0 || r.LastSeenAt.Before(now) {t.Fatal("restart restored trial")}
 if got:=r.Status(now,false);got==""{t.Fatal("no Free state")}
}
func TestMockCheckoutOrderTransitionsAndNoProductionPro(t *testing.T){
 now:=time.Now().UTC()
 var s State
 if e:=s.ApplyMockEvent("pay1","order1","checkout_completed",now.Add(30*24*time.Hour));e!=nil{t.Fatal(e)}
 if !s.IsMockPro(now,true) || s.IsMockPro(now,false){t.Fatal("mock grant leaked into production")}
 if e:=s.ApplyMockEvent("pay1","order1","refunded",time.Time{});e!=nil{t.Fatal(e)}
 if !s.IsMockPro(now,true){t.Fatal("idempotent replay changed mock order")}
 if e:=s.ApplyMockEvent("cancel1","order1","subscription_canceled",time.Time{});e!=nil{t.Fatal(e)}
 if !s.IsMockPro(now,true){t.Fatal("canceled should retain paid-through period")}
 if e:=s.ApplyMockEvent("refund1","order1","refunded",time.Time{});e!=nil{t.Fatal(e)}
 if s.IsMockPro(now,true){t.Fatal("refund failed to revoke")}
 if e:=s.ApplyMockEvent("late","order1","checkout_completed",now.Add(60*24*time.Hour));e==nil{t.Fatal("late payment revived refunded order")}
 if e:=s.ApplyMockEvent("pay2","order2","checkout_completed",now.Add(time.Hour));e!=nil{t.Fatal(e)}
 if e:=s.ApplyMockEvent("restore","order2","restore",time.Time{});e!=nil{t.Fatal(e)}
 if !s.IsMockPro(now,true) || s.IsMockPro(now.Add(2*time.Hour),true){t.Fatal("restore or expiry incorrect")}
}
