package productanalytics

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
)

func eventAllowed(event Event) bool {
	common := map[string]bool{
		"schema_version": true, "event_id": true, "occurred_at": true, "install_id": true,
		"process_id": true, "session_id": true, "app_version": true, "platform": true,
		"arch": true, "environment": true,
	}
	extras := map[string]map[string]bool{
		"app_started":         {},
		"app_session_started": {},
		"screen_viewed":       {"surface": true},
		"ui_action":           {"surface": true, "action_id": true, "input_method": true},
		"flow_run_started":    {"flow_origin": true, "run_source": true, "run_id": true},
		"flow_run_finished":   {"flow_origin": true, "run_source": true, "run_id": true, "outcome": true, "error_code": true, "duration_bucket": true},
	}
	allowed, ok := extras[event.Name]
	if !ok || !validID(event.EventID) || !validID(event.DistinctID) || event.OccurredAt.IsZero() {
		return false
	}
	for key := range event.Properties {
		if !common[key] && !allowed[key] {
			return false
		}
	}
	if intValue(event.Properties["schema_version"]) != SchemaVersion || stringValue(event.Properties["event_id"]) != event.EventID {
		return false
	}
	if stringValue(event.Properties["install_id"]) != event.DistinctID || !validID(stringValue(event.Properties["process_id"])) {
		return false
	}
	if session := stringValue(event.Properties["session_id"]); session != "" && !validID(session) {
		return false
	}
	if _, err := time.Parse(time.RFC3339Nano, stringValue(event.Properties["occurred_at"])); err != nil {
		return false
	}
	if appVersion := stringValue(event.Properties["app_version"]); appVersion == "" || len(appVersion) > 64 {
		return false
	}
	if !allowedPlatforms[stringValue(event.Properties["platform"])] || !allowedArch[stringValue(event.Properties["arch"])] {
		return false
	}
	environment := stringValue(event.Properties["environment"])
	if environment != "production" && environment != "development" && environment != "test" {
		return false
	}
	switch event.Name {
	case "screen_viewed":
		return allowedSurfaces[stringValue(event.Properties["surface"])]
	case "ui_action":
		return allowedSurfaces[stringValue(event.Properties["surface"])] &&
			allowedActions[stringValue(event.Properties["action_id"])] &&
			allowedInputMethods[stringValue(event.Properties["input_method"])]
	case "flow_run_started":
		return allowedFlowOrigins[stringValue(event.Properties["flow_origin"])] &&
			allowedRunSources[stringValue(event.Properties["run_source"])] && validID(stringValue(event.Properties["run_id"]))
	case "flow_run_finished":
		if !allowedFlowOrigins[stringValue(event.Properties["flow_origin"])] || !allowedRunSources[stringValue(event.Properties["run_source"])] || !validID(stringValue(event.Properties["run_id"])) || !allowedOutcomes[stringValue(event.Properties["outcome"])] {
			return false
		}
		if code := stringValue(event.Properties["error_code"]); code != "" && !allowedErrorCodes[code] {
			return false
		}
		bucket := stringValue(event.Properties["duration_bucket"])
		return bucket == "lt_1s" || bucket == "1_5s" || bucket == "5_30s" || bucket == "30s_2m" || bucket == "2_10m" || bucket == "gte_10m"
	default:
		return true
	}
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func (s *Service) rejectLocked(code string) {
	s.dropped++
	s.lastErrorCode = code
}

func randomID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return ""
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	hexValue := hex.EncodeToString(bytes)
	return hexValue[0:8] + "-" + hexValue[8:12] + "-" + hexValue[12:16] + "-" + hexValue[16:20] + "-" + hexValue[20:32]
}

func validID(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return false
	}
	for index, char := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			continue
		}
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
			return false
		}
	}
	return true
}

func normalizePlatform(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "darwin", "macos":
		return "macos"
	case "windows":
		return "windows"
	case "linux":
		return "linux"
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func durationBucket(duration time.Duration) string {
	if duration < 0 {
		duration = 0
	}
	switch {
	case duration < time.Second:
		return "lt_1s"
	case duration < 5*time.Second:
		return "1_5s"
	case duration < 30*time.Second:
		return "5_30s"
	case duration < 2*time.Minute:
		return "30s_2m"
	case duration < 10*time.Minute:
		return "2_10m"
	default:
		return "gte_10m"
	}
}
