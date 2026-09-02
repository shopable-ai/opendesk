package scheduler_test

import (
	"testing"
	"time"

	. "opendesk/pkg/scheduler"
)

func TestNextRunAtEveryAndCron(t *testing.T) {
	base := time.Date(2026, 9, 1, 0, 30, 0, 0, time.UTC)

	at, err := NextRun(ScheduleAt, "2026-09-02 09:00", "Asia/Shanghai", base)
	if err != nil {
		t.Fatal(err)
	}
	wantAt := time.Date(2026, 9, 2, 1, 0, 0, 0, time.UTC)
	if !at.Equal(wantAt) {
		t.Fatalf("at=%s want=%s", at, wantAt)
	}

	every, err := NextRun(ScheduleEvery, "5m", "UTC", base)
	if err != nil {
		t.Fatal(err)
	}
	if want := base.Add(5 * time.Minute); !every.Equal(want) {
		t.Fatalf("every=%s want=%s", every, want)
	}

	cronNext, err := NextRun(ScheduleCron, "0 9 * * *", "Asia/Shanghai", base)
	if err != nil {
		t.Fatal(err)
	}
	wantCron := time.Date(2026, 9, 1, 1, 0, 0, 0, time.UTC)
	if !cronNext.Equal(wantCron) {
		t.Fatalf("cron=%s want=%s", cronNext, wantCron)
	}
}

func TestValidateScheduleRejectsNonStandardCronAndInvalidInterval(t *testing.T) {
	if err := ValidateSchedule(ScheduleCron, "0 0 9 * * *", "UTC"); err == nil {
		t.Fatal("six-field cron unexpectedly accepted")
	}
	if err := ValidateSchedule(ScheduleEvery, "0m", "UTC"); err == nil {
		t.Fatal("zero interval unexpectedly accepted")
	}
	if err := ValidateSchedule(ScheduleEvery, "30s", "UTC"); err == nil {
		t.Fatal("sub-minute interval unexpectedly accepted")
	}
}
