package clock

import (
	"fmt"
	"time"
	_ "time/tzdata"
)

func Display(t time.Time, zone string, h24 bool) (string, error) {
	loc := time.Local
	if zone != "" {
		var err error
		loc, err = time.LoadLocation(zone)
		if err != nil {
			return "", err
		}
	}
	if h24 {
		return t.In(loc).Format("2006-01-02 15:04:05 MST"), nil
	}
	return t.In(loc).Format("2006-01-02 03:04:05 PM MST"), nil
}
func Countdown(now, target time.Time) string {
	delta := target.Sub(now)
	if delta <= 0 {
		return "已到达公告预计时间（不代表个人额度恢复）"
	}
	seconds := int64((delta + time.Second - 1) / time.Second)
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	minutes := (seconds % 3600) / 60
	secs := seconds % 60
	if days > 0 {
		return fmt.Sprintf("%d天 %02d:%02d:%02d", days, hours, minutes, secs)
	}
	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, secs)
}
