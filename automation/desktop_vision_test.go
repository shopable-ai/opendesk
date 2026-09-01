package automation

import (
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"opendesk/pkg/desktopvision"
)

type fakeDesktopVisionParser struct {
	last desktopvision.ParseOptions
	err  error
}

func (f *fakeDesktopVisionParser) Parse(_ context.Context, opts desktopvision.ParseOptions) (*desktopvision.ParseResult, error) {
	f.last = opts
	perception := opts.BasePerception
	perception.Elements = []desktopvision.Element{{
		ID: "button_7", Role: "button", Text: "7", BBoxNorm: desktopvision.NormalizedBBox{0, 0, 0.5, 0.5},
		Confidence: 0.99, Risk: desktopvision.RiskLow, Actionable: true,
	}}
	return &desktopvision.ParseResult{
		Perception: perception,
		Model:      desktopvision.ModelRef{Provider: opts.Provider, Model: opts.Model, PromptVersion: opts.PromptVersion},
		Command:    []string{"codex", "exec", "--image", opts.ImagePath},
		RawMessage: `{"elements":[{"text":"7"}]}`,
		Stderr:     "model: gpt-5.6-sol\nprovider: openai\n",
	}, f.err
}

func TestDesktopVisionParseWritesAuditedScreenshotBoundResult(t *testing.T) {
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "fresh.png")
	file, err := os.Create(imagePath)
	if err != nil {
		t.Fatalf("create image: %v", err)
	}
	if err := png.Encode(file, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatalf("encode image: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close image: %v", err)
	}

	parser := &fakeDesktopVisionParser{}
	bridge := &DesktopVision{
		parser: parser,
		activeWindow: func() (*WindowInfo, error) {
			return &WindowInfo{Title: "", ExeName: "Calculator", X: 100, Y: 80, Width: 2, Height: 2}, nil
		},
		displays: func() []map[string]interface{} {
			return []map[string]interface{}{{"id": "main", "x": 0, "y": 0, "width": 1280, "height": 1024, "scale": 1.0}}
		},
	}
	capturedAt := time.Date(2026, 8, 30, 13, 45, 0, 0, time.UTC)
	auditPath := filepath.Join(dir, "model-invocation.json")
	result, err := bridge.Parse(map[string]interface{}{
		"imagePath": imagePath, "auditPath": auditPath, "capturedAt": capturedAt.Format(time.RFC3339Nano),
		"app": "Calculator", "model": "gpt-5.6-sol", "provider": "openai", "promptVersion": "ui-parser-v1",
		"actionStep": "locate-7", "phase": "pre",
	})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	perception, ok := result["perception"].(map[string]interface{})
	elements, _ := perception["elements"].([]interface{})
	if !ok || len(elements) != 1 || elements[0].(map[string]interface{})["text"] != "7" {
		t.Fatalf("unexpected perception: %#v", result["perception"])
	}
	if parser.last.BasePerception.Image.Hash == "" || parser.last.BasePerception.Image.CapturedAt != capturedAt {
		t.Fatalf("provider did not receive bound screenshot provenance: %#v", parser.last.BasePerception.Image)
	}

	raw, err := os.ReadFile(auditPath)
	if err != nil {
		t.Fatalf("read audit: %v", err)
	}
	var audit desktopVisionInvocation
	if err := json.Unmarshal(raw, &audit); err != nil {
		t.Fatalf("decode audit: %v", err)
	}
	if !audit.Succeeded || audit.ImageSHA256 == "" || audit.ResponseImageSHA256 != audit.ImageSHA256 || audit.RawResponse == "" {
		t.Fatalf("incomplete model audit: %#v", audit)
	}
}

func TestDesktopVisionParseFailsBeforeProviderOnExpectedSHAMismatch(t *testing.T) {
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "fresh.png")
	file, err := os.Create(imagePath)
	if err != nil {
		t.Fatalf("create image: %v", err)
	}
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.White)
	if err := png.Encode(file, img); err != nil {
		t.Fatalf("encode image: %v", err)
	}
	_ = file.Close()

	parser := &fakeDesktopVisionParser{}
	bridge := &DesktopVision{
		parser:       parser,
		activeWindow: func() (*WindowInfo, error) { return &WindowInfo{}, nil },
		displays:     func() []map[string]interface{} { return nil },
	}
	auditPath := filepath.Join(dir, "model-invocation.json")
	_, err = bridge.Parse(map[string]interface{}{
		"imagePath": imagePath, "imageSHA256": "stale", "auditPath": auditPath,
		"capturedAt": time.Now().UTC().Format(time.RFC3339Nano), "app": "Calculator",
		"model": "gpt-5.6-sol", "provider": "openai",
	})
	if err == nil {
		t.Fatal("expected screenshot SHA mismatch")
	}
	if parser.last.ImagePath != "" {
		t.Fatal("provider must not run after a pre-call screenshot SHA mismatch")
	}
	raw, readErr := os.ReadFile(auditPath)
	if readErr != nil {
		t.Fatalf("read failure audit: %v", readErr)
	}
	var audit desktopVisionInvocation
	if err := json.Unmarshal(raw, &audit); err != nil {
		t.Fatalf("decode failure audit: %v", err)
	}
	if audit.Succeeded || audit.Error == "" || audit.ImageSHA256 == "" {
		t.Fatalf("failure audit did not fail closed: %#v", audit)
	}
}
