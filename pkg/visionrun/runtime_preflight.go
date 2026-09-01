package visionrun

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"opendesk/automation"
)

type RuntimePreflightOptions struct {
	AllowOfflineSourceImage bool
}

type RuntimePreflightResult struct {
	RunID      string
	ReportPath string
	Status     string
	CanProbe   bool
	CanSend    bool
}

type runtimePage interface {
	CheckScreenshotPermissions() map[string]interface{}
}

type runtimeWindowManager interface {
	List() ([]map[string]interface{}, error)
	GetActiveWindow() (*automation.WindowInfo, error)
}

type runtimeVision interface {
	GetCapabilities(options map[string]interface{}) (map[string]interface{}, error)
	RunOCR(options map[string]interface{}) (map[string]interface{}, error)
}

var newRuntimePage = func() runtimePage { return automation.NewPage() }
var newRuntimeWindowManager = func() runtimeWindowManager { return automation.NewWindowManager() }
var newRuntimeVision = func() runtimeVision { return automation.NewVision() }

func RunRuntimePreflight(bundle *Bundle, opts RuntimePreflightOptions) (*RuntimePreflightResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	requirement, _ := readJSONMap(bundle.Requirement)
	targetApp := stringValue(requirement["targetApp"])
	windowHint := stringValue(requirement["windowHint"])
	ocrProvider := stringValue(requirement["ocrProvider"])

	page := newRuntimePage()
	wm := newRuntimeWindowManager()
	vision := newRuntimeVision()

	checks := make([]map[string]any, 0, 5)

	perm := page.CheckScreenshotPermissions()
	permOK, _ := perm["ok"].(bool)
	checks = append(checks, map[string]any{
		"id":       "permissions",
		"required": true,
		"pass":     permOK,
		"detail":   permissionSummary(perm),
		"evidence": perm,
	})

	windowList, windowErr := wm.List()
	windowCount := len(windowList)
	targetMatches := filterWindows(windowList, targetApp, windowHint)
	windowPass := windowErr == nil && (len(targetMatches) > 0 || windowCount > 0)
	checks = append(checks, map[string]any{
		"id":       "window_list",
		"required": true,
		"pass":     windowPass,
		"detail":   windowListSummary(windowCount, len(targetMatches), windowErr),
		"evidence": map[string]any{"windowCount": windowCount, "targetMatches": len(targetMatches)},
	})

	activeWindow, activeErr := wm.GetActiveWindow()
	activePass := activeErr == nil && activeWindow != nil
	activeEvidence := map[string]any{}
	if activeWindow != nil {
		activeEvidence = map[string]any{
			"title":     activeWindow.Title,
			"exeName":   activeWindow.ExeName,
			"processId": activeWindow.ProcessID,
		}
	}
	checks = append(checks, map[string]any{
		"id":       "active_window",
		"required": false,
		"pass":     activePass,
		"detail":   activeWindowSummary(activeWindow, activeErr),
		"evidence": activeEvidence,
	})

	capturePath := filepath.Join(bundle.CaptureDir, "source.png")
	sourceImageReady := fileExists(capturePath)
	checks = append(checks, map[string]any{
		"id":       "source_image",
		"required": false,
		"pass":     sourceImageReady,
		"detail":   fmt.Sprintf("sourceImage=%s exists=%t", artifactPath(bundle.RunID, "capture/source.png"), sourceImageReady),
	})

	ocrReady, ocrEvidence, ocrDetail := runtimeOCRReady(vision, ocrProvider)
	checks = append(checks, map[string]any{
		"id":       "ocr_provider",
		"required": true,
		"pass":     ocrReady,
		"detail":   ocrDetail,
		"evidence": ocrEvidence,
	})

	allowOffline := opts.AllowOfflineSourceImage
	canProbe := permOK && ocrReady && ((windowErr == nil && len(targetMatches) > 0) || (allowOffline && sourceImageReady))
	canSend := permOK && ocrReady && len(targetMatches) > 0 && activePass

	status := "fail"
	switch {
	case canSend:
		status = "pass"
	case canProbe:
		status = "warn"
	}

	report := map[string]any{
		"schemaVersion":           schemaVersion,
		"createdAt":               time.Now().Format(time.RFC3339),
		"runId":                   bundle.RunID,
		"status":                  status,
		"canProbe":                canProbe,
		"canSend":                 canSend,
		"allowOfflineSourceImage": allowOffline,
		"targetApp":               targetApp,
		"windowHint":              windowHint,
		"ocrProvider":             ocrProvider,
		"checks":                  checks,
		"summary":                 runtimePreflightSummary(status, canProbe, canSend, len(targetMatches), sourceImageReady),
	}
	if err := writeJSON(bundle.RuntimePreflight, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "preflight.runtime",
		"status":     status,
		"runId":      bundle.RunID,
		"detail":     report["summary"],
		"reportPath": artifactPath(bundle.RunID, "preflight_runtime.json"),
		"canProbe":   canProbe,
		"canSend":    canSend,
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		payload["runtimePreflight"] = map[string]any{
			"reportPath": artifactPath(bundle.RunID, "preflight_runtime.json"),
			"status":     status,
			"canProbe":   canProbe,
			"canSend":    canSend,
		}
	}); err != nil {
		return nil, err
	}

	return &RuntimePreflightResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "preflight_runtime.json"),
		Status:     status,
		CanProbe:   canProbe,
		CanSend:    canSend,
	}, nil
}

func runtimeOCRReady(vision runtimeVision, providerLabel string) (bool, map[string]any, string) {
	caps, err := vision.GetCapabilities(nil)
	if err != nil {
		return false, map[string]any{}, fmt.Sprintf("ocr capability lookup failed: %v", err)
	}
	providers := arrayOfMaps(caps["providers"])
	choices := splitProviderChoices(providerLabel)
	if len(choices) == 0 {
		choices = []string{stringValue(caps["defaultProvider"])}
	}
	matched := make([]map[string]any, 0)
	for _, choice := range choices {
		for _, item := range providers {
			if normalizeProviderChoice(choice) != normalizeProviderChoice(stringValue(item["provider"])) {
				continue
			}
			matched = append(matched, item)
		}
	}
	if len(matched) == 0 {
		return false, map[string]any{"requested": choices}, fmt.Sprintf("no configured OCR provider matches %q", providerLabel)
	}

	for _, item := range matched {
		implemented, _ := item["implemented"].(bool)
		if !implemented {
			continue
		}
		endpointRequired, _ := item["endpointRequired"].(bool)
		endpointConfigured, _ := item["endpointConfigured"].(bool)
		if endpointRequired && !endpointConfigured {
			continue
		}
		return true, map[string]any{"matchedProvider": item, "requested": choices}, fmt.Sprintf("OCR ready via provider=%s", stringValue(item["provider"]))
	}
	return false, map[string]any{"matchedProviders": matched, "requested": choices}, "OCR providers exist but none are fully ready"
}

func splitProviderChoices(label string) []string {
	label = strings.TrimSpace(label)
	if label == "" {
		return nil
	}
	fields := strings.FieldsFunc(label, func(r rune) bool {
		return r == '|' || r == ',' || r == ';'
	})
	out := make([]string, 0, len(fields))
	for _, field := range fields {
		field = strings.TrimSpace(field)
		if field != "" {
			out = append(out, field)
		}
	}
	return out
}

func normalizeProviderChoice(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func filterWindows(windows []map[string]interface{}, targetApp, windowHint string) []map[string]interface{} {
	if len(windows) == 0 {
		return nil
	}
	tokens := make([]string, 0)
	for _, part := range []string{targetApp, windowHint} {
		for _, token := range strings.FieldsFunc(part, func(r rune) bool { return r == '/' || r == ',' || r == '|' }) {
			token = strings.ToLower(strings.TrimSpace(token))
			if token != "" {
				tokens = append(tokens, token)
			}
		}
	}
	if len(tokens) == 0 {
		return windows
	}
	out := make([]map[string]interface{}, 0)
	for _, item := range windows {
		title := strings.ToLower(stringValue(item["title"]))
		exe := strings.ToLower(stringValue(item["exeName"]))
		for _, token := range tokens {
			if strings.Contains(title, token) || strings.Contains(exe, token) {
				out = append(out, item)
				break
			}
		}
	}
	return out
}

func permissionSummary(perm map[string]interface{}) string {
	screen, _ := perm["screenCapture"].(bool)
	ax, _ := perm["accessibility"].(bool)
	return fmt.Sprintf("screenCapture=%t accessibility=%t", screen, ax)
}

func windowListSummary(windowCount, targetMatches int, err error) string {
	if err != nil {
		return fmt.Sprintf("window listing failed: %v", err)
	}
	return fmt.Sprintf("windowCount=%d targetMatches=%d", windowCount, targetMatches)
}

func activeWindowSummary(info *automation.WindowInfo, err error) string {
	if err != nil {
		return fmt.Sprintf("active window unavailable: %v", err)
	}
	if info == nil {
		return "active window unavailable"
	}
	return fmt.Sprintf("activeWindow=%s exe=%s", info.Title, info.ExeName)
}

func runtimePreflightSummary(status string, canProbe, canSend bool, targetMatches int, sourceImageReady bool) string {
	switch status {
	case "pass":
		return fmt.Sprintf("runtime preflight pass; target window matched=%d and send path may continue under further gates", targetMatches)
	case "warn":
		if sourceImageReady {
			return "runtime preflight warn; offline/source-image probe may continue but send remains blocked"
		}
		return "runtime preflight warn; partial readiness only, probe allowed and send blocked"
	default:
		return "runtime preflight fail; stop before probe/send actions"
	}
}

func readJSONMap(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
