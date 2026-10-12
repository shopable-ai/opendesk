// Package membership owns the LOCAL two-notification premium trial and explicitly
// simulated checkout. Production Pro must be server-signed; this code never charges.
package membership

import (
 "errors"
 "fmt"
 "time"
)
const TrialLimit = 2
type Order struct {
 ID string `json:"id"`
 Status string `json:"status"`
 PaidThrough time.Time `json:"paid_through"`
}
type MockCheckout struct {
 Orders map[string]Order `json:"orders,omitempty"`
 Applied map[string]bool `json:"applied,omitempty"`
 CurrentOrder string `json:"current_order,omitempty"`
}
type State struct {
 PremiumFired map[string]bool `json:"premium_fired,omitempty"`
 LastSeenAt time.Time `json:"last_seen_at,omitempty"`
 Mock MockCheckout `json:"mock,omitempty"`
}
func (s *State) normalize(){
 if s.PremiumFired==nil{s.PremiumFired=map[string]bool{}}
 if s.Mock.Orders==nil{s.Mock.Orders=map[string]Order{}}
 if s.Mock.Applied==nil{s.Mock.Applied=map[string]bool{}}
}
func(s State) Clone()State{
 out:=s
 out.PremiumFired=make(map[string]bool,len(s.PremiumFired))
 for k,v:=range s.PremiumFired{out.PremiumFired[k]=v}
 out.Mock.Orders=make(map[string]Order,len(s.Mock.Orders))
 for k,v:=range s.Mock.Orders{out.Mock.Orders[k]=v}
 out.Mock.Applied=make(map[string]bool,len(s.Mock.Applied))
 for k,v:=range s.Mock.Applied{out.Mock.Applied[k]=v}
 return out
}
func(s *State) trustedNow(now time.Time)time.Time{
 if now.Before(s.LastSeenAt){return s.LastSeenAt}
 s.LastSeenAt=now.UTC()
 return now
}
func(s *State) IsMockPro(now time.Time,demo bool)bool{
 if !demo{return false}
 now=s.trustedNow(now)
 o,ok:=s.Mock.Orders[s.Mock.CurrentOrder]
 return ok && (o.Status=="active" || o.Status=="canceled") && now.Before(o.PaidThrough)
}
func(s State) Remaining()int {
 n:=TrialLimit-len(s.PremiumFired)
 if n<0{return 0}
 return n
}
// Consume is called only for premium plans at delivery. A stable notification ID
// is never charged twice across HTTP refreshes or process restarts.
func(s *State) Consume(id string,now time.Time,demo bool)(allowed bool,trial bool){
 if id==""{return false,false}
 s.normalize()
 if s.PremiumFired[id]{return true,false}
 if s.IsMockPro(now,demo){return true,false}
 s.trustedNow(now)
 if s.Remaining()<=0{return false,false}
 s.PremiumFired[id]=true
 return true,true
}
func(s *State) Status(now time.Time,demo bool)string{
 if s.IsMockPro(now,demo){return "模拟 Pro · 非真实会员"}
 if n:=s.Remaining();n>0 {return fmt.Sprintf("Free · 高级提醒试用剩余 %d 次",n)}
 return "Free · 高级提醒试用已用完，基础时钟与到时提醒继续可用"
}
// ApplyMockEvent accepts synthetic, idempotent webhook-like transitions.
// It deliberately cannot activate a real paid membership or authorize production APIs.
func(s *State) ApplyMockEvent(eventID,orderID,kind string,paidThrough time.Time)error{
 if eventID=="" || orderID=="" || len(eventID)>160 || len(orderID)>160 {return errors.New("invalid mock event/order")}
 s.normalize()
 if s.Mock.Applied[eventID]{return nil}
 o:=s.Mock.Orders[orderID]
 if o.ID==""{o.ID=orderID}
 switch kind {
 case "checkout_completed":
  if paidThrough.IsZero(){return errors.New("missing paid-through timestamp")}
  if o.Status=="refunded" || o.Status=="chargeback"{return errors.New("revoked order cannot reactivate")}
  o.Status="active"
  o.PaidThrough=paidThrough.UTC()
  s.Mock.CurrentOrder=orderID
 case "subscription_canceled":
  if o.Status!="active" && o.Status!="canceled"{return errors.New("no active order to cancel")}
  o.Status="canceled"
 case "subscription_expired":
  if o.Status!="active" && o.Status!="canceled"{return errors.New("no order to expire")}
  o.Status="expired"
 case "refunded","chargeback":
  if o.Status==""{return errors.New("no order to revoke")}
  o.Status=kind
 case "restore":
  if o.Status!="active" && o.Status!="canceled"{return errors.New("no valid order to restore")}
  s.Mock.CurrentOrder=orderID
 default:return errors.New("unrecognized mock checkout transition")
 }
 s.Mock.Orders[orderID]=o
 s.Mock.Applied[eventID]=true
 return nil
}
