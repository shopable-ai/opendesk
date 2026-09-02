package automation

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

// OCR provides text extraction powered by the local tesseract CLI.
type OCR struct{}

func NewOCR() *OCR {
	return &OCR{}
}

// ExtractText extracts text from an image path or data URI.
// image can be:
// 1) absolute/relative file path
// 2) data:image/...;base64,...
// lang defaults to "chi_sim+eng".
func (o *OCR) ExtractText(image string, lang ...string) (string, error) {
	image = strings.TrimSpace(image)
	if image == "" {
		return "", fmt.Errorf("image cannot be empty")
	}

	language := "chi_sim+eng"
	if len(lang) > 0 && strings.TrimSpace(lang[0]) != "" {
		language = strings.TrimSpace(lang[0])
	}

	inputPath, cleanup, err := resolveOCRInput(image)
	if err != nil {
		return "", err
	}
	if cleanup != nil {
		defer cleanup()
	}

	candidates := []ocrCandidate{
		{imagePath: inputPath, psm: "6", tag: "origin-psm6"},
		{imagePath: inputPath, psm: "11", tag: "origin-psm11"},
	}

	enhancedPath, enhancedCleanup, enhancedErr := buildEnhancedOCRImage(inputPath)
	if enhancedErr == nil && enhancedPath != "" {
		if enhancedCleanup != nil {
			defer enhancedCleanup()
		}
		candidates = append(candidates,
			ocrCandidate{imagePath: enhancedPath, psm: "6", tag: "enhanced-psm6"},
			ocrCandidate{imagePath: enhancedPath, psm: "11", tag: "enhanced-psm11"},
		)
	}

	var lastErr error
	bestText := ""
	bestScore := -1
	for _, c := range candidates {
		text, err := runTesseractOCR(c.imagePath, language, c.psm)
		if err != nil {
			lastErr = err
			continue
		}
		score := scoreOCRText(text)
		if score > bestScore {
			bestScore = score
			bestText = text
		}
	}

	if strings.TrimSpace(bestText) == "" {
		if lastErr != nil {
			return "", lastErr
		}
		return "", fmt.Errorf("tesseract returned empty text")
	}
	return strings.TrimSpace(bestText), nil
}

type ocrCandidate struct {
	imagePath string
	psm       string
	tag       string
}

func runTesseractOCR(imagePath, language, psm string) (string, error) {
	args := []string{imagePath, "stdout", "-l", language, "--psm", psm}
	cmd := exec.Command("tesseract", args...)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("tesseract failed: %s", msg)
	}

	return strings.TrimSpace(stdout.String()), nil
}

func buildEnhancedOCRImage(inputPath string) (string, func(), error) {
	magickPath, err := exec.LookPath("magick")
	if err != nil {
		return "", nil, fmt.Errorf("magick not found")
	}

	tmp, err := os.CreateTemp("", "testmonkey-ocr-enhanced-*.png")
	if err != nil {
		return "", nil, fmt.Errorf("failed to create enhanced temp image: %w", err)
	}
	_ = tmp.Close()
	outPath := tmp.Name()

	// A conservative enhancement chain for UI text:
	// grayscale + upscale + mild sharpen + contrast stretch.
	cmd := exec.Command(
		magickPath,
		inputPath,
		"-colorspace", "Gray",
		"-resize", "220%",
		"-sharpen", "0x1.0",
		"-contrast-stretch", "1%x1%",
		outPath,
	)
	if err := cmd.Run(); err != nil {
		_ = os.Remove(outPath)
		return "", nil, fmt.Errorf("magick enhancement failed: %w", err)
	}

	cleanup := func() {
		_ = os.Remove(outPath)
	}
	return outPath, cleanup, nil
}

func scoreOCRText(text string) int {
	text = strings.TrimSpace(text)
	if text == "" {
		return 0
	}
	totalRunes := utf8.RuneCountInString(text)
	if totalRunes == 0 {
		return 0
	}

	cjkRe := regexp.MustCompile(`[\p{Han}]`)
	alnumRe := regexp.MustCompile(`[A-Za-z0-9]`)
	cjkCount := len(cjkRe.FindAllString(text, -1))
	alnumCount := len(alnumRe.FindAllString(text, -1))
	lines := strings.Split(text, "\n")
	nonEmptyLines := 0
	for _, l := range lines {
		if strings.TrimSpace(l) != "" {
			nonEmptyLines++
		}
	}

	// Prefer richer content while favoring readable CJK/alnum signal and multiline text.
	return totalRunes + cjkCount*2 + alnumCount + nonEmptyLines*3
}

func resolveOCRInput(image string) (string, func(), error) {
	if strings.HasPrefix(image, "data:image/") {
		raw := image
		if idx := strings.Index(raw, ","); idx >= 0 {
			raw = raw[idx+1:]
		}
		decoded, err := base64.StdEncoding.DecodeString(raw)
		if err != nil {
			return "", nil, fmt.Errorf("failed to decode image base64: %w", err)
		}

		tmp, err := os.CreateTemp("", "testmonkey-ocr-*.png")
		if err != nil {
			return "", nil, fmt.Errorf("failed to create temp image: %w", err)
		}
		if _, err := tmp.Write(decoded); err != nil {
			tmp.Close()
			os.Remove(tmp.Name())
			return "", nil, fmt.Errorf("failed to write temp image: %w", err)
		}
		tmp.Close()
		cleanup := func() {
			_ = os.Remove(tmp.Name())
		}
		return tmp.Name(), cleanup, nil
	}

	inputPath := image
	if !filepath.IsAbs(inputPath) {
		wd, err := os.Getwd()
		if err != nil {
			return "", nil, fmt.Errorf("failed to resolve working directory: %w", err)
		}
		inputPath = filepath.Join(wd, image)
	}

	if _, err := os.Stat(inputPath); err != nil {
		return "", nil, fmt.Errorf("image not found: %s", inputPath)
	}
	return inputPath, nil, nil
}
