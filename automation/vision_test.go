package automation

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/dop251/goja"
)

type fakeOCRProvider struct {
	name    string
	result  *VisionOCRResult
	err     error
	lastReq *VisionOCRRequest
}

func (f *fakeOCRProvider) Name() string {
	return f.name
}

func (f *fakeOCRProvider) OCR(ctx context.Context, req *VisionOCRRequest) (*VisionOCRResult, error) {
	f.lastReq = req
	return f.result, f.err
}

func TestParseOCRResponseMapLines(t *testing.T) {
	body := []byte(`{
		"provider":"paddle",
		"lineCount":1,
		"lines":[
			{
				"text":"发送",
				"confidence":0.98,
				"bbox":[[10,20],[110,20],[110,50],[10,50]]
			}
		]
	}`)

	result, err := parseOCRResponse("paddle", body)
	if err != nil {
		t.Fatalf("parseOCRResponse returned error: %v", err)
	}
	if result == nil {
		t.Fatal("result is nil")
	}
	if len(result.Lines) != 1 {
		t.Fatalf("expected 1 line, got %d", len(result.Lines))
	}
	line := result.Lines[0]
	if line.Text != "发送" {
		t.Fatalf("unexpected text: %s", line.Text)
	}
	if line.BBox.X != 10 || line.BBox.Y != 20 {
		t.Fatalf("unexpected bbox origin: %+v", line.BBox)
	}
	if line.BBox.Width != 100 || line.BBox.Height != 30 {
		t.Fatalf("unexpected bbox size: %+v", line.BBox)
	}
}

func TestRunOCRWithImagePathAndFakeProvider(t *testing.T) {
	tmpDir := t.TempDir()
	imgPath := filepath.Join(tmpDir, "img.bin")
	if err := os.WriteFile(imgPath, []byte("fake-image"), 0644); err != nil {
		t.Fatalf("failed to write temp image: %v", err)
	}

	v := &Vision{
		defaultProvider: "fake",
		providers: map[string]OCRProvider{
			"fake": &fakeOCRProvider{
				name: "fake",
				result: &VisionOCRResult{
					Provider: "fake",
					Text:     "hello",
					Lines: []VisionLine{
						{
							Text:       "hello",
							Confidence: 0.99,
							BBox:       VisionBBox{X: 1, Y: 2, Width: 3, Height: 4},
						},
					},
				},
			},
		},
	}

	result, err := v.RunOCR(map[string]interface{}{
		"provider":  "fake",
		"imagePath": imgPath,
	})
	if err != nil {
		t.Fatalf("RunOCR returned error: %v", err)
	}
	if result["provider"] != "fake" {
		t.Fatalf("unexpected provider: %v", result["provider"])
	}
	if result["lineCount"] != 1 {
		t.Fatalf("expected lineCount 1, got %v", result["lineCount"])
	}
}

func TestRunOCRWithImageStringPathAndFakeProvider(t *testing.T) {
	tmpDir := t.TempDir()
	imgPath := filepath.Join(tmpDir, "img.bin")
	if err := os.WriteFile(imgPath, []byte("fake-image"), 0644); err != nil {
		t.Fatalf("failed to write temp image: %v", err)
	}

	p := &fakeOCRProvider{
		name: "fake",
		result: &VisionOCRResult{
			Provider: "fake",
			Text:     "hello",
			Lines:    []VisionLine{{Text: "hello", Confidence: 0.99, BBox: VisionBBox{X: 1, Y: 2, Width: 3, Height: 4}}},
		},
	}
	v := &Vision{
		defaultProvider: "fake",
		providers: map[string]OCRProvider{
			"fake": p,
		},
	}

	_, err := v.RunOCR(map[string]interface{}{
		"provider": "fake",
		"image":    imgPath,
	})
	if err != nil {
		t.Fatalf("RunOCR returned error: %v", err)
	}
	if p.lastReq == nil || p.lastReq.ImageBase64 == "" {
		t.Fatalf("expected provider to receive image bytes from path string")
	}
}

func TestRunOCRWithImageObjectPathAndFakeProvider(t *testing.T) {
	tmpDir := t.TempDir()
	imgPath := filepath.Join(tmpDir, "img.bin")
	if err := os.WriteFile(imgPath, []byte("fake-image"), 0644); err != nil {
		t.Fatalf("failed to write temp image: %v", err)
	}

	p := &fakeOCRProvider{
		name: "fake",
		result: &VisionOCRResult{
			Provider: "fake",
			Text:     "hello",
			Lines:    []VisionLine{{Text: "hello", Confidence: 0.99, BBox: VisionBBox{X: 1, Y: 2, Width: 3, Height: 4}}},
		},
	}
	v := &Vision{
		defaultProvider: "fake",
		providers: map[string]OCRProvider{
			"fake": p,
		},
	}

	_, err := v.RunOCR(map[string]interface{}{
		"provider": "fake",
		"image": map[string]interface{}{
			"path": imgPath,
		},
	})
	if err != nil {
		t.Fatalf("RunOCR returned error: %v", err)
	}
	if p.lastReq == nil || p.lastReq.ImageBase64 == "" {
		t.Fatalf("expected provider to receive image bytes from image.path")
	}
}

func TestDetectUIFiltersByTargetAndConfidence(t *testing.T) {
	v := &Vision{
		defaultProvider: "fake",
		providers: map[string]OCRProvider{
			"fake": &fakeOCRProvider{
				name: "fake",
				result: &VisionOCRResult{
					Provider: "fake",
					Lines: []VisionLine{
						{Text: "发送", Confidence: 0.95, BBox: VisionBBox{X: 10, Y: 20, Width: 100, Height: 30}},
						{Text: "取消", Confidence: 0.40, BBox: VisionBBox{X: 10, Y: 60, Width: 100, Height: 30}},
					},
				},
			},
		},
	}

	result, err := v.DetectUI(map[string]interface{}{
		"provider":      "fake",
		"imageBase64":   "aGVsbG8=", // valid base64 placeholder
		"targetText":    "发送",
		"minConfidence": 0.5,
	})
	if err != nil {
		t.Fatalf("DetectUI returned error: %v", err)
	}

	count, ok := result["count"].(int)
	if !ok {
		t.Fatalf("count type mismatch: %T", result["count"])
	}
	if count != 1 {
		t.Fatalf("expected 1 matched element, got %d", count)
	}

	elements, ok := result["elements"].([]map[string]interface{})
	if !ok {
		t.Fatalf("elements type mismatch: %T", result["elements"])
	}
	if len(elements) != 1 {
		t.Fatalf("expected 1 element, got %d", len(elements))
	}
	if elements[0]["role"] != "button" {
		t.Fatalf("expected role button, got %v", elements[0]["role"])
	}
}

func TestRunOCREnsuresLanguageAliasAndResponseLang(t *testing.T) {
	p := &fakeOCRProvider{
		name: "fake",
		result: &VisionOCRResult{
			Provider: "fake",
			Text:     "ok",
			Lines:    []VisionLine{{Text: "ok", Confidence: 0.9, BBox: VisionBBox{X: 1, Y: 1, Width: 2, Height: 2}}},
		},
	}
	v := &Vision{
		defaultProvider: "fake",
		defaultLang:     "ch",
		providers: map[string]OCRProvider{
			"fake": p,
		},
	}

	result, err := v.RunOCR(map[string]interface{}{
		"provider": "fake",
		"image":    "aGVsbG8=",
		"language": "en",
	})
	if err != nil {
		t.Fatalf("RunOCR returned error: %v", err)
	}
	if p.lastReq == nil {
		t.Fatal("expected provider to receive request")
	}
	if p.lastReq.Lang != "en" {
		t.Fatalf("expected request lang en, got %s", p.lastReq.Lang)
	}
	if got := result["lang"]; got != "en" {
		t.Fatalf("expected response lang en, got %v", got)
	}
}

func TestRunOCRRejectsUnimplementedImageMediaID(t *testing.T) {
	v := &Vision{
		defaultProvider: "fake",
		providers: map[string]OCRProvider{
			"fake": &fakeOCRProvider{name: "fake"},
		},
	}

	_, err := v.RunOCR(map[string]interface{}{
		"provider": "fake",
		"image": map[string]interface{}{
			"mediaId": "media_123",
		},
	})
	if err == nil {
		t.Fatal("expected mediaId error")
	}
}

func TestRunOCRWithImageBytes(t *testing.T) {
	p := &fakeOCRProvider{
		name: "fake",
		result: &VisionOCRResult{
			Provider: "fake",
			Text:     "hello",
			Lines:    []VisionLine{{Text: "hello", Confidence: 0.99, BBox: VisionBBox{X: 1, Y: 2, Width: 3, Height: 4}}},
		},
	}
	v := &Vision{
		defaultProvider: "fake",
		providers: map[string]OCRProvider{
			"fake": p,
		},
	}

	_, err := v.RunOCR(map[string]interface{}{
		"provider":   "fake",
		"imageBytes": []byte("fake-image"),
	})
	if err != nil {
		t.Fatalf("RunOCR returned error: %v", err)
	}
	if p.lastReq == nil || p.lastReq.ImageBase64 == "" {
		t.Fatalf("expected provider to receive image bytes")
	}
}

func TestRunOCRWithImageArrayBuffer(t *testing.T) {
	vm := goja.New()
	buffer := vm.NewArrayBuffer([]byte("fake-image"))

	p := &fakeOCRProvider{
		name: "fake",
		result: &VisionOCRResult{
			Provider: "fake",
			Text:     "hello",
			Lines:    []VisionLine{{Text: "hello", Confidence: 0.99, BBox: VisionBBox{X: 1, Y: 2, Width: 3, Height: 4}}},
		},
	}
	v := &Vision{
		defaultProvider: "fake",
		providers: map[string]OCRProvider{
			"fake": p,
		},
	}

	_, err := v.RunOCR(map[string]interface{}{
		"provider": "fake",
		"image":    buffer,
	})
	if err != nil {
		t.Fatalf("RunOCR returned error: %v", err)
	}
	if p.lastReq == nil || p.lastReq.ImageBase64 == "" {
		t.Fatalf("expected provider to receive image bytes from ArrayBuffer")
	}
}

func TestGetCapabilitiesWithFilter(t *testing.T) {
	v := &Vision{
		defaultProvider: "paddle",
		defaultLang:     "ch",
		providers: map[string]OCRProvider{
			"paddle": &PaddleOCRProvider{endpoint: "http://127.0.0.1:8868/predict/ocr_system"},
			"openai": &unimplementedOCRProvider{name: "openai"},
		},
	}

	all, err := v.GetCapabilities(nil)
	if err != nil {
		t.Fatalf("GetCapabilities returned error: %v", err)
	}
	if all["providerCount"] != 2 {
		t.Fatalf("expected providerCount=2, got %v", all["providerCount"])
	}

	filtered, err := v.GetCapabilities(map[string]interface{}{"provider": "paddleocr"})
	if err != nil {
		t.Fatalf("GetCapabilities(filter) returned error: %v", err)
	}
	if filtered["providerCount"] != 1 {
		t.Fatalf("expected filtered providerCount=1, got %v", filtered["providerCount"])
	}

	filteredByProfile, err := v.GetCapabilities(map[string]interface{}{
		"visionProfile": map[string]interface{}{"provider": "openai"},
	})
	if err != nil {
		t.Fatalf("GetCapabilities(filter-by-profile) returned error: %v", err)
	}
	if filteredByProfile["providerCount"] != 1 {
		t.Fatalf("expected profile filtered providerCount=1, got %v", filteredByProfile["providerCount"])
	}
}

func TestRunOCRWithVisionProfile(t *testing.T) {
	p := &fakeOCRProvider{
		name: "fake",
		result: &VisionOCRResult{
			Provider: "fake",
			Text:     "ok",
			Lines:    []VisionLine{{Text: "ok", Confidence: 0.9, BBox: VisionBBox{X: 1, Y: 1, Width: 2, Height: 2}}},
		},
	}
	v := &Vision{
		defaultProvider: "fake",
		defaultLang:     "ch",
		providers: map[string]OCRProvider{
			"fake": p,
		},
	}

	result, err := v.RunOCR(map[string]interface{}{
		"image": "aGVsbG8=",
		"visionProfile": map[string]interface{}{
			"provider": "fake",
			"language": "en",
		},
	})
	if err != nil {
		t.Fatalf("RunOCR returned error: %v", err)
	}
	if p.lastReq == nil {
		t.Fatal("expected provider to receive request")
	}
	if p.lastReq.Lang != "en" {
		t.Fatalf("expected request lang from visionProfile=en, got %s", p.lastReq.Lang)
	}
	if got := result["lang"]; got != "en" {
		t.Fatalf("expected response lang en, got %v", got)
	}
}

func TestRunOCRTopLevelOverridesVisionProfile(t *testing.T) {
	p := &fakeOCRProvider{
		name: "fake",
		result: &VisionOCRResult{
			Provider: "fake",
			Text:     "ok",
			Lines:    []VisionLine{{Text: "ok", Confidence: 0.9, BBox: VisionBBox{X: 1, Y: 1, Width: 2, Height: 2}}},
		},
	}
	v := &Vision{
		defaultProvider: "fake",
		defaultLang:     "ch",
		providers: map[string]OCRProvider{
			"fake": p,
		},
	}

	_, err := v.RunOCR(map[string]interface{}{
		"image": "aGVsbG8=",
		"visionProfile": map[string]interface{}{
			"provider": "fake",
			"language": "en",
		},
		"lang": "ch",
	})
	if err != nil {
		t.Fatalf("RunOCR returned error: %v", err)
	}
	if p.lastReq == nil {
		t.Fatal("expected provider to receive request")
	}
	if p.lastReq.Lang != "ch" {
		t.Fatalf("expected top-level lang=ch override, got %s", p.lastReq.Lang)
	}
}

func TestAppleVisionLanguagesNormalizesCommonOCRAliases(t *testing.T) {
	got := appleVisionLanguages("chi_sim+en-US, ja-JP")
	want := []string{"zh-Hans", "en-US", "ja-JP"}
	if len(got) != len(want) {
		t.Fatalf("appleVisionLanguages length = %d, want %d: %#v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("appleVisionLanguages[%d] = %q, want %q; full=%#v", i, got[i], want[i], got)
		}
	}
}

func TestAppleVisionResultConvertsToTopLeftPixelCoordinates(t *testing.T) {
	result, err := appleVisionResult(map[string]interface{}{
		"text":  "OpenDesk",
		"image": map[string]interface{}{"width": 1000, "height": 500},
		"items": []interface{}{
			map[string]interface{}{
				"text":        "OpenDesk",
				"confidence":  0.95,
				"boundingBox": map[string]interface{}{"x": 0.1, "y": 0.2, "width": 0.4, "height": 0.3},
			},
		},
	}, "ch")
	if err != nil {
		t.Fatalf("appleVisionResult returned error: %v", err)
	}
	if result.Provider != "apple" || result.Lang != "zh-Hans" || result.Text != "OpenDesk" {
		t.Fatalf("unexpected Apple Vision result: %#v", result)
	}
	if len(result.Lines) != 1 {
		t.Fatalf("line count = %d, want 1", len(result.Lines))
	}
	if got, want := result.Lines[0].BBox, (VisionBBox{X: 100, Y: 250, Width: 400, Height: 150}); got != want {
		t.Fatalf("bbox = %+v, want %+v", got, want)
	}
}
