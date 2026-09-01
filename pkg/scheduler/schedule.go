package scheduler

import (
	"fmt"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
)

func ValidateSchedule(scheduleType ScheduleType, expression, timezone string) error {
	location, err := loadLocation(timezone)
	if err != nil {
		return err
	}
	expression = strings.TrimSpace(expression)
	switch scheduleType {
	case ScheduleAt:
		_, err = parseAt(expression, location)
	case ScheduleEvery:
		var interval time.Duration
		interval, err = time.ParseDuration(expression)
		if err == nil && interval < time.Minute {
			err = fmt.Errorf("every interval must be at least one minute")
		}
	case ScheduleCron:
		if len(strings.Fields(expression)) != 5 {
			return fmt.Errorf("cron expression must contain exactly five fields")
		}
		_, err = cron.ParseStandard(expression)
	default:
		return fmt.Errorf("unsupported schedule type %q", scheduleType)
	}
	if err != nil {
		return fmt.Errorf("invalid %s schedule %q: %w", scheduleType, expression, err)
	}
	return nil
}

// NextRun returns the first activation strictly after the supplied time.
// For fixed-delay schedules, callers pass the previous execution finish time.
func NextRun(scheduleType ScheduleType, expression, timezone string, after time.Time) (time.Time, error) {
	location, err := loadLocation(timezone)
	if err != nil {
		return time.Time{}, err
	}
	switch scheduleType {
	case ScheduleAt:
		at, err := parseAt(strings.TrimSpace(expression), location)
		if err != nil {
			return time.Time{}, err
		}
		if !at.After(after) {
			return time.Time{}, nil
		}
		return at.UTC(), nil
	case ScheduleEvery:
		interval, err := time.ParseDuration(strings.TrimSpace(expression))
		if err != nil || interval < time.Minute {
			return time.Time{}, fmt.Errorf("invalid every interval %q", expression)
		}
		return after.Add(interval).UTC(), nil
	case ScheduleCron:
		if len(strings.Fields(expression)) != 5 {
			return time.Time{}, fmt.Errorf("cron expression must contain exactly five fields")
		}
		schedule, err := cron.ParseStandard(expression)
		if err != nil {
			return time.Time{}, err
		}
		return schedule.Next(after.In(location)).UTC(), nil
	default:
		return time.Time{}, fmt.Errorf("unsupported schedule type %q", scheduleType)
	}
}

func atTime(expression, timezone string) (time.Time, error) {
	location, err := loadLocation(timezone)
	if err != nil {
		return time.Time{}, err
	}
	return parseAt(strings.TrimSpace(expression), location)
}

func parseAt(value string, location *time.Location) (time.Time, error) {
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UTC(), nil
	}
	for _, layout := range []string{"2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if parsed, err := time.ParseInLocation(layout, value, location); err == nil {
			return parsed.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("expected RFC3339 or YYYY-MM-DD HH:MM")
}

func loadLocation(name string) (*time.Location, error) {
	name = strings.TrimSpace(name)
	if name == "" || name == "Local" {
		return time.Local, nil
	}
	location, err := time.LoadLocation(name)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone %q: %w", name, err)
	}
	return location, nil
}
