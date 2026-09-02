package automation

import (
	"fmt"
	"image"
	"math"
	"sort"
	"strconv"
	"strings"
)

type layoutCell struct {
	R uint8
	G uint8
	B uint8
}

type layoutPoint struct {
	X int
	Y int
}

type layoutGridRect struct {
	MinX int
	MinY int
	MaxX int
	MaxY int
}

type layoutBandHint struct {
	Label string
	From  float64
	To    float64
}

type layoutHintSet struct {
	Vertical   []layoutBandHint
	Horizontal []layoutBandHint
}

type layoutBoundaryRef struct {
	Orientation string
	Side        string
	Position    int
	Confidence  float64
	Source      string
}

type layoutRegionInfo struct {
	Label int
	Cells []layoutPoint
	MinX  int
	MinY  int
	MaxX  int
	MaxY  int
	Area  int
	SumR  int
	SumG  int
	SumB  int
	Color layoutCell
}

type layoutAnalyzeOptions struct {
	CellSize               int
	Quantize               int
	Tolerance              float64
	MinRegionArea          int
	MaxRegions             int
	MaxDepth               int
	MinSplitSpan           int
	MinSeparatorScore      float64
	MinSeparatorSpanRatio  float64
	MaxSeparatorCandidates int
	SeparatorHints         layoutHintSet
	LegacyProfile          string
	CellColorMode          string // "mean" | "median" | "trimmed" | "dominant"
	BoundarySpanWidth      int    // default 3, for multi-span region contrast
}

type boundaryScore struct {
	Pos              int
	Score            float64
	SupportRatio     float64
	SupportSpanRatio float64
	SupportStart     int
	SupportEnd       int
	Contrast         float64
	Orientation      string
}

type layoutSplitNode struct {
	Rect       layoutGridRect
	Depth      int
	Boundaries []layoutBoundaryRef
	Separator  *layoutSeparator
	Children   []*layoutSplitNode
}

type layoutSeparatorCandidate struct {
	Separator    layoutSeparator
	GridPos      int
	HintLabel    string
	HintDistance float64
}

type layoutSegmentationState struct {
	SelectedSeparators []layoutSeparator
	Warnings           []string
	RootCandidates     map[string][]layoutSeparator
	HintWarnings       map[string]bool
}

func (r layoutGridRect) Width() int {
	return r.MaxX - r.MinX
}

func (r layoutGridRect) Height() int {
	return r.MaxY - r.MinY
}

func (r layoutGridRect) Valid() bool {
	return r.Width() > 0 && r.Height() > 0
}

func (ic *ImageColor) AnalyzeLayout(imageStr string, options interface{}) (map[string]interface{}, error) {
	img, err := ic.loadImage(imageStr)
	if err != nil {
		return nil, fmt.Errorf("failed to load image: %w", err)
	}
	return analyzeLayoutImage(img, options)
}

func analyzeLayoutImage(img image.Image, options interface{}) (map[string]interface{}, error) {
	opts := parseLayoutAnalyzeOptions(options)
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("invalid image size")
	}

	grid, gridW, gridH := buildLayoutGrid(img, opts.CellSize, opts.Quantize, opts.CellColorMode)
	if gridW <= 1 || gridH <= 1 {
		return nil, fmt.Errorf("image grid too small")
	}

	labels, regions := floodFillLayoutGrid(grid, gridW, gridH, opts.Tolerance, opts.Quantize)
	for pass := 0; pass < 2; pass++ {
		mergeSmallLayoutRegions(labels, grid, regions, opts.MinRegionArea)
		regions = rebuildLayoutRegions(labels, grid, gridW, gridH)
	}

	state := &layoutSegmentationState{
		RootCandidates: map[string][]layoutSeparator{},
		HintWarnings:   map[string]bool{},
	}
	if opts.LegacyProfile != "" {
		state.Warnings = append(state.Warnings, "profile is ignored by the generic layout core; pass optional separatorHints from JS or external config instead")
	}

	rootRect := layoutGridRect{MinX: 0, MinY: 0, MaxX: gridW, MaxY: gridH}
	root := buildLayoutSplitTree(labels, grid, rootRect, 0, opts, width, height, state, nil, true)

	separators := dedupeLayoutSeparators(state.SelectedSeparators)
	sortLayoutSeparators(separators)

	// Apply intelligent filtering to reduce false positives
	separators = filterLayoutSeparators(separators, width, height)

	if len(separators) == 0 {
		state.Warnings = append(state.Warnings, "no separator passed the confidence threshold; returning a single coarse region")
	}

	regionsOut := exportLayoutRegionsFromTree(root, img, opts.CellSize, width, height)
	if len(regionsOut) == 0 {
		regionsOut = []map[string]interface{}{layoutRegionFromLeaf(&layoutSplitNode{Rect: rootRect}, 1, img, opts.CellSize, width, height)}
	}

	return map[string]interface{}{
		"width":  width,
		"height": height,
		"grid": map[string]interface{}{
			"cellSize":               opts.CellSize,
			"gridWidth":              gridW,
			"gridHeight":             gridH,
			"quantize":               opts.Quantize,
			"tolerance":              opts.Tolerance,
			"minRegionArea":          opts.MinRegionArea,
			"maxDepth":               opts.MaxDepth,
			"minSplitSpan":           opts.MinSplitSpan,
			"minSeparatorScore":      opts.MinSeparatorScore,
			"minSeparatorSpanRatio":  opts.MinSeparatorSpanRatio,
			"maxSeparatorCandidates": opts.MaxSeparatorCandidates,
		},
		"regions":      regionsOut,
		"separators":   exportLayoutSeparatorGroups(separators),
		"floodRegions": exportLayoutFloodRegions(regions, opts, width, height),
		"warnings":     state.Warnings,
		"debug": map[string]interface{}{
			"separatorHints": exportLayoutHints(opts.SeparatorHints),
			"rootCandidates": exportLayoutSeparatorGroups(flattenLayoutSeparatorMap(state.RootCandidates)),
			"tree":           exportLayoutSplitTree(root, opts.CellSize, width, height),
		},
	}, nil
}

func parseLayoutAnalyzeOptions(options interface{}) layoutAnalyzeOptions {
	out := layoutAnalyzeOptions{
		CellSize:               10,
		Quantize:               16,
		Tolerance:              32,
		MinRegionArea:          4,
		MaxRegions:             24,
		MaxDepth:               6,
		MinSplitSpan:           4,
		MinSeparatorScore:      0.14,
		MinSeparatorSpanRatio:  0.30,
		MaxSeparatorCandidates: 8,
		CellColorMode:          "median", // default to median for better text noise resistance
		BoundarySpanWidth:      3,        // default to 3 cells for region contrast
	}
	if options == nil {
		return out
	}
	optMap, ok := options.(map[string]interface{})
	if !ok {
		return out
	}
	if value, ok := optMap["cellSize"]; ok {
		out.CellSize = layoutMaxInt(2, jsToInt(value))
	}
	if value, ok := optMap["quantize"]; ok {
		out.Quantize = layoutClampInt(jsToInt(value), 4, 64)
	}
	if value, ok := optMap["tolerance"]; ok {
		out.Tolerance = layoutClampFloat(layoutFloatValue(value), 2, 128)
	}
	if value, ok := optMap["minRegionArea"]; ok {
		out.MinRegionArea = layoutMaxInt(1, jsToInt(value))
	}
	if value, ok := optMap["maxRegions"]; ok {
		out.MaxRegions = layoutMaxInt(1, jsToInt(value))
	}
	if value, ok := optMap["maxDepth"]; ok {
		out.MaxDepth = layoutClampInt(jsToInt(value), 1, 12)
	}
	if value, ok := optMap["minSplitSpan"]; ok {
		out.MinSplitSpan = layoutClampInt(jsToInt(value), 2, 32)
	}
	if value, ok := optMap["minSeparatorScore"]; ok {
		out.MinSeparatorScore = layoutClampFloat(layoutFloatValue(value), 0.02, 0.95)
	}
	if value, ok := optMap["minSeparatorSpanRatio"]; ok {
		out.MinSeparatorSpanRatio = layoutClampFloat(layoutFloatValue(value), 0, 1)
	}
	if value, ok := optMap["maxSeparatorCandidates"]; ok {
		out.MaxSeparatorCandidates = layoutClampInt(jsToInt(value), 1, 24)
	}
	if value, ok := optMap["profile"]; ok {
		profile := strings.TrimSpace(fmt.Sprintf("%v", value))
		if profile != "" {
			out.LegacyProfile = profile
		}
	}
	if value, ok := optMap["separatorHints"]; ok {
		out.SeparatorHints = parseLayoutHints(value)
	}
	if value, ok := optMap["cellColorMode"]; ok {
		mode := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", value)))
		if mode == "mean" || mode == "median" || mode == "trimmed" || mode == "dominant" {
			out.CellColorMode = mode
		}
	}
	if value, ok := optMap["boundarySpanWidth"]; ok {
		out.BoundarySpanWidth = layoutClampInt(jsToInt(value), 1, 8)
	}
	if out.MinSplitSpan < 4 {
		out.MinSplitSpan = layoutMaxInt(out.MinSplitSpan, layoutMaxInt(2, 28/out.CellSize))
	}
	return out
}

// medianUint8 computes the median value of a uint8 slice
func medianUint8(values []uint8) uint8 {
	if len(values) == 0 {
		return 0
	}
	sorted := make([]uint8, len(values))
	copy(sorted, values)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	return sorted[len(sorted)/2]
}

// computeCellColorMedian computes cell color using median instead of mean
// This is more robust against text/foreground noise
func computeCellColorMedian(img image.Image, startX, startY, endX, endY, quantize int) layoutCell {
	pixelCount := (endX - startX) * (endY - startY)
	if pixelCount == 0 {
		return layoutCell{}
	}

	rs := make([]uint8, 0, pixelCount)
	gs := make([]uint8, 0, pixelCount)
	bs := make([]uint8, 0, pixelCount)

	for y := startY; y < endY; y++ {
		for x := startX; x < endX; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			rs = append(rs, uint8(r>>8))
			gs = append(gs, uint8(g>>8))
			bs = append(bs, uint8(b>>8))
		}
	}

	return layoutCell{
		R: quantizeColor(medianUint8(rs), layoutMaxInt(1, quantize/2)),
		G: quantizeColor(medianUint8(gs), layoutMaxInt(1, quantize/2)),
		B: quantizeColor(medianUint8(bs), layoutMaxInt(1, quantize/2)),
	}
}

// computeCellColorMean computes cell color using arithmetic mean (original method)
func computeCellColorMean(img image.Image, startX, startY, endX, endY, quantize int) layoutCell {
	var sumR, sumG, sumB, count int
	for y := startY; y < endY; y++ {
		for x := startX; x < endX; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			sumR += int(r >> 8)
			sumG += int(g >> 8)
			sumB += int(b >> 8)
			count++
		}
	}
	if count == 0 {
		return layoutCell{}
	}
	return layoutCell{
		R: quantizeColor(uint8(sumR/count), layoutMaxInt(1, quantize/2)),
		G: quantizeColor(uint8(sumG/count), layoutMaxInt(1, quantize/2)),
		B: quantizeColor(uint8(sumB/count), layoutMaxInt(1, quantize/2)),
	}
}

func buildLayoutGrid(img image.Image, cellSize, quantize int, cellColorMode string) ([][]layoutCell, int, int) {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	gridW := int(math.Ceil(float64(width) / float64(cellSize)))
	gridH := int(math.Ceil(float64(height) / float64(cellSize)))
	grid := make([][]layoutCell, gridH)
	for gy := 0; gy < gridH; gy++ {
		grid[gy] = make([]layoutCell, gridW)
		for gx := 0; gx < gridW; gx++ {
			startX := bounds.Min.X + gx*cellSize
			startY := bounds.Min.Y + gy*cellSize
			endX := layoutMinInt(bounds.Max.X, startX+cellSize)
			endY := layoutMinInt(bounds.Max.Y, startY+cellSize)

			// Use different color computation based on mode
			if cellColorMode == "median" {
				grid[gy][gx] = computeCellColorMedian(img, startX, startY, endX, endY, quantize)
			} else {
				// Default to mean for backward compatibility
				grid[gy][gx] = computeCellColorMean(img, startX, startY, endX, endY, quantize)
			}
		}
	}
	return grid, gridW, gridH
}

func quantizeColor(v uint8, step int) uint8 {
	if step <= 1 {
		return v
	}
	return uint8((int(v) / step) * step)
}

func floodFillLayoutGrid(grid [][]layoutCell, gridW, gridH int, tolerance float64, quantize int) ([][]int, []*layoutRegionInfo) {
	labels := make([][]int, gridH)
	for y := range labels {
		labels[y] = make([]int, gridW)
		for x := range labels[y] {
			labels[y][x] = -1
		}
	}

	regions := make([]*layoutRegionInfo, 0)
	for y := 0; y < gridH; y++ {
		for x := 0; x < gridW; x++ {
			if labels[y][x] >= 0 {
				continue
			}
			label := len(regions)
			region := &layoutRegionInfo{
				Label: label,
				MinX:  x,
				MinY:  y,
				MaxX:  x,
				MaxY:  y,
			}
			queue := []layoutPoint{{X: x, Y: y}}
			labels[y][x] = label

			for len(queue) > 0 {
				p := queue[0]
				queue = queue[1:]
				cell := grid[p.Y][p.X]
				region.Cells = append(region.Cells, p)
				region.Area++
				region.SumR += int(cell.R)
				region.SumG += int(cell.G)
				region.SumB += int(cell.B)
				if p.X < region.MinX {
					region.MinX = p.X
				}
				if p.Y < region.MinY {
					region.MinY = p.Y
				}
				if p.X > region.MaxX {
					region.MaxX = p.X
				}
				if p.Y > region.MaxY {
					region.MaxY = p.Y
				}

				avg := layoutCell{
					R: uint8(region.SumR / layoutMaxInt(1, region.Area)),
					G: uint8(region.SumG / layoutMaxInt(1, region.Area)),
					B: uint8(region.SumB / layoutMaxInt(1, region.Area)),
				}
				neighbors := []layoutPoint{
					{X: p.X - 1, Y: p.Y},
					{X: p.X + 1, Y: p.Y},
					{X: p.X, Y: p.Y - 1},
					{X: p.X, Y: p.Y + 1},
				}
				for _, n := range neighbors {
					if n.X < 0 || n.X >= gridW || n.Y < 0 || n.Y >= gridH {
						continue
					}
					if labels[n.Y][n.X] >= 0 {
						continue
					}
					if layoutCellDistanceQuantized(grid[n.Y][n.X], avg, quantize) > tolerance {
						continue
					}
					labels[n.Y][n.X] = label
					queue = append(queue, n)
				}
			}
			region.Color = layoutCell{
				R: uint8(region.SumR / layoutMaxInt(1, region.Area)),
				G: uint8(region.SumG / layoutMaxInt(1, region.Area)),
				B: uint8(region.SumB / layoutMaxInt(1, region.Area)),
			}
			regions = append(regions, region)
		}
	}
	return labels, regions
}

func mergeSmallLayoutRegions(labels [][]int, grid [][]layoutCell, regions []*layoutRegionInfo, minArea int) {
	if minArea <= 1 {
		return
	}
	gridH := len(labels)
	if gridH == 0 {
		return
	}
	gridW := len(labels[0])

	for _, region := range regions {
		if region == nil || region.Area >= minArea || len(region.Cells) == 0 {
			continue
		}
		neighborCounts := map[int]int{}
		for _, cell := range region.Cells {
			neighbors := []layoutPoint{
				{X: cell.X - 1, Y: cell.Y},
				{X: cell.X + 1, Y: cell.Y},
				{X: cell.X, Y: cell.Y - 1},
				{X: cell.X, Y: cell.Y + 1},
			}
			for _, n := range neighbors {
				if n.X < 0 || n.X >= gridW || n.Y < 0 || n.Y >= gridH {
					continue
				}
				label := labels[n.Y][n.X]
				if label >= 0 && label != region.Label {
					neighborCounts[label]++
				}
			}
		}
		bestLabel := -1
		bestCount := -1
		for label, count := range neighborCounts {
			if count > bestCount {
				bestLabel = label
				bestCount = count
			}
		}
		if bestLabel < 0 {
			continue
		}
		for _, cell := range region.Cells {
			labels[cell.Y][cell.X] = bestLabel
		}
	}
}

func rebuildLayoutRegions(labels [][]int, grid [][]layoutCell, gridW, gridH int) []*layoutRegionInfo {
	regionMap := map[int]*layoutRegionInfo{}
	for y := 0; y < gridH; y++ {
		for x := 0; x < gridW; x++ {
			label := labels[y][x]
			if label < 0 {
				continue
			}
			region := regionMap[label]
			if region == nil {
				region = &layoutRegionInfo{
					Label: label,
					MinX:  x,
					MinY:  y,
					MaxX:  x,
					MaxY:  y,
				}
				regionMap[label] = region
			}
			cell := grid[y][x]
			region.Cells = append(region.Cells, layoutPoint{X: x, Y: y})
			region.Area++
			region.SumR += int(cell.R)
			region.SumG += int(cell.G)
			region.SumB += int(cell.B)
			if x < region.MinX {
				region.MinX = x
			}
			if y < region.MinY {
				region.MinY = y
			}
			if x > region.MaxX {
				region.MaxX = x
			}
			if y > region.MaxY {
				region.MaxY = y
			}
		}
	}

	out := make([]*layoutRegionInfo, 0, len(regionMap))
	for _, region := range regionMap {
		region.Color = layoutCell{
			R: uint8(region.SumR / layoutMaxInt(1, region.Area)),
			G: uint8(region.SumG / layoutMaxInt(1, region.Area)),
			B: uint8(region.SumB / layoutMaxInt(1, region.Area)),
		}
		out = append(out, region)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Area > out[j].Area
	})
	return out
}

func buildLayoutSplitTree(labels [][]int, grid [][]layoutCell, rect layoutGridRect, depth int, opts layoutAnalyzeOptions, width, height int, state *layoutSegmentationState, boundaries []layoutBoundaryRef, captureRoot bool) *layoutSplitNode {
	node := &layoutSplitNode{
		Rect:       rect,
		Depth:      depth,
		Boundaries: append([]layoutBoundaryRef(nil), boundaries...),
	}
	if !rect.Valid() || depth >= opts.MaxDepth {
		return node
	}
	if rect.Width() < opts.MinSplitSpan*2 && rect.Height() < opts.MinSplitSpan*2 {
		return node
	}

	best, verticalCandidates, horizontalCandidates := chooseLayoutSplit(labels, grid, rect, depth, opts, width, height, state)
	if captureRoot {
		state.RootCandidates["vertical"] = candidateSeparatorsToItems(verticalCandidates)
		state.RootCandidates["horizontal"] = candidateSeparatorsToItems(horizontalCandidates)
	}
	if best == nil {
		return node
	}

	separator := best.Separator
	node.Separator = &separator
	state.SelectedSeparators = append(state.SelectedSeparators, separator)

	if separator.Orientation == "vertical" {
		leftRect := layoutGridRect{MinX: rect.MinX, MinY: rect.MinY, MaxX: best.GridPos, MaxY: rect.MaxY}
		rightRect := layoutGridRect{MinX: best.GridPos, MinY: rect.MinY, MaxX: rect.MaxX, MaxY: rect.MaxY}
		leftBoundaries := appendBoundary(boundaries, layoutBoundaryRef{Orientation: "vertical", Side: "right", Position: separator.Position, Confidence: separator.Confidence, Source: separator.Source})
		rightBoundaries := appendBoundary(boundaries, layoutBoundaryRef{Orientation: "vertical", Side: "left", Position: separator.Position, Confidence: separator.Confidence, Source: separator.Source})
		node.Children = []*layoutSplitNode{
			buildLayoutSplitTree(labels, grid, leftRect, depth+1, opts, width, height, state, leftBoundaries, false),
			buildLayoutSplitTree(labels, grid, rightRect, depth+1, opts, width, height, state, rightBoundaries, false),
		}
		return node
	}

	topRect := layoutGridRect{MinX: rect.MinX, MinY: rect.MinY, MaxX: rect.MaxX, MaxY: best.GridPos}
	bottomRect := layoutGridRect{MinX: rect.MinX, MinY: best.GridPos, MaxX: rect.MaxX, MaxY: rect.MaxY}
	topBoundaries := appendBoundary(boundaries, layoutBoundaryRef{Orientation: "horizontal", Side: "bottom", Position: separator.Position, Confidence: separator.Confidence, Source: separator.Source})
	bottomBoundaries := appendBoundary(boundaries, layoutBoundaryRef{Orientation: "horizontal", Side: "top", Position: separator.Position, Confidence: separator.Confidence, Source: separator.Source})
	node.Children = []*layoutSplitNode{
		buildLayoutSplitTree(labels, grid, topRect, depth+1, opts, width, height, state, topBoundaries, false),
		buildLayoutSplitTree(labels, grid, bottomRect, depth+1, opts, width, height, state, bottomBoundaries, false),
	}
	return node
}

func chooseLayoutSplit(labels [][]int, grid [][]layoutCell, rect layoutGridRect, depth int, opts layoutAnalyzeOptions, width, height int, state *layoutSegmentationState) (*layoutSeparatorCandidate, []layoutSeparatorCandidate, []layoutSeparatorCandidate) {
	verticalCandidates := selectLayoutBoundaryCandidates(computeFloodVerticalBoundaryScores(labels, grid, rect, opts.BoundarySpanWidth), rect, opts, width, height, depth)
	horizontalCandidates := selectLayoutBoundaryCandidates(computeFloodHorizontalBoundaryScores(labels, grid, rect, opts.BoundarySpanWidth), rect, opts, width, height, depth)
	verticalCandidates = applyLayoutChildContrast(verticalCandidates, grid, rect)
	horizontalCandidates = applyLayoutChildContrast(horizontalCandidates, grid, rect)

	bestHinted := pickHintedCandidate(verticalCandidates, horizontalCandidates, opts, state)
	if layoutHintsConfigured(opts.SeparatorHints) {
		return bestHinted, verticalCandidates, horizontalCandidates
	}
	bestAuto := pickBestAutoCandidate(verticalCandidates, horizontalCandidates, opts)

	switch {
	case bestHinted != nil && bestAuto != nil:
		hintedScore := bestHinted.Separator.Confidence + 0.06
		autoScore := bestAuto.Separator.Confidence
		if hintedScore >= autoScore-0.04 {
			return bestHinted, verticalCandidates, horizontalCandidates
		}
		return bestAuto, verticalCandidates, horizontalCandidates
	case bestHinted != nil:
		return bestHinted, verticalCandidates, horizontalCandidates
	default:
		return bestAuto, verticalCandidates, horizontalCandidates
	}
}

func layoutHintsConfigured(hints layoutHintSet) bool {
	return len(hints.Vertical) > 0 || len(hints.Horizontal) > 0
}

func selectLayoutBoundaryCandidates(items []boundaryScore, rect layoutGridRect, opts layoutAnalyzeOptions, width, height, depth int) []layoutSeparatorCandidate {
	if len(items) == 0 {
		return nil
	}
	items = smoothBoundaryScores(items, 1)
	threshold := layoutBoundaryThreshold(items, opts.MinSeparatorScore)
	minSupport := 0.18
	minSpacing := layoutMaxInt(2, axisSpanForOrientation(rect, items[0].Orientation)/10)
	candidates := make([]boundaryScore, 0, len(items))

	clusterStart := -1
	for i := range items {
		item := items[i]
		qualified := item.Score >= threshold && item.SupportRatio >= minSupport && item.SupportSpanRatio >= opts.MinSeparatorSpanRatio
		if qualified && clusterStart < 0 {
			clusterStart = i
		}
		if qualified {
			continue
		}
		if clusterStart >= 0 {
			if best, ok := selectBestBoundaryClusterItem(items[clusterStart:i]); ok {
				candidates = append(candidates, best)
			}
			clusterStart = -1
		}
	}
	if clusterStart >= 0 {
		if best, ok := selectBestBoundaryClusterItem(items[clusterStart:]); ok {
			candidates = append(candidates, best)
		}
	}
	if len(candidates) == 0 {
		best := items[0]
		for _, item := range items[1:] {
			if item.Score > best.Score {
				best = item
			}
		}
		if best.Score >= threshold && best.SupportRatio >= minSupport && best.SupportSpanRatio >= opts.MinSeparatorSpanRatio {
			candidates = append(candidates, best)
		}
	}

	sort.Slice(candidates, func(i, j int) bool {
		leftConfidence := layoutBoundaryConfidence(candidates[i])
		rightConfidence := layoutBoundaryConfidence(candidates[j])
		if leftConfidence == rightConfidence {
			return candidates[i].Score > candidates[j].Score
		}
		return leftConfidence > rightConfidence
	})

	filtered := make([]layoutSeparatorCandidate, 0, layoutMinInt(len(candidates), opts.MaxSeparatorCandidates))
	for _, item := range candidates {
		if !isValidSplitPosition(rect, item.Pos, item.Orientation, opts.MinSplitSpan) {
			continue
		}
		keep := true
		for _, existing := range filtered {
			if existing.Separator.Orientation != item.Orientation {
				continue
			}
			if absInt(existing.GridPos-item.Pos) < minSpacing {
				keep = false
				break
			}
		}
		if !keep {
			continue
		}
		filtered = append(filtered, layoutSeparatorCandidate{
			Separator: buildLayoutSeparatorCandidate(item, rect, depth, width, height, opts.CellSize),
			GridPos:   item.Pos,
		})
		if len(filtered) >= opts.MaxSeparatorCandidates {
			break
		}
	}
	return filtered
}

func selectBestBoundaryClusterItem(items []boundaryScore) (boundaryScore, bool) {
	if len(items) == 0 {
		return boundaryScore{}, false
	}
	best := items[0]
	bestConfidence := layoutBoundaryConfidence(best)
	for _, item := range items[1:] {
		confidence := layoutBoundaryConfidence(item)
		switch {
		case confidence > bestConfidence:
			best = item
			bestConfidence = confidence
		case confidence == bestConfidence && item.SupportRatio > best.SupportRatio:
			best = item
			bestConfidence = confidence
		case confidence == bestConfidence && item.SupportRatio == best.SupportRatio && item.Score > best.Score:
			best = item
			bestConfidence = confidence
		}
	}
	return best, true
}

func buildLayoutSeparatorCandidate(item boundaryScore, rect layoutGridRect, depth, width, height, cellSize int) layoutSeparator {
	position := gridBoundaryToPixels(item.Pos, cellSize, axisPixelLimit(width, height, item.Orientation))
	meta := map[string]interface{}{
		"gridPosition":     item.Pos,
		"supportRatio":     item.SupportRatio,
		"supportSpanRatio": item.SupportSpanRatio,
		"supportSpan":      exportLayoutSupportSpan(item, cellSize, width, height),
		"contrast":         item.Contrast,
		"depth":            depth,
		"gridRect":         exportLayoutGridRect(rect),
		"pixelTotal":       axisPixelLimit(width, height, item.Orientation),
		"span":             exportLayoutSeparatorSpan(item.Orientation, rect, cellSize, width, height),
		"normalizedPos":    layoutNormalizedPosition(item.Pos, rect, item.Orientation),
	}
	return layoutSeparator{
		Orientation: item.Orientation,
		Position:    position,
		Thickness:   2,
		Score:       item.Score,
		Source:      "grid-boundary",
		Confidence:  layoutBoundaryConfidence(item),
		Meta:        meta,
	}
}

func pickHintedCandidate(verticalCandidates, horizontalCandidates []layoutSeparatorCandidate, opts layoutAnalyzeOptions, state *layoutSegmentationState) *layoutSeparatorCandidate {
	best := bestHintMatch(verticalCandidates, opts.SeparatorHints.Vertical)
	if candidate := bestHintMatch(horizontalCandidates, opts.SeparatorHints.Horizontal); candidate != nil {
		if best == nil || layoutSeparatorSelectionScore(candidate.Separator) > layoutSeparatorSelectionScore(best.Separator) {
			best = candidate
		}
	}
	if best == nil {
		return nil
	}
	return best
}

func bestHintMatch(candidates []layoutSeparatorCandidate, hints []layoutBandHint) *layoutSeparatorCandidate {
	var best *layoutSeparatorCandidate
	for _, candidate := range candidates {
		matchedLabel, matchedDistance, ok := matchLayoutHint(candidate, hints)
		if !ok {
			continue
		}
		candidate.Separator.Source = "hinted-grid-boundary"
		candidate.Separator.Meta["hintLabel"] = matchedLabel
		candidate.HintLabel = matchedLabel
		candidate.HintDistance = matchedDistance
		if best == nil {
			best = &candidate
			continue
		}
		candidateScore := layoutSeparatorSelectionScore(candidate.Separator)
		bestScore := layoutSeparatorSelectionScore(best.Separator)
		if candidateScore > bestScore ||
			(candidateScore == bestScore && candidate.HintDistance < best.HintDistance) {
			best = &candidate
		}
	}
	return best
}

func pickBestAutoCandidate(verticalCandidates, horizontalCandidates []layoutSeparatorCandidate, opts layoutAnalyzeOptions) *layoutSeparatorCandidate {
	all := append([]layoutSeparatorCandidate{}, verticalCandidates...)
	all = append(all, horizontalCandidates...)
	if len(all) == 0 {
		return nil
	}
	sort.Slice(all, func(i, j int) bool {
		leftScore := layoutSeparatorSelectionScore(all[i].Separator)
		rightScore := layoutSeparatorSelectionScore(all[j].Separator)
		if leftScore == rightScore {
			return all[i].Separator.Score > all[j].Separator.Score
		}
		return leftScore > rightScore
	})
	best := all[0]
	support := layoutMetaFloat(best.Separator.Meta, "supportRatio")
	childContrast := layoutMetaFloat(best.Separator.Meta, "childContrast")
	if layoutSeparatorSelectionScore(best.Separator) < 0.34 || best.Separator.Confidence < 0.24 || support < 0.24 || childContrast < 3.5 {
		return nil
	}
	return &best
}

func candidateSeparatorsToItems(candidates []layoutSeparatorCandidate) []layoutSeparator {
	out := make([]layoutSeparator, 0, len(candidates))
	for _, candidate := range candidates {
		out = append(out, candidate.Separator)
	}
	sortLayoutSeparators(out)
	return out
}

func applyLayoutChildContrast(candidates []layoutSeparatorCandidate, grid [][]layoutCell, rect layoutGridRect) []layoutSeparatorCandidate {
	out := make([]layoutSeparatorCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		childContrast := layoutSplitChildContrast(grid, rect, candidate.GridPos, candidate.Separator.Orientation)
		candidate.Separator.Meta["childContrast"] = childContrast
		out = append(out, candidate)
	}
	return out
}

// computeRegionAverageColor computes the average color of a region span
// This is used for multi-span boundary contrast calculation
func computeRegionAverageColor(grid [][]layoutCell, rect layoutGridRect, startX, endX int, orientation string) layoutCell {
	startX = layoutClampInt(startX, rect.MinX, rect.MaxX-1)
	endX = layoutClampInt(endX, rect.MinX+1, rect.MaxX)

	var sumR, sumG, sumB, count int
	if orientation == "vertical" {
		for y := rect.MinY; y < rect.MaxY; y++ {
			for x := startX; x < endX; x++ {
				sumR += int(grid[y][x].R)
				sumG += int(grid[y][x].G)
				sumB += int(grid[y][x].B)
				count++
			}
		}
	} else {
		// horizontal orientation: swap x/y logic
		startY := layoutClampInt(startX, rect.MinY, rect.MaxY-1)
		endY := layoutClampInt(endX, rect.MinY+1, rect.MaxY)
		for y := startY; y < endY; y++ {
			for x := rect.MinX; x < rect.MaxX; x++ {
				sumR += int(grid[y][x].R)
				sumG += int(grid[y][x].G)
				sumB += int(grid[y][x].B)
				count++
			}
		}
	}

	if count == 0 {
		return layoutCell{}
	}

	return layoutCell{
		R: uint8(sumR / count),
		G: uint8(sumG / count),
		B: uint8(sumB / count),
	}
}

func computeFloodVerticalBoundaryScores(labels [][]int, grid [][]layoutCell, rect layoutGridRect, spanWidth int) []boundaryScore {
	out := make([]boundaryScore, 0, layoutMaxInt(0, rect.Width()-1))
	for x := rect.MinX + 1; x < rect.MaxX; x++ {
		// Compute region-level contrast (multi-span)
		leftColor := computeRegionAverageColor(grid, rect, x-spanWidth, x, "vertical")
		rightColor := computeRegionAverageColor(grid, rect, x, x+spanWidth, "vertical")
		regionContrast := layoutCellDistance(leftColor, rightColor)

		// Compute local support (cell-level changes)
		changeCount := 0
		supportStart := rect.MinY
		supportEnd := rect.MinY
		runStart := -1
		distSum := 0.0
		sampleCount := 0
		for y := rect.MinY; y < rect.MaxY; y++ {
			dist := layoutCellDistance(grid[y][x], grid[y][x-1])
			supported := labels[y][x] != labels[y][x-1] || dist >= 10
			if supported {
				changeCount++
				if runStart < 0 {
					runStart = y
				}
				if y+1-runStart > supportEnd-supportStart {
					supportStart = runStart
					supportEnd = y + 1
				}
			} else {
				runStart = -1
			}
			distSum += dist
			sampleCount++
		}
		if sampleCount == 0 {
			continue
		}
		ratio := float64(changeCount) / float64(sampleCount)
		supportSpanRatio := float64(supportEnd-supportStart) / float64(sampleCount)
		avgDist := distSum / float64(sampleCount)

		// Scoring formula optimized for median mode
		// Balanced weights for support ratio, local contrast, and region contrast
		score := ratio*0.40 +
			layoutClampFloat(avgDist/72.0, 0, 1)*0.25 +
			layoutClampFloat(regionContrast/72.0, 0, 1)*0.35

		out = append(out, boundaryScore{
			Pos:              x,
			Score:            score,
			SupportRatio:     ratio,
			SupportSpanRatio: supportSpanRatio,
			SupportStart:     supportStart,
			SupportEnd:       supportEnd,
			Contrast:         avgDist,
			Orientation:      "vertical",
		})
	}
	return out
}

func computeFloodHorizontalBoundaryScores(labels [][]int, grid [][]layoutCell, rect layoutGridRect, spanWidth int) []boundaryScore {
	out := make([]boundaryScore, 0, layoutMaxInt(0, rect.Height()-1))
	for y := rect.MinY + 1; y < rect.MaxY; y++ {
		// Compute region-level contrast (multi-span)
		topColor := computeRegionAverageColor(grid, rect, y-spanWidth, y, "horizontal")
		bottomColor := computeRegionAverageColor(grid, rect, y, y+spanWidth, "horizontal")
		regionContrast := layoutCellDistance(topColor, bottomColor)

		// Compute local support (cell-level changes)
		changeCount := 0
		supportStart := rect.MinX
		supportEnd := rect.MinX
		runStart := -1
		distSum := 0.0
		sampleCount := 0
		for x := rect.MinX; x < rect.MaxX; x++ {
			dist := layoutCellDistance(grid[y][x], grid[y-1][x])
			supported := labels[y][x] != labels[y-1][x] || dist >= 10
			if supported {
				changeCount++
				if runStart < 0 {
					runStart = x
				}
				if x+1-runStart > supportEnd-supportStart {
					supportStart = runStart
					supportEnd = x + 1
				}
			} else {
				runStart = -1
			}
			distSum += dist
			sampleCount++
		}
		if sampleCount == 0 {
			continue
		}
		ratio := float64(changeCount) / float64(sampleCount)
		supportSpanRatio := float64(supportEnd-supportStart) / float64(sampleCount)
		avgDist := distSum / float64(sampleCount)

		// Scoring formula optimized for median mode
		// Balanced weights for support ratio, local contrast, and region contrast
		score := ratio*0.40 +
			layoutClampFloat(avgDist/72.0, 0, 1)*0.25 +
			layoutClampFloat(regionContrast/72.0, 0, 1)*0.35

		out = append(out, boundaryScore{
			Pos:              y,
			Score:            score,
			SupportRatio:     ratio,
			SupportSpanRatio: supportSpanRatio,
			SupportStart:     supportStart,
			SupportEnd:       supportEnd,
			Contrast:         avgDist,
			Orientation:      "horizontal",
		})
	}
	return out
}
func smoothBoundaryScores(items []boundaryScore, radius int) []boundaryScore {
	if len(items) == 0 || radius <= 0 {
		return items
	}
	out := make([]boundaryScore, len(items))
	for i := range items {
		sumScore := 0.0
		sumSupport := 0.0
		sumContrast := 0.0
		count := 0.0
		bestSpan := items[i]
		for j := i - radius; j <= i+radius; j++ {
			if j < 0 || j >= len(items) {
				continue
			}
			sumScore += items[j].Score
			sumSupport += items[j].SupportRatio
			sumContrast += items[j].Contrast
			count++
			if items[j].SupportSpanRatio > bestSpan.SupportSpanRatio {
				bestSpan = items[j]
			}
		}
		out[i] = items[i]
		out[i].Score = sumScore / layoutMaxFloat(1, count)
		out[i].SupportRatio = sumSupport / layoutMaxFloat(1, count)
		out[i].Contrast = sumContrast / layoutMaxFloat(1, count)
		out[i].SupportSpanRatio = bestSpan.SupportSpanRatio
		out[i].SupportStart = bestSpan.SupportStart
		out[i].SupportEnd = bestSpan.SupportEnd
	}
	return out
}

func exportLayoutRegionsFromTree(root *layoutSplitNode, img image.Image, cellSize, width, height int) []map[string]interface{} {
	leaves := make([]*layoutSplitNode, 0)
	collectLayoutLeafNodes(root, &leaves)
	sort.Slice(leaves, func(i, j int) bool {
		leftRect := gridRectToPixels(leaves[i].Rect, cellSize, width, height)
		rightRect := gridRectToPixels(leaves[j].Rect, cellSize, width, height)
		if leftRect.Min.X != rightRect.Min.X {
			return leftRect.Min.X < rightRect.Min.X
		}
		if leftRect.Min.Y != rightRect.Min.Y {
			return leftRect.Min.Y < rightRect.Min.Y
		}
		return leftRect.Dx()*leftRect.Dy() > rightRect.Dx()*rightRect.Dy()
	})

	out := make([]map[string]interface{}, 0, len(leaves))
	for index, leaf := range leaves {
		out = append(out, layoutRegionFromLeaf(leaf, index+1, img, cellSize, width, height))
	}
	return out
}

func collectLayoutLeafNodes(node *layoutSplitNode, out *[]*layoutSplitNode) {
	if node == nil {
		return
	}
	if len(node.Children) == 0 {
		*out = append(*out, node)
		return
	}
	for _, child := range node.Children {
		collectLayoutLeafNodes(child, out)
	}
}

func layoutRegionFromLeaf(node *layoutSplitNode, index int, img image.Image, cellSize, width, height int) map[string]interface{} {
	rect := gridRectToPixels(node.Rect, cellSize, width, height)
	confidence := averageBoundaryConfidence(node.Boundaries)
	meta := map[string]interface{}{
		"depth":      node.Depth,
		"gridRect":   exportLayoutGridRect(node.Rect),
		"boundaries": exportLayoutBoundaries(node.Boundaries),
	}
	return map[string]interface{}{
		"id":         fmt.Sprintf("region_%02d", index),
		"role":       "layout_region",
		"label":      fmt.Sprintf("Region %02d", index),
		"bbox":       exportLayoutBBox(rect),
		"center":     map[string]interface{}{"x": rect.Min.X + rect.Dx()/2, "y": rect.Min.Y + rect.Dy()/2},
		"avgColor":   sampleRectColorHex(img, rect),
		"confidence": confidence,
		"meta":       meta,
	}
}

func exportLayoutSplitTree(node *layoutSplitNode, cellSize, width, height int) map[string]interface{} {
	if node == nil {
		return nil
	}
	out := map[string]interface{}{
		"depth":    node.Depth,
		"bbox":     exportLayoutBBox(gridRectToPixels(node.Rect, cellSize, width, height)),
		"children": []map[string]interface{}{},
	}
	if node.Separator != nil {
		out["separator"] = exportSingleLayoutSeparator(*node.Separator)
	}
	children := make([]map[string]interface{}, 0, len(node.Children))
	for _, child := range node.Children {
		children = append(children, exportLayoutSplitTree(child, cellSize, width, height))
	}
	out["children"] = children
	return out
}

func exportLayoutFloodRegions(regions []*layoutRegionInfo, opts layoutAnalyzeOptions, width, height int) []map[string]interface{} {
	limit := layoutMinInt(len(regions), opts.MaxRegions)
	out := make([]map[string]interface{}, 0, limit)
	for i := 0; i < limit; i++ {
		region := regions[i]
		if region == nil || region.Area <= 0 {
			continue
		}
		bboxCells := layoutMaxInt(1, (region.MaxX-region.MinX+1)*(region.MaxY-region.MinY+1))
		out = append(out, map[string]interface{}{
			"label": region.Label,
			"bbox": map[string]interface{}{
				"x":      layoutClampInt(region.MinX*opts.CellSize, 0, width-1),
				"y":      layoutClampInt(region.MinY*opts.CellSize, 0, height-1),
				"width":  layoutMaxInt(1, layoutMinInt(width-region.MinX*opts.CellSize, (region.MaxX-region.MinX+1)*opts.CellSize)),
				"height": layoutMaxInt(1, layoutMinInt(height-region.MinY*opts.CellSize, (region.MaxY-region.MinY+1)*opts.CellSize)),
			},
			"area":      region.Area,
			"fillRatio": layoutClampFloat(float64(region.Area)/float64(bboxCells), 0, 1),
			"avgColor":  fmt.Sprintf("#%02x%02x%02x", region.Color.R, region.Color.G, region.Color.B),
		})
	}
	return out
}

func exportLayoutSeparatorGroups(items []layoutSeparator) map[string]interface{} {
	vertical := make([]map[string]interface{}, 0)
	horizontal := make([]map[string]interface{}, 0)
	for _, item := range items {
		exported := exportSingleLayoutSeparator(item)
		if item.Orientation == "horizontal" {
			horizontal = append(horizontal, exported)
			continue
		}
		vertical = append(vertical, exported)
	}
	return map[string]interface{}{
		"vertical":   vertical,
		"horizontal": horizontal,
	}
}

func exportSingleLayoutSeparator(item layoutSeparator) map[string]interface{} {
	out := map[string]interface{}{
		"orientation": item.Orientation,
		"position":    item.Position,
		"thickness":   item.Thickness,
		"score":       item.Score,
		"source":      item.Source,
		"confidence":  item.Confidence,
	}
	if item.Meta != nil {
		out["meta"] = item.Meta
	}
	return out
}

func sampleRectColorHex(img image.Image, rect image.Rectangle) string {
	rect = rect.Intersect(img.Bounds())
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return "#000000"
	}
	stepX := layoutMaxInt(1, rect.Dx()/8)
	stepY := layoutMaxInt(1, rect.Dy()/8)
	var sumR, sumG, sumB, count int
	for y := rect.Min.Y; y < rect.Max.Y; y += stepY {
		for x := rect.Min.X; x < rect.Max.X; x += stepX {
			r, g, b, _ := img.At(x, y).RGBA()
			sumR += int(r >> 8)
			sumG += int(g >> 8)
			sumB += int(b >> 8)
			count++
		}
	}
	if count == 0 {
		return "#000000"
	}
	return fmt.Sprintf("#%02x%02x%02x", sumR/count, sumG/count, sumB/count)
}

func parseLayoutHints(raw interface{}) layoutHintSet {
	out := layoutHintSet{}
	row, ok := raw.(map[string]interface{})
	if !ok {
		return out
	}
	out.Vertical = parseLayoutHintAxis(row["vertical"])
	out.Horizontal = parseLayoutHintAxis(row["horizontal"])
	return out
}

func parseLayoutHintAxis(raw interface{}) []layoutBandHint {
	switch typed := raw.(type) {
	case []layoutBandHint:
		return typed
	case []map[string]interface{}:
		out := make([]layoutBandHint, 0, len(typed))
		for _, item := range typed {
			if hint, ok := parseLayoutHint(item); ok {
				out = append(out, hint)
			}
		}
		return out
	case []interface{}:
		out := make([]layoutBandHint, 0, len(typed))
		for _, item := range typed {
			if hint, ok := parseLayoutHint(item); ok {
				out = append(out, hint)
			}
		}
		return out
	default:
		return nil
	}
}

func parseLayoutHint(raw interface{}) (layoutBandHint, bool) {
	switch typed := raw.(type) {
	case layoutBandHint:
		if typed.To <= typed.From {
			return layoutBandHint{}, false
		}
		return typed, true
	case map[string]interface{}:
		from := layoutClampFloat(layoutFirstFloat(typed["from"], typed["start"]), 0, 1)
		to := layoutClampFloat(layoutFirstFloat(typed["to"], typed["end"]), 0, 1)
		if to <= from {
			return layoutBandHint{}, false
		}
		return layoutBandHint{
			Label: strings.TrimSpace(fmt.Sprintf("%v", layoutFirstNonNil(typed["label"], typed["id"]))),
			From:  from,
			To:    to,
		}, true
	case []interface{}:
		if len(typed) < 2 {
			return layoutBandHint{}, false
		}
		from := layoutClampFloat(layoutFloatValue(typed[0]), 0, 1)
		to := layoutClampFloat(layoutFloatValue(typed[1]), 0, 1)
		if to <= from {
			return layoutBandHint{}, false
		}
		return layoutBandHint{From: from, To: to}, true
	default:
		return layoutBandHint{}, false
	}
}

func exportLayoutHints(hints layoutHintSet) map[string]interface{} {
	return map[string]interface{}{
		"vertical":   exportLayoutHintAxis(hints.Vertical),
		"horizontal": exportLayoutHintAxis(hints.Horizontal),
	}
}

func exportLayoutHintAxis(items []layoutBandHint) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]interface{}{
			"label": item.Label,
			"from":  item.From,
			"to":    item.To,
		})
	}
	return out
}

func matchLayoutHint(candidate layoutSeparatorCandidate, hints []layoutBandHint) (string, float64, bool) {
	if len(hints) == 0 {
		return "", 0, false
	}
	total := layoutMetaFloat(candidate.Separator.Meta, "pixelTotal")
	if total <= 0 {
		return "", 0, false
	}
	posRatio := float64(candidate.Separator.Position) / total
	bestLabel := ""
	bestDistance := math.MaxFloat64
	for _, hint := range hints {
		if posRatio < hint.From || posRatio > hint.To {
			continue
		}
		center := (hint.From + hint.To) / 2
		distance := math.Abs(posRatio - center)
		label := hint.Label
		if label == "" {
			label = fmt.Sprintf("%.2f-%.2f", hint.From, hint.To)
		}
		if distance < bestDistance {
			bestDistance = distance
			bestLabel = label
		}
	}
	if bestLabel == "" {
		return "", 0, false
	}
	return bestLabel, bestDistance, true
}

func markMissedHints(state *layoutSegmentationState, hints []layoutBandHint) {
	for _, hint := range hints {
		label := hint.Label
		if label == "" {
			label = fmt.Sprintf("%.2f-%.2f", hint.From, hint.To)
		}
		if state.HintWarnings[label] {
			continue
		}
		state.HintWarnings[label] = true
		state.Warnings = append(state.Warnings, fmt.Sprintf("no separator matched hint band %s", label))
	}
}

func dedupeLayoutSeparators(items []layoutSeparator) []layoutSeparator {
	index := map[string]layoutSeparator{}
	for _, item := range items {
		key := fmt.Sprintf("%s:%d", item.Orientation, item.Position)
		if existing, ok := index[key]; ok && existing.Confidence >= item.Confidence {
			continue
		}
		index[key] = item
	}
	out := make([]layoutSeparator, 0, len(index))
	for _, item := range index {
		out = append(out, item)
	}
	return out
}

func sortLayoutSeparators(items []layoutSeparator) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].Orientation != items[j].Orientation {
			return items[i].Orientation < items[j].Orientation
		}
		if items[i].Position != items[j].Position {
			return items[i].Position < items[j].Position
		}
		return items[i].Confidence > items[j].Confidence
	})
}

func flattenLayoutSeparatorMap(items map[string][]layoutSeparator) []layoutSeparator {
	out := make([]layoutSeparator, 0)
	for _, group := range items {
		out = append(out, group...)
	}
	sortLayoutSeparators(out)
	return out
}

func appendBoundary(boundaries []layoutBoundaryRef, boundary layoutBoundaryRef) []layoutBoundaryRef {
	out := append([]layoutBoundaryRef(nil), boundaries...)
	out = append(out, boundary)
	return out
}

func averageBoundaryConfidence(boundaries []layoutBoundaryRef) float64 {
	if len(boundaries) == 0 {
		return 0.5
	}
	sum := 0.0
	for _, boundary := range boundaries {
		sum += boundary.Confidence
	}
	return layoutClampFloat(sum/float64(len(boundaries)), 0.1, 0.99)
}

func layoutSeparatorSelectionScore(separator layoutSeparator) float64 {
	return separator.Confidence + layoutClampFloat(layoutMetaFloat(separator.Meta, "childContrast")/48.0, 0, 0.15)
}

func exportLayoutBoundaries(items []layoutBoundaryRef) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]interface{}{
			"orientation": item.Orientation,
			"side":        item.Side,
			"position":    item.Position,
			"confidence":  item.Confidence,
			"source":      item.Source,
		})
	}
	return out
}

func exportLayoutGridRect(rect layoutGridRect) map[string]interface{} {
	return map[string]interface{}{
		"minX": rect.MinX,
		"minY": rect.MinY,
		"maxX": rect.MaxX,
		"maxY": rect.MaxY,
	}
}

func exportLayoutBBox(rect image.Rectangle) map[string]interface{} {
	return map[string]interface{}{
		"x":      rect.Min.X,
		"y":      rect.Min.Y,
		"width":  rect.Dx(),
		"height": rect.Dy(),
	}
}

func exportLayoutSeparatorSpan(orientation string, rect layoutGridRect, cellSize, width, height int) map[string]interface{} {
	if orientation == "vertical" {
		return map[string]interface{}{
			"start": layoutClampInt(rect.MinY*cellSize, 0, height),
			"end":   layoutClampInt(rect.MaxY*cellSize, 0, height),
		}
	}
	return map[string]interface{}{
		"start": layoutClampInt(rect.MinX*cellSize, 0, width),
		"end":   layoutClampInt(rect.MaxX*cellSize, 0, width),
	}
}

func exportLayoutSupportSpan(item boundaryScore, cellSize, width, height int) map[string]interface{} {
	limit := height
	if item.Orientation == "horizontal" {
		limit = width
	}
	return map[string]interface{}{
		"start": layoutClampInt(item.SupportStart*cellSize, 0, limit),
		"end":   layoutClampInt(item.SupportEnd*cellSize, 0, limit),
	}
}

func gridRectToPixels(rect layoutGridRect, cellSize, width, height int) image.Rectangle {
	return image.Rect(
		layoutClampInt(rect.MinX*cellSize, 0, width),
		layoutClampInt(rect.MinY*cellSize, 0, height),
		layoutClampInt(rect.MaxX*cellSize, 0, width),
		layoutClampInt(rect.MaxY*cellSize, 0, height),
	)
}

func layoutSplitChildContrast(grid [][]layoutCell, rect layoutGridRect, pos int, orientation string) float64 {
	if orientation == "vertical" {
		left := layoutGridRect{MinX: rect.MinX, MinY: rect.MinY, MaxX: pos, MaxY: rect.MaxY}
		right := layoutGridRect{MinX: pos, MinY: rect.MinY, MaxX: rect.MaxX, MaxY: rect.MaxY}
		return layoutCellDistance(layoutGridRectAverage(grid, left), layoutGridRectAverage(grid, right))
	}
	top := layoutGridRect{MinX: rect.MinX, MinY: rect.MinY, MaxX: rect.MaxX, MaxY: pos}
	bottom := layoutGridRect{MinX: rect.MinX, MinY: pos, MaxX: rect.MaxX, MaxY: rect.MaxY}
	return layoutCellDistance(layoutGridRectAverage(grid, top), layoutGridRectAverage(grid, bottom))
}

func layoutGridRectAverage(grid [][]layoutCell, rect layoutGridRect) layoutCell {
	var sumR, sumG, sumB, count int
	for y := rect.MinY; y < rect.MaxY; y++ {
		for x := rect.MinX; x < rect.MaxX; x++ {
			sumR += int(grid[y][x].R)
			sumG += int(grid[y][x].G)
			sumB += int(grid[y][x].B)
			count++
		}
	}
	if count == 0 {
		return layoutCell{}
	}
	return layoutCell{
		R: uint8(sumR / count),
		G: uint8(sumG / count),
		B: uint8(sumB / count),
	}
}

func layoutBoundaryThreshold(items []boundaryScore, minScore float64) float64 {
	if len(items) == 0 {
		return minScore
	}
	values := make([]float64, 0, len(items))
	for _, item := range items {
		values = append(values, item.Score)
	}
	mean := layoutMean(values)
	std := layoutStd(values)
	p75 := layoutPercentile(values, 0.75)
	threshold := layoutMaxFloat(minScore, layoutMaxFloat(mean+std*0.3, p75*0.9))
	return layoutClampFloat(threshold, minScore, 0.9)
}

func layoutBoundaryConfidence(item boundaryScore) float64 {
	contrastComponent := layoutClampFloat(item.Contrast/72.0, 0, 1)
	return layoutClampFloat(item.SupportRatio*0.58+item.Score*0.30+contrastComponent*0.12, 0, 1)
}

func layoutNormalizedPosition(pos int, rect layoutGridRect, orientation string) float64 {
	if orientation == "vertical" {
		return layoutClampFloat(float64(pos-rect.MinX)/float64(layoutMaxInt(1, rect.Width())), 0, 1)
	}
	return layoutClampFloat(float64(pos-rect.MinY)/float64(layoutMaxInt(1, rect.Height())), 0, 1)
}

func axisSpanForOrientation(rect layoutGridRect, orientation string) int {
	if orientation == "vertical" {
		return rect.Width()
	}
	return rect.Height()
}

func axisPixelLimit(width, height int, orientation string) int {
	if orientation == "vertical" {
		return width
	}
	return height
}

func isValidSplitPosition(rect layoutGridRect, pos int, orientation string, minSpan int) bool {
	if orientation == "vertical" {
		return pos-rect.MinX >= minSpan && rect.MaxX-pos >= minSpan
	}
	return pos-rect.MinY >= minSpan && rect.MaxY-pos >= minSpan
}

func gridBoundaryToPixels(pos, cellSize, maxPixels int) int {
	return layoutClampInt(pos*cellSize, 1, maxPixels-1)
}

func layoutCellDistance(a, b layoutCell) float64 {
	dr := float64(int(a.R) - int(b.R))
	dg := float64(int(a.G) - int(b.G))
	db := float64(int(a.B) - int(b.B))
	return math.Sqrt(dr*dr + dg*dg + db*db)
}

func layoutCellDistanceQuantized(a, b layoutCell, step int) float64 {
	qA := layoutCell{
		R: quantizeColor(a.R, step),
		G: quantizeColor(a.G, step),
		B: quantizeColor(a.B, step),
	}
	qB := layoutCell{
		R: quantizeColor(b.R, step),
		G: quantizeColor(b.G, step),
		B: quantizeColor(b.B, step),
	}
	return layoutCellDistance(qA, qB)
}

func layoutMean(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, value := range values {
		sum += value
	}
	return sum / float64(len(values))
}

func layoutStd(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	mean := layoutMean(values)
	sum := 0.0
	for _, value := range values {
		diff := value - mean
		sum += diff * diff
	}
	return math.Sqrt(sum / float64(len(values)))
}

func layoutPercentile(values []float64, p float64) float64 {
	if len(values) == 0 {
		return 0
	}
	cp := append([]float64(nil), values...)
	sort.Float64s(cp)
	index := int(math.Round(float64(len(cp)-1) * layoutClampFloat(p, 0, 1)))
	return cp[layoutClampInt(index, 0, len(cp)-1)]
}

func layoutMetaFloat(meta map[string]interface{}, key string) float64 {
	if meta == nil {
		return 0
	}
	return layoutFloatValue(meta[key])
}

func layoutFirstFloat(values ...interface{}) float64 {
	for _, value := range values {
		if value == nil {
			continue
		}
		return layoutFloatValue(value)
	}
	return 0
}

func layoutFirstNonNil(values ...interface{}) interface{} {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return ""
}

func layoutFloatValue(value interface{}) float64 {
	switch typed := value.(type) {
	case nil:
		return 0
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case int32:
		return float64(typed)
	case map[string]interface{}:
		return 0
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err == nil {
			return parsed
		}
	}
	return float64(jsToInt(value))
}

func layoutClampFloat(v, minV, maxV float64) float64 {
	if v < minV {
		return minV
	}
	if v > maxV {
		return maxV
	}
	return v
}

func layoutClampInt(v, minV, maxV int) int {
	if v < minV {
		return minV
	}
	if v > maxV {
		return maxV
	}
	return v
}

func layoutMinInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func layoutMaxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func layoutMaxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// filterLayoutSeparators applies final ranking and spacing after candidate-level
// score, support density, and continuous support-span filtering.
// It implements two strategies:
// 1. Confidence-based Top-N selection per orientation
// 2. Minimum spacing filter to avoid clustered separators
func filterLayoutSeparators(separators []layoutSeparator, width, height int) []layoutSeparator {
	if len(separators) == 0 {
		return separators
	}

	// Separate by orientation
	var vertical, horizontal []layoutSeparator
	for _, sep := range separators {
		if sep.Orientation == "vertical" {
			vertical = append(vertical, sep)
		} else {
			horizontal = append(horizontal, sep)
		}
	}

	// Apply filtering per orientation
	vertical = filterSeparatorsByOrientation(vertical, "vertical", width, height)
	horizontal = filterSeparatorsByOrientation(horizontal, "horizontal", width, height)

	// Combine results
	result := make([]layoutSeparator, 0, len(vertical)+len(horizontal))
	result = append(result, vertical...)
	result = append(result, horizontal...)
	return result
}

func filterSeparatorsByOrientation(seps []layoutSeparator, orientation string, width, height int) []layoutSeparator {
	if len(seps) == 0 {
		return seps
	}

	// Sort by confidence (descending)
	sorted := make([]layoutSeparator, len(seps))
	copy(sorted, seps)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Confidence > sorted[j].Confidence
	})

	// Strategy: Apply minimum spacing filter first, then keep top N
	// This ensures we don't cluster separators in one area
	var minSpacing int
	if orientation == "vertical" {
		minSpacing = width / 15 // At least ~6.7% of width apart
	} else {
		minSpacing = height / 15 // At least ~6.7% of height apart
	}
	if minSpacing < 30 {
		minSpacing = 30 // Minimum 30 pixels
	}

	result := make([]layoutSeparator, 0, 5)
	for _, sep := range sorted {
		// Check if this separator is too close to any already selected
		tooClose := false
		for _, existing := range result {
			distance := sep.Position - existing.Position
			if distance < 0 {
				distance = -distance
			}
			if distance < minSpacing {
				tooClose = true
				break
			}
		}

		if !tooClose {
			result = append(result, sep)
			// Keep at most 5 separators per orientation
			if len(result) >= 5 {
				break
			}
		}
	}

	// Sort result by position for consistent output
	sort.Slice(result, func(i, j int) bool {
		return result[i].Position < result[j].Position
	})

	return result
}
