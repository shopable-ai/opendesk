package automation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"
	"time"

	"opendesk/pkg/desktopvision"
)

type desktopVisionParser interface {
	Parse(context.Context, desktopvision.ParseOptions) (*desktopvision.ParseResult, error)
}

// DesktopVision exposes the audited Codex image parser to JavaScript. It is
// intentionally separate from Vision, whose providers are OCR services.
type DesktopVision struct {
	parser       desktopVisionParser
	activeWindow func() (*WindowInfo, error)
	displays     func() []map[string]interface{}
}

type desktopVisionInvocation struct {
	ActionStep          string                   `json:"action_step,omitempty"`
	Phase               string                   `json:"phase,omitempty"`
	ImagePath           string                   `json:"image_path"`
	ImageSHA256         string                   `json:"image_sha256"`
	CapturedAt          time.Time                `json:"captured_at"`
	RequestedModel      string                   `json:"requested_model"`
	RequestedProvider   string                   `json:"requested_provider"`
	PromptVersion       string                   `json:"prompt_version"`
	BaseSnapshot        desktopvision.Perception `json:"base_snapshot"`
	ResolvedModel       desktopvision.ModelRef   `json:"resolved_model"`
	Command             []string                 `json:"command,omitempty"`
	Stdout              string                   `json:"stdout,omitempty"`
	Stderr              string                   `json:"stderr,omitempty"`
	RawResponse         string                   `json:"raw_response,omitempty"`
	ResponseImageSHA256 string                   `json:"response_image_sha256,omitempty"`
	Succeeded           bool                     `json:"succeeded"`
	Error               string                   `json:"error,omitempty"`
}

func NewDesktopVision() *DesktopVision {
	workingDir, _ := os.Getwd()
	provider := desktopvision.NewCodexProvider(desktopvision.ProviderOptions{
		Executable:    strings.TrimSpace(os.Getenv("DESKTOP_VISION_CODEX_PATH")),
		WorkingDir:    workingDir,
		PromptVersion: desktopvision.DefaultPromptVersion,
		Timeout:       desktopvision.DefaultExecTimeout,
	})
	return &DesktopVision{
		parser:       provider,
		activeWindow: NewWindowManager().GetActiveWindow,
		displays:     NewScreen().GetDisplays,
	}
}

// Parse uses the official Codex provider on a fresh screenshot and persists an
// audit record even when the provider or screenshot-provenance gate fails.
func (v *DesktopVision) Parse(options map[string]interface{}) (map[string]interface{}, error) {
	if v == nil || v.parser == nil || v.activeWindow == nil || v.displays == nil {
		return nil, fmt.Errorf("desktop vision bridge is unavailable")
	}
	imagePath := strings.TrimSpace(visionStringOption(options, "imagePath", ""))
	auditPath := strings.TrimSpace(visionStringOption(options, "auditPath", ""))
	model := strings.TrimSpace(visionStringOption(options, "model", ""))
	provider := strings.TrimSpace(visionStringOption(options, "provider", ""))
	promptVersion := strings.TrimSpace(visionStringOption(options, "promptVersion", desktopvision.DefaultPromptVersion))
	actionStep := strings.TrimSpace(visionStringOption(options, "actionStep", ""))
	phase := strings.TrimSpace(visionStringOption(options, "phase", ""))

	invocation := desktopVisionInvocation{
		ActionStep: actionStep, Phase: phase, ImagePath: imagePath,
		RequestedModel: model, RequestedProvider: provider, PromptVersion: promptVersion,
	}
	fail := func(err error) (map[string]interface{}, error) {
		invocation.Error = err.Error()
		if auditErr := writeDesktopVisionAudit(auditPath, invocation); auditErr != nil {
			return nil, fmt.Errorf("%v; additionally failed to write model audit: %w", err, auditErr)
		}
		return nil, err
	}

	if imagePath == "" {
		return fail(fmt.Errorf("imagePath is required"))
	}
	if auditPath == "" {
		return nil, fmt.Errorf("auditPath is required")
	}
	if model == "" {
		return fail(fmt.Errorf("model is required"))
	}
	if provider == "" {
		return fail(fmt.Errorf("provider is required"))
	}
	capturedAt, err := desktopVisionCapturedAt(options)
	if err != nil {
		return fail(err)
	}
	invocation.CapturedAt = capturedAt

	raw, err := os.ReadFile(imagePath)
	if err != nil {
		return fail(fmt.Errorf("read screenshot: %w", err))
	}
	digest := sha256.Sum256(raw)
	imageSHA := hex.EncodeToString(digest[:])
	invocation.ImageSHA256 = imageSHA
	if expected := strings.TrimSpace(visionStringOption(options, "imageSHA256", "")); expected != "" && expected != imageSHA {
		return fail(fmt.Errorf("fresh screenshot SHA mismatch before model call: got %q, want %q", imageSHA, expected))
	}
	file, err := os.Open(imagePath)
	if err != nil {
		return fail(fmt.Errorf("open screenshot: %w", err))
	}
	imageConfig, _, decodeErr := image.DecodeConfig(file)
	_ = file.Close()
	if decodeErr != nil {
		return fail(fmt.Errorf("decode screenshot: %w", decodeErr))
	}

	window, err := v.activeWindow()
	if err != nil {
		return fail(fmt.Errorf("get active window: %w", err))
	}
	expectedApp := strings.TrimSpace(visionStringOption(options, "app", ""))
	if expectedApp == "" {
		return fail(fmt.Errorf("app is required"))
	}
	if !desktopVisionSameApp(window.ExeName, expectedApp) {
		return fail(fmt.Errorf("frontmost app is %q, want %q", window.ExeName, expectedApp))
	}
	if imageConfig.Width != int(window.Width) || imageConfig.Height != int(window.Height) {
		return fail(fmt.Errorf("screenshot/window size mismatch: image=%dx%d window=%dx%d", imageConfig.Width, imageConfig.Height, window.Width, window.Height))
	}
	display, err := desktopVisionDisplayForWindow(v.displays(), window)
	if err != nil {
		return fail(err)
	}
	base := desktopvision.Perception{
		App: expectedApp,
		Window: desktopvision.Window{
			Title: window.Title,
			BoundsScreen: desktopvision.ScreenBBox{
				float64(window.X), float64(window.Y), float64(window.X + window.Width), float64(window.Y + window.Height),
			},
		},
		Image: desktopvision.Image{
			Size: desktopvision.ImageSize{Width: imageConfig.Width, Height: imageConfig.Height}, Hash: imageSHA, CapturedAt: capturedAt,
		},
		Display: display,
	}
	invocation.BaseSnapshot = base

	timeout := time.Duration(visionIntOption(options, "timeoutMs", int(desktopvision.DefaultExecTimeout/time.Millisecond))) * time.Millisecond
	parsed, parseErr := v.parser.Parse(context.Background(), desktopvision.ParseOptions{
		ImagePath: imagePath, Model: model, Provider: provider, PromptVersion: promptVersion,
		TargetText: strings.TrimSpace(visionStringOption(options, "targetText", "")),
		TargetRole: strings.TrimSpace(visionStringOption(options, "targetRole", "")),
		Purpose:    strings.TrimSpace(visionStringOption(options, "purpose", "")),
		WorkingDir: strings.TrimSpace(visionStringOption(options, "workingDir", "")), Timeout: timeout, BasePerception: base,
	})
	if parsed != nil {
		invocation.ResolvedModel = parsed.Model
		invocation.Command = append([]string(nil), parsed.Command...)
		invocation.Stdout = parsed.Stdout
		invocation.Stderr = parsed.Stderr
		invocation.RawResponse = parsed.RawMessage
		invocation.ResponseImageSHA256 = parsed.Perception.Image.Hash
	}
	if parseErr != nil {
		return fail(parseErr)
	}
	if parsed == nil {
		return fail(fmt.Errorf("desktop vision provider returned no result"))
	}
	if parsed.Perception.Image.Hash != imageSHA {
		return fail(fmt.Errorf("model response screenshot SHA mismatch: got %q, want %q", parsed.Perception.Image.Hash, imageSHA))
	}
	if annotatedPath := strings.TrimSpace(visionStringOption(options, "annotatedPath", "")); annotatedPath != "" {
		if err := desktopvision.WriteAnnotatedPNG(imagePath, parsed.Perception, annotatedPath); err != nil {
			return fail(fmt.Errorf("write annotated screenshot: %w", err))
		}
	}
	invocation.Succeeded = true
	if err := writeDesktopVisionAudit(auditPath, invocation); err != nil {
		return nil, err
	}
	perceptionValue, err := desktopVisionJSONValue(parsed.Perception)
	if err != nil {
		return nil, err
	}
	modelValue, err := desktopVisionJSONValue(parsed.Model)
	if err != nil {
		return nil, err
	}
	invocationValue, err := desktopVisionJSONValue(invocation)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"perception": perceptionValue,
		"model":      modelValue,
		"invocation": invocationValue,
	}, nil
}

func desktopVisionJSONValue(value interface{}) (interface{}, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal desktop vision result: %w", err)
	}
	var result interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("decode desktop vision result: %w", err)
	}
	return result, nil
}

func desktopVisionCapturedAt(options map[string]interface{}) (time.Time, error) {
	raw := strings.TrimSpace(visionStringOption(options, "capturedAt", ""))
	if raw != "" {
		parsed, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return time.Time{}, fmt.Errorf("capturedAt must be RFC3339: %w", err)
		}
		return parsed, nil
	}
	millis := visionIntOption(options, "capturedAtMs", 0)
	if millis <= 0 {
		return time.Time{}, fmt.Errorf("capturedAt or capturedAtMs is required")
	}
	return time.UnixMilli(int64(millis)).UTC(), nil
}

func desktopVisionDisplayForWindow(rows []map[string]interface{}, window *WindowInfo) (desktopvision.Display, error) {
	cx := float64(window.X) + float64(window.Width)/2
	cy := float64(window.Y) + float64(window.Height)/2
	for _, row := range rows {
		x := visionFloat(row["x"], 0)
		y := visionFloat(row["y"], 0)
		width := visionFloat(row["width"], 0)
		height := visionFloat(row["height"], 0)
		if width > 0 && height > 0 && cx >= x && cx <= x+width && cy >= y && cy <= y+height {
			return desktopvision.Display{
				ID: visionString(row["id"], ""), Scale: visionFloat(row["scale"], 1),
				Bounds: desktopvision.ScreenBBox{x, y, x + width, y + height},
			}, nil
		}
	}
	return desktopvision.Display{}, fmt.Errorf("active window is not contained by a known display")
}

func desktopVisionSameApp(actual, expected string) bool {
	normalize := func(value string) string {
		return strings.ToLower(strings.TrimSuffix(strings.TrimSpace(value), ".app"))
	}
	return normalize(actual) == normalize(expected)
}

func writeDesktopVisionAudit(path string, invocation desktopVisionInvocation) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("auditPath is required")
	}
	raw, err := json.MarshalIndent(invocation, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal model audit: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create model audit directory: %w", err)
	}
	if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil {
		return fmt.Errorf("write model audit: %w", err)
	}
	return nil
}
