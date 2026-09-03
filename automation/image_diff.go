package automation

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
)

const imageDiffMaxSafeInteger = float64(1<<53 - 1)

type imageDiffOptions struct {
	PixelThreshold   uint8
	MaxDiffPixels    *int64
	MaxDiffRatio     *float64
	IncludeAlpha     bool
	IgnoreRegions    []imageDiffRegion
	OutputPath       *string
	IncludeDiffImage bool
}

type imageDiffRegion struct {
	X      int64
	Y      int64
	Width  int64
	Height int64
}

type imageDiffBounds struct {
	X      int
	Y      int
	Width  int
	Height int
}

type imageDiffScanEvent struct {
	X     int
	Delta int
}

type imageDiffResult struct {
	Matched           bool
	Width             int
	Height            int
	TotalPixels       int64
	ComparedPixels    int64
	IgnoredPixels     int64
	DiffPixels        int64
	DiffRatio         float64
	MeanAbsoluteError float64
	MaxChannelDiff    uint8
	ChangedBounds     *imageDiffBounds
	PixelThreshold    uint8
	IncludeAlpha      bool
	DiffPath          *string
	DiffImage         *string
}

// Diff compares two equally sized images using deterministic per-channel pixel
// differences. It is intentionally independent of the template matching
// backend so its behavior is identical with and without the opencv build tag.
func (ic *ImageColor) Diff(actualImage, expectedImage string, options interface{}) (map[string]interface{}, error) {
	opts, err := parseImageDiffOptions(options)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(actualImage) == "" {
		return nil, fmt.Errorf("actual image must not be empty")
	}
	if strings.TrimSpace(expectedImage) == "" {
		return nil, fmt.Errorf("expected image must not be empty")
	}

	actual, err := ic.loadImage(actualImage)
	if err != nil {
		return nil, fmt.Errorf("failed to load actual image: %w", err)
	}
	expected, err := ic.loadImage(expectedImage)
	if err != nil {
		return nil, fmt.Errorf("failed to load expected image: %w", err)
	}

	actualNRGBA := imageToNRGBA(actual)
	expectedNRGBA := imageToNRGBA(expected)
	width := actualNRGBA.Bounds().Dx()
	height := actualNRGBA.Bounds().Dy()
	expectedWidth := expectedNRGBA.Bounds().Dx()
	expectedHeight := expectedNRGBA.Bounds().Dy()
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("actual image has invalid dimensions: %dx%d", width, height)
	}
	if expectedWidth <= 0 || expectedHeight <= 0 {
		return nil, fmt.Errorf("expected image has invalid dimensions: %dx%d", expectedWidth, expectedHeight)
	}
	if width != expectedWidth || height != expectedHeight {
		return nil, fmt.Errorf(
			"image dimensions differ: actual=%dx%d expected=%dx%d",
			width, height, expectedWidth, expectedHeight,
		)
	}
	if height > 0 && width > int(^uint(0)>>1)/height {
		return nil, fmt.Errorf("image dimensions are too large: %dx%d", width, height)
	}

	totalPixels := int64(width) * int64(height)
	ignored, ignoredPixels := imageDiffIgnoreMask(width, height, opts.IgnoreRegions)
	comparedPixels := totalPixels - ignoredPixels

	var diffImage *image.NRGBA
	if opts.OutputPath != nil || opts.IncludeDiffImage {
		diffImage = image.NewNRGBA(image.Rect(0, 0, width, height))
	}

	channelsCompared := 3
	if opts.IncludeAlpha {
		channelsCompared = 4
	}
	var diffPixels int64
	var absoluteErrorSum float64
	var maxChannelDiff uint8
	minChangedX, minChangedY := width, height
	maxChangedX, maxChangedY := -1, -1

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			actualPixel := actualNRGBA.NRGBAAt(x, y)
			if ignored != nil && ignored[y*width+x] {
				if diffImage != nil {
					diffImage.SetNRGBA(x, y, imageDiffUnchangedPixel(actualPixel))
				}
				continue
			}

			expectedPixel := expectedNRGBA.NRGBAAt(x, y)
			differences := [4]uint8{
				imageDiffAbs(actualPixel.R, expectedPixel.R),
				imageDiffAbs(actualPixel.G, expectedPixel.G),
				imageDiffAbs(actualPixel.B, expectedPixel.B),
				imageDiffAbs(actualPixel.A, expectedPixel.A),
			}
			pixelChanged := false
			for channel := 0; channel < channelsCompared; channel++ {
				difference := differences[channel]
				absoluteErrorSum += float64(difference)
				if difference > maxChannelDiff {
					maxChannelDiff = difference
				}
				if difference > opts.PixelThreshold {
					pixelChanged = true
				}
			}

			if pixelChanged {
				diffPixels++
				if x < minChangedX {
					minChangedX = x
				}
				if y < minChangedY {
					minChangedY = y
				}
				if x > maxChangedX {
					maxChangedX = x
				}
				if y > maxChangedY {
					maxChangedY = y
				}
			}

			if diffImage != nil {
				if pixelChanged {
					diffImage.SetNRGBA(x, y, color.NRGBA{R: 255, A: 255})
				} else {
					diffImage.SetNRGBA(x, y, imageDiffUnchangedPixel(actualPixel))
				}
			}
		}
	}

	diffRatio := 0.0
	meanAbsoluteError := 0.0
	if comparedPixels > 0 {
		diffRatio = float64(diffPixels) / float64(comparedPixels)
		meanAbsoluteError = absoluteErrorSum / (float64(comparedPixels) * float64(channelsCompared))
	}

	matched := diffPixels == 0
	if opts.MaxDiffPixels != nil || opts.MaxDiffRatio != nil {
		matched = true
		if opts.MaxDiffPixels != nil {
			matched = matched && diffPixels <= *opts.MaxDiffPixels
		}
		if opts.MaxDiffRatio != nil {
			matched = matched && diffRatio <= *opts.MaxDiffRatio
		}
	}

	result := imageDiffResult{
		Matched:           matched,
		Width:             width,
		Height:            height,
		TotalPixels:       totalPixels,
		ComparedPixels:    comparedPixels,
		IgnoredPixels:     ignoredPixels,
		DiffPixels:        diffPixels,
		DiffRatio:         diffRatio,
		MeanAbsoluteError: meanAbsoluteError,
		MaxChannelDiff:    maxChannelDiff,
		PixelThreshold:    opts.PixelThreshold,
		IncludeAlpha:      opts.IncludeAlpha,
	}
	if diffPixels > 0 {
		result.ChangedBounds = &imageDiffBounds{
			X:      minChangedX,
			Y:      minChangedY,
			Width:  maxChangedX - minChangedX + 1,
			Height: maxChangedY - minChangedY + 1,
		}
	}

	if diffImage != nil {
		encoded, err := encodeImageDiffPNG(diffImage)
		if err != nil {
			return nil, err
		}
		if opts.OutputPath != nil {
			if err := writeImageDiffPNG(*opts.OutputPath, encoded); err != nil {
				return nil, err
			}
			result.DiffPath = opts.OutputPath
		}
		if opts.IncludeDiffImage {
			dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded)
			result.DiffImage = &dataURL
		}
	}

	return result.toMap(), nil
}

func parseImageDiffOptions(raw interface{}) (imageDiffOptions, error) {
	options := imageDiffOptions{}
	if raw == nil {
		return options, nil
	}

	values, ok := raw.(map[string]interface{})
	if !ok {
		return options, fmt.Errorf("ImageColor.diff options must be an object")
	}

	allowed := map[string]struct{}{
		"pixelThreshold": {}, "maxDiffPixels": {}, "maxDiffRatio": {},
		"includeAlpha": {}, "ignoreRegions": {}, "outputPath": {}, "includeDiffImage": {},
	}
	unknown := make([]string, 0)
	for key := range values {
		if _, exists := allowed[key]; !exists {
			unknown = append(unknown, key)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return options, fmt.Errorf("ImageColor.diff options contain unknown field(s): %s", strings.Join(unknown, ", "))
	}

	if value, exists := values["pixelThreshold"]; exists {
		parsed, err := imageDiffInteger(value, "options.pixelThreshold", 0, 255)
		if err != nil {
			return options, err
		}
		options.PixelThreshold = uint8(parsed)
	}
	if value, exists := values["maxDiffPixels"]; exists {
		parsed, err := imageDiffInteger(value, "options.maxDiffPixels", 0, int64(imageDiffMaxSafeInteger))
		if err != nil {
			return options, err
		}
		options.MaxDiffPixels = &parsed
	}
	if value, exists := values["maxDiffRatio"]; exists {
		parsed, err := imageDiffNumber(value, "options.maxDiffRatio")
		if err != nil {
			return options, err
		}
		if parsed < 0 || parsed > 1 {
			return options, fmt.Errorf("options.maxDiffRatio must be between 0 and 1")
		}
		options.MaxDiffRatio = &parsed
	}
	if value, exists := values["includeAlpha"]; exists {
		parsed, ok := value.(bool)
		if !ok {
			return options, fmt.Errorf("options.includeAlpha must be a boolean")
		}
		options.IncludeAlpha = parsed
	}
	if value, exists := values["ignoreRegions"]; exists {
		regions, err := parseImageDiffRegions(value)
		if err != nil {
			return options, err
		}
		options.IgnoreRegions = regions
	}
	if value, exists := values["outputPath"]; exists {
		parsed, ok := value.(string)
		if !ok {
			return options, fmt.Errorf("options.outputPath must be a string")
		}
		if strings.TrimSpace(parsed) == "" {
			return options, fmt.Errorf("options.outputPath must not be empty")
		}
		options.OutputPath = &parsed
	}
	if value, exists := values["includeDiffImage"]; exists {
		parsed, ok := value.(bool)
		if !ok {
			return options, fmt.Errorf("options.includeDiffImage must be a boolean")
		}
		options.IncludeDiffImage = parsed
	}

	return options, nil
}

func parseImageDiffRegions(raw interface{}) ([]imageDiffRegion, error) {
	if raw == nil {
		return nil, nil
	}
	value := reflect.ValueOf(raw)
	if value.Kind() != reflect.Slice && value.Kind() != reflect.Array {
		return nil, fmt.Errorf("options.ignoreRegions must be an array")
	}

	regions := make([]imageDiffRegion, 0, value.Len())
	for index := 0; index < value.Len(); index++ {
		item := value.Index(index).Interface()
		regionValues, ok := item.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("options.ignoreRegions[%d] must be an object", index)
		}

		allowed := map[string]struct{}{"x": {}, "y": {}, "width": {}, "height": {}}
		unknown := make([]string, 0)
		for key := range regionValues {
			if _, exists := allowed[key]; !exists {
				unknown = append(unknown, key)
			}
		}
		if len(unknown) > 0 {
			sort.Strings(unknown)
			return nil, fmt.Errorf(
				"options.ignoreRegions[%d] contains unknown field(s): %s",
				index, strings.Join(unknown, ", "),
			)
		}

		coordinates := make(map[string]int64, 4)
		for _, key := range []string{"x", "y", "width", "height"} {
			rawValue, exists := regionValues[key]
			if !exists {
				return nil, fmt.Errorf("options.ignoreRegions[%d].%s is required", index, key)
			}
			minimum := -int64(imageDiffMaxSafeInteger)
			if key == "width" || key == "height" {
				minimum = 0
			}
			parsed, err := imageDiffInteger(
				rawValue,
				fmt.Sprintf("options.ignoreRegions[%d].%s", index, key),
				minimum,
				int64(imageDiffMaxSafeInteger),
			)
			if err != nil {
				return nil, err
			}
			coordinates[key] = parsed
		}

		regions = append(regions, imageDiffRegion{
			X: coordinates["x"], Y: coordinates["y"],
			Width: coordinates["width"], Height: coordinates["height"],
		})
	}
	return regions, nil
}

func imageDiffInteger(value interface{}, name string, minimum, maximum int64) (int64, error) {
	number, err := imageDiffNumber(value, name)
	if err != nil {
		return 0, err
	}
	if math.Trunc(number) != number {
		return 0, fmt.Errorf("%s must be an integer", name)
	}
	if number < float64(minimum) || number > float64(maximum) {
		return 0, fmt.Errorf("%s must be between %d and %d", name, minimum, maximum)
	}
	return int64(number), nil
}

func imageDiffNumber(value interface{}, name string) (float64, error) {
	var number float64
	switch typed := value.(type) {
	case int:
		number = float64(typed)
	case int8:
		number = float64(typed)
	case int16:
		number = float64(typed)
	case int32:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case uint:
		number = float64(typed)
	case uint8:
		number = float64(typed)
	case uint16:
		number = float64(typed)
	case uint32:
		number = float64(typed)
	case uint64:
		number = float64(typed)
	case float32:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, fmt.Errorf("%s must be a number", name)
	}
	if math.IsNaN(number) || math.IsInf(number, 0) {
		return 0, fmt.Errorf("%s must be finite", name)
	}
	return number, nil
}

func imageDiffIgnoreMask(width, height int, regions []imageDiffRegion) ([]bool, int64) {
	if len(regions) == 0 {
		return nil, 0
	}

	events := make([][]imageDiffScanEvent, height+1)
	for _, region := range regions {
		x0 := imageDiffMaxInt64(0, region.X)
		y0 := imageDiffMaxInt64(0, region.Y)
		x1 := imageDiffMinInt64(int64(width), region.X+region.Width)
		y1 := imageDiffMinInt64(int64(height), region.Y+region.Height)
		if x0 >= x1 || y0 >= y1 {
			continue
		}
		startY, endY := int(y0), int(y1)
		startX, endX := int(x0), int(x1)
		events[startY] = append(events[startY],
			imageDiffScanEvent{X: startX, Delta: 1},
			imageDiffScanEvent{X: endX, Delta: -1},
		)
		events[endY] = append(events[endY],
			imageDiffScanEvent{X: startX, Delta: -1},
			imageDiffScanEvent{X: endX, Delta: 1},
		)
	}

	ignored := make([]bool, width*height)
	xDeltas := make([]int, width+1)
	var ignoredPixels int64
	for y := 0; y < height; y++ {
		for _, event := range events[y] {
			xDeltas[event.X] += event.Delta
		}
		active := 0
		for x := 0; x < width; x++ {
			active += xDeltas[x]
			if active > 0 {
				ignored[y*width+x] = true
				ignoredPixels++
			}
		}
	}
	return ignored, ignoredPixels
}

func imageDiffAbs(actual, expected uint8) uint8 {
	if actual >= expected {
		return actual - expected
	}
	return expected - actual
}

func imageDiffUnchangedPixel(actual color.NRGBA) color.NRGBA {
	gray := uint8((uint16(actual.R) + uint16(actual.G) + uint16(actual.B)) / 3)
	return color.NRGBA{R: gray, G: gray, B: gray, A: 255}
}

func encodeImageDiffPNG(diffImage image.Image) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestCompression}
	if err := encoder.Encode(&buffer, diffImage); err != nil {
		return nil, fmt.Errorf("failed to encode diff PNG: %w", err)
	}
	return buffer.Bytes(), nil
}

func writeImageDiffPNG(path string, contents []byte) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return fmt.Errorf("failed to create diff output directory %q: %w", directory, err)
	}
	if err := os.WriteFile(path, contents, 0o644); err != nil {
		return fmt.Errorf("failed to write diff PNG %q: %w", path, err)
	}
	return nil
}

func (result imageDiffResult) toMap() map[string]interface{} {
	output := map[string]interface{}{
		"matched":           result.Matched,
		"width":             result.Width,
		"height":            result.Height,
		"totalPixels":       result.TotalPixels,
		"comparedPixels":    result.ComparedPixels,
		"ignoredPixels":     result.IgnoredPixels,
		"diffPixels":        result.DiffPixels,
		"diffRatio":         result.DiffRatio,
		"meanAbsoluteError": result.MeanAbsoluteError,
		"maxChannelDiff":    result.MaxChannelDiff,
		"changedBounds":     nil,
		"pixelThreshold":    result.PixelThreshold,
		"includeAlpha":      result.IncludeAlpha,
	}
	if result.ChangedBounds != nil {
		output["changedBounds"] = map[string]interface{}{
			"x": result.ChangedBounds.X, "y": result.ChangedBounds.Y,
			"width": result.ChangedBounds.Width, "height": result.ChangedBounds.Height,
		}
	}
	if result.DiffPath != nil {
		output["diffPath"] = *result.DiffPath
	}
	if result.DiffImage != nil {
		output["diffImage"] = *result.DiffImage
	}
	return output
}

func imageDiffMinInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func imageDiffMaxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
