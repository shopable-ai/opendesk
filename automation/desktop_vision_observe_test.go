package automation

import (
	"context"
	"encoding/base64"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"opendesk/pkg/desktopvision"
)

type observeParser struct {
	called bool
	path   string
}

func (p *observeParser) Parse(_ context.Context, opts desktopvision.ParseOptions) (*desktopvision.ParseResult, error) {
	p.called = true
	p.path = opts.ImagePath
	perception := opts.BasePerception
	perception.Elements = []desktopvision.Element{{
		Text: "Save", BBoxNorm: desktopvision.NormalizedBBox{0.1, 0.1, 0.2, 0.2},
		Confidence: 0.99, Risk: desktopvision.RiskLow, Actionable: true,
	}}
	return &desktopvision.ParseResult{
		Perception: perception,
		Model:      desktopvision.ModelRef{Provider: opts.Provider, Model: opts.Model},
	}, nil
}

func tinyObservePNG(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "capture.png")
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create image: %v", err)
	}
	if err := png.Encode(file, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatalf("encode image: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close image: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read image: %v", err)
	}
	return base64.StdEncoding.EncodeToString(raw)
}

func TestDesktopVisionObserveDefaultsToNoUpload(t *testing.T) {
	t.Setenv("OPENDESK_UI_CLOUD_VISION", "")
	parser := &observeParser{}
	bridge := &DesktopVision{parser: parser}
	_, err := bridge.Observe(map[string]interface{}{"image": tinyObservePNG(t)})
	if err == nil {
		t.Fatal("Observe unexpectedly allowed a cloud upload")
	}
	if parser.called {
		t.Fatal("provider ran before policy approval")
	}
	caps := bridge.GetCapabilities()
	if caps["policyAllowed"] != false || caps["configured"] != false {
		t.Fatalf("unexpected default capabilities: %#v", caps)
	}
}

func TestDesktopVisionObserveUsesConfiguredExistingProviderAndCleansCapture(t *testing.T) {
	t.Setenv("OPENDESK_UI_CLOUD_VISION", "allow")
	t.Setenv("DESKTOP_VISION_MODEL", "fixture-model")
	t.Setenv("DESKTOP_VISION_PROVIDER", "fixture-provider")
	parser := &observeParser{}
	bridge := &DesktopVision{
		parser: parser,
		activeWindow: func() (*WindowInfo, error) {
			return &WindowInfo{Title: "Fixture", ExeName: "Fixture", X: 100, Y: 200, Width: 1, Height: 1}, nil
		},
		displays: func() []map[string]interface{} {
			return []map[string]interface{}{{"id": "main", "x": 0, "y": 0, "width": 1280, "height": 1024, "scale": 1.0}}
		},
	}
	result, err := bridge.Observe(map[string]interface{}{
		"image": tinyObservePNG(t), "app": "Fixture", "targetText": "Save",
		"capturedAt": time.Now().UTC().Format(time.RFC3339Nano), "timeoutMs": 1000,
	})
	if err != nil {
		t.Fatalf("Observe: %v", err)
	}
	if !parser.called || parser.path == "" {
		t.Fatal("configured provider was not invoked")
	}
	if _, err := os.Stat(parser.path); !os.IsNotExist(err) {
		t.Fatalf("temporary screenshot remains after Observe: %v", err)
	}
	if result["source"] != "vlm" || result["auditPersisted"] != false || result["perception"] == nil {
		t.Fatalf("unexpected Observe result: %#v", result)
	}
	caps := bridge.GetCapabilities()
	if caps["policyAllowed"] != true || caps["configured"] != true {
		t.Fatalf("configured capability missing: %#v", caps)
	}
}
