package mcpserver

import (
	"bytes"
	"encoding/json"
	"math/big"
	"strings"
)

// ToolAnnotations are advisory MCP hints, never an authorization boundary.
type ToolAnnotations struct {
	ReadOnlyHint    bool `json:"readOnlyHint"`
	DestructiveHint bool `json:"destructiveHint"`
	IdempotentHint  bool `json:"idempotentHint"`
	OpenWorldHint   bool `json:"openWorldHint"`
}

func validRequestID(raw json.RawMessage) bool {
	var value any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if !json.Valid(raw) || decoder.Decode(&value) != nil {
		return false
	}
	switch value := value.(type) {
	case string:
		return true
	case json.Number:
		// Compare the exponent with the fractional scale without expanding it;
		// IDs such as 1e999999999 must not allocate an enormous big.Rat.
		coefficient, exponent, _ := strings.Cut(strings.ToLower(string(value)), "e")
		if exponent == "" {
			exponent = "0"
		}
		scale := 0
		if dot := strings.IndexByte(coefficient, '.'); dot >= 0 {
			scale = len(coefficient) - dot - 1
		}
		digits := strings.ReplaceAll(strings.TrimPrefix(coefficient, "-"), ".", "")
		trimmed := strings.TrimRight(digits, "0")
		if trimmed == "" {
			return true
		}
		scale -= len(digits) - len(trimmed)
		number, ok := new(big.Int).SetString(exponent, 10)
		return ok && number.Cmp(big.NewInt(int64(scale))) >= 0
	default:
		return false
	}
}

func isJSONObject(raw json.RawMessage) bool {
	return json.Valid(raw) && bytes.HasPrefix(bytes.TrimSpace(raw), []byte("{"))
}

// Keep this allowlist independent of hints: adding a tool cannot implicitly
// enable it for a tunnel. Vision providers, Browser and Recorder are excluded.
func readOnlyTool(name string) bool {
	switch name {
	case "tm_status", "tm_permissions", "tm_list_windows", "tm_get_active_window",
		"tm_list_displays", "tm_wait_for_window", "tm_screenshot":
		return true
	default:
		return false
	}
}

func policyTool(tool Tool, readOnly bool) Tool {
	// Conservative defaults cover UI actions and future tools: callers may
	// mutate arbitrary applications, and replay need not be idempotent.
	annotations := ToolAnnotations{DestructiveHint: true, OpenWorldHint: true}
	switch tool.Name {
	case "tm_status", "tm_permissions", "tm_list_windows", "tm_get_active_window",
		"tm_list_displays", "tm_wait_for_window", "tm_analyze_layout":
		annotations = ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true}
	case "tm_ocr", "tm_detect_ui", "tm_wait_for_text", "tm_find_target":
		annotations = ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: true}
	case "tm_browser_status", "tm_browser_tabs", "tm_browser_observe", "tm_browser_locate",
		"tm_browser_read", "tm_browser_wait", "tm_browser_verify":
		annotations = ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: true}
	case "tm_screenshot", "tm_inspect_desktop", "tm_capture_and_annotate", "tm_annotate_regions":
		// Full-mode callers may overwrite an arbitrary path even with base64 output.
		annotations.OpenWorldHint = false
	default:
		if strings.HasPrefix(tool.Name, "tm_recorder_") {
			// Even status lazily initializes the artifact store.
			annotations.OpenWorldHint = false
		}
	}
	if readOnly && readOnlyTool(tool.Name) {
		// Copy the schema before restricting it, preserving full-mode contracts.
		schema := make(map[string]any, len(tool.InputSchema))
		for key, value := range tool.InputSchema {
			schema[key] = value
		}
		schema["additionalProperties"] = false
		if tool.Name == "tm_screenshot" {
			properties := make(map[string]any)
			for key, value := range schema["properties"].(map[string]any) {
				if key != "path" {
					properties[key] = value
				}
			}
			properties["returnType"] = map[string]any{"type": "string", "enum": []string{"base64", "bytes", "none"}, "default": "base64"}
			schema["properties"] = properties
			tool.Description += "; read-only mode: no output paths; base64 by default (native capture may use temporary files)"
		}
		tool.InputSchema = schema
		annotations = ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true}
	}
	tool.Annotations = &annotations
	return tool
}
