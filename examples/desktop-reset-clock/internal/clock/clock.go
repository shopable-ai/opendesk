package clock

import (
	"fmt"
	"time"
	_ "time/tzdata"
)

// Parts is presentation-only; timestamps remain UTC in the persisted feed.
type Parts struct {
	Time string
	Date string
	Zone string
}

func LocalParts(t time.Time, zone string, h24 bool) (Parts, error) {
	loc := time.Local
	if zone != "" {
		var err error
		loc, err = time.LoadLocation(zone)
		if err != nil {
			return Parts{}, err
		}
	}
	local := t.In(loc)
	clockFormat := "15:04:05"
	if !h24 {
		clockFormat = "03:04:05 PM"
	}
	return Parts{Time: local.Format(clockFormat), Date: local.Format("2006-01-02"), Zone: local.Format("MST")}, nil
}

func Display(t time.Time, zone string, h24 bool) (string, error) {
	p, err := LocalParts(t, zone, h24)
	if err != nil {
		return "", err
	}
	return p.Date + " " + p.Time + " " + p.Zone, nil
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
