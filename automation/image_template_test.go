package automation

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestImageColorFindImageFindsBestAndPreservesFindPos(t *testing.T) {
	source, template := templateTestScene(t)
	ic := NewImageColor()

	result, err := ic.FindImage(templateTestDataURL(t, source), templateTestDataURL(t, template), map[string]interface{}{
		"threshold": 0.99,
	})
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, result, true, 30, 12, 14, 10, 1)
	if result["centerX"] != 37.0 || result["centerY"] != 17.0 {
		t.Fatalf("unexpected center: %#v", result)
	}

	legacy, err := ic.FindPos(templateTestDataURL(t, source), templateTestDataURL(t, template), 0.99)
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, legacy, true, 30, 12, 14, 10, 0)
	if _, exists := legacy["scale"]; exists {
		t.Fatalf("findPos must preserve its legacy result shape: %#v", legacy)
	}

	absent := templateTestPattern(14, 10, 99)
	missing, err := ic.FindImage(templateTestDataURL(t, source), templateTestDataURL(t, absent), map[string]interface{}{
		"threshold": 0.99,
	})
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, missing, false, -1, -1, 14, 10, 1)
}

func TestImageColorFindImageDefaultThresholdBoundary(t *testing.T) {
	ic := NewImageColor()
	template := image.NewNRGBA(image.Rect(0, 0, 14, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 14; x++ {
			template.SetNRGBA(x, y, color.NRGBA{A: 255})
		}
	}

	// A deterministic 38-level RGB shift scores 1 - 38/255, just above the
	// public 0.85 default. A 39-level shift scores just below it.
	justAbove := image.NewNRGBA(template.Bounds())
	justBelow := image.NewNRGBA(template.Bounds())
	for y := 0; y < 10; y++ {
		for x := 0; x < 14; x++ {
			justAbove.SetNRGBA(x, y, color.NRGBA{R: 38, G: 38, B: 38, A: 255})
			justBelow.SetNRGBA(x, y, color.NRGBA{R: 39, G: 39, B: 39, A: 255})
		}
	}

	matched, err := ic.FindImage(templateTestDataURL(t, justAbove), templateTestDataURL(t, template), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !matched["found"].(bool) {
		t.Fatalf("default threshold must accept 1 - 38/255: %#v", matched)
	}

	notMatched, err := ic.FindImage(templateTestDataURL(t, justBelow), templateTestDataURL(t, template), nil)
	if err != nil {
		t.Fatal(err)
	}
	if notMatched["found"].(bool) {
		t.Fatalf("default threshold must reject 1 - 39/255: %#v", notMatched)
	}
}

func TestImageColorFindImageRegionThresholdAndScales(t *testing.T) {
	source, template := templateTestScene(t)
	ic := NewImageColor()
	data := templateTestDataURL(t, source)
	templateData := templateTestDataURL(t, template)

	inside, err := ic.FindImage(data, templateData, map[string]interface{}{
		"threshold": 0.99,
		"region":    map[string]interface{}{"x": 90, "y": 50, "width": 50, "height": 40},
	})
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, inside, true, 104, 62, 14, 10, 1)

	outside, err := ic.FindImage(data, templateData, map[string]interface{}{
		"threshold": 0.99,
		"region":    map[string]interface{}{"x": 0, "y": 80, "width": 40, "height": 30},
	})
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, outside, false, -1, -1, 14, 10, 1)

	boundarySource := image.NewNRGBA(image.Rect(0, 0, 14, 10))
	draw.Draw(boundarySource, boundarySource.Bounds(), template, image.Point{}, draw.Src)
	pixel := boundarySource.NRGBAAt(0, 0)
	pixel.R = 255 - pixel.R
	boundarySource.SetNRGBA(0, 0, pixel)
	maxDiff := float64(newTemplateMatchPlan(template).MaxDiff)
	score := 1 - math.Abs(float64(int(pixel.R)-int(template.NRGBAAt(0, 0).R)))/maxDiff
	atBoundary, err := ic.FindImage(templateTestDataURL(t, boundarySource), templateData, map[string]interface{}{"threshold": score})
	if err != nil {
		t.Fatal(err)
	}
	if !atBoundary["found"].(bool) {
		t.Fatalf("threshold boundary must be inclusive: score=%.17g result=%#v", score, atBoundary)
	}
	aboveBoundary, err := ic.FindImage(templateTestDataURL(t, boundarySource), templateData, map[string]interface{}{"threshold": score + 0.0001})
	if err != nil {
		t.Fatal(err)
	}
	if aboveBoundary["found"].(bool) {
		t.Fatalf("score above threshold must not match: score=%.17g result=%#v", score, aboveBoundary)
	}

	scaledSource := templateTestCanvas(160, 100)
	scaledDown, err := scaleImageTemplate(template, 0.9)
	if err != nil {
		t.Fatal(err)
	}
	scaledUp, err := scaleImageTemplate(template, 1.1)
	if err != nil {
		t.Fatal(err)
	}
	templateTestBlit(scaledSource, scaledDown, 20, 17)
	templateTestBlit(scaledSource, scaledUp, 94, 52)

	down, err := ic.FindImage(templateTestDataURL(t, scaledSource), templateData, map[string]interface{}{
		"threshold": 0.99, "scales": []interface{}{0.9},
	})
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, down, true, 20, 17, scaledDown.Bounds().Dx(), scaledDown.Bounds().Dy(), 0.9)
	up, err := ic.FindImage(templateTestDataURL(t, scaledSource), templateData, map[string]interface{}{
		"threshold": 0.99, "scales": []interface{}{1.1},
	})
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, up, true, 94, 52, scaledUp.Bounds().Dx(), scaledUp.Bounds().Dy(), 1.1)
}

func TestImageColorFindImagesDeduplicatesSortsAndLimits(t *testing.T) {
	source, template := templateTestScene(t)
	ic := NewImageColor()
	data := templateTestDataURL(t, source)
	templateData := templateTestDataURL(t, template)

	results, err := ic.FindImages(data, templateData, map[string]interface{}{"threshold": 0.99, "maxResults": 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 3 {
		t.Fatalf("result count = %d, want 3: %#v", len(results), results)
	}
	want := [][2]int{{30, 12}, {104, 62}, {48, 82}}
	for index, coordinate := range want {
		templateTestMatch(t, results[index], true, coordinate[0], coordinate[1], 14, 10, 1)
	}

	limited, err := ic.FindImages(data, templateData, map[string]interface{}{"threshold": 0.99, "maxResults": 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(limited) != 2 {
		t.Fatalf("limited result count = %d, want 2: %#v", len(limited), limited)
	}
	for index := range limited {
		templateTestMatch(t, limited[index], true, want[index][0], want[index][1], 14, 10, 1)
	}

	gradient := templateTestGradient(12, 10)
	gradientSource := templateTestCanvas(120, 80)
	templateTestBlit(gradientSource, gradient, 48, 31)
	deduplicated, err := ic.FindImages(templateTestDataURL(t, gradientSource), templateTestDataURL(t, gradient), map[string]interface{}{
		"threshold": 0.97, "maxResults": 20,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(deduplicated) != 1 {
		t.Fatalf("overlapping candidates must be deduplicated, got %#v", deduplicated)
	}
	templateTestMatch(t, deduplicated[0], true, 48, 31, 12, 10, 1)
}

func TestImageColorFindImagesRegionAndMultiScale(t *testing.T) {
	template := templateTestPattern(20, 14, 7)
	source := templateTestCanvas(180, 120)
	onePoint := image.Point{X: 20, Y: 20}
	templateTestBlit(source, template, onePoint.X, onePoint.Y)
	scaled, err := scaleImageTemplate(template, 1.1)
	if err != nil {
		t.Fatal(err)
	}
	templateTestBlit(source, scaled, 110, 60)
	ic := NewImageColor()

	results, err := ic.FindImages(templateTestDataURL(t, source), templateTestDataURL(t, template), map[string]interface{}{
		"threshold": 0.99, "scales": []interface{}{0.9, 1, 1.1}, "maxResults": 20,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Fatalf("multi-scale count = %d, want 2: %#v", len(results), results)
	}
	templateTestMatch(t, results[0], true, 20, 20, 20, 14, 1)
	templateTestMatch(t, results[1], true, 110, 60, scaled.Bounds().Dx(), scaled.Bounds().Dy(), 1.1)

	roi, err := ic.FindImages(templateTestDataURL(t, source), templateTestDataURL(t, template), map[string]interface{}{
		"threshold": 0.99,
		"region":    map[string]interface{}{"x": 90, "y": 45, "width": 80, "height": 60},
		"scales":    []interface{}{1, 1.1},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(roi) != 1 {
		t.Fatalf("ROI results = %#v", roi)
	}
	templateTestMatch(t, roi[0], true, 110, 60, scaled.Bounds().Dx(), scaled.Bounds().Dy(), 1.1)
}

func TestImageColorTemplateMatchImageInputs(t *testing.T) {
	source, template := templateTestScene(t)
	ic := NewImageColor()
	temporaryDirectory := t.TempDir()
	pngPath := filepath.Join(temporaryDirectory, "source.png")
	templatePath := filepath.Join(temporaryDirectory, "template.png")
	templateTestWritePNG(t, pngPath, source)
	templateTestWritePNG(t, templatePath, template)

	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	relativePath, err := filepath.Rel(workingDirectory, pngPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, sourceInput := range []string{pngPath, relativePath, templateTestDataURL(t, source), templateTestRawBase64(t, source)} {
		result, err := ic.FindImage(sourceInput, templatePath, map[string]interface{}{"threshold": 0.99})
		if err != nil {
			t.Fatalf("input %q: %v", sourceInput, err)
		}
		templateTestMatch(t, result, true, 30, 12, 14, 10, 1)
	}

	longDirectory := filepath.Join(temporaryDirectory, strings.Repeat("a", 45), strings.Repeat("b", 45), strings.Repeat("c", 45))
	if err := os.MkdirAll(longDirectory, 0o755); err != nil {
		t.Fatal(err)
	}
	longPath := filepath.Join(longDirectory, "source.png")
	if len(longPath) <= 100 {
		t.Fatalf("test path is not longer than 100 characters: %q", longPath)
	}
	templateTestWritePNG(t, longPath, source)
	longResult, err := ic.FindImage(longPath, templatePath, map[string]interface{}{"threshold": 0.99})
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, longResult, true, 30, 12, 14, 10, 1)

	jpegPath := filepath.Join(temporaryDirectory, "scene.jpg")
	templateTestWriteJPEG(t, jpegPath, source)
	jpegResult, err := ic.FindImage(jpegPath, jpegPath, map[string]interface{}{"threshold": 1})
	if err != nil {
		t.Fatal(err)
	}
	templateTestMatch(t, jpegResult, true, 0, 0, source.Bounds().Dx(), source.Bounds().Dy(), 1)

	for _, malformed := range []string{
		"%%%%", "data:image/png;base64,not-base64",
		base64.StdEncoding.EncodeToString([]byte("not an image")),
		filepath.Join(temporaryDirectory, "does-not-exist.png"),
	} {
		if _, err := ic.FindImage(malformed, templatePath, nil); err == nil {
			t.Fatalf("expected invalid source %q to fail", malformed)
		}
	}
}

func TestImageColorTemplateMatchValidatesOptions(t *testing.T) {
	source, template := templateTestScene(t)
	data := templateTestDataURL(t, source)
	templateData := templateTestDataURL(t, template)
	ic := NewImageColor()
	cases := []struct {
		name    string
		method  string
		options interface{}
		want    string
	}{
		{"options object", "one", "bad", "options must be an object"},
		{"unknown", "one", map[string]interface{}{"backend": "opencv"}, "unknown field(s): backend"},
		{"threshold lower", "one", map[string]interface{}{"threshold": -0.1}, "threshold must be between 0 and 1"},
		{"threshold upper", "one", map[string]interface{}{"threshold": 1.1}, "threshold must be between 0 and 1"},
		{"region missing", "one", map[string]interface{}{"region": map[string]interface{}{"x": 0, "y": 0, "width": 1}}, "region.height is required"},
		{"region fraction", "one", map[string]interface{}{"region": map[string]interface{}{"x": 0.5, "y": 0, "width": 1, "height": 1}}, "region.x must be an integer"},
		{"region outside", "one", map[string]interface{}{"region": map[string]interface{}{"x": 0, "y": 0, "width": 999, "height": 1}}, "fully within source"},
		{"scales empty", "one", map[string]interface{}{"scales": []interface{}{}}, "scales must not be empty"},
		{"scale zero", "one", map[string]interface{}{"scales": []interface{}{0}}, "must be greater than 0"},
		{"max results one", "one", map[string]interface{}{"maxResults": 1}, "unknown field(s): maxResults"},
		{"max results zero", "many", map[string]interface{}{"maxResults": 0}, "maxResults must be between 1"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			var err error
			if test.method == "many" {
				_, err = ic.FindImages(data, templateData, test.options)
			} else {
				_, err = ic.FindImage(data, templateData, test.options)
			}
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want substring %q", err, test.want)
			}
		})
	}
}

func templateTestScene(t *testing.T) (*image.NRGBA, *image.NRGBA) {
	t.Helper()
	source := templateTestCanvas(150, 110)
	template := templateTestPattern(14, 10, 7)
	templateTestBlit(source, template, 30, 12)
	templateTestBlit(source, template, 104, 62)
	templateTestBlit(source, template, 48, 82)
	return source, template
}

func templateTestCanvas(width, height int) *image.NRGBA {
	result := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			result.SetNRGBA(x, y, color.NRGBA{R: 7, G: 11, B: 17, A: 255})
		}
	}
	return result
}

func templateTestPattern(width, height, seed int) *image.NRGBA {
	result := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			result.SetNRGBA(x, y, color.NRGBA{
				R: uint8((seed*19 + x*37 + y*17) % 251),
				G: uint8((seed*23 + x*11 + y*43) % 251),
				B: uint8((seed*29 + x*29 + y*7) % 251), A: 255,
			})
		}
	}
	return result
}

func templateTestGradient(width, height int) *image.NRGBA {
	result := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			result.SetNRGBA(x, y, color.NRGBA{R: uint8(40 + x*8 + y*2), G: uint8(30 + x*5 + y*3), B: uint8(20 + x*3 + y*4), A: 255})
		}
	}
	return result
}

func templateTestBlit(destination *image.NRGBA, source image.Image, x, y int) {
	draw.Draw(destination, image.Rect(x, y, x+source.Bounds().Dx(), y+source.Bounds().Dy()), source, source.Bounds().Min, draw.Src)
}

func templateTestDataURL(t *testing.T, source image.Image) string {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, source); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buffer.Bytes())
}

func templateTestRawBase64(t *testing.T, source image.Image) string {
	t.Helper()
	return strings.TrimPrefix(templateTestDataURL(t, source), "data:image/png;base64,")
}

func templateTestWritePNG(t *testing.T, path string, source image.Image) {
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

func templateTestWriteJPEG(t *testing.T, path string, source image.Image) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := jpeg.Encode(file, source, &jpeg.Options{Quality: 92}); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func templateTestMatch(t *testing.T, result map[string]interface{}, found bool, x, y, width, height int, scale float64) {
	t.Helper()
	if actual, ok := result["found"].(bool); !ok || actual != found {
		t.Fatalf("found = %#v, want %v; result=%#v", result["found"], found, result)
	}
	for key, want := range map[string]int{"x": x, "y": y, "width": width, "height": height} {
		actual, ok := result[key].(int)
		if !ok || actual != want {
			t.Fatalf("%s = %#v, want %d; result=%#v", key, result[key], want, result)
		}
	}
	if scale != 0 {
		actual, ok := result["scale"].(float64)
		if !ok || math.Abs(actual-scale) > 1e-12 {
			t.Fatalf("scale = %#v, want %.6f; result=%#v", result["scale"], scale, result)
		}
	}
}
