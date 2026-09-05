package automation

import (
	"context"
	"fmt"
	"math"
	"runtime"
	"strings"
	"time"

	"opendesk/pkg/nativeextension"
)

const appleVisionPluginID = "com.example.macos-vision"

// AppleVisionOCRProvider runs the program-relative Apple Vision helper through
// the validated native-extension protocol. macOS builds package this helper, so
// OCR does not need a network endpoint or a separately installed CLI engine.
type AppleVisionOCRProvider struct {
	host *nativeextension.Host
}

func NewAppleVisionOCRProvider() *AppleVisionOCRProvider {
	return &AppleVisionOCRProvider{host: nativeextension.NewHost()}
}

func (p *AppleVisionOCRProvider) Name() string {
	return "apple"
}

func (p *AppleVisionOCRProvider) Capabilities() map[string]interface{} {
	_, err := p.plugin()
	available := err == nil
	capabilities := map[string]interface{}{
		"provider":                   p.Name(),
		"implemented":                runtime.GOOS == "darwin",
		"switchReady":                runtime.GOOS == "darwin",
		"available":                  available,
		"defaultLang":                "ch",
		"supportedLangs":             []string{"ch", "chinese_cht", "en", "ja", "ko"},
		"supportsDetectOrientation":  true,
		"supportsRecognizeDirection": true,
		"endpointRequired":           false,
		"endpointConfigured":         available,
		"recognitionLevelDefault":    "accurate",
		"backend":                    "Apple Vision",
	}
	if !available {
		capabilities["note"] = "Apple Vision helper is not packaged beside this executable; rebuild with make build or scripts/build_macos_app.sh"
	}
	return capabilities
}

func (p *AppleVisionOCRProvider) OCR(ctx context.Context, req *VisionOCRRequest) (*VisionOCRResult, error) {
	if runtime.GOOS != "darwin" {
		return nil, fmt.Errorf("Apple Vision OCR is only available on macOS")
	}
	if req == nil || strings.TrimSpace(req.ImageBase64) == "" {
		return nil, fmt.Errorf("image cannot be empty")
	}

	plugin, err := p.plugin()
	if err != nil {
		return nil, fmt.Errorf("Apple Vision OCR is unavailable: %w", err)
	}
	imagePath, cleanup, err := writeVisionTempImage(req.ImageBase64)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	recognitionLevel := strings.ToLower(strings.TrimSpace(req.RecognitionLevel))
	if recognitionLevel == "" {
		recognitionLevel = "accurate"
	}
	if recognitionLevel != "accurate" && recognitionLevel != "fast" {
		return nil, fmt.Errorf("recognitionLevel must be accurate or fast")
	}

	timeout := time.Duration(req.TimeoutMS) * time.Millisecond
	if timeout <= 0 {
		timeout = time.Duration(defaultVisionTimeoutMS) * time.Millisecond
	}
	host := p.host
	if host == nil {
		host = nativeextension.NewHost()
	}
	result, err := host.Call(ctx, nativeextension.CallOptions{
		Executable: plugin.ExecutablePath,
		Method:     plugin.Methods["ocr"].WireMethod,
		Timeout:    timeout,
		Params: map[string]interface{}{
			"imagePath":        imagePath,
			"recognitionLevel": recognitionLevel,
			"languages":        appleVisionLanguages(req.Lang),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("Apple Vision OCR failed: %w", err)
	}

	payload := visionToMap(result.Result)
	if payload == nil {
		return nil, fmt.Errorf("Apple Vision OCR returned an invalid response")
	}
	return appleVisionResult(payload, req.Lang)
}

func (p *AppleVisionOCRProvider) plugin() (nativeextension.Plugin, error) {
	if runtime.GOOS != "darwin" {
		return nativeextension.Plugin{}, fmt.Errorf("Apple Vision OCR is only available on macOS")
	}
	registry, err := nativeextension.Discover(nativeextension.DiscoveryOptions{})
	if err != nil {
		return nativeextension.Plugin{}, fmt.Errorf("discover Apple Vision helper: %w", err)
	}
	plugin, err := registry.ValidateArtifact(appleVisionPluginID)
	if err != nil {
		return nativeextension.Plugin{}, err
	}
	method, ok := plugin.Methods["ocr"]
	if !ok || strings.TrimSpace(method.WireMethod) == "" {
		return nativeextension.Plugin{}, fmt.Errorf("Apple Vision helper does not expose ocr")
	}
	return plugin, nil
}

func appleVisionLanguages(lang string) []string {
	parts := strings.FieldsFunc(strings.ToLower(strings.TrimSpace(lang)), func(r rune) bool {
		return r == '+' || r == ',' || r == ';'
	})
	if len(parts) == 0 {
		parts = []string{"ch"}
	}
	known := map[string]string{
		"ch": "zh-Hans", "zh": "zh-Hans", "zh-cn": "zh-Hans", "zh_cn": "zh-Hans", "zh-hans": "zh-Hans", "cn": "zh-Hans", "chinese": "zh-Hans", "simplified": "zh-Hans", "simplified_chinese": "zh-Hans", "chi_sim": "zh-Hans",
		"chinese_cht": "zh-Hant", "zh-tw": "zh-Hant", "zh_tw": "zh-Hant", "zh-hk": "zh-Hant", "zh-hant": "zh-Hant", "traditional": "zh-Hant", "traditional_chinese": "zh-Hant", "chi_tra": "zh-Hant",
		"en": "en-US", "eng": "en-US", "english": "en-US", "en-us": "en-US", "en_us": "en-US",
		"ja": "ja-JP", "jp": "ja-JP", "japan": "ja-JP", "jpn": "ja-JP", "japanese": "ja-JP", "ja-jp": "ja-JP", "ja_jp": "ja-JP",
		"ko": "ko-KR", "kr": "ko-KR", "korean": "ko-KR", "kor": "ko-KR", "ko-kr": "ko-KR", "ko_kr": "ko-KR",
	}
	result := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if mapped, ok := known[value]; ok {
			value = mapped
		}
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	if len(result) == 0 {
		return []string{"zh-Hans"}
	}
	return result
}

func appleVisionResult(payload map[string]interface{}, lang string) (*VisionOCRResult, error) {
	image := visionToMap(payload["image"])
	width := visionInt(image["width"], 0)
	height := visionInt(image["height"], 0)
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("Apple Vision OCR returned invalid image dimensions")
	}
	items, ok := payload["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("Apple Vision OCR returned invalid items")
	}
	lines := make([]VisionLine, 0, len(items))
	for _, raw := range items {
		item := visionToMap(raw)
		if item == nil {
			return nil, fmt.Errorf("Apple Vision OCR returned an invalid item")
		}
		text := strings.TrimSpace(visionString(item["text"], ""))
		if text == "" {
			continue
		}
		box, err := appleVisionBBox(visionToMap(item["boundingBox"]), width, height)
		if err != nil {
			return nil, err
		}
		confidence := visionFloat(item["confidence"], 0)
		if math.IsNaN(confidence) || math.IsInf(confidence, 0) || confidence < 0 || confidence > 1 {
			return nil, fmt.Errorf("Apple Vision OCR returned invalid confidence")
		}
		lines = append(lines, VisionLine{Text: text, Confidence: confidence, BBox: box})
	}

	text := strings.TrimSpace(visionString(payload["text"], ""))
	if text == "" {
		text = joinVisionLines(lines)
	}
	return &VisionOCRResult{
		Provider: "apple",
		Lang:     normalizeVisionLangByProvider("apple", lang),
		Text:     text,
		Lines:    lines,
		Raw: map[string]interface{}{
			"backend":          "Apple Vision",
			"image":            image,
			"coordinateSystem": payload["coordinateSystem"],
		},
	}, nil
}

func appleVisionBBox(box map[string]interface{}, imageWidth, imageHeight int) (VisionBBox, error) {
	if box == nil || imageWidth <= 0 || imageHeight <= 0 {
		return VisionBBox{}, fmt.Errorf("Apple Vision OCR returned invalid bounding box")
	}
	x := visionFloat(box["x"], math.NaN())
	y := visionFloat(box["y"], math.NaN())
	width := visionFloat(box["width"], math.NaN())
	height := visionFloat(box["height"], math.NaN())
	for _, value := range []float64{x, y, width, height} {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > 1 {
			return VisionBBox{}, fmt.Errorf("Apple Vision OCR returned invalid bounding box")
		}
	}
	if x+width > 1.000001 || y+height > 1.000001 {
		return VisionBBox{}, fmt.Errorf("Apple Vision OCR returned invalid bounding box")
	}
	// Apple Vision uses lower-left normalized coordinates; Vision.runOCR exposes
	// top-left image pixels so the result can be used directly for UI targeting.
	return VisionBBox{
		X:      int(math.Round(x * float64(imageWidth))),
		Y:      int(math.Round((1 - y - height) * float64(imageHeight))),
		Width:  int(math.Round(width * float64(imageWidth))),
		Height: int(math.Round(height * float64(imageHeight))),
	}, nil
}
