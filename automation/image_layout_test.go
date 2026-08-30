package automation

import (
	"image"
	"image/color"
	"reflect"
	"testing"
)

func newSolidLayoutImage(width, height int, c color.RGBA) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, c)
		}
	}
	return img
}

func maxBoundaryScore(items []boundaryScore) float64 {
	maxScore := 0.0
	for _, item := range items {
		if item.Score > maxScore {
			maxScore = item.Score
		}
	}
	return maxScore
}

func boundaryScoreAt(items []boundaryScore, pos int) (boundaryScore, bool) {
	for _, item := range items {
		if item.Pos == pos {
			return item, true
		}
	}
	return boundaryScore{}, false
}

func TestLayoutCellColorMedianResistsSparseTextNoise(t *testing.T) {
	img := newSolidLayoutImage(60, 40, color.RGBA{R: 240, G: 240, B: 240, A: 255})
	for y := 0; y < 40; y++ {
		img.SetRGBA(29, y, color.RGBA{A: 255})
		img.SetRGBA(30, y, color.RGBA{A: 255})
	}

	medianGrid, gridW, gridH := buildLayoutGrid(img, 10, 16, "median")
	medianLabels, _ := floodFillLayoutGrid(medianGrid, gridW, gridH, 32, 16)
	medianScores := computeFloodVerticalBoundaryScores(medianLabels, medianGrid, layoutGridRect{MinX: 0, MinY: 0, MaxX: gridW, MaxY: gridH}, 3)
	if got := maxBoundaryScore(medianScores); got != 0 {
		t.Fatalf("sparse text-like noise produced a median boundary score: %v", got)
	}

	meanGrid, meanW, meanH := buildLayoutGrid(img, 10, 16, "mean")
	meanLabels, _ := floodFillLayoutGrid(meanGrid, meanW, meanH, 32, 16)
	meanScores := computeFloodVerticalBoundaryScores(meanLabels, meanGrid, layoutGridRect{MinX: 0, MinY: 0, MaxX: meanW, MaxY: meanH}, 3)
	if got := maxBoundaryScore(meanScores); got <= 0 {
		t.Fatalf("expected mean mode to remain sensitive to the synthetic foreground noise, got %v", got)
	}
}

func TestLayoutCellColorMedianDiffersFromMean(t *testing.T) {
	img := newSolidLayoutImage(10, 10, color.RGBA{R: 240, G: 240, B: 240, A: 255})
	for y := 0; y < 10; y++ {
		img.SetRGBA(0, y, color.RGBA{A: 255})
	}

	median := computeCellColorMedian(img, 0, 0, 10, 10, 2)
	mean := computeCellColorMean(img, 0, 0, 10, 10, 2)
	if median == mean {
		t.Fatalf("median and mean unexpectedly produced the same color: %#v", median)
	}
	if median.R != 240 || median.G != 240 || median.B != 240 {
		t.Fatalf("median did not preserve the majority background color: %#v", median)
	}
	if mean.R >= median.R {
		t.Fatalf("mean should be pulled down by dark foreground noise: mean=%#v median=%#v", mean, median)
	}
}

func TestLayoutBoundarySpanWidthChangesContrastWithoutOutOfBounds(t *testing.T) {
	grid := make([][]layoutCell, 4)
	labels := make([][]int, 4)
	columns := []uint8{0, 0, 20, 40, 40, 40}
	for y := range grid {
		grid[y] = make([]layoutCell, len(columns))
		labels[y] = make([]int, len(columns))
		for x, value := range columns {
			grid[y][x] = layoutCell{R: value, G: value, B: value}
			labels[y][x] = 0
		}
	}
	rect := layoutGridRect{MinX: 0, MinY: 0, MaxX: len(columns), MaxY: len(grid)}

	narrow := computeFloodVerticalBoundaryScores(labels, grid, rect, 1)
	wide := computeFloodVerticalBoundaryScores(labels, grid, rect, 3)
	oversized := computeFloodVerticalBoundaryScores(labels, grid, rect, 99)
	if len(narrow) != len(columns)-1 || len(wide) != len(narrow) || len(oversized) != len(narrow) {
		t.Fatalf("unexpected boundary score lengths: narrow=%d wide=%d oversized=%d", len(narrow), len(wide), len(oversized))
	}

	narrowAt3, ok := boundaryScoreAt(narrow, 3)
	if !ok {
		t.Fatal("missing boundary score at position 3 for span=1")
	}
	wideAt3, ok := boundaryScoreAt(wide, 3)
	if !ok {
		t.Fatal("missing boundary score at position 3 for span=3")
	}
	if narrowAt3.Score == wideAt3.Score {
		t.Fatalf("boundarySpanWidth did not affect the synthetic boundary score: %v", narrowAt3.Score)
	}
	for _, item := range oversized {
		if item.Pos <= rect.MinX || item.Pos >= rect.MaxX {
			t.Fatalf("oversized span produced out-of-range boundary position: %#v", item)
		}
	}
}

func TestLayoutAnalyzeOptionValidation(t *testing.T) {
	invalid := parseLayoutAnalyzeOptions(map[string]interface{}{"cellColorMode": "not-a-mode", "boundarySpanWidth": 0})
	if invalid.CellColorMode != "median" {
		t.Fatalf("invalid cellColorMode should keep the median default, got %q", invalid.CellColorMode)
	}
	if invalid.BoundarySpanWidth != 1 {
		t.Fatalf("boundarySpanWidth <= 0 should clamp to 1, got %d", invalid.BoundarySpanWidth)
	}

	tooLarge := parseLayoutAnalyzeOptions(map[string]interface{}{"boundarySpanWidth": 999})
	if tooLarge.BoundarySpanWidth != 8 {
		t.Fatalf("large boundarySpanWidth should clamp to 8, got %d", tooLarge.BoundarySpanWidth)
	}

	for _, mode := range []string{"mean", "median", "trimmed", "dominant"} {
		opts := parseLayoutAnalyzeOptions(map[string]interface{}{"cellColorMode": mode})
		if opts.CellColorMode != mode {
			t.Fatalf("accepted mode %q normalized to %q", mode, opts.CellColorMode)
		}
	}
}

func TestLayoutTrimmedAndDominantCurrentlyAliasMean(t *testing.T) {
	img := newSolidLayoutImage(20, 20, color.RGBA{R: 210, G: 220, B: 230, A: 255})
	for y := 0; y < 8; y++ {
		for x := 0; x < 5; x++ {
			img.SetRGBA(x, y, color.RGBA{R: 20, G: 30, B: 40, A: 255})
		}
	}

	meanGrid, meanW, meanH := buildLayoutGrid(img, 10, 16, "mean")
	trimmedGrid, trimmedW, trimmedH := buildLayoutGrid(img, 10, 16, "trimmed")
	dominantGrid, dominantW, dominantH := buildLayoutGrid(img, 10, 16, "dominant")
	if meanW != trimmedW || meanW != dominantW || meanH != trimmedH || meanH != dominantH {
		t.Fatal("mode aliases changed grid dimensions")
	}
	if !reflect.DeepEqual(meanGrid, trimmedGrid) {
		t.Fatal("trimmed is currently expected to route to mean; implementation behavior changed")
	}
	if !reflect.DeepEqual(meanGrid, dominantGrid) {
		t.Fatal("dominant is currently expected to route to mean; implementation behavior changed")
	}
}

func TestAnalyzeLayoutSmallAndUniformImages(t *testing.T) {
	if _, err := analyzeLayoutImage(image.NewRGBA(image.Rect(0, 0, 0, 0)), nil); err == nil {
		t.Fatal("expected empty image to be rejected")
	}
	if _, err := analyzeLayoutImage(newSolidLayoutImage(1, 1, color.RGBA{A: 255}), nil); err == nil {
		t.Fatal("expected tiny image grid to be rejected")
	}

	result, err := analyzeLayoutImage(newSolidLayoutImage(40, 40, color.RGBA{R: 120, G: 120, B: 120, A: 255}), nil)
	if err != nil {
		t.Fatalf("uniform single-region image returned error: %v", err)
	}
	regions, ok := result["regions"].([]map[string]interface{})
	if !ok || len(regions) == 0 {
		t.Fatalf("uniform image should return at least one coarse region, got %#v", result["regions"])
	}
}

func TestLayoutHighContrastSplitProducesStrongBoundary(t *testing.T) {
	img := newSolidLayoutImage(80, 40, color.RGBA{R: 16, G: 16, B: 16, A: 255})
	for y := 0; y < 40; y++ {
		for x := 40; x < 80; x++ {
			img.SetRGBA(x, y, color.RGBA{R: 232, G: 232, B: 232, A: 255})
		}
	}

	grid, gridW, gridH := buildLayoutGrid(img, 10, 16, "median")
	labels, _ := floodFillLayoutGrid(grid, gridW, gridH, 32, 16)
	scores := computeFloodVerticalBoundaryScores(labels, grid, layoutGridRect{MinX: 0, MinY: 0, MaxX: gridW, MaxY: gridH}, 3)
	boundary, ok := boundaryScoreAt(scores, 4)
	if !ok {
		t.Fatal("expected score at the synthetic 40px split")
	}
	if boundary.Score < 0.9 {
		t.Fatalf("expected strong boundary at the synthetic split, got score=%v", boundary.Score)
	}
}
