package visionrun

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type ChatCandidatesOptions struct{}

type ChatCandidatesResult struct {
	RunID          string
	ReportPath     string
	CandidateCount int
}

func RunChatCandidates(bundle *Bundle, _ ChatCandidatesOptions) (*ChatCandidatesResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	targetsPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "action_targets.json"))
	if err != nil {
		return nil, err
	}
	requirement, _ := readJSONMap(bundle.Requirement)
	ocrPayload, err := readJSONMap(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_results.json"))
	if err != nil {
		return nil, err
	}

	openTarget := firstTargetByIntent(arrayOfMaps(targetsPayload["targets"]), "open_chat")
	if openTarget == nil {
		return nil, fmt.Errorf("open_chat target missing")
	}

	ocrByID := map[string]map[string]any{}
	for _, item := range arrayOfMaps(ocrPayload["results"]) {
		ocrByID[stringValue(item["id"])] = item
	}

	targetChatName := strings.TrimSpace(stringValue(requirement["targetChatName"]))
	candidates := make([]map[string]any, 0)
	for _, candidate := range arrayOfMaps(openTarget["candidates"]) {
		id := stringValue(candidate["id"])
		ocr := ocrByID[id]
		text := ""
		status := "missing"
		if ocr != nil {
			text = strings.TrimSpace(stringValue(ocr["text"]))
			status = stringValue(ocr["status"])
		}
		normalized := normalizeCandidateText(text)
		matchScore := candidateMatchScore(normalized, targetChatName)
		candidates = append(candidates, map[string]any{
			"id":             id,
			"text":           text,
			"normalizedText": normalized,
			"status":         status,
			"bbox":           candidate["bbox"],
			"point":          candidate["point"],
			"path":           ocr["path"],
			"matchesTarget":  targetChatName != "" && matchScore >= 0.55,
			"matchScore":     round4(matchScore),
		})
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		return floatValue(candidates[i]["matchScore"]) > floatValue(candidates[j]["matchScore"])
	})
	candidates = dedupeChatCandidates(candidates)
	bestCandidate := map[string]any{}
	if len(candidates) > 0 {
		bestCandidate = candidates[0]
	}

	report := map[string]any{
		"schemaVersion":  schemaVersion,
		"createdAt":      time.Now().Format(time.RFC3339),
		"runId":          bundle.RunID,
		"targetId":       openTarget["id"],
		"targetChatName": targetChatName,
		"candidateCount": len(candidates),
		"candidates":     candidates,
		"bestCandidate":  bestCandidate,
	}
	reportPath := filepath.Join(bundle.InferDir, "chat_candidates.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":             time.Now().Format(time.RFC3339),
		"stage":          "infer.chat-candidates",
		"status":         "pass",
		"runId":          bundle.RunID,
		"detail":         fmt.Sprintf("generated %d chat row OCR candidates", len(candidates)),
		"reportPath":     artifactPath(bundle.RunID, "infer/chat_candidates.json"),
		"candidateCount": len(candidates),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["chatCandidatesPath"] = artifactPath(bundle.RunID, "infer/chat_candidates.json")
		verify["chatCandidateCount"] = len(candidates)
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}
	return &ChatCandidatesResult{
		RunID:          bundle.RunID,
		ReportPath:     artifactPath(bundle.RunID, "infer/chat_candidates.json"),
		CandidateCount: len(candidates),
	}, nil
}

func firstTargetByIntent(targets []map[string]any, intent string) map[string]any {
	for _, target := range targets {
		if stringValue(target["intent"]) == intent {
			return target
		}
	}
	return nil
}

func normalizeCandidateText(text string) string {
	text = strings.TrimSpace(text)
	text = strings.ReplaceAll(text, "\r", "")
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.Join(strings.Fields(text), " ")
	return text
}

func candidateMatchScore(candidateText, targetChatName string) float64 {
	candidateText = normalizedMatchToken(candidateText)
	targetChatName = normalizedMatchToken(targetChatName)
	if candidateText == "" || targetChatName == "" {
		return 0
	}
	if strings.Contains(candidateText, targetChatName) {
		return 1
	}
	if strings.Contains(targetChatName, candidateText) {
		return 0.78
	}
	common := 0
	for _, r := range targetChatName {
		if strings.ContainsRune(candidateText, r) {
			common++
		}
	}
	return float64(common) / float64(len([]rune(targetChatName)))
}

func normalizedMatchToken(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	replacer := strings.NewReplacer(
		" ", "",
		"\n", "",
		"\r", "",
		"\t", "",
		"[", "",
		"]", "",
		"(", "",
		")", "",
		"|", "",
		"【", "",
		"】", "",
		":", "",
	)
	return replacer.Replace(s)
}

func dedupeChatCandidates(candidates []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		bbox := mapValue(candidate["bbox"])
		key := fmt.Sprintf("%s|%d|%d|%d", normalizedMatchToken(stringValue(candidate["normalizedText"])), intValue(bbox["x"]), intValue(bbox["y"]), intValue(bbox["height"]))
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, candidate)
	}
	return out
}
