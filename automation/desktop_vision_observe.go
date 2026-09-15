package automation

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const maxDesktopVisionObserveImageBytes = 24 * 1024 * 1024

// Observe is the privacy-gated, non-persisting DesktopVision entrypoint used by
// high-level UI perception. It deliberately does not accept model/provider from
// the UI call surface: deployment configuration selects them through env vars.
// Parse remains the explicit low-level/audited API.
func (v *DesktopVision) Observe(options map[string]interface{}) (map[string]interface{}, error) {
	if strings.TrimSpace(os.Getenv("OPENDESK_UI_CLOUD_VISION")) != "allow" {
		return nil, fmt.Errorf("cloud vision policy does not allow UI perception uploads")
	}
	if options == nil {
		return nil, fmt.Errorf("options are required")
	}
	model := strings.TrimSpace(os.Getenv("DESKTOP_VISION_MODEL"))
	provider := strings.TrimSpace(os.Getenv("DESKTOP_VISION_PROVIDER"))
	if model == "" || provider == "" {
		return nil, fmt.Errorf("desktop vision model/provider are not configured")
	}

	encoded := strings.TrimSpace(visionStringOption(options, "image", ""))
	if encoded == "" {
		return nil, fmt.Errorf("image is required")
	}
	if comma := strings.IndexByte(encoded, ','); strings.HasPrefix(encoded, "data:") && comma >= 0 {
		encoded = encoded[comma+1:]
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("image must be base64 PNG data: %w", err)
	}
	if len(raw) == 0 || len(raw) > maxDesktopVisionObserveImageBytes {
		return nil, fmt.Errorf("image size must be from 1 through %d bytes", maxDesktopVisionObserveImageBytes)
	}

	tempDir, err := os.MkdirTemp("", "opendesk-ui-perception-*")
	if err != nil {
		return nil, fmt.Errorf("create UI perception temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)
	if err := os.Chmod(tempDir, 0o700); err != nil {
		return nil, fmt.Errorf("secure UI perception temp dir: %w", err)
	}
	imagePath := filepath.Join(tempDir, "capture.png")
	if err := os.WriteFile(imagePath, raw, 0o600); err != nil {
		return nil, fmt.Errorf("write UI perception screenshot: %w", err)
	}

	parseOptions := map[string]interface{}{
		"imagePath":     imagePath,
		"auditPath":     filepath.Join(tempDir, "audit.json"),
		"model":         model,
		"provider":      provider,
		"app":           visionStringOption(options, "app", ""),
		"targetText":    visionStringOption(options, "targetText", ""),
		"targetRole":    visionStringOption(options, "targetRole", ""),
		"purpose":       visionStringOption(options, "purpose", ""),
		"capturedAt":    visionStringOption(options, "capturedAt", ""),
		"capturedAtMs":  visionIntOption(options, "capturedAtMs", 0),
		"timeoutMs":     visionIntOption(options, "timeoutMs", int(defaultVisionTimeoutMS)),
		"promptVersion": visionStringOption(options, "promptVersion", ""),
	}
	// Preserve Parse's default prompt when Observe's caller did not supply one.
	if strings.TrimSpace(visionString(parseOptions["promptVersion"], "")) == "" {
		delete(parseOptions, "promptVersion")
	}
	if strings.TrimSpace(visionString(parseOptions["capturedAt"], "")) == "" {
		delete(parseOptions, "capturedAt")
	}

	parsed, err := v.Parse(parseOptions)
	if err != nil {
		return nil, err
	}
	result := map[string]interface{}{
		"source":         "vlm",
		"transport":      "desktopvision",
		"auditPersisted": false,
	}
	if perception, ok := parsed["perception"]; ok {
		result["perception"] = perception
	}
	if modelValue, ok := parsed["model"]; ok {
		result["model"] = modelValue
	}
	return result, nil
}

// GetCapabilities reports whether automatic high-level VLM fallback is both
// supported and explicitly authorized. It performs no screenshot/model call.
func (v *DesktopVision) GetCapabilities() map[string]interface{} {
	policyAllowed := strings.TrimSpace(os.Getenv("OPENDESK_UI_CLOUD_VISION")) == "allow"
	modelConfigured := strings.TrimSpace(os.Getenv("DESKTOP_VISION_MODEL")) != ""
	providerConfigured := strings.TrimSpace(os.Getenv("DESKTOP_VISION_PROVIDER")) != ""
	return map[string]interface{}{
		"schemaVersion":                1,
		"observe":                      true,
		"policyAllowed":                policyAllowed,
		"configured":                   policyAllowed && modelConfigured && providerConfigured,
		"modelConfigured":              modelConfigured,
		"providerConfigured":           providerConfigured,
		"persistsAutomaticScreenshots": false,
		"persistsAutomaticRawResponse": false,
	}
}
