package visionrun

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

type OCRProbeOptions struct{}

type OCRProbeResult struct {
	RunID      string
	ReportPath string
	Executed   int
	Succeeded  int
}

func RunOCRProbes(bundle *Bundle, _ OCRProbeOptions) (*OCRProbeResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	plan, err := readJSONMap(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_plan.json"))
	if err != nil {
		return nil, err
	}
	requirement, _ := readJSONMap(bundle.Requirement)
	vision := newRuntimeVision()
	provider := preferredOCRProvider(vision, stringValue(requirement["ocrProvider"]))

	results := make([]map[string]any, 0)
	executed := 0
	succeeded := 0
	for _, probe := range arrayOfMaps(plan["probes"]) {
		entry := map[string]any{
			"id":          probe["id"],
			"intent":      probe["intent"],
			"expectedUse": probe["expectedUse"],
			"path":        probe["path"],
			"status":      "skipped",
			"text":        "",
			"lineCount":   0,
		}
		path := stringValue(probe["path"])
		if path == "" {
			entry["error"] = "missing path"
			results = append(results, entry)
			continue
		}
		absPath := resolveArtifactAbsPath(bundle, path)
		if !fileExists(absPath) {
			entry["error"] = "probe image missing"
			results = append(results, entry)
			continue
		}

		executed++
		ocrResult, err := vision.RunOCR(map[string]interface{}{
			"provider":  provider,
			"imagePath": absPath,
		})
		if err != nil {
			entry["status"] = "fail"
			entry["error"] = err.Error()
			results = append(results, entry)
			continue
		}
		entry["status"] = "pass"
		entry["text"] = stringValue(ocrResult["text"])
		entry["lineCount"] = intValue(ocrResult["lineCount"])
		entry["provider"] = stringValue(ocrResult["provider"])
		succeeded++
		results = append(results, entry)
	}

	report := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"provider":      provider,
		"executed":      executed,
		"succeeded":     succeeded,
		"results":       results,
	}
	reportPath := filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_results.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "evidence.ocr-probe",
		"status":     "pass",
		"runId":      bundle.RunID,
		"detail":     fmt.Sprintf("executed %d OCR probes with %d successes", executed, succeeded),
		"reportPath": artifactPath(bundle.RunID, "evidence/ocr/ocr_probe_results.json"),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["ocrProbeResultsPath"] = artifactPath(bundle.RunID, "evidence/ocr/ocr_probe_results.json")
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}

	return &OCRProbeResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "evidence/ocr/ocr_probe_results.json"),
		Executed:   executed,
		Succeeded:  succeeded,
	}, nil
}

func preferredOCRProvider(vision runtimeVision, configured string) string {
	caps, err := vision.GetCapabilities(nil)
	if err != nil {
		return "local"
	}
	requested := splitProviderChoices(configured)
	if len(requested) == 0 {
		requested = []string{stringValue(caps["defaultProvider"])}
	}
	providers := arrayOfMaps(caps["providers"])
	for _, choice := range requested {
		for _, item := range providers {
			if normalizeProviderChoice(choice) != normalizeProviderChoice(stringValue(item["provider"])) {
				continue
			}
			implemented, _ := item["implemented"].(bool)
			if !implemented {
				continue
			}
			endpointRequired, _ := item["endpointRequired"].(bool)
			endpointConfigured, _ := item["endpointConfigured"].(bool)
			if endpointRequired && !endpointConfigured {
				continue
			}
			return stringValue(item["provider"])
		}
	}
	return "local"
}

func resolveArtifactAbsPath(bundle *Bundle, path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	repoRoot := filepath.Dir(filepath.Dir(filepath.Dir(bundle.BaseDir)))
	clean := strings.TrimSpace(path)
	return filepath.Join(repoRoot, filepath.FromSlash(clean))
}
