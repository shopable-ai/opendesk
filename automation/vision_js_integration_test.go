package automation

import (
	"context"
	"testing"

	"github.com/dop251/goja"
)

type jsFakeOCRProvider struct {
	lastReq *VisionOCRRequest
}

func (f *jsFakeOCRProvider) Name() string {
	return "fake"
}

func (f *jsFakeOCRProvider) OCR(ctx context.Context, req *VisionOCRRequest) (*VisionOCRResult, error) {
	f.lastReq = req
	return &VisionOCRResult{
		Provider: "fake",
		Lang:     req.Lang,
		Text:     "ok",
		Lines: []VisionLine{
			{
				Text:       "ok",
				Confidence: 0.99,
				BBox:       VisionBBox{X: 1, Y: 2, Width: 3, Height: 4},
			},
		},
	}, nil
}

func TestVisionRunOCRFromJSTypedArray(t *testing.T) {
	vm := goja.New()
	provider := &jsFakeOCRProvider{}
	vision := &Vision{
		defaultProvider: "fake",
		defaultLang:     "ch",
		providers: map[string]OCRProvider{
			"fake": provider,
		},
	}

	vm.Set("Vision", AutoMapObject(vm, vision))

	value, err := vm.RunString(`
		const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
		const result = Vision.runOCR({
		  provider: "fake",
		  lang: "en",
		  image: bytes
		});
		({
		  provider: result.provider,
		  lang: result.lang,
		  lineCount: result.lineCount
		});
	`)
	if err != nil {
		t.Fatalf("RunString returned error: %v", err)
	}

	exported, ok := value.Export().(map[string]interface{})
	if !ok {
		t.Fatalf("unexpected JS result type: %T", value.Export())
	}
	if exported["provider"] != "fake" {
		t.Fatalf("unexpected provider: %v", exported["provider"])
	}
	if exported["lang"] != "en" {
		t.Fatalf("unexpected lang: %v", exported["lang"])
	}
	if exported["lineCount"] != int64(1) {
		t.Fatalf("unexpected lineCount: %v", exported["lineCount"])
	}
	if provider.lastReq == nil || provider.lastReq.ImageBase64 == "" {
		t.Fatalf("expected provider to receive image bytes from JS typed array")
	}
}
