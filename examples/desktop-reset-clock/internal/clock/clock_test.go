package clock

import (
	"strings"
	"testing"
	"time"
)

func TestTZAndCountdown(t *testing.T) {
	a := time.Date(2026, 3, 8, 6, 30, 0, 0, time.UTC)
	b := a.Add(time.Hour)
	before, e := Display(a, "America/New_York", true)
	if e != nil {
		t.Fatal(e)
	}
	after, _ := Display(b, "America/New_York", true)
	if !strings.Contains(before, "01:30") || !strings.Contains(after, "03:30") {
		t.Fatalf("DST gap: %s %s", before, after)
	}
	fallA := time.Date(2026, 11, 1, 5, 30, 0, 0, time.UTC)
	fallB := fallA.Add(time.Hour)
	fst, _ := Display(fallA, "America/New_York", true)
	snd, _ := Display(fallB, "America/New_York", true)
	if !strings.Contains(fst, "01:30") || !strings.Contains(snd, "01:30") || fst == snd {
		t.Fatalf("DST overlap not distinct: %s / %s", fst, snd)
	}
	if Countdown(a, a.Add(2*time.Second)) != "00:00:02" {
		t.Fatal("bad countdown")
	}
	if !strings.HasPrefix(Countdown(a, a.Add(-time.Second)), "已到达") {
		t.Fatal("expired")
	}
}
