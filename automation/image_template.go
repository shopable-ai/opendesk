package automation

import (
	"fmt"
	"image"
	"math"
	"reflect"
	"sort"
	"strings"

	xdraw "golang.org/x/image/draw"
)

const (
	defaultTemplateMatchThreshold  = 0.85
	defaultTemplateMatchMaxResults = 20
	templateMatchNMSIoU            = 0.30
	templateMatchMaxSafeInteger    = float64(1<<53 - 1)
	templateMatchMaxSamples        = 64
)

type imageTemplateRegion struct {
	X      int
	Y      int
	Width  int
	Height int
}

type imageTemplateOptions struct {
	Threshold  float64
	Region     *imageTemplateRegion
	Scales     []float64
	MaxResults int
}

type templateMatchCandidate struct {
	X          int
	Y          int
	Width      int
	Height     int
	Confidence float64
	Scale      float64
}

type imageTemplateInput struct {
	Value string
	Index int
}

type templateMatchScoreGrid struct {
	Template *image.NRGBA
	Scale    float64
	Region   image.Rectangle
	Width    int
	Height   int
	Scores   []float64
}

type templateMatchSample struct {
	X             int
	Y             int
	TemplateIndex int
}

type templateMatchPlan struct {
	Template *image.NRGBA
	Samples  []templateMatchSample
	MaxDiff  uint64
}

// FindImage finds the single highest-confidence occurrence of one template in
// source. templateInput accepts either one image input or a non-empty array of
// state variants. source and every template accept a file path, image data URL,
// or raw base64 PNG/JPEG input.
func (ic *ImageColor) FindImage(sourceInput string, templateInput interface{}, rawOptions interface{}) (map[string]interface{}, error) {
	options, err := parseImageTemplateOptions(rawOptions, false)
	if err != nil {
		return nil, err
	}
	templates, err := parseImageTemplateInputs(templateInput)
	if err != nil {
		return nil, err
	}
	source, err := loadImageSource(sourceInput)
	if err != nil {
		return nil, fmt.Errorf("failed to load source image: %w", err)
	}
	sourceNRGBA := imageToNRGBA(source)
	best := templateMatchCandidate{Confidence: -1}
	bestTemplateIndex := -1
	for _, input := range templates {
		template, err := loadImageSource(input.Value)
		if err != nil {
			if len(templates) == 1 {
				return nil, fmt.Errorf("failed to load template image: %w", err)
			}
			return nil, fmt.Errorf("failed to load template image at index %d: %w", input.Index, err)
		}
		candidate, err := findBestTemplateCandidate(sourceNRGBA, imageToNRGBA(template), options)
		if err != nil {
			return nil, fmt.Errorf("template at index %d: %w", input.Index, err)
		}
		if bestTemplateIndex < 0 || templateCandidateLess(candidate, best) {
			best = candidate
			bestTemplateIndex = input.Index
		}
	}
	result := best.toMap(best.Confidence >= options.Threshold)
	result["templateIndex"] = bestTemplateIndex
	return result, nil
}

// FindImages finds all distinct occurrences of template above threshold. The
// internal NMS step removes overlapping candidates for one visual target.
func (ic *ImageColor) FindImages(sourceInput, templateInput string, rawOptions interface{}) ([]map[string]interface{}, error) {
	options, err := parseImageTemplateOptions(rawOptions, true)
	if err != nil {
		return nil, err
	}
	source, err := loadImageSource(sourceInput)
	if err != nil {
		return nil, fmt.Errorf("failed to load source image: %w", err)
	}
	template, err := loadImageSource(templateInput)
	if err != nil {
		return nil, fmt.Errorf("failed to load template image: %w", err)
	}

	candidates, err := findTemplateCandidates(imageToNRGBA(source), imageToNRGBA(template), options)
	if err != nil {
		return nil, err
	}
	selected := selectDistinctTemplateCandidates(candidates, options.Threshold, options.MaxResults)
	results := make([]map[string]interface{}, 0, len(selected))
	for _, candidate := range selected {
		results = append(results, candidate.toMap(true))
	}
	return results, nil
}

func parseImageTemplateInputs(raw interface{}) ([]imageTemplateInput, error) {
	if value, ok := raw.(string); ok {
		return []imageTemplateInput{{Value: value, Index: 0}}, nil
	}

	value := reflect.ValueOf(raw)
	if !value.IsValid() || (value.Kind() != reflect.Slice && value.Kind() != reflect.Array) {
		return nil, fmt.Errorf("template must be a string or a non-empty string array")
	}
	if value.Len() == 0 {
		return nil, fmt.Errorf("template must be a non-empty string array")
	}
	templates := make([]imageTemplateInput, 0, value.Len())
	for index := 0; index < value.Len(); index++ {
		input, ok := value.Index(index).Interface().(string)
		if !ok || input == "" {
			return nil, fmt.Errorf("template[%d] must be a non-empty string", index)
		}
		templates = append(templates, imageTemplateInput{Value: input, Index: index})
	}
	return templates, nil
}

func parseImageTemplateOptions(raw interface{}, includeMaxResults bool) (imageTemplateOptions, error) {
	options := imageTemplateOptions{
		Threshold:  defaultTemplateMatchThreshold,
		Scales:     []float64{1},
		MaxResults: defaultTemplateMatchMaxResults,
	}
	if raw == nil {
		return options, nil
	}

	values, ok := raw.(map[string]interface{})
	if !ok {
		return options, fmt.Errorf("ImageColor template-match options must be an object")
	}
	allowed := map[string]struct{}{
		"threshold": {}, "region": {}, "scales": {},
	}
	if includeMaxResults {
		allowed["maxResults"] = struct{}{}
	}
	unknown := make([]string, 0)
	for key := range values {
		if _, known := allowed[key]; !known {
			unknown = append(unknown, key)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return options, fmt.Errorf("ImageColor template-match options contain unknown field(s): %s", strings.Join(unknown, ", "))
	}

	if value, exists := values["threshold"]; exists {
		threshold, err := templateMatchNumber(value, "options.threshold")
		if err != nil {
			return options, err
		}
		if threshold < 0 || threshold > 1 {
			return options, fmt.Errorf("options.threshold must be between 0 and 1")
		}
		options.Threshold = threshold
	}
	if value, exists := values["region"]; exists {
		region, err := parseImageTemplateRegion(value)
		if err != nil {
			return options, err
		}
		options.Region = &region
	}
	if value, exists := values["scales"]; exists {
		scales, err := parseImageTemplateScales(value)
		if err != nil {
			return options, err
		}
		options.Scales = scales
	}
	if includeMaxResults {
		if value, exists := values["maxResults"]; exists {
			parsed, err := templateMatchInteger(value, "options.maxResults", 1, int64(templateMatchMaxSafeInteger))
			if err != nil {
				return options, err
			}
			options.MaxResults = int(parsed)
		}
	}
	return options, nil
}

func parseImageTemplateRegion(raw interface{}) (imageTemplateRegion, error) {
	values, ok := raw.(map[string]interface{})
	if !ok {
		return imageTemplateRegion{}, fmt.Errorf("options.region must be an object")
	}
	allowed := map[string]struct{}{"x": {}, "y": {}, "width": {}, "height": {}}
	unknown := make([]string, 0)
	for key := range values {
		if _, known := allowed[key]; !known {
			unknown = append(unknown, key)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return imageTemplateRegion{}, fmt.Errorf("options.region contains unknown field(s): %s", strings.Join(unknown, ", "))
	}

	parsed := make(map[string]int64, 4)
	for _, key := range []string{"x", "y", "width", "height"} {
		value, exists := values[key]
		if !exists {
			return imageTemplateRegion{}, fmt.Errorf("options.region.%s is required", key)
		}
		minimum := int64(0)
		integer, err := templateMatchInteger(value, "options.region."+key, minimum, int64(templateMatchMaxSafeInteger))
		if err != nil {
			return imageTemplateRegion{}, err
		}
		if (key == "width" || key == "height") && integer == 0 {
			return imageTemplateRegion{}, fmt.Errorf("options.region.%s must be greater than 0", key)
		}
		parsed[key] = integer
	}
	return imageTemplateRegion{
		X: int(parsed["x"]), Y: int(parsed["y"]),
		Width: int(parsed["width"]), Height: int(parsed["height"]),
	}, nil
}

func parseImageTemplateScales(raw interface{}) ([]float64, error) {
	value := reflect.ValueOf(raw)
	if value.Kind() != reflect.Slice && value.Kind() != reflect.Array {
		return nil, fmt.Errorf("options.scales must be an array")
	}
	if value.Len() == 0 {
		return nil, fmt.Errorf("options.scales must not be empty")
	}
	scales := make([]float64, 0, value.Len())
	for index := 0; index < value.Len(); index++ {
		scale, err := templateMatchNumber(value.Index(index).Interface(), fmt.Sprintf("options.scales[%d]", index))
		if err != nil {
			return nil, err
		}
		if scale <= 0 {
			return nil, fmt.Errorf("options.scales[%d] must be greater than 0", index)
		}
		duplicate := false
		for _, existing := range scales {
			if existing == scale {
				duplicate = true
				break
			}
		}
		if !duplicate {
			scales = append(scales, scale)
		}
	}
	return scales, nil
}

func templateMatchNumber(value interface{}, name string) (float64, error) {
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

func templateMatchInteger(value interface{}, name string, minimum, maximum int64) (int64, error) {
	number, err := templateMatchNumber(value, name)
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

func findBestTemplateCandidate(source, template *image.NRGBA, options imageTemplateOptions) (templateMatchCandidate, error) {
	region, err := resolveTemplateMatchRegion(source, options.Region)
	if err != nil {
		return templateMatchCandidate{}, err
	}
	best := templateMatchCandidate{Confidence: -1}
	matchedScale := false
	for _, scale := range options.Scales {
		scaled, err := scaleImageTemplate(template, scale)
		if err != nil {
			return templateMatchCandidate{}, err
		}
		if scaled.Bounds().Dx() > region.Dx() || scaled.Bounds().Dy() > region.Dy() {
			continue
		}
		matchedScale = true
		candidate := findTemplateMatchBestInRegion(source, scaled, region, scale)
		if best.Confidence < 0 || templateCandidateLess(candidate, best) {
			best = candidate
		}
	}
	if !matchedScale {
		return templateMatchCandidate{}, fmt.Errorf("template does not fit within search region")
	}
	return best, nil
}

func findTemplateCandidates(source, template *image.NRGBA, options imageTemplateOptions) ([]templateMatchScoreGrid, error) {
	region, err := resolveTemplateMatchRegion(source, options.Region)
	if err != nil {
		return nil, err
	}
	grids := make([]templateMatchScoreGrid, 0, len(options.Scales))
	for _, scale := range options.Scales {
		scaled, err := scaleImageTemplate(template, scale)
		if err != nil {
			return nil, err
		}
		width := region.Dx() - scaled.Bounds().Dx() + 1
		height := region.Dy() - scaled.Bounds().Dy() + 1
		if width <= 0 || height <= 0 {
			continue
		}
		if height > int(^uint(0)>>1)/width {
			return nil, fmt.Errorf("template candidate grid is too large")
		}
		grid := templateMatchScoreGrid{
			Template: scaled, Scale: scale, Region: region,
			Width: width, Height: height, Scores: make([]float64, width*height),
		}
		for index := range grid.Scores {
			grid.Scores[index] = -1
		}
		plan := newTemplateMatchPlan(scaled)
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				score, matched := templateMatchPlanScoreAt(source, plan, region.Min.X+x, region.Min.Y+y, options.Threshold)
				if matched {
					grid.Scores[y*width+x] = score
				}
			}
		}
		grids = append(grids, grid)
	}
	if len(grids) == 0 {
		return nil, fmt.Errorf("template does not fit within search region")
	}
	return grids, nil
}

func resolveTemplateMatchRegion(source *image.NRGBA, requested *imageTemplateRegion) (image.Rectangle, error) {
	bounds := source.Bounds()
	if bounds.Dx() <= 0 || bounds.Dy() <= 0 {
		return image.Rectangle{}, fmt.Errorf("source image has invalid dimensions")
	}
	if requested == nil {
		return bounds, nil
	}
	if requested.X+requested.Width < requested.X || requested.Y+requested.Height < requested.Y ||
		requested.X+requested.Width > bounds.Dx() || requested.Y+requested.Height > bounds.Dy() {
		return image.Rectangle{}, fmt.Errorf("options.region must be fully within source image bounds %dx%d", bounds.Dx(), bounds.Dy())
	}
	return image.Rect(requested.X, requested.Y, requested.X+requested.Width, requested.Y+requested.Height), nil
}

func scaleImageTemplate(template *image.NRGBA, scale float64) (*image.NRGBA, error) {
	width := int(math.Round(float64(template.Bounds().Dx()) * scale))
	height := int(math.Round(float64(template.Bounds().Dy()) * scale))
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("scale %.6g produces an empty template", scale)
	}
	if scale == 1 {
		return template, nil
	}
	result := image.NewNRGBA(image.Rect(0, 0, width, height))
	xdraw.CatmullRom.Scale(result, result.Bounds(), template, template.Bounds(), xdraw.Over, nil)
	return result, nil
}

func findTemplateMatchBestInRegion(source, template *image.NRGBA, region image.Rectangle, scale float64) templateMatchCandidate {
	templateWidth := template.Bounds().Dx()
	templateHeight := template.Bounds().Dy()
	bestDiff := ^uint64(0)
	best := templateMatchCandidate{X: -1, Y: -1, Width: templateWidth, Height: templateHeight, Confidence: 0, Scale: scale}
	plan := newTemplateMatchPlan(template)
	for y := region.Min.Y; y <= region.Max.Y-templateHeight; y++ {
		for x := region.Min.X; x <= region.Max.X-templateWidth; x++ {
			diff := templateMatchPlanDifferenceAt(source, plan, x, y, bestDiff)
			if diff < bestDiff {
				bestDiff = diff
				best.X = x
				best.Y = y
			}
		}
	}
	if bestDiff != ^uint64(0) && plan.MaxDiff > 0 {
		best.Confidence = templateMatchConfidence(bestDiff, plan.MaxDiff)
	}
	return best
}

// findTemplateMatchPureGo is the canonical portable matcher. Its confidence is
// 1 - mean(abs(RGB source-template))/255 over a deterministic stratified
// sample of at most 64 template pixels. The bounded sample makes common desktop
// screenshot searches predictable while preserving an exact, build-independent
// threshold contract.
func findTemplateMatchPureGo(source, template *image.NRGBA) (bestX, bestY int, bestScore float64) {
	if template.Bounds().Dx() <= 0 || template.Bounds().Dy() <= 0 ||
		template.Bounds().Dx() > source.Bounds().Dx() || template.Bounds().Dy() > source.Bounds().Dy() {
		return -1, -1, 0
	}
	best := findTemplateMatchBestInRegion(source, template, source.Bounds(), 1)
	return best.X, best.Y, best.Confidence
}

func newTemplateMatchPlan(template *image.NRGBA) templateMatchPlan {
	width := template.Bounds().Dx()
	height := template.Bounds().Dy()
	pixelCount := width * height
	if pixelCount <= templateMatchMaxSamples {
		samples := make([]templateMatchSample, 0, pixelCount)
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				samples = append(samples, templateMatchSample{X: x, Y: y, TemplateIndex: y*template.Stride + x*4})
			}
		}
		return templateMatchPlan{Template: template, Samples: samples, MaxDiff: uint64(len(samples)) * 3 * 255}
	}

	samplesAcross := int(math.Round(math.Sqrt(float64(templateMatchMaxSamples*width) / float64(height))))
	if samplesAcross < 1 {
		samplesAcross = 1
	}
	if samplesAcross > width {
		samplesAcross = width
	}
	samplesDown := templateMatchMaxSamples / samplesAcross
	if samplesDown < 1 {
		samplesDown = 1
	}
	if samplesDown > height {
		samplesDown = height
	}
	samples := make([]templateMatchSample, 0, samplesAcross*samplesDown)
	for sampleY := 0; sampleY < samplesDown; sampleY++ {
		y := templateMatchSampleCoordinate(sampleY, samplesDown, height)
		for sampleX := 0; sampleX < samplesAcross; sampleX++ {
			x := templateMatchSampleCoordinate(sampleX, samplesAcross, width)
			samples = append(samples, templateMatchSample{X: x, Y: y, TemplateIndex: y*template.Stride + x*4})
		}
	}
	return templateMatchPlan{Template: template, Samples: samples, MaxDiff: uint64(len(samples)) * 3 * 255}
}

func templateMatchSampleCoordinate(index, count, length int) int {
	if count <= 1 {
		return length / 2
	}
	return index * (length - 1) / (count - 1)
}

func templateMatchPlanDifferenceAt(source *image.NRGBA, plan templateMatchPlan, x, y int, stopAfter uint64) uint64 {
	var diff uint64
	for _, sample := range plan.Samples {
		sourceIndex := (y+sample.Y)*source.Stride + (x+sample.X)*4
		templateIndex := sample.TemplateIndex
		diff += templateMatchChannelDifference(source.Pix[sourceIndex], plan.Template.Pix[templateIndex])
		diff += templateMatchChannelDifference(source.Pix[sourceIndex+1], plan.Template.Pix[templateIndex+1])
		diff += templateMatchChannelDifference(source.Pix[sourceIndex+2], plan.Template.Pix[templateIndex+2])
		if diff > stopAfter {
			return diff
		}
	}
	return diff
}

func templateMatchPlanScoreAt(source *image.NRGBA, plan templateMatchPlan, x, y int, threshold float64) (float64, bool) {
	limit := float64(plan.MaxDiff) * (1 - threshold)
	var diff uint64
	for _, sample := range plan.Samples {
		sourceIndex := (y+sample.Y)*source.Stride + (x+sample.X)*4
		templateIndex := sample.TemplateIndex
		diff += templateMatchChannelDifference(source.Pix[sourceIndex], plan.Template.Pix[templateIndex])
		diff += templateMatchChannelDifference(source.Pix[sourceIndex+1], plan.Template.Pix[templateIndex+1])
		diff += templateMatchChannelDifference(source.Pix[sourceIndex+2], plan.Template.Pix[templateIndex+2])
		if float64(diff) > limit+1e-9 {
			return 0, false
		}
	}
	return templateMatchConfidence(diff, plan.MaxDiff), true
}

func templateMatchConfidence(diff, maxDiff uint64) float64 {
	if maxDiff == 0 {
		return 0
	}
	confidence := 1 - float64(diff)/float64(maxDiff)
	if confidence < 0 {
		return 0
	}
	return confidence
}

func templateMatchChannelDifference(a, b uint8) uint64 {
	if a >= b {
		return uint64(a - b)
	}
	return uint64(b - a)
}

func selectDistinctTemplateCandidates(grids []templateMatchScoreGrid, threshold float64, maxResults int) []templateMatchCandidate {
	selected := make([]templateMatchCandidate, 0, maxResults)
	for len(selected) < maxResults {
		var best templateMatchCandidate
		found := false
		for _, grid := range grids {
			for y := 0; y < grid.Height; y++ {
				for x := 0; x < grid.Width; x++ {
					score := grid.Scores[y*grid.Width+x]
					if score < threshold {
						continue
					}
					candidate := templateMatchCandidate{
						X: grid.Region.Min.X + x, Y: grid.Region.Min.Y + y,
						Width: grid.Template.Bounds().Dx(), Height: grid.Template.Bounds().Dy(),
						Confidence: score, Scale: grid.Scale,
					}
					if templateCandidateOverlapsAny(candidate, selected) {
						continue
					}
					if !found || templateCandidateLess(candidate, best) {
						best = candidate
						found = true
					}
				}
			}
		}
		if !found {
			break
		}
		selected = append(selected, best)
	}
	sort.SliceStable(selected, func(i, j int) bool { return templateCandidateLess(selected[i], selected[j]) })
	return selected
}

func templateCandidateLess(left, right templateMatchCandidate) bool {
	if left.Confidence != right.Confidence {
		return left.Confidence > right.Confidence
	}
	if left.Y != right.Y {
		return left.Y < right.Y
	}
	if left.X != right.X {
		return left.X < right.X
	}
	return left.Scale < right.Scale
}

func templateCandidateOverlapsAny(candidate templateMatchCandidate, selected []templateMatchCandidate) bool {
	for _, existing := range selected {
		if templateCandidateIoU(candidate, existing) > templateMatchNMSIoU {
			return true
		}
	}
	return false
}

func templateCandidateIoU(left, right templateMatchCandidate) float64 {
	x0 := max(left.X, right.X)
	y0 := max(left.Y, right.Y)
	x1 := min(left.X+left.Width, right.X+right.Width)
	y1 := min(left.Y+left.Height, right.Y+right.Height)
	if x1 <= x0 || y1 <= y0 {
		return 0
	}
	intersection := (x1 - x0) * (y1 - y0)
	union := left.Width*left.Height + right.Width*right.Height - intersection
	if union <= 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

func (candidate templateMatchCandidate) toMap(found bool) map[string]interface{} {
	result := map[string]interface{}{
		"found": found, "confidence": candidate.Confidence,
		"width": candidate.Width, "height": candidate.Height,
		"scale": candidate.Scale,
	}
	if !found {
		result["x"] = -1
		result["y"] = -1
		result["centerX"] = -1
		result["centerY"] = -1
		return result
	}
	result["x"] = candidate.X
	result["y"] = candidate.Y
	result["centerX"] = float64(candidate.X) + float64(candidate.Width)/2
	result["centerY"] = float64(candidate.Y) + float64(candidate.Height)/2
	return result
}
