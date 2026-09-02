package automation

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/dop251/goja"
)

const (
	defaultVisionTimeoutMS = 12000
)

// Vision provides OCR and basic UI element detection.
// Default strategy: PaddleOCR provider first, optional cloud providers as reserved placeholders.
type Vision struct {
	defaultProvider string
	defaultLang     string
	providers       map[string]OCRProvider
}

type OCRProvider interface {
	Name() string
	OCR(ctx context.Context, req *VisionOCRRequest) (*VisionOCRResult, error)
}

type OCRProviderWithCapabilities interface {
	Capabilities() map[string]interface{}
}

type VisionOCRRequest struct {
	ImageBase64        string
	Lang               string
	DetectOrientation  bool
	RecognizeDirection bool
	TimeoutMS          int
}

type VisionBBox struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

type VisionLine struct {
	Text       string     `json:"text"`
	Confidence float64    `json:"confidence"`
	BBox       VisionBBox `json:"bbox"`
}

type VisionOCRResult struct {
	Provider string       `json:"provider"`
	Lang     string       `json:"lang,omitempty"`
	Text     string       `json:"text"`
	Lines    []VisionLine `json:"lines"`
	Raw      interface{}  `json:"raw,omitempty"`
}

type PaddleOCRProvider struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

type unimplementedOCRProvider struct {
	name string
}

func (u *unimplementedOCRProvider) Name() string {
	return u.name
}

func (u *unimplementedOCRProvider) OCR(ctx context.Context, req *VisionOCRRequest) (*VisionOCRResult, error) {
	return nil, fmt.Errorf("ocr provider '%s' is reserved but not implemented in current build", u.name)
}

func (u *unimplementedOCRProvider) Capabilities() map[string]interface{} {
	return map[string]interface{}{
		"provider":         u.name,
		"implemented":      false,
		"supportedLangs":   []string{},
		"defaultLang":      "",
		"switchReady":      true,
		"note":             "reserved provider, not implemented in current build",
		"endpointRequired": false,
	}
}

func (p *PaddleOCRProvider) Name() string {
	return "paddle"
}

func (p *PaddleOCRProvider) Capabilities() map[string]interface{} {
	langs := visionCSVEnvOrDefault("PADDLE_OCR_LANGS", []string{"ch", "en", "chinese_cht", "japan", "korean"})
	defaultLang := normalizePaddleLang(visionStringEnv("PADDLE_OCR_DEFAULT_LANG", "ch"))
	return map[string]interface{}{
		"provider":                   p.Name(),
		"implemented":                true,
		"switchReady":                true,
		"defaultLang":                defaultLang,
		"supportedLangs":             langs,
		"supportsDetectOrientation":  true,
		"supportsRecognizeDirection": true,
		"endpointRequired":           true,
		"endpointConfigured":         strings.TrimSpace(p.endpoint) != "",
	}
}

// NewVision creates a provider-based OCR service.
func NewVision() *Vision {
	timeoutMS := defaultVisionTimeoutMS
	if envTimeout := strings.TrimSpace(os.Getenv("PADDLE_OCR_TIMEOUT_MS")); envTimeout != "" {
		if parsed, err := strconv.Atoi(envTimeout); err == nil && parsed > 0 {
			timeoutMS = parsed
		}
	}

	defaultProvider := strings.ToLower(strings.TrimSpace(os.Getenv("VISION_OCR_PROVIDER")))
	if defaultProvider == "" {
		defaultProvider = "paddle"
	}
	defaultProvider = normalizeProviderName(defaultProvider)

	defaultLang := strings.TrimSpace(os.Getenv("VISION_OCR_LANG"))
	if defaultLang == "" {
		defaultLang = "ch"
	}
	defaultLang = normalizeVisionLangByProvider(defaultProvider, defaultLang)

	client := &http.Client{Timeout: time.Duration(timeoutMS) * time.Millisecond}
	paddle := &PaddleOCRProvider{
		endpoint: strings.TrimSpace(os.Getenv("PADDLE_OCR_ENDPOINT")),
		apiKey:   strings.TrimSpace(os.Getenv("PADDLE_OCR_API_KEY")),
		client:   client,
	}
	local := &LocalTesseractOCRProvider{}

	providers := map[string]OCRProvider{
		"paddle":    paddle,
		"paddleocr": paddle,
		"local":     local,
		"tesseract": local,
		"openai":    &unimplementedOCRProvider{name: "openai"},
		"azure":     &unimplementedOCRProvider{name: "azure"},
		"google":    &unimplementedOCRProvider{name: "google"},
		"aws":       &unimplementedOCRProvider{name: "aws"},
	}

	return &Vision{
		defaultProvider: defaultProvider,
		defaultLang:     defaultLang,
		providers:       providers,
	}
}

func (p *PaddleOCRProvider) OCR(ctx context.Context, req *VisionOCRRequest) (*VisionOCRResult, error) {
	if strings.TrimSpace(p.endpoint) == "" {
		return nil, fmt.Errorf("PADDLE_OCR_ENDPOINT is required for paddle provider")
	}

	payload := map[string]interface{}{
		"image_base64":        req.ImageBase64,
		"lang":                req.Lang,
		"detect_orientation":  req.DetectOrientation,
		"recognize_direction": req.RecognizeDirection,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal paddle request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create paddle request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if p.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
		httpReq.Header.Set("X-API-Key", p.apiKey)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("paddle request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read paddle response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("paddle provider returned status %d: %s", resp.StatusCode, truncateVision(respBody, 300))
	}

	parsed, err := parseOCRResponse("paddle", respBody)
	if err != nil {
		return nil, err
	}
	return parsed, nil
}

// RunOCR runs OCR using selected provider.
func (v *Vision) RunOCR(options map[string]interface{}) (map[string]interface{}, error) {
	options = visionMergedOptions(options)
	result, err := v.runOCRResult(options)
	if err != nil {
		return nil, err
	}

	data := map[string]interface{}{
		"provider":  result.Provider,
		"lang":      result.Lang,
		"text":      result.Text,
		"lines":     result.Lines,
		"lineCount": len(result.Lines),
	}

	if visionBoolOption(options, "includeRaw", false) {
		data["raw"] = result.Raw
	}

	return data, nil
}

// DetectUI finds basic UI elements from OCR lines.
// Current MVP strategy: text-based filtering + line box center click point.
func (v *Vision) DetectUI(options map[string]interface{}) (map[string]interface{}, error) {
	options = visionMergedOptions(options)
	ocrResult, err := v.runOCRResult(options)
	if err != nil {
		return nil, err
	}

	targetText := strings.TrimSpace(visionStringOption(options, "targetText", ""))
	matchMode := strings.ToLower(strings.TrimSpace(visionStringOption(options, "matchMode", "contains")))
	minConfidence := visionFloatOption(options, "minConfidence", 0.0)
	defaultRole := strings.TrimSpace(visionStringOption(options, "defaultRole", "text"))

	var elements []map[string]interface{}
	for _, line := range ocrResult.Lines {
		if line.Text == "" {
			continue
		}
		if line.Confidence < minConfidence {
			continue
		}
		if !visionLineMatches(line.Text, targetText, matchMode) {
			continue
		}

		role := visionGuessRole(line.Text)
		if role == "" {
			role = defaultRole
		}
		clickX := line.BBox.X + line.BBox.Width/2
		clickY := line.BBox.Y + line.BBox.Height/2
		elements = append(elements, map[string]interface{}{
			"role":       role,
			"text":       line.Text,
			"bbox":       line.BBox,
			"score":      line.Confidence,
			"clickPoint": map[string]int{"x": clickX, "y": clickY},
		})
	}

	return map[string]interface{}{
		"provider": ocrResult.Provider,
		"lang":     ocrResult.Lang,
		"text":     ocrResult.Text,
		"count":    len(elements),
		"elements": elements,
	}, nil
}

// GetCapabilities returns provider/language capabilities for UI selection and provider switching.
func (v *Vision) GetCapabilities(options map[string]interface{}) (map[string]interface{}, error) {
	options = visionMergedOptions(options)
	if options == nil {
		options = map[string]interface{}{}
	}

	providerFilter := normalizeProviderName(visionStringOption(options, "provider", ""))
	if providerFilter == "" {
		providerFilter = normalizeProviderName(visionStringOption(options, "providerName", ""))
	}

	providerNames := make([]string, 0, len(v.providers))
	for name := range v.providers {
		providerNames = append(providerNames, name)
	}
	sort.Strings(providerNames)

	items := make([]map[string]interface{}, 0, len(providerNames))
	byCanonical := map[string]map[string]interface{}{}
	for _, name := range providerNames {
		provider := v.providers[name]
		canonicalName := normalizeProviderName(name)
		if providerFilter != "" && canonicalName != providerFilter {
			continue
		}

		if existing, ok := byCanonical[canonicalName]; ok {
			aliases, _ := existing["aliases"].([]string)
			aliases = append(aliases, name)
			sort.Strings(aliases)
			existing["aliases"] = aliases
			continue
		}

		item := map[string]interface{}{
			"provider":    canonicalName,
			"alias":       name,
			"aliases":     []string{name},
			"isDefault":   canonicalName == v.defaultProvider,
			"implemented": true,
		}

		if _, ok := provider.(*unimplementedOCRProvider); ok {
			item["implemented"] = false
		}

		if capabilityProvider, ok := provider.(OCRProviderWithCapabilities); ok {
			for k, v := range capabilityProvider.Capabilities() {
				item[k] = v
			}
		}
		if _, ok := item["defaultLang"]; !ok {
			item["defaultLang"] = v.defaultLang
		}
		if _, ok := item["supportedLangs"]; !ok {
			item["supportedLangs"] = []string{}
		}
		if _, ok := item["switchReady"]; !ok {
			item["switchReady"] = true
		}
		byCanonical[canonicalName] = item
		items = append(items, item)
	}

	if providerFilter != "" && len(items) == 0 {
		return nil, fmt.Errorf("unsupported ocr provider: %s", providerFilter)
	}

	return map[string]interface{}{
		"defaultProvider": v.defaultProvider,
		"defaultLang":     v.defaultLang,
		"providers":       items,
		"providerCount":   len(items),
	}, nil
}

func (v *Vision) runOCRResult(options map[string]interface{}) (*VisionOCRResult, error) {
	options = visionMergedOptions(options)
	if options == nil {
		options = map[string]interface{}{}
	}

	imageBase64, err := visionExtractImage(options)
	if err != nil {
		return nil, err
	}

	providerName := normalizeProviderName(visionStringOption(options, "provider", v.defaultProvider))
	if providerName == "" {
		providerName = "paddle"
	}

	provider, ok := v.providers[providerName]
	if !ok {
		return nil, fmt.Errorf("unsupported ocr provider: %s", providerName)
	}

	timeoutMS := visionIntOption(options, "timeoutMs", defaultVisionTimeoutMS)
	if timeoutMS <= 0 {
		timeoutMS = defaultVisionTimeoutMS
	}

	lang := strings.TrimSpace(visionStringOption(options, "lang", ""))
	if lang == "" {
		lang = strings.TrimSpace(visionStringOption(options, "language", ""))
	}
	if lang == "" {
		lang = v.defaultLang
	}
	lang = normalizeVisionLangByProvider(providerName, lang)

	req := &VisionOCRRequest{
		ImageBase64:        imageBase64,
		Lang:               lang,
		DetectOrientation:  visionBoolOption(options, "detectOrientation", true),
		RecognizeDirection: visionBoolOption(options, "recognizeDirection", true),
		TimeoutMS:          timeoutMS,
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMS)*time.Millisecond)
	defer cancel()

	result, err := provider.OCR(ctx, req)
	if err != nil {
		return nil, err
	}
	if result != nil {
		if strings.TrimSpace(result.Provider) == "" {
			result.Provider = provider.Name()
		}
		if strings.TrimSpace(result.Lang) == "" {
			result.Lang = req.Lang
		}
	}
	return result, nil
}

func parseOCRResponse(provider string, body []byte) (*VisionOCRResult, error) {
	var root interface{}
	if err := json.Unmarshal(body, &root); err != nil {
		return nil, fmt.Errorf("failed to parse ocr provider response: %w", err)
	}

	text, lines := extractOCRTextAndLines(root)
	resultProvider := provider
	resultLang := ""
	if m, ok := root.(map[string]interface{}); ok {
		if p := strings.TrimSpace(visionString(m["provider"], "")); p != "" {
			resultProvider = normalizeProviderName(p)
		}
		resultLang = strings.TrimSpace(visionString(m["lang"], ""))
	}
	result := &VisionOCRResult{
		Provider: resultProvider,
		Lang:     resultLang,
		Text:     text,
		Lines:    lines,
		Raw:      root,
	}
	return result, nil
}

func extractOCRTextAndLines(root interface{}) (string, []VisionLine) {
	switch node := root.(type) {
	case map[string]interface{}:
		if data, ok := node["data"]; ok {
			text, lines := extractOCRTextAndLines(data)
			if text != "" || len(lines) > 0 {
				return text, lines
			}
		}

		if result, ok := node["result"]; ok {
			text, lines := extractOCRTextAndLines(result)
			if text != "" || len(lines) > 0 {
				return text, lines
			}
		}

		lines := parseLinesFromMap(node)
		if len(lines) > 0 {
			return joinVisionLines(lines), lines
		}

		if text, ok := node["text"].(string); ok && strings.TrimSpace(text) != "" {
			one := VisionLine{
				Text:       strings.TrimSpace(text),
				Confidence: visionFloat(node["confidence"], 0),
				BBox:       parseVisionBBox(node["bbox"]),
			}
			if one.BBox.Width == 0 || one.BBox.Height == 0 {
				one.BBox = parseVisionBBox(node["text_region"])
			}
			return one.Text, []VisionLine{one}
		}

	case []interface{}:
		lines := parseLinesFromArray(node)
		return joinVisionLines(lines), lines
	}

	return "", nil
}

func parseLinesFromMap(node map[string]interface{}) []VisionLine {
	var out []VisionLine
	if lines, ok := node["lines"].([]interface{}); ok {
		for _, raw := range lines {
			line := parseVisionLine(raw)
			if line.Text != "" {
				out = append(out, line)
			}
		}
	}
	if len(out) > 0 {
		return out
	}

	if ocrResults, ok := node["ocr_results"].([]interface{}); ok {
		for _, raw := range ocrResults {
			line := parseVisionLine(raw)
			if line.Text != "" {
				out = append(out, line)
			}
		}
	}
	return out
}

func parseLinesFromArray(arr []interface{}) []VisionLine {
	out := make([]VisionLine, 0, len(arr))
	for _, item := range arr {
		line := parseVisionLine(item)
		if line.Text != "" {
			out = append(out, line)
		}
	}
	return out
}

func parseVisionLine(raw interface{}) VisionLine {
	switch row := raw.(type) {
	case map[string]interface{}:
		line := VisionLine{
			Text:       strings.TrimSpace(visionString(row["text"], "")),
			Confidence: visionFloat(row["confidence"], visionFloat(row["score"], 0)),
			BBox:       parseVisionBBox(row["bbox"]),
		}
		if line.BBox.Width == 0 || line.BBox.Height == 0 {
			line.BBox = parseVisionBBox(row["box"])
		}
		if line.BBox.Width == 0 || line.BBox.Height == 0 {
			line.BBox = parseVisionBBox(row["text_region"])
		}
		return line
	case []interface{}:
		// Common Paddle style: [box, [text, confidence]]
		line := VisionLine{}
		if len(row) >= 1 {
			line.BBox = parseVisionBBox(row[0])
		}
		if len(row) >= 2 {
			switch second := row[1].(type) {
			case []interface{}:
				if len(second) > 0 {
					line.Text = strings.TrimSpace(visionString(second[0], ""))
				}
				if len(second) > 1 {
					line.Confidence = visionFloat(second[1], 0)
				}
			case map[string]interface{}:
				line.Text = strings.TrimSpace(visionString(second["text"], ""))
				line.Confidence = visionFloat(second["confidence"], visionFloat(second["score"], 0))
			case string:
				line.Text = strings.TrimSpace(second)
			}
		}
		return line
	default:
		return VisionLine{}
	}
}

func parseVisionBBox(raw interface{}) VisionBBox {
	switch box := raw.(type) {
	case map[string]interface{}:
		return VisionBBox{
			X:      visionInt(box["x"], 0),
			Y:      visionInt(box["y"], 0),
			Width:  visionInt(box["width"], 0),
			Height: visionInt(box["height"], 0),
		}
	case []interface{}:
		// [x, y, w, h]
		if len(box) == 4 && isNumericVision(box[0]) && isNumericVision(box[1]) && isNumericVision(box[2]) && isNumericVision(box[3]) {
			return VisionBBox{
				X:      visionInt(box[0], 0),
				Y:      visionInt(box[1], 0),
				Width:  visionInt(box[2], 0),
				Height: visionInt(box[3], 0),
			}
		}

		// Polygon points [[x1,y1],[x2,y2],...]
		if len(box) > 0 {
			minX, minY := 1<<31-1, 1<<31-1
			maxX, maxY := -1, -1
			for _, point := range box {
				xy, ok := point.([]interface{})
				if !ok || len(xy) < 2 {
					continue
				}
				x := visionInt(xy[0], 0)
				y := visionInt(xy[1], 0)
				if x < minX {
					minX = x
				}
				if y < minY {
					minY = y
				}
				if x > maxX {
					maxX = x
				}
				if y > maxY {
					maxY = y
				}
			}
			if maxX >= minX && maxY >= minY && minX >= 0 && minY >= 0 {
				return VisionBBox{
					X:      minX,
					Y:      minY,
					Width:  maxX - minX,
					Height: maxY - minY,
				}
			}
		}
	}
	return VisionBBox{}
}

func visionExtractImage(options map[string]interface{}) (string, error) {
	if image, ok := options["image"]; ok {
		return visionResolveImageSource(image, "image")
	}
	if imageBytes, ok := options["imageBytes"]; ok {
		return visionResolveImageSource(imageBytes, "imageBytes")
	}
	if image, ok := options["imageBase64"]; ok {
		return visionResolveImageSource(image, "imageBase64")
	}
	if path, ok := options["imagePath"]; ok {
		return visionResolveImageSource(map[string]interface{}{"path": path}, "imagePath")
	}
	return "", fmt.Errorf("missing image input: provide image/imageBase64/imagePath")
}

func visionResolveImageSource(raw interface{}, fieldName string) (string, error) {
	switch v := raw.(type) {
	case map[string]interface{}:
		if bytesValue, ok := visionBinaryFieldValue(v, "bytes", "imageBytes", "dataBytes", "byteArray"); ok {
			return visionEncodeBinary(bytesValue, fieldName+".bytes")
		}
		if mediaID := strings.TrimSpace(visionString(v["mediaId"], "")); mediaID != "" {
			return "", fmt.Errorf("%s.mediaId is not implemented yet", fieldName)
		}
		if path := strings.TrimSpace(visionString(v["path"], "")); path != "" {
			return visionReadImagePath(path, fieldName+".path")
		}
		if path := strings.TrimSpace(visionString(v["imagePath"], "")); path != "" {
			return visionReadImagePath(path, fieldName+".imagePath")
		}
		if base64Value := strings.TrimSpace(visionString(v["base64"], "")); base64Value != "" {
			return normalizeVisionBase64(base64Value), nil
		}
		if base64Value := strings.TrimSpace(visionString(v["imageBase64"], "")); base64Value != "" {
			return normalizeVisionBase64(base64Value), nil
		}
		if dataValue := strings.TrimSpace(visionString(v["data"], "")); dataValue != "" {
			return normalizeVisionBase64(dataValue), nil
		}
		if urlValue := strings.TrimSpace(visionString(v["url"], "")); urlValue != "" {
			return "", fmt.Errorf("%s.url is not implemented yet", fieldName)
		}
		return "", fmt.Errorf("missing %s source: provide path/base64/imagePath/imageBase64", fieldName)
	case string:
		return visionResolveImageString(v, fieldName)
	case fmt.Stringer:
		return visionResolveImageString(v.String(), fieldName)
	default:
		if bytesValue, ok := visionBinaryValue(raw); ok {
			return visionEncodeBinary(bytesValue, fieldName)
		}
		if raw == nil {
			return "", fmt.Errorf("%s cannot be empty", fieldName)
		}
		return visionResolveImageString(visionString(raw, ""), fieldName)
	}
}

func visionResolveImageString(value, fieldName string) (string, error) {
	s := strings.TrimSpace(value)
	if s == "" {
		return "", fmt.Errorf("%s cannot be empty", fieldName)
	}
	if strings.HasPrefix(s, "data:image/") || isLikelyBase64Payload(s) {
		return normalizeVisionBase64(s), nil
	}
	if _, err := os.Stat(s); err == nil {
		return visionReadImagePath(s, fieldName)
	}
	if filepath.IsAbs(s) || strings.Contains(s, "/") || strings.Contains(s, `\`) {
		return visionReadImagePath(s, fieldName)
	}
	return normalizeVisionBase64(s), nil
}

func visionReadImagePath(imagePath, fieldName string) (string, error) {
	absPath := imagePath
	if !filepath.IsAbs(absPath) {
		var err error
		absPath, err = filepath.Abs(imagePath)
		if err != nil {
			return "", fmt.Errorf("failed to resolve %s: %w", fieldName, err)
		}
	}
	content, err := os.ReadFile(absPath)
	if err != nil {
		return "", fmt.Errorf("failed to read %s: %w", fieldName, err)
	}
	return base64.StdEncoding.EncodeToString(content), nil
}

func isLikelyBase64Payload(s string) bool {
	if len(s) < 32 || len(s)%4 != 0 {
		return false
	}
	for _, r := range s {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '+' || r == '/' || r == '=' {
			continue
		}
		return false
	}
	return true
}

func visionBinaryFieldValue(m map[string]interface{}, keys ...string) ([]byte, bool) {
	for _, key := range keys {
		if raw, ok := m[key]; ok {
			if bytesValue, ok := visionBinaryValue(raw); ok {
				return bytesValue, true
			}
		}
	}
	return nil, false
}

func visionBinaryValue(raw interface{}) ([]byte, bool) {
	switch v := raw.(type) {
	case []byte:
		return append([]byte(nil), v...), true
	case []interface{}:
		out := make([]byte, 0, len(v))
		for _, item := range v {
			n := visionInt(item, -1)
			if n < 0 || n > 255 {
				return nil, false
			}
			out = append(out, byte(n))
		}
		return out, true
	case goja.ArrayBuffer:
		return append([]byte(nil), v.Bytes()...), true
	case *goja.ArrayBuffer:
		if v == nil {
			return nil, false
		}
		return append([]byte(nil), v.Bytes()...), true
	default:
		return nil, false
	}
}

func visionEncodeBinary(data []byte, fieldName string) (string, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("%s cannot be empty", fieldName)
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func normalizeVisionBase64(s string) string {
	if idx := strings.Index(s, "base64,"); idx >= 0 {
		return strings.TrimSpace(s[idx+7:])
	}
	return strings.TrimSpace(s)
}

func joinVisionLines(lines []VisionLine) string {
	if len(lines) == 0 {
		return ""
	}
	parts := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line.Text) != "" {
			parts = append(parts, strings.TrimSpace(line.Text))
		}
	}
	return strings.Join(parts, "\n")
}

func visionLineMatches(text, target, matchMode string) bool {
	if strings.TrimSpace(target) == "" {
		return true
	}
	source := visionComparableText(text)
	target = visionComparableText(target)
	switch matchMode {
	case "exact":
		return source == target
	default:
		return strings.Contains(source, target)
	}
}

func visionGuessRole(text string) string {
	t := strings.ToLower(strings.TrimSpace(text))
	if t == "" {
		return ""
	}
	buttonHints := []string{"发送", "send", "提交", "submit", "确定", "ok", "登录", "回复", "保存", "下一步", "next"}
	for _, hint := range buttonHints {
		if strings.Contains(t, hint) {
			return "button"
		}
	}
	inputHints := []string{"搜索", "search", "输入", "input"}
	for _, hint := range inputHints {
		if strings.Contains(t, hint) {
			return "input"
		}
	}
	return "text"
}

func truncateVision(raw []byte, max int) string {
	if len(raw) <= max {
		return string(raw)
	}
	return string(raw[:max]) + "..."
}

func visionComparableText(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(s)), ""))
}

func isNumericVision(v interface{}) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64, float32, float64, json.Number:
		return true
	default:
		return false
	}
}

func visionStringOption(options map[string]interface{}, key, def string) string {
	if options == nil {
		return def
	}
	value, ok := options[key]
	if !ok {
		return def
	}
	return visionString(value, def)
}

func visionBoolOption(options map[string]interface{}, key string, def bool) bool {
	if options == nil {
		return def
	}
	value, ok := options[key]
	if !ok {
		return def
	}
	return visionBool(value, def)
}

func visionIntOption(options map[string]interface{}, key string, def int) int {
	if options == nil {
		return def
	}
	value, ok := options[key]
	if !ok {
		return def
	}
	return visionInt(value, def)
}

func visionFloatOption(options map[string]interface{}, key string, def float64) float64 {
	if options == nil {
		return def
	}
	value, ok := options[key]
	if !ok {
		return def
	}
	return visionFloat(value, def)
}

func visionString(v interface{}, def string) string {
	switch s := v.(type) {
	case string:
		return s
	case fmt.Stringer:
		return s.String()
	default:
		if v == nil {
			return def
		}
		return fmt.Sprintf("%v", v)
	}
}

func visionBool(v interface{}, def bool) bool {
	switch b := v.(type) {
	case bool:
		return b
	case string:
		switch strings.ToLower(strings.TrimSpace(b)) {
		case "1", "true", "yes", "y", "on":
			return true
		case "0", "false", "no", "n", "off":
			return false
		default:
			return def
		}
	default:
		return def
	}
}

func visionInt(v interface{}, def int) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return int(i)
		}
		return def
	case string:
		if i, err := strconv.Atoi(strings.TrimSpace(n)); err == nil {
			return i
		}
		return def
	default:
		return def
	}
}

func visionFloat(v interface{}, def float64) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		if f, err := n.Float64(); err == nil {
			return f
		}
		return def
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(n), 64); err == nil {
			return f
		}
		return def
	default:
		return def
	}
}

func normalizeProviderName(name string) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "paddleocr":
		return "paddle"
	case "tesseract":
		return "local"
	default:
		return strings.ToLower(strings.TrimSpace(name))
	}
}

func normalizeVisionLangByProvider(providerName, lang string) string {
	normalizedProvider := normalizeProviderName(providerName)
	if normalizedProvider == "" {
		normalizedProvider = "paddle"
	}
	lang = strings.TrimSpace(lang)
	if lang == "" {
		lang = "ch"
	}
	switch normalizedProvider {
	case "paddle":
		return normalizePaddleLang(lang)
	case "local":
		return normalizeTesseractLang(lang)
	default:
		return strings.ToLower(lang)
	}
}

func normalizePaddleLang(lang string) string {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case "ch", "zh", "zh-cn", "zh_cn", "zh-hans", "cn", "chinese", "simplified", "simplified_chinese", "chi_sim":
		return "ch"
	case "chinese_cht", "zh-tw", "zh_tw", "zh-hk", "zh-hant", "traditional", "traditional_chinese", "chi_tra":
		return "chinese_cht"
	case "en", "eng", "english":
		return "en"
	case "japan", "ja", "jp", "jpn", "japanese":
		return "japan"
	case "korean", "ko", "kr", "kor":
		return "korean"
	default:
		return strings.ToLower(strings.TrimSpace(lang))
	}
}

func normalizeTesseractLang(lang string) string {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case "ch", "zh", "zh-cn", "zh_cn", "zh-hans", "cn", "chinese", "simplified", "simplified_chinese", "chi_sim":
		return "chi_sim+eng"
	case "chinese_cht", "zh-tw", "zh_tw", "zh-hk", "zh-hant", "traditional", "traditional_chinese", "chi_tra":
		return "chi_tra+eng"
	case "en", "eng", "english":
		return "eng"
	default:
		return strings.TrimSpace(lang)
	}
}

func visionStringEnv(key, def string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return def
}

func visionCSVEnvOrDefault(key string, defaults []string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return defaults
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		canonical := normalizePaddleLang(value)
		if _, ok := seen[canonical]; ok {
			continue
		}
		seen[canonical] = struct{}{}
		out = append(out, canonical)
	}
	if len(out) == 0 {
		return defaults
	}
	sort.Strings(out)
	return out
}

func visionMergedOptions(options map[string]interface{}) map[string]interface{} {
	merged := map[string]interface{}{}
	if options == nil {
		return merged
	}

	if profileRaw, ok := options["visionProfile"]; ok {
		if profile := visionToMap(profileRaw); profile != nil {
			for k, v := range profile {
				merged[k] = v
			}
		}
	}

	for k, v := range options {
		if k == "visionProfile" {
			continue
		}
		merged[k] = v
	}
	return merged
}

func visionToMap(raw interface{}) map[string]interface{} {
	switch v := raw.(type) {
	case map[string]interface{}:
		return v
	default:
		return nil
	}
}
