package recorder

import (
	"regexp"
	"strings"
)

var sensitiveNamePattern = regexp.MustCompile(`(?i)(password|passwd|secret|token|api[_-]?key|authorization|cookie)`)

func RedactArguments(arguments map[string]any, hints []VariableHint) (map[string]any, int64) {
	out := make(map[string]any, len(arguments))
	classifications := make(map[string]string, len(hints))
	for _, hint := range hints {
		classifications[hint.Argument] = strings.ToLower(strings.TrimSpace(hint.Classification))
	}
	var redacted int64
	for key, value := range arguments {
		class := classifications[key]
		if sensitiveNamePattern.MatchString(key) || class == "secret" || class == "redacted" {
			out[key] = "<redacted>"
			redacted++
			continue
		}
		out[key] = cloneJSONValue(value)
	}
	return out, redacted
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			if sensitiveNamePattern.MatchString(key) {
				out[key] = "<redacted>"
			} else {
				out[key] = cloneJSONValue(item)
			}
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for index, item := range typed {
			out[index] = cloneJSONValue(item)
		}
		return out
	default:
		return value
	}
}
