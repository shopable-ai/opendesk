package events

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func sample(t time.Time) Snapshot {
	e := Event{ID: "one", Revision: 1, Type: "reset_announcement", State: "active", Audience: "all_users", EffectiveAt: &t, VerifiedAt: &t, SourceURL: "https://example.org/a"}
	return Snapshot{SchemaVersion: 1, ChannelID: "channel", FeedVersion: 1, GeneratedAt: t, SourceHealth: SourceHealth{LastCheckedAt: &t}, Events: []Event{e}}
}
func TestDecodeAndRevision(t *testing.T) {
	now := time.Now().UTC().Add(-time.Minute)
	a := sample(now)
	b, e := json.Marshal(a)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = Decode(b); e != nil {
		t.Fatal(e)
	}
	for _, raw := range []string{`<html>hello</html>`, string(b) + ` {}`, `{"schema_version":99}`, `{"schema_version":1,"channel_id":"x","feed_version":1,"generated_at":"bad"}`} {
		if _, e = Decode([]byte(raw)); e == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	v2 := a
	v2.Events = append([]Event(nil), a.Events...)
	v2.FeedVersion = 2
	v2.Events[0].Revision = 2
	later := now.Add(time.Hour)
	v2.Events[0].EffectiveAt = &later
	if changed, e := Reconcile(&a, v2); e != nil || !changed {
		t.Fatalf("v2: %v changed %v", e, changed)
	}
	if _, e := Reconcile(&v2, a); e == nil {
		t.Fatal("accepted regression")
	}
	wrong := v2
	wrong.FeedVersion = 2
	wrong.Events = append([]Event(nil), v2.Events...)
	wrong.Events[0].Revision = 3
	if _, e := Reconcile(&v2, wrong); e == nil || !strings.Contains(e.Error(), "same feed_version") {
		t.Fatalf("same version conflict: %v", e)
	}
	removed := v2
	removed.FeedVersion = 3
	removed.Events = nil
	if _, e := Reconcile(&v2, removed); e == nil {
		t.Fatal("missing tombstone accepted")
	}
	withdrawn := v2
	withdrawn.FeedVersion = 3
	withdrawn.Events = append([]Event(nil), v2.Events...)
	withdrawn.Events[0].Revision = 3
	withdrawn.Events[0].State = "withdrawn"
	withdrawn.Events[0].EffectiveAt = nil
	if changed, e := Reconcile(&v2, withdrawn); e != nil || !changed {
		t.Fatalf("withdraw: %v", e)
	}
	if Eligible(withdrawn.Events[0], now, &now) {
		t.Fatal("withdrawn eligible")
	}
}
