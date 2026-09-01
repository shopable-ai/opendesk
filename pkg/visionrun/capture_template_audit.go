package visionrun

import (
	"fmt"
	"image"
	"math"
	"path/filepath"
	"time"
)

type CaptureTemplateAuditResult struct {
	RunID        string
	ReportPath   string
	Matched      int
	Total        int
	AverageScore float64
	Status       string
}

func RunCaptureTemplateAudit(bundle *Bundle) (*CaptureTemplateAuditResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}
	contract, err := readJSONMap(filepath.Join(bundle.VerifyDir, "capture_contract.json"))
	if err != nil {
		return nil, err
	}
	src, err := openImage(filepath.Join(bundle.CaptureDir, "source.png"))
	if err != nil {
		return nil, err
	}
	captures := arrayOfMaps(contract["captures"])
	results := make([]map[string]any, 0, len(captures))
	matched := 0
	total := 0
	totalScore := 0.0
	for _, capture := range captures {
		refPath := stringValue(capture["referenceImagePath"])
		if refPath == "" {
			continue
		}
		refImg, err := openImage(resolveArtifactAbsPath(bundle, refPath))
		if err != nil {
			results = append(results, map[string]any{
				"id":     capture["id"],
				"zoneId": capture["zoneId"],
				"status": "fail",
				"error":  err.Error(),
			})
			continue
		}
		searchWindow := mapValue(capture["searchWindow"])
		matchCfg := mapValue(capture["templateMatch"])
		match, err := templateSearch(src, refImg, searchWindow, matchCfg)
		if err != nil {
			results = append(results, map[string]any{
				"id":     capture["id"],
				"zoneId": capture["zoneId"],
				"status": "fail",
				"error":  err.Error(),
			})
			continue
		}
		total++
		totalScore += match.Score
		minScore := floatValue(matchCfg["minScore"])
		status := "pass"
		if match.Score < minScore {
			status = "warn"
		} else {
			matched++
		}
		results = append(results, map[string]any{
			"id":             capture["id"],
			"zoneId":         capture["zoneId"],
			"status":         status,
			"score":          round4(match.Score),
			"minScore":       round4(minScore),
			"matchedBBox":    match.BBox,
			"matchedScale":   round4(match.Scale),
			"searchWindow":   searchWindow,
			"referenceImage": refPath,
		})
	}
	averageScore := 0.0
	if total > 0 {
		averageScore = totalScore / float64(total)
	}
	status := "pass"
	if total == 0 || matched < total {
		status = "warn"
	}
	report := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"status":        status,
		"matched":       matched,
		"total":         total,
		"averageScore":  round4(averageScore),
		"results":       results,
		"summary":       fmt.Sprintf("capture template audit %s: matched=%d/%d avg=%.4f", status, matched, total, averageScore),
	}
	reportPath := filepath.Join(bundle.VerifyDir, "capture_template_report.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.capture-template-audit",
		"status":     status,
		"runId":      bundle.RunID,
		"detail":     report["summary"],
		"reportPath": artifactPath(bundle.RunID, "verify/capture_template_report.json"),
	}); err != nil {
		return nil, err
	}
	return &CaptureTemplateAuditResult{
		RunID:        bundle.RunID,
		ReportPath:   artifactPath(bundle.RunID, "verify/capture_template_report.json"),
		Matched:      matched,
		Total:        total,
		AverageScore: round4(averageScore),
		Status:       status,
	}, nil
}

type templateSearchResult struct {
	Score float64
	BBox  map[string]any
	Scale float64
}

func templateSearch(src, ref image.Image, searchWindow, matchCfg map[string]any) (*templateSearchResult, error) {
	window := normalizeBBox(searchWindow)
	wx := intValue(window["x"])
	wy := intValue(window["y"])
	ww := intValue(window["width"])
	wh := intValue(window["height"])
	if ww <= 0 || wh <= 0 {
		return nil, fmt.Errorf("invalid search window")
	}
	refBounds := ref.Bounds()
	baseW := refBounds.Dx()
	baseH := refBounds.Dy()
	if baseW <= 0 || baseH <= 0 {
		return nil, fmt.Errorf("invalid reference image")
	}
	step := maxIntSafe(1, intValue(matchCfg["searchStep"]))
	scales := floatArray(matchCfg["scales"])
	if len(scales) == 0 {
		scales = []float64{1}
	}
	best := &templateSearchResult{Score: -1}
	for _, scale := range scales {
		cw := maxIntSafe(1, int(math.Round(float64(baseW)*scale)))
		ch := maxIntSafe(1, int(math.Round(float64(baseH)*scale)))
		maxX := wx + ww - cw
		maxY := wy + wh - ch
		if maxX < wx || maxY < wy {
			continue
		}
		for y := wy; y <= maxY; y += step {
			for x := wx; x <= maxX; x += step {
				score := compareTemplateAt(src, ref, x, y, cw, ch)
				if score > best.Score {
					best = &templateSearchResult{
						Score: score,
						Scale: scale,
						BBox:  map[string]any{"x": x, "y": y, "width": cw, "height": ch},
					}
				}
			}
		}
	}
	if best.Score < 0 {
		return nil, fmt.Errorf("no valid template match candidates")
	}
	return best, nil
}

func compareTemplateAt(src, ref image.Image, x, y, width, height int) float64 {
	sampleCols := maxIntSafe(6, minIntSafe(18, width/12))
	sampleRows := maxIntSafe(6, minIntSafe(18, height/12))
	total := 0.0
	count := 0.0
	refBounds := ref.Bounds()
	srcBounds := src.Bounds()
	for row := 0; row < sampleRows; row++ {
		refY := refBounds.Min.Y + int(float64(row+1)*float64(refBounds.Dy())/float64(sampleRows+1))
		srcY := y + int(float64(row+1)*float64(height)/float64(sampleRows+1))
		if srcY < srcBounds.Min.Y || srcY >= srcBounds.Max.Y || refY >= refBounds.Max.Y {
			continue
		}
		for col := 0; col < sampleCols; col++ {
			refX := refBounds.Min.X + int(float64(col+1)*float64(refBounds.Dx())/float64(sampleCols+1))
			srcX := x + int(float64(col+1)*float64(width)/float64(sampleCols+1))
			if srcX < srcBounds.Min.X || srcX >= srcBounds.Max.X || refX >= refBounds.Max.X {
				continue
			}
			refR, refG, refB, _ := ref.At(refX, refY).RGBA()
			srcR, srcG, srcB, _ := src.At(srcX, srcY).RGBA()
			dr := float64(int(srcR>>8) - int(refR>>8))
			dg := float64(int(srcG>>8) - int(refG>>8))
			db := float64(int(srcB>>8) - int(refB>>8))
			dist := math.Sqrt(dr*dr + dg*dg + db*db)
			total += dist
			count++
		}
	}
	if count == 0 {
		return 0
	}
	avg := total / count
	return clamp01(1 - avg/255.0)
}

func floatArray(raw any) []float64 {
	switch typed := raw.(type) {
	case []float64:
		return typed
	case []any:
		out := make([]float64, 0, len(typed))
		for _, item := range typed {
			out = append(out, floatValue(item))
		}
		return out
	default:
		return nil
	}
}
