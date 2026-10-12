package health

import (
	"testing"
	"time"
)

func TestSourceFreshness(t *testing.T) {
	now := time.Now()
	s := Status{LastValidFeedAt: Ptr(now)}
	if s.AllowAuto(now) || s.Grade(now) != "上游状态未知" {
		t.Fatal("invented upstream check")
	}
	s.LastSourceCheckedAt = Ptr(now.Add(-31 * time.Minute))
	if s.AllowAuto(now) {
		t.Fatal("stale auto")
	}
	if s.Grade(now) != "来源可能过期（停止自动公告提醒）" {
		t.Fatal("wrong grade")
	}
	s.LastSourceCheckedAt = Ptr(now.Add(-5 * time.Minute))
	if !s.AllowAuto(now) {
		t.Fatal("fresh blocked")
	}
	s.PausedUnauthorized = true
	if s.AllowAuto(now) {
		t.Fatal("unauthorized auto")
	}
}
