package visionrun

import (
	"fmt"
	"image"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type EvidenceOptions struct{}

type EvidenceResult struct {
	RunID              string
	ActionIndexPath    string
	OCRIndexPath       string
	AnchorCount        int
	OCRProbeImageCount int
}

var invalidEvidenceChars = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func RunEvidence(bundle *Bundle, _ EvidenceOptions) (*EvidenceResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	srcPath := filepath.Join(bundle.CaptureDir, "source.png")
	src, err := openImage(srcPath)
	if err != nil {
		return nil, err
	}

	zonesPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "zones.json"))
	if err != nil {
		return nil, err
	}
	targetsPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "action_targets.json"))
	if err != nil {
		return nil, err
	}
	ocrPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "ocr_map.json"))
	if err != nil {
		return nil, err
	}

	zones := arrayOfMaps(zonesPayload["zones"])
	targets := arrayOfMaps(targetsPayload["targets"])
	ocrBindings := arrayOfMaps(ocrPayload["zoneBindings"])
	textAnchors := arrayOfMaps(ocrPayload["textAnchors"])

	anchorEntries := make([]map[string]any, 0)
	for _, zone := range zones {
		id := sanitizeEvidenceName(stringValue(zone["id"]))
		if id == "" {
			continue
		}
		relPath := filepath.ToSlash(filepath.Join("evidence", "anchors", "zone_"+id+".png"))
		if _, err := saveCrop(src, filepath.Join(bundle.BaseDir, relPath), zone["bbox"]); err == nil {
			anchorEntries = append(anchorEntries, map[string]any{
				"id":   stringValue(zone["id"]),
				"role": stringValue(zone["role"]),
				"path": artifactPath(bundle.RunID, relPath),
				"bbox": zone["bbox"],
				"kind": "zone",
			})
		}
	}

	actionEntries := make([]map[string]any, 0)
	for _, target := range targets {
		id := sanitizeEvidenceName(stringValue(target["id"]))
		if id == "" {
			continue
		}
		relPath := filepath.ToSlash(filepath.Join("evidence", "anchors", "target_"+id+".png"))
		_, err := saveCrop(src, filepath.Join(bundle.BaseDir, relPath), target["bbox"])
		if err == nil {
			anchorEntries = append(anchorEntries, map[string]any{
				"id":     stringValue(target["id"]),
				"intent": stringValue(target["intent"]),
				"path":   artifactPath(bundle.RunID, relPath),
				"bbox":   target["bbox"],
				"kind":   "target",
			})
		}

		candidateEntries := make([]map[string]any, 0)
		for _, candidate := range arrayOfMaps(target["candidates"]) {
			cid := sanitizeEvidenceName(stringValue(candidate["id"]))
			crel := filepath.ToSlash(filepath.Join("evidence", "anchors", "candidate_"+id+"_"+cid+".png"))
			if _, err := saveCrop(src, filepath.Join(bundle.BaseDir, crel), candidate["bbox"]); err == nil {
				entry := map[string]any{
					"id":   stringValue(candidate["id"]),
					"path": artifactPath(bundle.RunID, crel),
					"bbox": candidate["bbox"],
				}
				candidateEntries = append(candidateEntries, entry)
				anchorEntries = append(anchorEntries, map[string]any{
					"id":     stringValue(candidate["id"]),
					"intent": stringValue(target["intent"]),
					"path":   artifactPath(bundle.RunID, crel),
					"bbox":   candidate["bbox"],
					"kind":   "candidate",
				})
			}
		}

		actionEntries = append(actionEntries, map[string]any{
			"id":             stringValue(target["id"]),
			"intent":         stringValue(target["intent"]),
			"targetPath":     artifactPath(bundle.RunID, relPath),
			"bbox":           target["bbox"],
			"point":          target["point"],
			"candidates":     candidateEntries,
			"preconditions":  target["preconditions"],
			"postconditions": target["postconditions"],
		})
	}

	ocrEntries := make([]map[string]any, 0)
	for _, binding := range ocrBindings {
		id := sanitizeEvidenceName(stringValue(binding["id"]))
		if id == "" {
			continue
		}
		relPath := filepath.ToSlash(filepath.Join("evidence", "ocr", "binding_"+id+".png"))
		if _, err := saveCrop(src, filepath.Join(bundle.BaseDir, relPath), binding["bbox"]); err == nil {
			ocrEntries = append(ocrEntries, map[string]any{
				"id":     stringValue(binding["id"]),
				"intent": stringValue(binding["intent"]),
				"path":   artifactPath(bundle.RunID, relPath),
				"bbox":   binding["bbox"],
			})
		}
	}
	for _, anchor := range textAnchors {
		id := sanitizeEvidenceName(stringValue(anchor["id"]))
		if id == "" {
			continue
		}
		relPath := filepath.ToSlash(filepath.Join("evidence", "ocr", "anchor_"+id+".png"))
		if _, err := saveCrop(src, filepath.Join(bundle.BaseDir, relPath), anchor["bbox"]); err == nil {
			ocrEntries = append(ocrEntries, map[string]any{
				"id":          stringValue(anchor["id"]),
				"intent":      stringValue(anchor["intent"]),
				"expectedUse": stringValue(anchor["expectedUse"]),
				"path":        artifactPath(bundle.RunID, relPath),
				"bbox":        anchor["bbox"],
			})
		}
	}

	actionIndex := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"actions":       actionEntries,
	}
	actionIndexPath := filepath.Join(bundle.EvidenceActionsDir, "probe_actions.json")
	if err := writeJSON(actionIndexPath, actionIndex); err != nil {
		return nil, err
	}

	ocrIndex := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"probes":        ocrEntries,
	}
	ocrIndexPath := filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_plan.json")
	if err := writeJSON(ocrIndexPath, ocrIndex); err != nil {
		return nil, err
	}

	anchorIndex := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"anchors":       anchorEntries,
	}
	if err := writeJSON(filepath.Join(bundle.EvidenceAnchorsDir, "anchor_index.json"), anchorIndex); err != nil {
		return nil, err
	}

	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":              time.Now().Format(time.RFC3339),
		"stage":           "evidence.probe",
		"status":          "pass",
		"runId":           bundle.RunID,
		"detail":          "generated action and OCR probe evidence crops",
		"actionIndexPath": artifactPath(bundle.RunID, "evidence/actions/probe_actions.json"),
		"ocrIndexPath":    artifactPath(bundle.RunID, "evidence/ocr/ocr_probe_plan.json"),
		"anchorCount":     len(anchorEntries),
		"ocrProbeCount":   len(ocrEntries),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["probeActionIndexPath"] = artifactPath(bundle.RunID, "evidence/actions/probe_actions.json")
		verify["ocrProbePlanPath"] = artifactPath(bundle.RunID, "evidence/ocr/ocr_probe_plan.json")
		verify["anchorIndexPath"] = artifactPath(bundle.RunID, "evidence/anchors/anchor_index.json")
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}

	return &EvidenceResult{
		RunID:              bundle.RunID,
		ActionIndexPath:    artifactPath(bundle.RunID, "evidence/actions/probe_actions.json"),
		OCRIndexPath:       artifactPath(bundle.RunID, "evidence/ocr/ocr_probe_plan.json"),
		AnchorCount:        len(anchorEntries),
		OCRProbeImageCount: len(ocrEntries),
	}, nil
}

func openImage(path string) (image.Image, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open image %s: %w", path, err)
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		return nil, fmt.Errorf("decode image %s: %w", path, err)
	}
	return img, nil
}

func saveCrop(src image.Image, path string, bboxRaw any) (string, error) {
	bbox := normalizeBBox(bboxRaw)
	x := intValue(bbox["x"])
	y := intValue(bbox["y"])
	width := intValue(bbox["width"])
	height := intValue(bbox["height"])
	if width <= 0 || height <= 0 {
		return "", fmt.Errorf("invalid bbox")
	}
	bounds := src.Bounds()
	rect := image.Rect(x, y, x+width, y+height).Intersect(bounds)
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return "", fmt.Errorf("bbox outside source bounds")
	}
	dst := image.NewRGBA(image.Rect(0, 0, rect.Dx(), rect.Dy()))
	draw.Draw(dst, dst.Bounds(), src, rect.Min, draw.Src)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return "", err
	}
	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	if err := png.Encode(file, dst); err != nil {
		return "", err
	}
	return path, nil
}

func sanitizeEvidenceName(value string) string {
	value = strings.TrimSpace(value)
	value = invalidEvidenceChars.ReplaceAllString(value, "_")
	value = strings.Trim(value, "_.-")
	return value
}
