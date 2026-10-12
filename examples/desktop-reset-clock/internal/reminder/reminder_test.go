package reminder

import (
	"github.com/shopable-ai/opendesk/examples/desktop-reset-clock/internal/events"
	"testing"
	"time"
)

func TestRevisionWithdrawAndDedup(t *testing.T) {
	now := time.Now().UTC()
	pub := now.Add(-72 * time.Hour)
	future := now.Add(20 * time.Minute)
	e := events.Event{ID: "same", Revision: 1, Type: "reset_announcement", State: "active", Audience: "all_users", EffectiveAt: &future, VerifiedAt: &pub}
	eng := New(nil)
	s := events.Snapshot{Events: []events.Event{e}}
	eng.SetEvents(s, now, true)
	if eng.Pending() != 2 {
		t.Fatalf("pending=%d", eng.Pending())
	}
	eng.SetEvents(s, now, true)
	if eng.Pending() != 2 {
		t.Fatal("duplicate plans")
	}
	old := eng.Plans
	v2 := s
	v2.Events = append([]events.Event(nil), s.Events...)
	v2.Events[0].Revision = 2
	later := future.Add(time.Hour)
	v2.Events[0].EffectiveAt = &later
	eng.SetEvents(v2, now, true)
	if eng.Pending() != 2 {
		t.Fatal("reschedule failed")
	}
	for k := range old {
		if _, ok := eng.Plans[k]; ok {
			t.Fatal("old plan not cancelled")
		}
	}
	v3 := v2
	v3.Events = append([]events.Event(nil), v2.Events...)
	v3.Events[0].Revision = 3
	v3.Events[0].State = "withdrawn"
	v3.Events[0].EffectiveAt = nil
	eng.SetEvents(v3, now, true)
	if eng.Pending() != 0 {
		t.Fatal("withdrawal left plan")
	}
	eng.SetEvents(s, now.Add(2*time.Hour), true)
	if eng.Pending() != 0 {
		t.Fatal("replayed past history")
	}
	eng.Manual(now, 10*time.Minute)
	if got := eng.Due(now.Add(11*time.Minute), true, false); len(got) != 1 {
		t.Fatalf("manual catchup: %d", len(got))
	}
	if got := eng.Due(now.Add(11*time.Minute), true, false); len(got) != 0 {
		t.Fatal("duplicated")
	}
}
func TestStaleQuietAndNoCatchUp(t *testing.T) {
	n := time.Now()
	eng := New(nil)
	eng.Manual(n, time.Minute)
	if got := eng.Due(n.Add(time.Minute), true, true); len(got) != 0 {
		t.Fatal("quiet notified")
	}
	if got := eng.Due(n.Add(2*time.Minute), true, false); len(got) != 0 {
		t.Fatal("quiet replayed")
	}
	eng.Manual(n, time.Minute)
	if got := eng.Due(n.Add(time.Hour), true, false); len(got) != 0 {
		t.Fatal("long sleep replayed")
	}
}

func TestAutomaticKeysAreScopedByChannel(t *testing.T) {
 now:=time.Now().UTC()
 future:=now.Add(time.Hour)
 ev:=events.Event{ID:"same-id",Revision:1,Type:"reset_announcement",State:"active",
   Audience:"public",EffectiveAt:&future,VerifiedAt:&now,SourceURL:"https://example.org/a"}
 one:=events.Snapshot{ChannelID:"channel-one",Events:[]events.Event{ev}}
 two:=events.Snapshot{ChannelID:"channel-two",Events:[]events.Event{ev}}
 engine:=New(nil)
 engine.SetEvents(one,now,false)
 var original string
 for key:=range engine.Plans{original=key}
 if original==""{t.Fatal("missing original plan")}
 engine.Fired[original]=true
 engine.SetEvents(two,now,false)
 if len(engine.Plans)!=1{t.Fatal("same event ID from different channels was deduplicated")}
 for key:=range engine.Plans{if key==original{t.Fatal("notification key collided across channels")}}
}
