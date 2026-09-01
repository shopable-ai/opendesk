package visionrun

import (
	"encoding/json"
	"fmt"
	"html"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type MirrorOptions struct {
	Title     string
	Auxiliary bool
}

type MirrorResult struct {
	RunID             string
	HTMLPath          string
	LayoutHTMLPath    string
	SemanticHTMLPath  string
	SemanticModelPath string
	InferSemanticPath string
	CSSPath           string
	MetaPath          string
	DOMReportPath     string
	RenderedImagePath string
	RegionCount       int
}

type skeletonCell struct {
	X      int
	Y      int
	Width  int
	Height int
	Color  string
	Kind   string
}

func RunMirror(bundle *Bundle, opts MirrorOptions) (*MirrorResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	regionsPath := filepath.Join(bundle.DetectDir, "regions.json")
	data, err := os.ReadFile(regionsPath)
	if err != nil {
		return nil, fmt.Errorf("read detect contract %s: %w", regionsPath, err)
	}

	var report map[string]any
	if err := json.Unmarshal(data, &report); err != nil {
		return nil, fmt.Errorf("decode detect contract %s: %w", regionsPath, err)
	}

	window := mapValue(report["window"])
	width := intValue(window["width"])
	height := intValue(window["height"])
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("detect contract missing window width/height")
	}

	regions := normalizeDetectRegions(report["regions"])
	sort.Slice(regions, func(i, j int) bool {
		left := normalizeBBox(regions[i]["bbox"])
		right := normalizeBBox(regions[j]["bbox"])
		if intValue(left["x"]) != intValue(right["x"]) {
			return intValue(left["x"]) < intValue(right["x"])
		}
		if intValue(left["y"]) != intValue(right["y"]) {
			return intValue(left["y"]) < intValue(right["y"])
		}
		return intValue(left["width"])*intValue(left["height"]) > intValue(right["width"])*intValue(right["height"])
	})
	cells := buildSkeletonCells(report["separators"], regions, width, height)
	layoutModelPath := filepath.Join(bundle.DetectDir, "layout_model.json")
	if _, err := os.Stat(layoutModelPath); err == nil {
		if modelCells := buildLayoutModelCells(layoutModelPath, regions); len(modelCells) > 0 {
			cells = modelCells
		}
	}

	title := strings.TrimSpace(opts.Title)
	if title == "" {
		title = fmt.Sprintf("Mirror %s", bundle.RunID)
	}

	htmlPath := filepath.Join(bundle.MirrorDir, "index.html")
	layoutHTMLPath := filepath.Join(bundle.MirrorDir, "layout.html")
	semanticHTMLPath := filepath.Join(bundle.MirrorDir, "semantic.html")
	semanticModelPath := filepath.Join(bundle.MirrorDir, "semantic_model.json")
	inferSemanticModelPath := filepath.Join(bundle.InferDir, "semantic_model.json")
	cssPath := filepath.Join(bundle.MirrorDir, "styles.css")
	metaPath := filepath.Join(bundle.MirrorDir, "meta.json")
	domReportPath := filepath.Join(bundle.MirrorDir, "dom_validation_report.json")
	renderedPath := artifactPath(bundle.RunID, "mirror/mirror.png")

	if err := os.WriteFile(cssPath, []byte(buildMirrorCSS(width, height)), 0644); err != nil {
		return nil, fmt.Errorf("write mirror css: %w", err)
	}
	layoutHTML := []byte(buildMirrorHTML(bundle, title, width, height, cells, regions))
	if err := os.WriteFile(htmlPath, layoutHTML, 0644); err != nil {
		return nil, fmt.Errorf("write mirror html: %w", err)
	}
	if err := os.WriteFile(layoutHTMLPath, layoutHTML, 0644); err != nil {
		return nil, fmt.Errorf("write layout html alias: %w", err)
	}
	semanticDoc := buildSemanticMirror(bundle, title, width, height)
	if err := os.WriteFile(semanticHTMLPath, []byte(semanticDoc.HTML), 0644); err != nil {
		return nil, fmt.Errorf("write semantic mirror html: %w", err)
	}
	if err := writeJSON(semanticModelPath, semanticDoc.Model); err != nil {
		return nil, err
	}
	if err := writeJSON(inferSemanticModelPath, semanticDoc.Model); err != nil {
		return nil, err
	}
	domReport := validateGeneratedMirrorDOM(semanticDoc.Report, semanticDoc.Model, htmlPath, semanticHTMLPath)
	if err := writeJSON(domReportPath, domReport); err != nil {
		return nil, err
	}
	phase1Gate := mapValue(domReport["phase1Gate"])
	phase1Passed := boolValue(phase1Gate["passed"])

	bindings := make([]map[string]any, 0, len(regions))
	for _, region := range regions {
		id := stringValue(region["id"])
		if id == "" {
			continue
		}
		bindings = append(bindings, map[string]any{
			"regionId": id,
			"selector": fmt.Sprintf("[data-region-id=\"%s\"]", id),
		})
	}

	meta := map[string]any{
		"runId":                  bundle.RunID,
		"htmlPath":               artifactPath(bundle.RunID, "mirror/index.html"),
		"layoutHtmlPath":         artifactPath(bundle.RunID, "mirror/layout.html"),
		"semanticHtmlPath":       artifactPath(bundle.RunID, "mirror/semantic.html"),
		"semanticModelPath":      artifactPath(bundle.RunID, "mirror/semantic_model.json"),
		"inferSemanticModelPath": artifactPath(bundle.RunID, "infer/semantic_model.json"),
		"cssPath":                artifactPath(bundle.RunID, "mirror/styles.css"),
		"domReportPath":          artifactPath(bundle.RunID, "mirror/dom_validation_report.json"),
		"renderedImagePath":      renderedPath,
		"regionBindings":         bindings,
		"visibleCells":           exportVisibleCells(cells),
		"window": map[string]any{
			"width":  width,
			"height": height,
		},
		"createdAt": time.Now().Format(time.RFC3339),
	}
	if err := writeJSON(metaPath, meta); err != nil {
		return nil, err
	}

	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":                     time.Now().Format(time.RFC3339),
		"stage":                  "mirror.generate",
		"status":                 "pass",
		"runId":                  bundle.RunID,
		"detail":                 "generated mirror html/css/meta",
		"htmlPath":               artifactPath(bundle.RunID, "mirror/index.html"),
		"layoutHtmlPath":         artifactPath(bundle.RunID, "mirror/layout.html"),
		"semanticHtmlPath":       artifactPath(bundle.RunID, "mirror/semantic.html"),
		"semanticModelPath":      artifactPath(bundle.RunID, "mirror/semantic_model.json"),
		"inferSemanticModelPath": artifactPath(bundle.RunID, "infer/semantic_model.json"),
		"cssPath":                artifactPath(bundle.RunID, "mirror/styles.css"),
		"metaPath":               artifactPath(bundle.RunID, "mirror/meta.json"),
		"domReportPath":          artifactPath(bundle.RunID, "mirror/dom_validation_report.json"),
		"regionCount":            len(regions),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["domValidationReportPath"] = artifactPath(bundle.RunID, "mirror/dom_validation_report.json")
		verify["phase1GatePassed"] = phase1Passed
		verify["phase1BlockingIssues"] = phase1Gate["blockingIssues"]
		payload["verify"] = verify
		payload["mirror"] = map[string]any{
			"htmlPath":               artifactPath(bundle.RunID, "mirror/index.html"),
			"layoutHtmlPath":         artifactPath(bundle.RunID, "mirror/layout.html"),
			"semanticHtmlPath":       artifactPath(bundle.RunID, "mirror/semantic.html"),
			"semanticModelPath":      artifactPath(bundle.RunID, "mirror/semantic_model.json"),
			"inferSemanticModelPath": artifactPath(bundle.RunID, "infer/semantic_model.json"),
			"cssPath":                artifactPath(bundle.RunID, "mirror/styles.css"),
			"metaPath":               artifactPath(bundle.RunID, "mirror/meta.json"),
			"domReportPath":          artifactPath(bundle.RunID, "mirror/dom_validation_report.json"),
			"renderedImagePath":      renderedPath,
			"auxiliary":              opts.Auxiliary,
		}
		if !phase1Passed {
			payload["status"] = "fail"
			payload["canProceed"] = false
			payload["nextStep"] = "repair-dom-phase1"
			payload["summary"] = "phase1 DOM validation failed; stop before phase2 artifact generation"
			payload["stopCondition"] = "phase1 dom validation failed"
			return
		}
		if !opts.Auxiliary {
			payload["status"] = "pending"
			payload["canProceed"] = true
			payload["nextStep"] = "compare"
			payload["summary"] = fmt.Sprintf("mirror contract ready with %d regions; render mirror.png and continue to compare", len(regions))
			payload["stopCondition"] = ""
		}
	}); err != nil {
		return nil, err
	}

	return &MirrorResult{
		RunID:             bundle.RunID,
		HTMLPath:          artifactPath(bundle.RunID, "mirror/index.html"),
		LayoutHTMLPath:    artifactPath(bundle.RunID, "mirror/layout.html"),
		SemanticHTMLPath:  artifactPath(bundle.RunID, "mirror/semantic.html"),
		SemanticModelPath: artifactPath(bundle.RunID, "mirror/semantic_model.json"),
		InferSemanticPath: artifactPath(bundle.RunID, "infer/semantic_model.json"),
		CSSPath:           artifactPath(bundle.RunID, "mirror/styles.css"),
		MetaPath:          artifactPath(bundle.RunID, "mirror/meta.json"),
		DOMReportPath:     artifactPath(bundle.RunID, "mirror/dom_validation_report.json"),
		RenderedImagePath: renderedPath,
		RegionCount:       len(regions),
	}, nil
}

func buildMirrorHTML(bundle *Bundle, title string, width, height int, cells []skeletonCell, regions []map[string]any) string {
	zonesPayload, _ := readJSONMap(filepath.Join(bundle.InferDir, "zones.json"))
	chatCandidatesPayload, _ := readJSONMap(filepath.Join(bundle.InferDir, "chat_candidates.json"))
	zones := arrayOfMaps(zonesPayload["zones"])
	chatCandidates := arrayOfMaps(chatCandidatesPayload["candidates"])

	var b strings.Builder
	b.WriteString("<!doctype html>\n<html lang=\"en\">\n<head>\n")
	b.WriteString("  <meta charset=\"utf-8\" />\n")
	b.WriteString("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n")
	b.WriteString(fmt.Sprintf("  <title>%s</title>\n", html.EscapeString(title)))
	b.WriteString("  <link rel=\"stylesheet\" href=\"styles.css\" />\n")
	b.WriteString("</head>\n<body>\n")
	b.WriteString(fmt.Sprintf("  <main class=\"mirror-root\" style=\"width:%dpx;height:%dpx;\">\n", width, height))
	for _, zone := range zones {
		bbox := normalizeBBox(zone["bbox"])
		role := stringValue(zone["role"])
		color := blendedCellColor(intValue(bbox["x"]), intValue(bbox["y"]), intValue(bbox["width"]), intValue(bbox["height"]), regions)
		b.WriteString(fmt.Sprintf("    <section class=\"layout-zone layout-zone--%s\" data-zone-id=\"%s\" style=\"left:%dpx;top:%dpx;width:%dpx;height:%dpx;background:%s;\">\n",
			cssSafeToken(role),
			html.EscapeString(stringValue(zone["id"])),
			intValue(bbox["x"]),
			intValue(bbox["y"]),
			intValue(bbox["width"]),
			intValue(bbox["height"]),
			html.EscapeString(color),
		))
		b.WriteString(fmt.Sprintf("      <header class=\"layout-zone__label\">%s</header>\n", html.EscapeString(role)))
		switch stringValue(zone["id"]) {
		case "conversation_list":
			b.WriteString(renderLayoutConversationList(chatCandidates))
		case "chat_header":
			b.WriteString("      <div class=\"layout-header-bar\"></div>\n")
			b.WriteString("      <div class=\"layout-header-title\"></div>\n")
			b.WriteString("      <div class=\"layout-header-meta\"></div>\n")
		case "message_list":
			b.WriteString("      <div class=\"layout-message-stack\">\n")
			b.WriteString("        <div class=\"layout-bubble layout-bubble--left\"></div>\n")
			b.WriteString("        <div class=\"layout-bubble layout-bubble--left layout-bubble--short\"></div>\n")
			b.WriteString("        <div class=\"layout-bubble layout-bubble--right\"></div>\n")
			b.WriteString("      </div>\n")
		case "input_area":
			b.WriteString("      <div class=\"layout-input-shell\">\n")
			b.WriteString("        <div class=\"layout-input-field\"></div>\n")
			b.WriteString("        <div class=\"layout-send-button\">发送</div>\n")
			b.WriteString("      </div>\n")
		case "detail_panel":
			b.WriteString("      <div class=\"layout-detail-card\"></div>\n")
			b.WriteString("      <div class=\"layout-detail-card layout-detail-card--short\"></div>\n")
		}
		b.WriteString("    </section>\n")
	}
	for _, cell := range cells {
		if cell.Kind == "zone" {
			continue
		}
		klass := "layout-band"
		if cell.Kind != "" {
			klass += " layout-band--" + cssSafeToken(cell.Kind)
		}
		b.WriteString(fmt.Sprintf("    <div class=\"%s\" style=\"left:%dpx;top:%dpx;width:%dpx;height:%dpx;background:%s;\"></div>\n", klass, cell.X, cell.Y, cell.Width, cell.Height, html.EscapeString(cell.Color)))
	}
	for _, region := range regions {
		id := html.EscapeString(stringValue(region["id"]))
		role := html.EscapeString(defaultString(stringValue(region["role"]), "layout_region"))
		bbox := normalizeBBox(region["bbox"])
		x := intValue(bbox["x"])
		y := intValue(bbox["y"])
		w := intValue(bbox["width"])
		h := intValue(bbox["height"])
		b.WriteString(fmt.Sprintf("    <div class=\"layout-label\" style=\"left:%dpx;top:%dpx;\">%s</div>\n", x+6, y+6, role))
		b.WriteString(fmt.Sprintf("    <div class=\"region-anchor\" data-region-id=\"%s\" data-role=\"%s\" style=\"left:%dpx;top:%dpx;width:%dpx;height:%dpx;\"></div>\n", id, role, x, y, w, h))
	}
	b.WriteString("  </main>\n</body>\n</html>\n")
	return b.String()
}

func renderLayoutConversationList(chatCandidates []map[string]any) string {
	var b strings.Builder
	b.WriteString("      <div class=\"layout-list\">\n")
	items := chatCandidates
	if len(items) > 6 {
		items = items[:6]
	}
	for _, candidate := range items {
		className := "layout-list__item"
		if boolValue(candidate["matchesTarget"]) {
			className += " layout-list__item--selected"
		}
		h := maxIntSafe(72, minIntSafe(108, intValue(mapValue(candidate["bbox"])["height"])+12))
		b.WriteString(fmt.Sprintf("        <div class=\"%s\" style=\"min-height:%dpx;\">\n", className, h))
		b.WriteString("          <div class=\"layout-list__avatar\"></div>\n")
		b.WriteString("          <div class=\"layout-list__text\">\n")
		b.WriteString("            <div class=\"layout-list__line layout-list__line--strong\"></div>\n")
		b.WriteString("            <div class=\"layout-list__line\"></div>\n")
		b.WriteString("          </div>\n")
		b.WriteString("        </div>\n")
	}
	b.WriteString("      </div>\n")
	return b.String()
}

type semanticMirrorDoc struct {
	HTML   string
	Report map[string]any
	Model  map[string]any
}

func buildSemanticMirror(bundle *Bundle, title string, width, height int) semanticMirrorDoc {
	detectPayload, _ := readJSONMap(filepath.Join(bundle.DetectDir, "regions.json"))
	zonesPayload, _ := readJSONMap(filepath.Join(bundle.InferDir, "zones.json"))
	targetsPayload, _ := readJSONMap(filepath.Join(bundle.InferDir, "action_targets.json"))
	chatCandidatesPayload, _ := readJSONMap(filepath.Join(bundle.InferDir, "chat_candidates.json"))
	ocrResultsPayload, _ := readJSONMap(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_results.json"))

	regions := normalizeDetectRegions(detectPayload["regions"])
	zones := arrayOfMaps(zonesPayload["zones"])
	targets := arrayOfMaps(targetsPayload["targets"])
	chatCandidates := arrayOfMaps(chatCandidatesPayload["candidates"])
	ocrResults := arrayOfMaps(ocrResultsPayload["results"])
	model := buildSemanticMirrorModel(bundle, width, height, regions, zones, targets, chatCandidates, ocrResults, mapValue(chatCandidatesPayload["bestCandidate"]))
	htmlDoc := buildSemanticMirrorHTML(title, width, height, model)
	report := buildSemanticMirrorReport(bundle.RunID, model)

	return semanticMirrorDoc{
		HTML:   htmlDoc,
		Report: report,
		Model:  model,
	}
}

func buildSemanticConversationList(chatCandidates []map[string]any) string {
	var b strings.Builder
	b.WriteString("      <div class=\"semantic-list\">\n")
	for i, candidate := range chatCandidates {
		selected := boolValue(candidate["matchesTarget"])
		className := "semantic-list__item"
		if selected {
			className += " semantic-list__item--selected"
		}
		b.WriteString(fmt.Sprintf("        <article class=\"%s\" data-candidate-id=\"%s\" data-match-score=\"%.4f\">\n", className, html.EscapeString(stringValue(candidate["id"])), floatValue(candidate["matchScore"])))
		b.WriteString("          <div class=\"semantic-list__avatar\"></div>\n")
		b.WriteString("          <div class=\"semantic-list__content\">\n")
		title := stringValue(candidate["normalizedText"])
		if title == "" {
			title = fmt.Sprintf("candidate-%02d", i+1)
		}
		b.WriteString(fmt.Sprintf("            <div class=\"semantic-list__title\">%s</div>\n", html.EscapeString(shortMirrorText(title, 26))))
		b.WriteString(fmt.Sprintf("            <div class=\"semantic-list__snippet\">%s</div>\n", html.EscapeString(shortMirrorText(title, 42))))
		b.WriteString("          </div>\n")
		b.WriteString("          <div class=\"semantic-list__meta\">13:36</div>\n")
		b.WriteString("        </article>\n")
	}
	b.WriteString("      </div>\n")
	return b.String()
}

func buildSemanticHeader(bestCandidate, headerProbe map[string]any) string {
	var b strings.Builder
	title := stringValue(headerProbe["text"])
	if title == "" {
		title = stringValue(bestCandidate["normalizedText"])
	}
	b.WriteString("      <div class=\"semantic-header\">\n")
	b.WriteString(fmt.Sprintf("        <h1 class=\"semantic-header__title\">%s</h1>\n", html.EscapeString(shortMirrorText(title, 36))))
	b.WriteString("        <div class=\"semantic-header__meta\">在线 · 最近沟通窗口</div>\n")
	b.WriteString("      </div>\n")
	return b.String()
}

func buildSemanticMessages(messageProbe, replyProbe map[string]any) string {
	var b strings.Builder
	left := stringValue(messageProbe["text"])
	right := stringValue(replyProbe["text"])
	if left == "" {
		left = "历史消息区域"
	}
	if right == "" {
		right = "最新回复读取区域"
	}
	b.WriteString("      <div class=\"semantic-messages\">\n")
	b.WriteString(fmt.Sprintf("        <div class=\"semantic-bubble semantic-bubble--left\">%s</div>\n", html.EscapeString(shortMirrorText(left, 68))))
	b.WriteString(fmt.Sprintf("        <div class=\"semantic-bubble semantic-bubble--right\">%s</div>\n", html.EscapeString(shortMirrorText(right, 56))))
	b.WriteString("      </div>\n")
	return b.String()
}

func buildSemanticInput(draftProbe, sendTarget map[string]any) string {
	var b strings.Builder
	text := stringValue(draftProbe["text"])
	if text == "" {
		text = "输入框草稿区域"
	}
	sendLabel := "发送"
	if sendTarget != nil {
		sendLabel = "发送"
	}
	b.WriteString("      <div class=\"semantic-inputbar\">\n")
	b.WriteString(fmt.Sprintf("        <div class=\"semantic-inputbar__field\">%s</div>\n", html.EscapeString(shortMirrorText(text, 72))))
	b.WriteString(fmt.Sprintf("        <button class=\"semantic-inputbar__send\">%s</button>\n", html.EscapeString(sendLabel)))
	b.WriteString("      </div>\n")
	return b.String()
}

func probeByIDForMirror(items []map[string]any, id string) map[string]any {
	for _, item := range items {
		if stringValue(item["id"]) == id {
			return item
		}
	}
	return map[string]any{}
}

func shortMirrorText(text string, limit int) string {
	text = normalizeCandidateText(text)
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "..."
}

func buildSemanticMirrorModel(bundle *Bundle, width, height int, regions, zones, targets, chatCandidates, ocrResults []map[string]any, bestCandidate map[string]any) map[string]any {
	headerProbe := probeByIDForMirror(ocrResults, "header_identity")
	draftProbe := probeByIDForMirror(ocrResults, "draft_input")
	messageProbe := probeByIDForMirror(ocrResults, "message_list_local")
	replyProbe := probeByIDForMirror(ocrResults, "latest_reply_probe")
	uniqueCandidates, duplicateCount := uniqueChatCandidates(chatCandidates)
	if len(uniqueCandidates) == 0 {
		uniqueCandidates = fallbackChatCandidatesFromTargets(targets)
	}

	zoneViews := make([]map[string]any, 0, len(zones))
	for _, zone := range zones {
		bbox := normalizeBBox(zone["bbox"])
		zoneViews = append(zoneViews, map[string]any{
			"id":         stringValue(zone["id"]),
			"role":       stringValue(zone["role"]),
			"bbox":       bbox,
			"confidence": floatValue(zone["confidence"]),
			"color":      blendedCellColor(intValue(bbox["x"]), intValue(bbox["y"]), intValue(bbox["width"]), intValue(bbox["height"]), regions),
		})
	}

	targetViews := make([]map[string]any, 0, len(targets))
	for _, target := range targets {
		targetViews = append(targetViews, map[string]any{
			"id":         stringValue(target["id"]),
			"intent":     stringValue(target["intent"]),
			"zoneId":     stringValue(target["zoneId"]),
			"bbox":       normalizeBBox(target["bbox"]),
			"point":      mapValue(target["point"]),
			"candidates": arrayOfMaps(target["candidates"]),
		})
	}

	model := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"canvas": map[string]any{
			"width":  width,
			"height": height,
		},
		"zones":               zoneViews,
		"targets":             targetViews,
		"chatCandidates":      uniqueCandidates,
		"duplicateCandidates": duplicateCount,
		"bestCandidate":       bestCandidate,
		"probes": map[string]any{
			"header":       headerProbe,
			"draft":        draftProbe,
			"message":      messageProbe,
			"latest_reply": replyProbe,
		},
		"views": map[string]any{
			"conversationList": buildConversationListView(uniqueCandidates),
			"header":           buildHeaderView(bestCandidate, headerProbe),
			"messages":         buildMessageView(messageProbe, replyProbe),
			"inputBar":         buildInputView(draftProbe, firstTargetByIntent(targets, "send_message")),
		},
	}
	return model
}

func buildSemanticMirrorHTML(title string, width, height int, model map[string]any) string {
	var b strings.Builder
	zones := arrayOfMaps(model["zones"])
	targets := arrayOfMaps(model["targets"])
	chatCandidates := arrayOfMaps(model["chatCandidates"])
	probes := mapValue(model["probes"])
	views := mapValue(model["views"])

	b.WriteString("<!doctype html>\n<html lang=\"en\">\n<head>\n")
	b.WriteString("  <meta charset=\"utf-8\" />\n")
	b.WriteString("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n")
	b.WriteString(fmt.Sprintf("  <title>%s Semantic</title>\n", html.EscapeString(title)))
	b.WriteString("  <link rel=\"stylesheet\" href=\"styles.css\" />\n")
	b.WriteString("</head>\n<body>\n")
	b.WriteString(fmt.Sprintf("  <main class=\"mirror-root semantic-root\" style=\"width:%dpx;height:%dpx;\">\n", width, height))
	b.WriteString("    <section class=\"semantic-summary\" data-kind=\"semantic-summary\">\n")
	b.WriteString(fmt.Sprintf("      <div data-field=\"zone-count\">zones:%d</div>\n", len(zones)))
	b.WriteString(fmt.Sprintf("      <div data-field=\"target-count\">targets:%d</div>\n", len(targets)))
	b.WriteString(fmt.Sprintf("      <div data-field=\"candidate-count\">chatCandidates:%d</div>\n", len(chatCandidates)))
	b.WriteString(fmt.Sprintf("      <div data-field=\"ocr-count\">ocrResults:%d</div>\n", probeCount(probes)))
	b.WriteString("    </section>\n")

	for _, zone := range zones {
		bbox := normalizeBBox(zone["bbox"])
		b.WriteString(fmt.Sprintf(
			"    <section class=\"semantic-zone semantic-zone--%s\" data-zone-id=\"%s\" data-role=\"%s\" data-confidence=\"%.4f\" style=\"left:%dpx;top:%dpx;width:%dpx;height:%dpx;background:%s;\">\n",
			cssSafeToken(stringValue(zone["role"])),
			html.EscapeString(stringValue(zone["id"])),
			html.EscapeString(stringValue(zone["role"])),
			floatValue(zone["confidence"]),
			intValue(bbox["x"]),
			intValue(bbox["y"]),
			intValue(bbox["width"]),
			intValue(bbox["height"]),
			html.EscapeString(stringValue(zone["color"])),
		))
		b.WriteString(fmt.Sprintf("      <header>%s</header>\n", html.EscapeString(stringValue(zone["role"]))))
		switch stringValue(zone["id"]) {
		case "conversation_list":
			b.WriteString(renderConversationListHTML(arrayOfMaps(views["conversationList"])))
		case "chat_header":
			b.WriteString(renderHeaderHTML(mapValue(views["header"])))
		case "message_list":
			b.WriteString(renderMessagesHTML(arrayOfMaps(views["messages"])))
		case "input_area":
			b.WriteString(renderInputHTML(mapValue(views["inputBar"])))
		}
		b.WriteString("    </section>\n")
	}

	for _, target := range targets {
		bbox := normalizeBBox(target["bbox"])
		b.WriteString(fmt.Sprintf(
			"    <article class=\"semantic-target\" data-target-id=\"%s\" data-intent=\"%s\" data-zone-id=\"%s\" style=\"left:%dpx;top:%dpx;width:%dpx;height:%dpx;\">\n",
			html.EscapeString(stringValue(target["id"])),
			html.EscapeString(stringValue(target["intent"])),
			html.EscapeString(stringValue(target["zoneId"])),
			intValue(bbox["x"]),
			intValue(bbox["y"]),
			intValue(bbox["width"]),
			intValue(bbox["height"]),
		))
		b.WriteString(fmt.Sprintf("      <div class=\"semantic-target__label\">%s</div>\n", html.EscapeString(stringValue(target["intent"]))))
		for _, candidate := range arrayOfMaps(target["candidates"]) {
			cb := normalizeBBox(candidate["bbox"])
			b.WriteString(fmt.Sprintf(
				"      <div class=\"semantic-candidate\" data-candidate-id=\"%s\" style=\"left:%dpx;top:%dpx;width:%dpx;height:%dpx;\">candidate</div>\n",
				html.EscapeString(stringValue(candidate["id"])),
				intValue(cb["x"]),
				intValue(cb["y"]),
				intValue(cb["width"]),
				intValue(cb["height"]),
			))
		}
		b.WriteString("    </article>\n")
	}

	for _, candidate := range chatCandidates {
		b.WriteString(fmt.Sprintf(
			"    <div class=\"semantic-chat-candidate\" data-candidate-id=\"%s\" data-match-score=\"%.4f\" data-matches-target=\"%t\">%s</div>\n",
			html.EscapeString(stringValue(candidate["id"])),
			floatValue(candidate["matchScore"]),
			boolValue(candidate["matchesTarget"]),
			html.EscapeString(stringValue(candidate["normalizedText"])),
		))
	}

	for _, probe := range []map[string]any{mapValue(probes["header"]), mapValue(probes["draft"]), mapValue(probes["message"]), mapValue(probes["latest_reply"])} {
		if len(probe) == 0 {
			continue
		}
		b.WriteString(fmt.Sprintf(
			"    <div class=\"semantic-ocr-probe\" data-probe-id=\"%s\" data-intent=\"%s\" data-status=\"%s\">%s</div>\n",
			html.EscapeString(stringValue(probe["id"])),
			html.EscapeString(stringValue(probe["intent"])),
			html.EscapeString(stringValue(probe["status"])),
			html.EscapeString(stringValue(probe["text"])),
		))
	}

	b.WriteString("  </main>\n</body>\n</html>\n")
	return b.String()
}

func buildSemanticMirrorReport(runID string, model map[string]any) map[string]any {
	zones := arrayOfMaps(model["zones"])
	targets := arrayOfMaps(model["targets"])
	chatCandidates := arrayOfMaps(model["chatCandidates"])
	probes := mapValue(model["probes"])
	duplicateCount := intValue(model["duplicateCandidates"])
	headerText := stringValue(mapValue(probes["header"])["text"])
	draftText := stringValue(mapValue(probes["draft"])["text"])
	messageText := stringValue(mapValue(probes["message"])["text"])
	selectedCount := 0
	for _, candidate := range chatCandidates {
		if boolValue(candidate["matchesTarget"]) {
			selectedCount++
		}
	}
	structureScore := 0.0
	reqZones := requiredMirrorZones(zones)
	for _, ok := range reqZones {
		if ok {
			structureScore += 0.10
		}
	}
	if len(targets) >= 4 {
		structureScore += 0.10
	}
	textScore := 0.0
	for _, text := range []string{headerText, draftText, messageText} {
		if strings.TrimSpace(text) != "" {
			textScore += 0.06
		}
	}
	candidateScore := 0.0
	if len(chatCandidates) > 0 {
		candidateScore += 0.08
	}
	if selectedCount == 1 {
		candidateScore += 0.12
	}
	penalty := minFloat(float64(duplicateCount)*0.18, 0.42)
	semanticScore := structureScore + textScore + candidateScore - penalty
	if semanticScore < 0 {
		semanticScore = 0
	}
	if semanticScore > 1 {
		semanticScore = 1
	}
	return map[string]any{
		"schemaVersion":           schemaVersion,
		"createdAt":               time.Now().Format(time.RFC3339),
		"runId":                   runID,
		"zoneCount":               len(zones),
		"targetCount":             len(targets),
		"chatCandidateCount":      len(chatCandidates),
		"ocrProbeCount":           probeCount(probes),
		"requiredZonesPresent":    reqZones,
		"targetIntentsPresent":    presentTargetIntents(targets),
		"selectedCandidateCount":  selectedCount,
		"duplicateCandidateCount": duplicateCount,
		"candidateUniquenessOK":   duplicateCount == 0,
		"singleTargetMatchOK":     selectedCount == 1,
		"textCoverage": map[string]bool{
			"header":  strings.TrimSpace(headerText) != "",
			"draft":   strings.TrimSpace(draftText) != "",
			"message": strings.TrimSpace(messageText) != "",
		},
		"semanticScore": round4(semanticScore),
		"semanticBlocks": map[string]any{
			"conversationRows": len(chatCandidates),
			"headerText":       headerText,
			"draftText":        draftText,
			"messageText":      messageText,
		},
		"summary": "DOM-first semantic mirror report generated from semantic_model.json",
	}
}

func uniqueChatCandidates(candidates []map[string]any) ([]map[string]any, int) {
	out := make([]map[string]any, 0, len(candidates))
	seen := map[string]bool{}
	duplicates := 0
	for _, candidate := range candidates {
		key := fmt.Sprintf("%s|%d|%d", stringValue(candidate["normalizedText"]), intValue(mapValue(candidate["bbox"])["y"]), intValue(mapValue(candidate["bbox"])["height"]))
		if seen[key] {
			duplicates++
			continue
		}
		seen[key] = true
		out = append(out, candidate)
	}
	return out, duplicates
}

func fallbackChatCandidatesFromTargets(targets []map[string]any) []map[string]any {
	openTarget := firstTargetByIntent(targets, "open_chat")
	if openTarget == nil {
		return nil
	}
	items := make([]map[string]any, 0, len(arrayOfMaps(openTarget["candidates"])))
	for i, candidate := range arrayOfMaps(openTarget["candidates"]) {
		items = append(items, map[string]any{
			"id":             stringValue(candidate["id"]),
			"bbox":           normalizeBBox(candidate["bbox"]),
			"point":          mapValue(candidate["point"]),
			"status":         "fallback",
			"text":           "",
			"normalizedText": fmt.Sprintf("candidate-%02d", i+1),
			"matchScore":     0.0,
			"matchesTarget":  false,
		})
	}
	return items
}

func buildConversationListView(chatCandidates []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(chatCandidates))
	for i, candidate := range chatCandidates {
		out = append(out, map[string]any{
			"id":          stringValue(candidate["id"]),
			"title":       shortMirrorText(stringValue(candidate["normalizedText"]), 28),
			"snippet":     shortMirrorText(stringValue(candidate["normalizedText"]), 46),
			"selected":    boolValue(candidate["matchesTarget"]),
			"matchScore":  floatValue(candidate["matchScore"]),
			"height":      maxIntSafe(74, minIntSafe(112, intValue(mapValue(candidate["bbox"])["height"])+18)),
			"displayTime": displayTimeForIndex(i),
		})
	}
	return out
}

func buildHeaderView(bestCandidate, headerProbe map[string]any) map[string]any {
	title := stringValue(headerProbe["text"])
	if title == "" {
		title = stringValue(bestCandidate["normalizedText"])
	}
	return map[string]any{
		"title": shortMirrorText(title, 36),
		"meta":  "在线 · 最近沟通窗口",
	}
}

func buildMessageView(messageProbe, replyProbe map[string]any) []map[string]any {
	left := stringValue(messageProbe["text"])
	if left == "" {
		left = "历史消息区域"
	}
	right := stringValue(replyProbe["text"])
	if right == "" {
		right = "最新回复读取区域"
	}
	return []map[string]any{
		{"side": "left", "text": shortMirrorText(left, 72)},
		{"side": "right", "text": shortMirrorText(right, 58)},
	}
}

func buildInputView(draftProbe, sendTarget map[string]any) map[string]any {
	text := stringValue(draftProbe["text"])
	if text == "" {
		text = "输入框草稿区域"
	}
	return map[string]any{
		"text":      shortMirrorText(text, 84),
		"sendLabel": "发送",
		"hasSend":   sendTarget != nil,
	}
}

func renderConversationListHTML(items []map[string]any) string {
	var b strings.Builder
	b.WriteString("      <div class=\"semantic-list\">\n")
	for _, item := range items {
		className := "semantic-list__item"
		if boolValue(item["selected"]) {
			className += " semantic-list__item--selected"
		}
		b.WriteString(fmt.Sprintf("        <article class=\"%s\" data-candidate-id=\"%s\" data-match-score=\"%.4f\" style=\"min-height:%dpx;\">\n", className, html.EscapeString(stringValue(item["id"])), floatValue(item["matchScore"]), intValue(item["height"])))
		b.WriteString("          <div class=\"semantic-list__avatar\"></div>\n")
		b.WriteString("          <div class=\"semantic-list__content\">\n")
		b.WriteString(fmt.Sprintf("            <div class=\"semantic-list__title\">%s</div>\n", html.EscapeString(stringValue(item["title"]))))
		b.WriteString(fmt.Sprintf("            <div class=\"semantic-list__snippet\">%s</div>\n", html.EscapeString(stringValue(item["snippet"]))))
		b.WriteString("          </div>\n")
		b.WriteString(fmt.Sprintf("          <div class=\"semantic-list__meta\">%s</div>\n", html.EscapeString(stringValue(item["displayTime"]))))
		b.WriteString("        </article>\n")
	}
	b.WriteString("      </div>\n")
	return b.String()
}

func renderHeaderHTML(view map[string]any) string {
	return fmt.Sprintf("      <div class=\"semantic-header\">\n        <h1 class=\"semantic-header__title\">%s</h1>\n        <div class=\"semantic-header__meta\">%s</div>\n      </div>\n", html.EscapeString(stringValue(view["title"])), html.EscapeString(stringValue(view["meta"])))
}

func renderMessagesHTML(items []map[string]any) string {
	var b strings.Builder
	b.WriteString("      <div class=\"semantic-messages\">\n")
	for _, item := range items {
		className := "semantic-bubble semantic-bubble--left"
		if stringValue(item["side"]) == "right" {
			className = "semantic-bubble semantic-bubble--right"
		}
		b.WriteString(fmt.Sprintf("        <div class=\"%s\">%s</div>\n", className, html.EscapeString(stringValue(item["text"]))))
	}
	b.WriteString("      </div>\n")
	return b.String()
}

func renderInputHTML(view map[string]any) string {
	return fmt.Sprintf("      <div class=\"semantic-inputbar\">\n        <div class=\"semantic-inputbar__field\">%s</div>\n        <button class=\"semantic-inputbar__send\">%s</button>\n      </div>\n", html.EscapeString(stringValue(view["text"])), html.EscapeString(stringValue(view["sendLabel"])))
}

func probeCount(probes map[string]any) int {
	count := 0
	for _, key := range []string{"header", "draft", "message", "latest_reply"} {
		if len(mapValue(probes[key])) > 0 {
			count++
		}
	}
	return count
}

func displayTimeForIndex(index int) string {
	hour := 13 + index/6
	minute := 36 + (index*7)%20
	return fmt.Sprintf("%02d:%02d", hour, minute)
}

func buildMirrorCSS(width, height int) string {
	tpl := `:root {
  color-scheme: light;
  --mirror-width: __MIRROR_WIDTH__px;
  --mirror-height: __MIRROR_HEIGHT__px;
  --bg: #f5f5f5;
  --chrome: rgba(20, 20, 20, 0.72);
  --label: #ffffff;
  --text: rgba(20, 20, 20, 0.82);
  --outline: rgba(0, 0, 0, 0.08);
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  width: var(--mirror-width);
  height: var(--mirror-height);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.mirror-root {
  position: relative;
  width: var(--mirror-width);
  height: var(--mirror-height);
  overflow: hidden;
  background: var(--bg);
}

.frame-cell {
  position: absolute;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.frame-cell--zone {
  border-width: 2px;
  border-color: rgba(0, 0, 0, 0.12);
}

.frame-cell--band {
  border-color: rgba(255, 255, 255, 0.28);
}

.layout-zone,
.layout-band {
  position: absolute;
  overflow: hidden;
}

.layout-zone {
  border-right: 1px solid rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 8px;
}

.layout-zone::after {
  position: absolute;
  inset: 0;
  content: "";
  background: linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0.02));
}

.layout-band {
  border-bottom: 1px solid rgba(255, 255, 255, 0.26);
  border-right: 1px solid rgba(255, 255, 255, 0.18);
}

.region-anchor {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.layout-label {
  position: absolute;
  z-index: 15;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: rgba(18, 18, 18, 0.76);
  font-size: 11px;
  font-weight: 600;
}

.layout-zone__label {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 12;
  margin: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: rgba(18, 18, 18, 0.76);
  font-size: 11px;
  font-weight: 600;
}

.layout-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 42px 10px 10px;
}

.layout-list__item {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.58);
}

.layout-list__item--selected {
  background: rgba(199, 232, 218, 0.96);
}

.layout-list__avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.14);
}

.layout-list__text {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.layout-list__line {
  height: 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.12);
}

.layout-list__line--strong {
  width: 68%;
  background: rgba(0, 0, 0, 0.2);
}

.layout-header-bar,
.layout-header-title,
.layout-header-meta,
.layout-detail-card,
.layout-bubble,
.layout-input-field,
.layout-send-button {
  position: absolute;
  border-radius: 14px;
}

.layout-header-bar {
  left: 16px;
  right: 16px;
  top: 44px;
  height: 1px;
  background: rgba(0,0,0,0.08);
}

.layout-header-title {
  left: 18px;
  top: 56px;
  width: 38%;
  height: 18px;
  background: rgba(0,0,0,0.18);
}

.layout-header-meta {
  left: 18px;
  top: 82px;
  width: 22%;
  height: 12px;
  background: rgba(0,0,0,0.10);
}

.layout-message-stack {
  position: absolute;
  inset: 46px 18px 18px;
}

.layout-bubble {
  height: 54px;
  background: rgba(255,255,255,0.92);
}

.layout-bubble--left {
  left: 0;
  width: 44%;
  top: 14px;
}

.layout-bubble--short {
  top: 86px;
  width: 28%;
}

.layout-bubble--right {
  right: 0;
  width: 40%;
  top: 156px;
  background: rgba(199, 232, 218, 0.96);
}

.layout-input-shell {
  position: absolute;
  inset: 46px 18px 18px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
}

.layout-input-field {
  position: static;
  min-height: 74px;
  background: rgba(255,255,255,0.92);
}

.layout-send-button {
  position: static;
  min-width: 68px;
  min-height: 42px;
  padding: 12px 18px;
  background: rgba(20, 184, 102, 0.92);
  color: white;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.layout-detail-card {
  left: 16px;
  right: 16px;
  top: 48px;
  height: 96px;
  background: rgba(255,255,255,0.64);
}

.layout-detail-card--short {
  top: 160px;
  height: 64px;
}

.region__text {
  padding: 6px 8px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  opacity: 0.82;
}

.semantic-root {
  background: rgba(255, 255, 255, 0.92);
}

.semantic-summary {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 20;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  font-size: 12px;
}

.semantic-zone,
.semantic-target,
.semantic-candidate {
  position: absolute;
  border: 1px dashed rgba(0, 0, 0, 0.22);
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.semantic-zone > header,
.semantic-target__label {
  font-size: 11px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.82);
}

.semantic-chat-candidate,
.semantic-ocr-probe {
  display: none;
}

.semantic-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 44px 10px 10px;
}

.semantic-list__item {
  display: grid;
  grid-template-columns: 42px 1fr auto;
  gap: 10px;
  align-items: center;
  min-height: 74px;
  padding: 10px 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
}

.semantic-list__item--selected {
  background: rgba(199, 232, 218, 0.95);
  outline: 1px solid rgba(40, 120, 80, 0.18);
}

.semantic-list__avatar {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.12);
}

.semantic-list__content {
  min-width: 0;
}

.semantic-list__title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(10, 10, 10, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.semantic-list__snippet,
.semantic-list__meta {
  font-size: 11px;
  color: rgba(30, 30, 30, 0.58);
}

.semantic-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 42px 16px 12px;
}

.semantic-header__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: rgba(20, 20, 20, 0.92);
}

.semantic-header__meta {
  font-size: 12px;
  color: rgba(40, 40, 40, 0.55);
}

.semantic-messages {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 48px 22px 18px;
}

.semantic-bubble {
  max-width: 68%%;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  line-height: 1.45;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.semantic-bubble--left {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.95);
  color: rgba(25, 25, 25, 0.92);
}

.semantic-bubble--right {
  align-self: flex-end;
  background: rgba(199, 232, 218, 0.95);
  color: rgba(18, 50, 36, 0.92);
}

.semantic-inputbar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 48px 18px 18px;
}

.semantic-inputbar__field {
  min-height: 72px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  padding: 16px 18px;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(25, 25, 25, 0.92);
}

.semantic-inputbar__send {
  border: 0;
  border-radius: 16px;
  background: rgba(20, 184, 102, 0.92);
  color: white;
  font-size: 13px;
  font-weight: 700;
  padding: 14px 18px;
}
`
	return strings.NewReplacer(
		"__MIRROR_WIDTH__", strconv.Itoa(width),
		"__MIRROR_HEIGHT__", strconv.Itoa(height),
	).Replace(tpl)
}

func cssSafeToken(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "layout-region"
	}
	value = strings.ReplaceAll(value, "_", "-")
	value = strings.ReplaceAll(value, " ", "-")
	return value
}

func mapValue(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	default:
		return map[string]any{}
	}
}

func buildSkeletonCells(separatorsRaw any, regions []map[string]any, width, height int) []skeletonCell {
	xBounds := deriveAxisBoundaries("vertical", separatorsRaw, regions, width, height)
	cells := make([]skeletonCell, 0)
	for i := 0; i < len(xBounds)-1; i++ {
		x0, x1 := xBounds[i], xBounds[i+1]
		if x1-x0 <= 0 {
			continue
		}
		yBounds := deriveColumnRows(x0, x1, separatorsRaw, regions, width, height)
		for j := 0; j < len(yBounds)-1; j++ {
			y0, y1 := yBounds[j], yBounds[j+1]
			if y1-y0 <= 0 {
				continue
			}
			cells = append(cells, skeletonCell{
				X:      x0,
				Y:      y0,
				Width:  x1 - x0,
				Height: y1 - y0,
				Color:  blendedCellColor(x0, y0, x1-x0, y1-y0, regions),
				Kind:   "band",
			})
		}
	}
	return cells
}

func buildLayoutModelCells(modelPath string, regions []map[string]any) []skeletonCell {
	data, err := os.ReadFile(modelPath)
	if err != nil {
		return nil
	}
	var model map[string]any
	if err := json.Unmarshal(data, &model); err != nil {
		return nil
	}
	structure := mapValue(model["structure"])
	cells := make([]skeletonCell, 0)
	for _, zone := range arrayOfMaps(structure["majorZones"]) {
		x := intValue(zone["x"])
		y := intValue(zone["y"])
		w := intValue(zone["width"])
		h := intValue(zone["height"])
		if w <= 0 || h <= 0 {
			continue
		}
		cells = append(cells, skeletonCell{
			X:      x,
			Y:      y,
			Width:  w,
			Height: h,
			Color:  blendedCellColor(x, y, w, h, regions),
			Kind:   "zone",
		})
	}
	for _, column := range arrayOfMaps(structure["columns"]) {
		x := intValue(column["x"])
		w := intValue(column["width"])
		if w <= 0 {
			continue
		}
		for _, row := range arrayOfMaps(column["rows"]) {
			y := intValue(row["y"])
			h := intValue(row["height"])
			if h <= 0 {
				continue
			}
			cells = append(cells, skeletonCell{
				X:      x,
				Y:      y,
				Width:  w,
				Height: h,
				Color:  blendedCellColor(x, y, w, h, regions),
				Kind:   "band",
			})
		}
	}
	if len(cells) == 0 {
		return nil
	}
	return cells
}

func deriveAxisBoundaries(axis string, separatorsRaw any, regions []map[string]any, width, height int) []int {
	totalSecondary := height
	totalPrimary := width
	if axis == "horizontal" {
		totalSecondary = width
		totalPrimary = height
	}

	scores := map[int]float64{
		0:            1,
		totalPrimary: 1,
	}

	for _, region := range regions {
		b := normalizeBBox(region["bbox"])
		x := intValue(b["x"])
		y := intValue(b["y"])
		w := intValue(b["width"])
		h := intValue(b["height"])
		if axis == "vertical" {
			scores[x] += float64(h) / float64(maxIntSafe(1, totalSecondary))
			scores[x+w] += float64(h) / float64(maxIntSafe(1, totalSecondary))
		} else {
			scores[y] += float64(w) / float64(maxIntSafe(1, totalSecondary))
			scores[y+h] += float64(w) / float64(maxIntSafe(1, totalSecondary))
		}
	}

	sepMap := mapValue(separatorsRaw)
	for _, item := range arrayOfMaps(sepMap[axis]) {
		pos := intValue(item["position"])
		meta := mapValue(item["meta"])
		span := mapValue(meta["span"])
		spanLen := 0
		if axis == "vertical" {
			spanLen = intValue(span["end"]) - intValue(span["start"])
		} else {
			spanLen = intValue(span["end"]) - intValue(span["start"])
		}
		coverage := float64(maxIntSafe(0, spanLen)) / float64(maxIntSafe(1, totalSecondary))
		score := floatValue(item["confidence"])*1.2 + coverage
		scores[pos] += score
	}

	points := make([]int, 0, len(scores))
	for pos, score := range scores {
		if pos <= 0 || pos >= totalPrimary {
			continue
		}
		if score >= 0.75 {
			points = append(points, pos)
		}
	}
	points = append(points, 0, totalPrimary)
	sort.Ints(points)
	return dedupeBoundaries(points, 40, totalPrimary)
}

func deriveColumnRows(x0, x1 int, separatorsRaw any, regions []map[string]any, width, height int) []int {
	scores := map[int]float64{0: 1, height: 1}
	columnWidth := maxIntSafe(1, x1-x0)
	for _, region := range regions {
		b := normalizeBBox(region["bbox"])
		rx := intValue(b["x"])
		ry := intValue(b["y"])
		rw := intValue(b["width"])
		rh := intValue(b["height"])
		overlap := overlapSpan(x0, x1, rx, rx+rw)
		if overlap <= 0 {
			continue
		}
		weight := float64(overlap) / float64(columnWidth)
		scores[ry] += weight
		scores[ry+rh] += weight
	}

	sepMap := mapValue(separatorsRaw)
	for _, item := range arrayOfMaps(sepMap["horizontal"]) {
		pos := intValue(item["position"])
		meta := mapValue(item["meta"])
		span := mapValue(meta["span"])
		start := intValue(span["start"])
		end := intValue(span["end"])
		overlap := overlapSpan(x0, x1, start, end)
		if overlap <= 0 {
			continue
		}
		score := floatValue(item["confidence"])*1.2 + float64(overlap)/float64(columnWidth)
		scores[pos] += score
	}

	points := make([]int, 0, len(scores))
	for pos, score := range scores {
		if pos <= 0 || pos >= height {
			continue
		}
		if score >= 0.75 {
			points = append(points, pos)
		}
	}
	points = append(points, 0, height)
	sort.Ints(points)
	return dedupeBoundaries(points, 32, height)
}

func blendedCellColor(x, y, width, height int, regions []map[string]any) string {
	type accum struct{ r, g, b, area float64 }
	var a accum
	for _, region := range regions {
		b := normalizeBBox(region["bbox"])
		rx := intValue(b["x"])
		ry := intValue(b["y"])
		rw := intValue(b["width"])
		rh := intValue(b["height"])
		overlapW := overlapSpan(x, x+width, rx, rx+rw)
		overlapH := overlapSpan(y, y+height, ry, ry+rh)
		if overlapW <= 0 || overlapH <= 0 {
			continue
		}
		area := float64(overlapW * overlapH)
		r, g, bch := hexToRGB(defaultString(stringValue(region["avgColor"]), "#f5f5f5"))
		a.r += float64(r) * area
		a.g += float64(g) * area
		a.b += float64(bch) * area
		a.area += area
	}
	if a.area == 0 {
		return "#f5f5f5"
	}
	return fmt.Sprintf("#%02x%02x%02x", int(math.Round(a.r/a.area)), int(math.Round(a.g/a.area)), int(math.Round(a.b/a.area)))
}

func arrayOfMaps(raw any) []map[string]any {
	switch typed := raw.(type) {
	case []map[string]any:
		return typed
	case []any:
		out := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	default:
		return nil
	}
}

func dedupeBoundaries(points []int, minGap, maxValue int) []int {
	if len(points) == 0 {
		return []int{0, maxValue}
	}
	sort.Ints(points)
	out := make([]int, 0, len(points))
	for _, p := range points {
		if p < 0 || p > maxValue {
			continue
		}
		if len(out) == 0 || p-out[len(out)-1] >= minGap {
			out = append(out, p)
			continue
		}
		if p > out[len(out)-1] {
			out[len(out)-1] = p
		}
	}
	if out[0] != 0 {
		out = append([]int{0}, out...)
	}
	if out[len(out)-1] != maxValue {
		out = append(out, maxValue)
	}
	return out
}

func overlapSpan(a0, a1, b0, b1 int) int {
	start := maxIntSafe(a0, b0)
	end := minIntSafe(a1, b1)
	if end <= start {
		return 0
	}
	return end - start
}

func hexToRGB(hex string) (int, int, int) {
	hex = strings.TrimPrefix(strings.TrimSpace(hex), "#")
	if len(hex) != 6 {
		return 245, 245, 245
	}
	r, _ := strconv.ParseInt(hex[0:2], 16, 64)
	g, _ := strconv.ParseInt(hex[2:4], 16, 64)
	b, _ := strconv.ParseInt(hex[4:6], 16, 64)
	return int(r), int(g), int(b)
}

func minIntSafe(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxIntSafe(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func exportVisibleCells(cells []skeletonCell) []map[string]any {
	out := make([]map[string]any, 0, len(cells))
	for _, cell := range cells {
		out = append(out, map[string]any{
			"x":      cell.X,
			"y":      cell.Y,
			"width":  cell.Width,
			"height": cell.Height,
			"color":  cell.Color,
			"kind":   cell.Kind,
		})
	}
	return out
}

func requiredMirrorZones(zones []map[string]any) map[string]bool {
	required := []string{"conversation_list", "chat_header", "message_list", "input_area"}
	out := make(map[string]bool, len(required))
	for _, id := range required {
		out[id] = zoneByID(zones, id) != nil
	}
	return out
}

func presentTargetIntents(targets []map[string]any) []string {
	out := make([]string, 0, len(targets))
	seen := map[string]bool{}
	for _, target := range targets {
		intent := stringValue(target["intent"])
		if intent == "" || seen[intent] {
			continue
		}
		seen[intent] = true
		out = append(out, intent)
	}
	sort.Strings(out)
	return out
}

func semanticMirrorScore(zones, targets, chatCandidates, ocrResults []map[string]any) float64 {
	score := 0.0
	reqZones := requiredMirrorZones(zones)
	for _, ok := range reqZones {
		if ok {
			score += 0.15
		}
	}
	if len(targets) >= 4 {
		score += 0.2
	}
	if len(chatCandidates) > 0 {
		score += 0.1
	}
	if len(ocrResults) > 0 {
		score += 0.1
	}
	if score > 1 {
		score = 1
	}
	return score
}
