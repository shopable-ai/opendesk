package health

import (
	"time"
)

// Status timestamps have independent meanings; a client 304 is not an upstream poll.
type Status struct {
	LastAttemptAt       *time.Time `json:"last_attempt_at,omitempty"`
	LastHTTPSuccessAt   *time.Time `json:"last_http_success_at,omitempty"`
	LastValidFeedAt     *time.Time `json:"last_valid_feed_at,omitempty"`
	LastSourceCheckedAt *time.Time `json:"last_source_checked_at,omitempty"`
	LastEventChangedAt  *time.Time `json:"last_event_changed_at,omitempty"`
	LastFailureAt       *time.Time `json:"last_failure_at,omitempty"`
	LastError           string     `json:"last_error,omitempty"`
	NextRetryAt         *time.Time `json:"next_retry_at,omitempty"`
	PausedUnauthorized  bool       `json:"paused_unauthorized,omitempty"`
}

func Ptr(t time.Time) *time.Time { v := t.UTC(); return &v }
func (s Status) Grade(now time.Time) string {
	if s.PausedUnauthorized {
		return "无权限：已暂停自动请求"
	}
	if s.LastValidFeedAt == nil {
		return "等待有效公告数据"
	}
	if s.LastSourceCheckedAt == nil {
		return "上游状态未知"
	}
	age := now.Sub(*s.LastSourceCheckedAt)
	if age > 60*time.Minute {
		return "来源严重异常（缓存）"
	}
	if age > 30*time.Minute {
		return "来源可能过期（停止自动公告提醒）"
	}
	if age > 15*time.Minute {
		return "来源更新延迟"
	}
	if s.LastError != "" {
		return "连接异常（使用缓存）"
	}
	return "已检查，无新公告或缓存有效"
}
func (s Status) AllowAuto(now time.Time) bool {
	return !s.PausedUnauthorized && s.LastSourceCheckedAt != nil && !s.LastSourceCheckedAt.After(now.Add(time.Minute)) && now.Sub(*s.LastSourceCheckedAt) <= 30*time.Minute && s.LastValidFeedAt != nil
}
