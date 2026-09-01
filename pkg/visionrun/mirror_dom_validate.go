package visionrun

import (
	"os"
	"sort"
	"strings"

	"golang.org/x/net/html"
)

func validateGeneratedMirrorDOM(baseReport, model map[string]any, layoutHTMLPath, semanticHTMLPath string) map[string]any {
	report := map[string]any{}
	for k, v := range baseReport {
		report[k] = v
	}

	layoutCounts := extractHTMLCounts(layoutHTMLPath)
	semanticCounts := extractHTMLCounts(semanticHTMLPath)

	zones := arrayOfMaps(model["zones"])
	targets := arrayOfMaps(model["targets"])
	chatCandidates := arrayOfMaps(model["chatCandidates"])
	selectedCount := intValue(report["selectedCandidateCount"])
	requiredZones := requiredMirrorZones(zones)
	missingZones := make([]string, 0)
	for _, id := range []string{"conversation_list", "chat_header", "message_list", "input_area"} {
		if !requiredZones[id] {
			missingZones = append(missingZones, id)
		}
	}

	presentIntents := presentTargetIntents(targets)
	requiredIntents := []string{"open_chat", "focus_input", "send_message", "read_reply"}
	missingIntents := make([]string, 0)
	for _, intent := range requiredIntents {
		if !stringInSlice(presentIntents, intent) {
			missingIntents = append(missingIntents, intent)
		}
	}

	layoutScore := 0.0
	if layoutCounts["region-anchor"] == len(zones) || layoutCounts["region-anchor"] >= len(zones) {
		layoutScore += 0.25
	}
	if layoutCounts["layout-label"] >= len(zones) {
		layoutScore += 0.25
	}
	if layoutCounts["layout-column"] >= 2 {
		layoutScore += 0.2
	}
	if layoutCounts["layout-band"] >= 3 {
		layoutScore += 0.1
	}
	if layoutCounts["main-root"] == 1 {
		layoutScore += 0.2
	}
	if layoutScore > 1 {
		layoutScore = 1
	}

	semanticScore := floatValue(report["semanticScore"])
	if semanticCounts["semantic-zone"] < len(zones) {
		semanticScore -= 0.18
	}
	if semanticCounts["semantic-target"] < len(targets) {
		semanticScore -= 0.12
	}
	if semanticCounts["semantic-list__item"] < len(chatCandidates) {
		semanticScore -= 0.14
	}
	if semanticCounts["semantic-list__item--selected"] != selectedCount {
		semanticScore -= 0.12
	}
	if semanticCounts["semantic-bubble"] < 2 {
		semanticScore -= 0.12
	}
	if semanticCounts["semantic-inputbar"] < 1 {
		semanticScore -= 0.12
	}
	if len(missingZones) > 0 {
		semanticScore -= 0.12
	}
	if len(missingIntents) > 0 {
		semanticScore -= 0.10
	}
	if selectedCount != 1 {
		semanticScore -= 0.10
	}
	if !boolValue(report["candidateUniquenessOK"]) {
		semanticScore -= 0.10
	}
	if semanticScore < 0 {
		semanticScore = 0
	}

	phase1Blocking := make([]string, 0)
	for _, id := range missingZones {
		phase1Blocking = append(phase1Blocking, "missing required zone: "+id)
	}
	for _, intent := range missingIntents {
		phase1Blocking = append(phase1Blocking, "missing required target intent: "+intent)
	}

	layoutScaffoldMissing := make([]string, 0)
	for _, className := range []string{"layout-zone", "layout-label", "region-anchor"} {
		if layoutCounts[className] == 0 {
			layoutScaffoldMissing = append(layoutScaffoldMissing, className)
			phase1Blocking = append(phase1Blocking, "missing layout scaffold: "+className)
		}
	}
	semanticScaffoldMissing := make([]string, 0)
	for _, className := range []string{"semantic-zone", "semantic-target", "semantic-list__item", "semantic-inputbar"} {
		if semanticCounts[className] == 0 {
			semanticScaffoldMissing = append(semanticScaffoldMissing, className)
			phase1Blocking = append(phase1Blocking, "missing semantic scaffold: "+className)
		}
	}
	sort.Strings(presentIntents)

	phase2Blocking := make([]string, 0)
	if selectedCount != 1 {
		phase2Blocking = append(phase2Blocking, "selected row is not unique")
	}
	if !boolValue(report["candidateUniquenessOK"]) {
		phase2Blocking = append(phase2Blocking, "chat candidate set is not unique")
	}
	if !boolValue(mapValue(report["textCoverage"])["header"]) {
		phase2Blocking = append(phase2Blocking, "header probe text missing")
	}
	if !boolValue(mapValue(report["textCoverage"])["draft"]) {
		phase2Blocking = append(phase2Blocking, "draft probe text missing")
	}

	report["layoutHtmlValidation"] = map[string]any{
		"counts":                 layoutCounts,
		"expectedZones":          len(zones),
		"expectedRegionAnchors":  len(zones),
		"expectedZoneLabels":     len(zones),
		"layoutScaffoldMissing":  layoutScaffoldMissing,
		"layoutScaffoldComplete": len(layoutScaffoldMissing) == 0,
		"score":                  round4(layoutScore),
	}
	report["semanticHtmlValidation"] = map[string]any{
		"counts":                   semanticCounts,
		"expectedZones":            len(zones),
		"expectedTargets":          len(targets),
		"expectedCandidates":       len(chatCandidates),
		"expectedSelected":         selectedCount,
		"requiredZonesPresent":     requiredZones,
		"missingRequiredZones":     missingZones,
		"requiredTargetIntents":    requiredIntents,
		"presentTargetIntents":     presentIntents,
		"missingTargetIntents":     missingIntents,
		"candidateUniquenessOK":    boolValue(report["candidateUniquenessOK"]),
		"selectedCandidateCount":   selectedCount,
		"selectedUniquenessOK":     selectedCount == 1,
		"semanticScaffoldMissing":  semanticScaffoldMissing,
		"semanticScaffoldComplete": len(semanticScaffoldMissing) == 0,
	}
	report["semanticScore"] = round4(semanticScore)
	report["htmlFilesPresent"] = map[string]bool{
		"layout":   fileExists(layoutHTMLPath),
		"semantic": fileExists(semanticHTMLPath),
	}
	report["phase1Gate"] = map[string]any{
		"passed":         len(phase1Blocking) == 0,
		"blockingIssues": phase1Blocking,
	}
	report["phase2Readiness"] = map[string]any{
		"passed":         len(phase2Blocking) == 0,
		"blockingIssues": phase2Blocking,
	}
	return report
}

func extractHTMLCounts(path string) map[string]int {
	counts := map[string]int{}
	data, err := os.ReadFile(path)
	if err != nil {
		return counts
	}
	doc, err := html.Parse(strings.NewReader(string(data)))
	if err != nil {
		return counts
	}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			if n.Data == "main" {
				counts["main-root"]++
			}
			classAttr := attrValue(n, "class")
			for _, className := range strings.Fields(classAttr) {
				counts[className]++
			}
			if attrValue(n, "data-region-id") != "" {
				counts["region-anchor"]++
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return counts
}

func attrValue(n *html.Node, key string) string {
	for _, attr := range n.Attr {
		if attr.Key == key {
			return attr.Val
		}
	}
	return ""
}

func stringInSlice(items []string, needle string) bool {
	for _, item := range items {
		if item == needle {
			return true
		}
	}
	return false
}
