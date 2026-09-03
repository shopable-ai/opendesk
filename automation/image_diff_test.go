package automation

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestImageColorDiffIdenticalImages(t *testing.T) {
	actual := imageDiffTestImage(2, 2, color.NRGBA{R: 10, G: 20, B: 30, A: 255})
	result := imageDiffTestRun(t, actual, actual, nil)

	imageDiffTestEqual(t, result, "matched", true)
	imageDiffTestEqualInt(t, result, "width", 2)
	imageDiffTestEqualInt(t, result, "height", 2)
	imageDiffTestEqualInt(t, result, "totalPixels", 4)
	imageDiffTestEqualInt(t, result, "comparedPixels", 4)
	imageDiffTestEqualInt(t, result, "ignoredPixels", 0)
	imageDiffTestEqualInt(t, result, "diffPixels", 0)
	imageDiffTestEqualFloat(t, result, "diffRatio", 0)
	imageDiffTestEqualFloat(t, result, "meanAbsoluteError", 0)
	imageDiffTestEqualInt(t, result, "maxChannelDiff", 0)
	imageDiffTestEqualInt(t, result, "pixelThreshold", 0)
	imageDiffTestEqual(t, result, "includeAlpha", false)
	if result["changedBounds"] != nil {
		t.Fatalf("changedBounds = %#v, want nil", result["changedBounds"])
	}
	if _, exists := result["diffPath"]; exists {
		t.Fatal("diffPath must be omitted without outputPath")
	}
	if _, exists := result["diffImage"]; exists {
		t.Fatal("diffImage must be omitted by default")
	}
}

func TestImageColorDiffSinglePixelAndThresholdBoundary(t *testing.T) {
	actual := imageDiffTestImage(1, 1, color.NRGBA{R: 10, G: 20, B: 30, A: 255})
	expectedAtThreshold := imageDiffTestImage(1, 1, color.NRGBA{R: 18, G: 20, B: 30, A: 255})
	expectedAboveThreshold := imageDiffTestImage(1, 1, color.NRGBA{R: 19, G: 20, B: 30, A: 255})

	atThreshold := imageDiffTestRun(t, actual, expectedAtThreshold, map[string]interface{}{"pixelThreshold": 8})
	imageDiffTestEqualInt(t, atThreshold, "diffPixels", 0)
	imageDiffTestEqual(t, atThreshold, "matched", true)
	imageDiffTestEqualInt(t, atThreshold, "maxChannelDiff", 8)
	imageDiffTestEqualFloat(t, atThreshold, "meanAbsoluteError", 8.0/3.0)

	aboveThreshold := imageDiffTestRun(t, actual, expectedAboveThreshold, map[string]interface{}{"pixelThreshold": 8})
	imageDiffTestEqualInt(t, aboveThreshold, "diffPixels", 1)
	imageDiffTestEqual(t, aboveThreshold, "matched", false)
	imageDiffTestEqualFloat(t, aboveThreshold, "diffRatio", 1)
	imageDiffTestEqualInt(t, aboveThreshold, "maxChannelDiff", 9)
	imageDiffTestBounds(t, aboveThreshold, 0, 0, 1, 1)
}

func TestImageColorDiffMultiplePixelsAndChangedBounds(t *testing.T) {
	actual := imageDiffTestImage(4, 3, color.NRGBA{A: 255})
	expected := imageDiffTestImage(4, 3, color.NRGBA{A: 255})
	expected.SetNRGBA(3, 0, color.NRGBA{R: 10, A: 255})
	expected.SetNRGBA(1, 2, color.NRGBA{G: 20, A: 255})

	result := imageDiffTestRun(t, actual, expected, nil)
	imageDiffTestEqualInt(t, result, "diffPixels", 2)
	imageDiffTestEqualFloat(t, result, "diffRatio", 2.0/12.0)
	imageDiffTestEqualFloat(t, result, "meanAbsoluteError", 30.0/(12.0*3.0))
	imageDiffTestEqualInt(t, result, "maxChannelDiff", 20)
	imageDiffTestBounds(t, result, 1, 0, 3, 3)
}

func TestImageColorDiffLimits(t *testing.T) {
	actual := imageDiffTestImage(4, 1, color.NRGBA{A: 255})
	expected := imageDiffTestImage(4, 1, color.NRGBA{A: 255})
	expected.SetNRGBA(0, 0, color.NRGBA{R: 1, A: 255})
	expected.SetNRGBA(1, 0, color.NRGBA{G: 1, A: 255})

	tests := []struct {
		name    string
		options map[string]interface{}
		matched bool
	}{
		{name: "max pixels pass", options: map[string]interface{}{"maxDiffPixels": 2}, matched: true},
		{name: "max pixels fail", options: map[string]interface{}{"maxDiffPixels": 1}, matched: false},
		{name: "max ratio pass", options: map[string]interface{}{"maxDiffRatio": 0.5}, matched: true},
		{name: "max ratio fail", options: map[string]interface{}{"maxDiffRatio": 0.49}, matched: false},
		{name: "both pass", options: map[string]interface{}{"maxDiffPixels": 2, "maxDiffRatio": 0.5}, matched: true},
		{name: "pixels pass ratio fails", options: map[string]interface{}{"maxDiffPixels": 2, "maxDiffRatio": 0.49}, matched: false},
		{name: "ratio passes pixels fail", options: map[string]interface{}{"maxDiffPixels": 1, "maxDiffRatio": 0.5}, matched: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := imageDiffTestRun(t, actual, expected, test.options)
			imageDiffTestEqual(t, result, "matched", test.matched)
		})
	}
}

func TestImageColorDiffIgnoreRegionsUnionAndClipping(t *testing.T) {
	actual := imageDiffTestImage(4, 2, color.NRGBA{A: 255})
	expected := imageDiffTestImage(4, 2, color.NRGBA{R: 100, A: 255})
	options := map[string]interface{}{
		"ignoreRegions": []interface{}{
			map[string]interface{}{"x": 0, "y": 0, "width": 3, "height": 2},
			map[string]interface{}{"x": 2, "y": 0, "width": 4, "height": 1},
			map[string]interface{}{"x": -10, "y": -10, "width": 2, "height": 2},
			map[string]interface{}{"x": 100, "y": 100, "width": 10, "height": 10},
		},
	}

	result := imageDiffTestRun(t, actual, expected, options)
	imageDiffTestEqualInt(t, result, "ignoredPixels", 7)
	imageDiffTestEqualInt(t, result, "comparedPixels", 1)
	imageDiffTestEqualInt(t, result, "diffPixels", 1)
	imageDiffTestEqualFloat(t, result, "diffRatio", 1)
	imageDiffTestBounds(t, result, 3, 1, 1, 1)
}

func TestImageColorDiffAllPixelsIgnored(t *testing.T) {
	actual := imageDiffTestImage(2, 2, color.NRGBA{A: 255})
	expected := imageDiffTestImage(2, 2, color.NRGBA{R: 255, G: 255, B: 255, A: 0})
	result := imageDiffTestRun(t, actual, expected, map[string]interface{}{
		"includeAlpha": true,
		"ignoreRegions": []interface{}{
			map[string]interface{}{"x": -1, "y": -1, "width": 10, "height": 10},
		},
	})

	imageDiffTestEqual(t, result, "matched", true)
	imageDiffTestEqualInt(t, result, "ignoredPixels", 4)
	imageDiffTestEqualInt(t, result, "comparedPixels", 0)
	imageDiffTestEqualInt(t, result, "diffPixels", 0)
	imageDiffTestEqualFloat(t, result, "diffRatio", 0)
	imageDiffTestEqualFloat(t, result, "meanAbsoluteError", 0)
	imageDiffTestEqualInt(t, result, "maxChannelDiff", 0)
	if result["changedBounds"] != nil {
		t.Fatalf("changedBounds = %#v, want nil", result["changedBounds"])
	}
}

func TestImageColorDiffAlphaOption(t *testing.T) {
	actual := imageDiffTestImage(1, 1, color.NRGBA{R: 10, G: 20, B: 30, A: 0})
	expected := imageDiffTestImage(1, 1, color.NRGBA{R: 10, G: 20, B: 30, A: 255})

	withoutAlpha := imageDiffTestRun(t, actual, expected, nil)
	imageDiffTestEqualInt(t, withoutAlpha, "diffPixels", 0)
	imageDiffTestEqualInt(t, withoutAlpha, "maxChannelDiff", 0)
	imageDiffTestEqualFloat(t, withoutAlpha, "meanAbsoluteError", 0)

	withAlpha := imageDiffTestRun(t, actual, expected, map[string]interface{}{"includeAlpha": true})
	imageDiffTestEqualInt(t, withAlpha, "diffPixels", 1)
	imageDiffTestEqualInt(t, withAlpha, "maxChannelDiff", 255)
	imageDiffTestEqualFloat(t, withAlpha, "meanAbsoluteError", 255.0/4.0)
}

func TestImageColorDiffRejectsDifferentSizesAndInvalidImages(t *testing.T) {
	ic := NewImageColor()
	actual := imageDiffTestDataURL(t, imageDiffTestImage(2, 2, color.NRGBA{A: 255}))
	expected := imageDiffTestDataURL(t, imageDiffTestImage(3, 1, color.NRGBA{A: 255}))
	if _, err := ic.Diff(actual, expected, nil); err == nil || !strings.Contains(err.Error(), "actual=2x2 expected=3x1") {
		t.Fatalf("dimension error = %v", err)
	}
	if _, err := ic.Diff("", actual, nil); err == nil || !strings.Contains(err.Error(), "actual image") {
		t.Fatalf("empty image error = %v", err)
	}
	if _, err := ic.Diff("data:image/png;base64,not-base64", actual, nil); err == nil || !strings.Contains(err.Error(), "actual image") {
		t.Fatalf("decode error = %v", err)
	}
}

func TestImageColorDiffPathDataURLAndBase64Inputs(t *testing.T) {
	actualImage := imageDiffTestImage(2, 2, color.NRGBA{R: 1, G: 2, B: 3, A: 255})
	expectedImage := imageDiffTestImage(2, 2, color.NRGBA{R: 1, G: 2, B: 3, A: 255})
	expectedImage.SetNRGBA(1, 0, color.NRGBA{R: 2, G: 2, B: 3, A: 255})

	temporaryDirectory := t.TempDir()
	actualPath := filepath.Join(temporaryDirectory, "actual.png")
	imageDiffTestWritePNG(t, actualPath, actualImage)
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	relativeActualPath, err := filepath.Rel(workingDirectory, actualPath)
	if err != nil {
		t.Fatal(err)
	}
	expectedDataURL := imageDiffTestDataURL(t, expectedImage)
	expectedBase64 := strings.TrimPrefix(expectedDataURL, "data:image/png;base64,")

	fromPathAndDataURL, err := NewImageColor().Diff(actualPath, expectedDataURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	imageDiffTestEqualInt(t, fromPathAndDataURL, "diffPixels", 1)
	fromRelativePath, err := NewImageColor().Diff(relativeActualPath, expectedDataURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	imageDiffTestEqualInt(t, fromRelativePath, "diffPixels", 1)

	fromDataURLAndBase64, err := NewImageColor().Diff(imageDiffTestDataURL(t, actualImage), expectedBase64, nil)
	if err != nil {
		t.Fatal(err)
	}
	imageDiffTestEqualInt(t, fromDataURLAndBase64, "diffPixels", 1)
}

func TestImageColorDiffWritesDeterministicPNGAndDataURL(t *testing.T) {
	actual := imageDiffTestImage(2, 1, color.NRGBA{R: 30, G: 60, B: 90, A: 255})
	expected := imageDiffTestImage(2, 1, color.NRGBA{R: 50, G: 60, B: 90, A: 255})
	outputPath := filepath.Join(t.TempDir(), "nested", "diff.png")
	options := map[string]interface{}{
		"ignoreRegions": []interface{}{
			map[string]interface{}{"x": 1, "y": 0, "width": 1, "height": 1},
		},
		"outputPath": outputPath, "includeDiffImage": true,
	}

	result := imageDiffTestRun(t, actual, expected, options)
	imageDiffTestEqual(t, result, "diffPath", outputPath)
	imageDiffTestEqualInt(t, result, "diffPixels", 1)
	imageDiffTestEqualInt(t, result, "ignoredPixels", 1)
	diffDataURL, ok := result["diffImage"].(string)
	if !ok || !strings.HasPrefix(diffDataURL, "data:image/png;base64,") {
		t.Fatalf("diffImage = %#v", result["diffImage"])
	}

	fileContents, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	dataURLContents, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(diffDataURL, "data:image/png;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(fileContents, dataURLContents) {
		t.Fatal("diffPath and diffImage must contain identical PNG bytes")
	}

	decoded, err := png.Decode(bytes.NewReader(fileContents))
	if err != nil {
		t.Fatalf("decode diff PNG: %v", err)
	}
	if decoded.Bounds().Dx() != 2 || decoded.Bounds().Dy() != 1 {
		t.Fatalf("diff dimensions = %v", decoded.Bounds())
	}
	if pixel := color.NRGBAModel.Convert(decoded.At(0, 0)).(color.NRGBA); pixel != (color.NRGBA{R: 255, A: 255}) {
		t.Fatalf("changed pixel = %#v", pixel)
	}
	if pixel := color.NRGBAModel.Convert(decoded.At(1, 0)).(color.NRGBA); pixel != (color.NRGBA{R: 60, G: 60, B: 60, A: 255}) {
		t.Fatalf("ignored pixel = %#v", pixel)
	}

	second := imageDiffTestRun(t, actual, expected, map[string]interface{}{"includeDiffImage": true})
	third := imageDiffTestRun(t, actual, expected, map[string]interface{}{"includeDiffImage": true})
	if second["diffImage"] != third["diffImage"] {
		t.Fatal("identical inputs must generate identical diff PNG data URLs")
	}
}

func TestImageColorDiffValidatesOptions(t *testing.T) {
	imageURL := imageDiffTestDataURL(t, imageDiffTestImage(1, 1, color.NRGBA{A: 255}))
	tests := []struct {
		name        string
		options     interface{}
		messagePart string
	}{
		{name: "options type", options: "bad", messagePart: "options must be an object"},
		{name: "unknown option", options: map[string]interface{}{"threshold": 1}, messagePart: "unknown field(s): threshold"},
		{name: "fractional threshold", options: map[string]interface{}{"pixelThreshold": 1.5}, messagePart: "pixelThreshold must be an integer"},
		{name: "threshold below range", options: map[string]interface{}{"pixelThreshold": -1}, messagePart: "pixelThreshold must be between 0 and 255"},
		{name: "threshold above range", options: map[string]interface{}{"pixelThreshold": 256}, messagePart: "pixelThreshold must be between 0 and 255"},
		{name: "infinite threshold", options: map[string]interface{}{"pixelThreshold": math.Inf(1)}, messagePart: "pixelThreshold must be finite"},
		{name: "negative max pixels", options: map[string]interface{}{"maxDiffPixels": -1}, messagePart: "maxDiffPixels must be between"},
		{name: "ratio above range", options: map[string]interface{}{"maxDiffRatio": 1.1}, messagePart: "maxDiffRatio must be between 0 and 1"},
		{name: "alpha type", options: map[string]interface{}{"includeAlpha": 1}, messagePart: "includeAlpha must be a boolean"},
		{name: "regions type", options: map[string]interface{}{"ignoreRegions": "bad"}, messagePart: "ignoreRegions must be an array"},
		{name: "missing region field", options: map[string]interface{}{"ignoreRegions": []interface{}{map[string]interface{}{"x": 0, "y": 0, "width": 1}}}, messagePart: ".height is required"},
		{name: "negative region width", options: map[string]interface{}{"ignoreRegions": []interface{}{map[string]interface{}{"x": 0, "y": 0, "width": -1, "height": 1}}}, messagePart: ".width must be between 0"},
		{name: "fractional region", options: map[string]interface{}{"ignoreRegions": []interface{}{map[string]interface{}{"x": 0.5, "y": 0, "width": 1, "height": 1}}}, messagePart: ".x must be an integer"},
		{name: "empty output path", options: map[string]interface{}{"outputPath": " "}, messagePart: "outputPath must not be empty"},
		{name: "diff image type", options: map[string]interface{}{"includeDiffImage": "yes"}, messagePart: "includeDiffImage must be a boolean"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := NewImageColor().Diff(imageURL, imageURL, test.options)
			if err == nil || !strings.Contains(err.Error(), test.messagePart) {
				t.Fatalf("error = %v, want substring %q", err, test.messagePart)
			}
		})
	}
}

func imageDiffTestRun(t *testing.T, actual, expected image.Image, options interface{}) map[string]interface{} {
	t.Helper()
	result, err := NewImageColor().Diff(imageDiffTestDataURL(t, actual), imageDiffTestDataURL(t, expected), options)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func imageDiffTestImage(width, height int, fill color.NRGBA) *image.NRGBA {
	result := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			result.SetNRGBA(x, y, fill)
		}
	}
	return result
}

func imageDiffTestDataURL(t *testing.T, source image.Image) string {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, source); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buffer.Bytes())
}

func imageDiffTestWritePNG(t *testing.T, path string, source image.Image) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, source); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func imageDiffTestEqual(t *testing.T, result map[string]interface{}, key string, expected interface{}) {
	t.Helper()
	if actual := result[key]; actual != expected {
		t.Fatalf("%s = %#v, want %#v", key, actual, expected)
	}
}

func imageDiffTestEqualInt(t *testing.T, result map[string]interface{}, key string, expected int64) {
	t.Helper()
	var actual int64
	switch value := result[key].(type) {
	case int:
		actual = int64(value)
	case int64:
		actual = value
	case uint8:
		actual = int64(value)
	default:
		t.Fatalf("%s has unexpected type %T", key, result[key])
	}
	if actual != expected {
		t.Fatalf("%s = %d, want %d", key, actual, expected)
	}
}

func imageDiffTestEqualFloat(t *testing.T, result map[string]interface{}, key string, expected float64) {
	t.Helper()
	actual, ok := result[key].(float64)
	if !ok {
		t.Fatalf("%s has unexpected type %T", key, result[key])
	}
	if math.Abs(actual-expected) > 1e-12 {
		t.Fatalf("%s = %.16f, want %.16f", key, actual, expected)
	}
}

func imageDiffTestBounds(t *testing.T, result map[string]interface{}, x, y, width, height int64) {
	t.Helper()
	bounds, ok := result["changedBounds"].(map[string]interface{})
	if !ok {
		t.Fatalf("changedBounds = %#v", result["changedBounds"])
	}
	imageDiffTestEqualInt(t, bounds, "x", x)
	imageDiffTestEqualInt(t, bounds, "y", y)
	imageDiffTestEqualInt(t, bounds, "width", width)
	imageDiffTestEqualInt(t, bounds, "height", height)
}
