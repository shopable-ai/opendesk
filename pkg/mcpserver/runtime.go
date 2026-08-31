package mcpserver

import (
	"encoding/base64"
	"fmt"
	"opendesk/automation"
	pkgContainer "opendesk/pkg/container"
	"strings"
)

type AutomationRuntime struct {
	vision *automation.Vision
}

func NewAutomationRuntime(container *pkgContainer.Container) *AutomationRuntime {
	vision := automation.NewVision()
	if container != nil && container.Vision() != nil {
		vision = container.Vision()
	}
	return &AutomationRuntime{vision: vision}
}

func (r *AutomationRuntime) Status() (map[string]any, error) {
	status := map[string]any{"status": "ok"}
	if r.vision != nil {
		status["vision"] = "enabled"
	}
	return status, nil
}

func (r *AutomationRuntime) Permissions() (map[string]any, error) {
	return automation.NewPage().CheckScreenshotPermissions(), nil
}

func (r *AutomationRuntime) RequestPermissions(args map[string]any) (map[string]any, error) {
	return automation.NewPage().RequestMacPermissions(args)
}

func (r *AutomationRuntime) ListWindows() ([]map[string]any, error) {
	return automation.NewWindowManager().List()
}

func (r *AutomationRuntime) GetActiveWindow() (map[string]any, error) {
	window, err := automation.NewWindowManager().GetActiveWindow()
	if err != nil {
		return nil, wrapRuntimeError("get_active_window", err)
	}
	return activeWindowMap(window), nil
}

func (r *AutomationRuntime) FocusWindow(title string) error {
	if strings.TrimSpace(title) == "" {
		return fmt.Errorf("title is required")
	}
	return wrapRuntimeError("focus_window", automation.NewWindowManager().Focus(title))
}

func (r *AutomationRuntime) GetDisplays() ([]map[string]any, error) {
	return automation.NewScreen().GetDisplays(), nil
}

func (r *AutomationRuntime) Screenshot(args map[string]any) (any, error) {
	result, err := automation.NewPage().Screenshot(args)
	if err != nil {
		return nil, wrapRuntimeError("screenshot", err)
	}
	return result, nil
}

func (r *AutomationRuntime) OCR(args map[string]any) (map[string]any, error) {
	if r.vision == nil {
		return nil, fmt.Errorf("vision runtime is unavailable")
	}
	result, err := r.vision.RunOCR(normalizeVisionArgs(args))
	if err != nil {
		return nil, wrapRuntimeError("ocr", err)
	}
	return result, nil
}

func (r *AutomationRuntime) DetectUI(args map[string]any) (map[string]any, error) {
	if r.vision == nil {
		return nil, fmt.Errorf("vision runtime is unavailable")
	}
	result, err := r.vision.DetectUI(normalizeVisionArgs(args))
	if err != nil {
		return nil, wrapRuntimeError("detect_ui", err)
	}
	return result, nil
}

func (r *AutomationRuntime) AnalyzeLayout(args map[string]any) (map[string]any, error) {
	if r.vision == nil {
		return nil, fmt.Errorf("vision runtime is unavailable")
	}
	result, err := r.vision.AnalyzeLayout(normalizeVisionArgs(args))
	if err != nil {
		return nil, wrapRuntimeError("analyze_layout", err)
	}
	return result, nil
}

func (r *AutomationRuntime) AnnotateRegions(args map[string]any) (map[string]any, error) {
	if r.vision == nil {
		return nil, fmt.Errorf("vision runtime is unavailable")
	}
	result, err := r.vision.AnnotateRegions(normalizeVisionArgs(args))
	if err != nil {
		return nil, wrapRuntimeError("annotate_regions", err)
	}
	return result, nil
}

func (r *AutomationRuntime) Click(args map[string]any) error {
	x, okX := numberArg(args, "x")
	y, okY := numberArg(args, "y")
	if !okX || !okY {
		return fmt.Errorf("x and y are required")
	}
	return wrapRuntimeError("click", automation.NewMouse().Click(int(x), int(y), map[string]any{"button": stringOrDefault(args, "button", "left")}))
}

func (r *AutomationRuntime) Type(args map[string]any) error {
	text := stringArg(args, "text")
	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("text is required")
	}
	keyboard := automation.NewKeyboard()
	if err := keyboard.Type(text); err != nil {
		return wrapRuntimeError("type", err)
	}
	if boolArg(args, "pressEnter") || boolArg(args, "press_return") {
		return wrapRuntimeError("press_key", keyboard.Press("Enter"))
	}
	return nil
}

func (r *AutomationRuntime) PressKey(key string) error {
	if strings.Contains(key, ",") || strings.Contains(key, "+") {
		parts := splitKeyChord(key)
		return wrapRuntimeError("press_key", automation.NewKeyboard().Combination(parts...))
	}
	return wrapRuntimeError("press_key", automation.NewKeyboard().Press(key))
}

func (r *AutomationRuntime) Move(args map[string]any) error {
	x, okX := numberArg(args, "x")
	y, okY := numberArg(args, "y")
	if !okX || !okY {
		return fmt.Errorf("x and y are required")
	}
	return wrapRuntimeError("move", automation.NewMouse().Move(int(x), int(y), nil))
}

func (r *AutomationRuntime) Scroll(args map[string]any) error {
	deltaX, _ := numberArg(args, "deltaX")
	deltaY, _ := numberArg(args, "deltaY")
	steps, _ := numberArg(args, "steps")
	return wrapRuntimeError("scroll", automation.NewMouse().Wheel(map[string]any{"deltaX": int(deltaX), "deltaY": int(deltaY), "steps": int(steps)}))
}

func activeWindowMap(window *automation.WindowInfo) map[string]any {
	if window == nil {
		return map[string]any{
			"title":        "",
			"pid":          0,
			"x":            0,
			"y":            0,
			"width":        0,
			"height":       0,
			"exeName":      "",
			"exePath":      "",
			"isForeground": false,
			"hasFocus":     false,
			"handle":       "",
			"isPopup":      false,
			"index":        0,
		}
	}
	return map[string]any{
		"title":        window.Title,
		"pid":          window.ProcessID,
		"x":            window.X,
		"y":            window.Y,
		"width":        window.Width,
		"height":       window.Height,
		"exeName":      window.ExeName,
		"exePath":      window.ExePath,
		"isForeground": window.IsForeground,
		"hasFocus":     window.HasFocus,
		"handle":       window.Handle,
		"isPopup":      window.IsPopup,
		"index":        window.Index,
	}
}

func normalizeVisionArgs(args map[string]any) map[string]any {
	if args == nil {
		return map[string]any{}
	}
	out := map[string]any{}
	for k, v := range args {
		out[k] = v
	}
	if imagePath := stringArg(args, "imagePath"); strings.TrimSpace(imagePath) != "" {
		out["imagePath"] = imagePath
	}
	if image := stringArg(args, "image"); strings.TrimSpace(image) != "" {
		out["image"] = image
	}
	if imageBytes, ok := args["imageBytes"].([]byte); ok && len(imageBytes) > 0 {
		out["image"] = base64.StdEncoding.EncodeToString(imageBytes)
	}
	if targetText := stringArg(args, "target_text"); strings.TrimSpace(targetText) != "" && strings.TrimSpace(stringArg(args, "targetText")) == "" {
		out["targetText"] = targetText
	}
	return out
}

func numberArg(args map[string]any, key string) (float64, bool) {
	if args == nil {
		return 0, false
	}
	switch v := args[key].(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	default:
		return 0, false
	}
}

func boolArg(args map[string]any, key string) bool {
	if args == nil {
		return false
	}
	v, _ := args[key].(bool)
	return v
}

func stringArg(args map[string]any, key string) string {
	if args == nil {
		return ""
	}
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func stringOrDefault(args map[string]any, key, fallback string) string {
	if v := stringArg(args, key); strings.TrimSpace(v) != "" {
		return v
	}
	return fallback
}

func splitKeyChord(raw string) []string {
	parts := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == '+' })
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}
