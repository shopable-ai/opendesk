package scheduler

import "strings"

// TriggerType is server-owned run provenance. Clients can choose when a Job
// should run, but they cannot declare how a JobRun was actually claimed.
type TriggerType string

const (
	TriggerUnknown   TriggerType = "unknown"
	TriggerScheduled TriggerType = "scheduled"
	TriggerManual    TriggerType = "manual"
)

func normalizeTriggerType(value TriggerType) TriggerType {
	switch TriggerType(strings.ToLower(strings.TrimSpace(string(value)))) {
	case TriggerScheduled:
		return TriggerScheduled
	case TriggerManual:
		return TriggerManual
	default:
		return TriggerUnknown
	}
}
