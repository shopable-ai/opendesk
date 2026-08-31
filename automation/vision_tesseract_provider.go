package automation

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type LocalTesseractOCRProvider struct{}

func (p *LocalTesseractOCRProvider) Name() string {
	return "local"
}

func (p *LocalTesseractOCRProvider) Capabilities() map[string]interface{} {
	return map[string]interface{}{
		"provider":                   p.Name(),
		"implemented":                true,
		"switchReady":                true,
		"defaultLang":                "ch",
		"supportedLangs":             []string{"ch", "en", "chinese_cht"},
		"supportsDetectOrientation":  false,
		"supportsRecognizeDirection": false,
		"endpointRequired":           false,
		"binary":                     "tesseract",
	}
}

func (p *LocalTesseractOCRProvider) OCR(ctx context.Context, req *VisionOCRRequest) (*VisionOCRResult, error) {
	if strings.TrimSpace(req.ImageBase64) == "" {
		return nil, fmt.Errorf("image cannot be empty")
	}
	imagePath, cleanup, err := writeVisionTempImage(req.ImageBase64)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	lang := normalizeVisionLangByProvider(p.Name(), req.Lang)
	lines, err := runTesseractTSV(ctx, imagePath, lang)
	if err != nil {
		return nil, err
	}

	text := joinVisionLines(lines)
	if strings.TrimSpace(text) == "" {
		plainText, textErr := runTesseractPlainText(ctx, imagePath, lang)
		if textErr == nil {
			text = plainText
		}
	}

	return &VisionOCRResult{
		Provider: p.Name(),
		Lang:     req.Lang,
		Text:     strings.TrimSpace(text),
		Lines:    lines,
		Raw: map[string]interface{}{
			"source": "tesseract",
			"lang":   lang,
			"lines":  len(lines),
		},
	}, nil
}

func writeVisionTempImage(imageBase64 string) (string, func(), error) {
	decoded, err := base64.StdEncoding.DecodeString(normalizeVisionBase64(imageBase64))
	if err != nil {
		return "", nil, fmt.Errorf("failed to decode image base64: %w", err)
	}

	tmp, err := os.CreateTemp("", "opendesk-vision-*.png")
	if err != nil {
		return "", nil, fmt.Errorf("failed to create temp image: %w", err)
	}
	if _, err := tmp.Write(decoded); err != nil {
		tmp.Close()
		_ = os.Remove(tmp.Name())
		return "", nil, fmt.Errorf("failed to write temp image: %w", err)
	}
	_ = tmp.Close()
	return tmp.Name(), func() { _ = os.Remove(tmp.Name()) }, nil
}

func runTesseractPlainText(ctx context.Context, imagePath, lang string) (string, error) {
	args := []string{imagePath, "stdout", "-l", lang, "--psm", "6"}
	out, err := runVisionCommand(ctx, "tesseract", args...)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func runTesseractTSV(ctx context.Context, imagePath, lang string) ([]VisionLine, error) {
	args := []string{imagePath, "stdout", "-l", lang, "--psm", "6", "tsv"}
	out, err := runVisionCommand(ctx, "tesseract", args...)
	if err != nil {
		return nil, err
	}
	return parseTesseractTSV(string(out)), nil
}

func runVisionCommand(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf("%s failed: %s", name, msg)
	}
	return stdout.Bytes(), nil
}

func parseTesseractTSV(raw string) []VisionLine {
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	if len(lines) <= 1 {
		return nil
	}

	type agg struct {
		Texts      []string
		Confidence float64
		ConfCount  int
		MinX       int
		MinY       int
		MaxX       int
		MaxY       int
	}

	aggregated := map[string]*agg{}
	order := make([]string, 0)
	for _, row := range lines[1:] {
		if strings.TrimSpace(row) == "" {
			continue
		}
		fields := strings.Split(row, "\t")
		if len(fields) < 12 {
			continue
		}
		level := visionInt(fields[0], 0)
		if level != 5 {
			continue
		}
		text := strings.TrimSpace(fields[11])
		if text == "" {
			continue
		}
		left := visionInt(fields[6], 0)
		top := visionInt(fields[7], 0)
		width := visionInt(fields[8], 0)
		height := visionInt(fields[9], 0)
		conf := visionFloat(fields[10], -1)
		key := strings.Join(fields[1:5], ":")
		current := aggregated[key]
		if current == nil {
			current = &agg{
				MinX: left,
				MinY: top,
				MaxX: left + width,
				MaxY: top + height,
			}
			aggregated[key] = current
			order = append(order, key)
		}
		current.Texts = append(current.Texts, text)
		if conf >= 0 {
			current.Confidence += conf
			current.ConfCount++
		}
		if left < current.MinX {
			current.MinX = left
		}
		if top < current.MinY {
			current.MinY = top
		}
		if left+width > current.MaxX {
			current.MaxX = left + width
		}
		if top+height > current.MaxY {
			current.MaxY = top + height
		}
	}

	out := make([]VisionLine, 0, len(order))
	for _, key := range order {
		current := aggregated[key]
		if current == nil || len(current.Texts) == 0 {
			continue
		}
		conf := 0.0
		if current.ConfCount > 0 {
			conf = current.Confidence / float64(current.ConfCount) / 100.0
		}
		out = append(out, VisionLine{
			Text:       strings.Join(current.Texts, " "),
			Confidence: conf,
			BBox: VisionBBox{
				X:      current.MinX,
				Y:      current.MinY,
				Width:  current.MaxX - current.MinX,
				Height: current.MaxY - current.MinY,
			},
		})
	}
	return out
}
