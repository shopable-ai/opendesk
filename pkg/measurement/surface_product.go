package measurement

import (
	"fmt"
	"html"
	"path/filepath"
	"strings"
	"time"

	"opendesk/pkg/customui"
)

func measurementWindowSpecProduct(a *activeSession) customui.WindowSpec {
	mapping := a.frame.Snapshot.Mapping
	return customui.WindowSpec{
		ID: WindowID, Kind: "measurement", Title: "",
		Bounds:      customui.Bounds{X: mapping.Origin.X, Y: mapping.Origin.Y, Width: mapping.LogicalSize.Width, Height: mapping.LogicalSize.Height},
		AlwaysOnTop: true, Theme: "dark",
		Content:     customui.ContentSpec{HTML: measurementHTMLProduct(a), CSS: measurementCSSProduct(), BasePath: "."},
		Measurement: &customui.MeasurementSurfaceSpec{TargetID: previewID},
	}
}

func measurementWindowSpec(frame CaptureFrame, assetName, source string) customui.WindowSpec {
	a := &activeSession{
		frame: frame, reference: frame.Reference, assetPath: assetName, overlayPath: "measurement-overlay.png",
		tool: "point", outputFormat: "concise", status: targetConfirmationInstruction(frame), selectedTarget: frame.SelectedTargetID,
		targetConfirmed: frame.TargetConfirmed, source: strings.TrimSpace(source), phase: PhaseMeasuring,
	}
	return measurementWindowSpecProduct(a)
}

func measurementHTMLProduct(a *activeSession) string {
	disabled := " disabled"
	if a.result != nil {
		disabled = ""
	}
	confirmHidden, confirmedHidden := "", " hidden"
	if a.targetConfirmed {
		confirmHidden, confirmedHidden = " hidden", ""
	}
	hud := ChooseHUDPlacement(a.frame.Snapshot.Mapping, a.reference, a.result)
	microTarget := a.reference.Bounds
	if a.pointer != nil {
		microTarget = Rect{X: a.pointer.X, Y: a.pointer.Y, Width: 1, Height: 1}
	} else if result, ok := resultBounds(a.result); ok {
		microTarget = result
	}
	micro := MicroPlacement(a.frame.Snapshot.Mapping, microTarget)
	return `<main id="measurementRoot">` +
		`<img id="measurementPreview" src="` + html.EscapeString(filepath.Base(a.assetPath)) + `">` +
		`<img id="measurementOverlay" src="` + html.EscapeString(filepath.Base(a.overlayPath)) + `">` +
		`<section id="measurementMicro" class="` + strings.Join(micro.Classes, " ") + `"><span id="measurementMicroValue">` + html.EscapeString(microText(a)) + `</span></section>` +
		`<section id="measurementHUD" class="` + strings.Join(hud.Classes, " ") + `"><p id="measurementHUDValue">` + html.EscapeString(a.conciseResult()) + `</p><p id="referenceInfo">` + html.EscapeString(measurementReferenceSummary(a)) + `</p><p id="measurementStatus">` + html.EscapeString(a.status) + `</p><p id="snapInfo">` + html.EscapeString(snapSummary(a)) + `</p></section>` +
		`<section id="measurementCopyMenu" hidden><button id="copyConcise"` + disabled + `>① 简明数值</button><button id="copyHuman"` + disabled + `>② 完整中文说明</button><button id="copyStructured"` + disabled + `>③ 结构化数据</button></section>` +
		`<section id="measurementInspector" hidden><header><strong>测量详情</strong><button id="closeInspector">关闭</button></header><label>目标<select id="targetWindow">` + targetOptionsHTML(a.frame.Targets, a.selectedTarget) + `</select></label><div class="row"><button id="previousTarget">上一个候选</button><button id="nextTarget">下一个候选</button><button id="confirmTarget"` + confirmHidden + `>确认候选</button><span id="targetConfirmed"` + confirmedHidden + `>已确认</span></div><button id="refreshSnapshot">更新画面</button><label>局部参照<select id="referenceType">` + referenceOptions(a) + `</select></label><label>保存格式<select id="outputFormat">` + outputOptions(a.outputFormat) + `</select></label><button id="saveResult"` + disabled + `>保存结果</button><p id="snapshotInfo">` + html.EscapeString(snapshotSummary(a.frame)+" · "+snapshotTokenSummary(a.snapshotToken())) + `</p><p id="measurementInspectorResult" class="inspectorResult">` + html.EscapeString(a.selectedResult()) + `</p><p id="measurementHint">` + html.EscapeString(measurementHint(a.source)) + `</p></section>` +
		`<section id="measurementToolbar"><button id="toolPoint" aria-pressed="` + boolString(a.tool == "point") + `">点</button><button id="toolRegion" aria-pressed="` + boolString(a.tool == "region") + `">区域</button><button id="toolTwoPoint" aria-pressed="` + boolString(a.tool == "twoPoint") + `">两点</button><button id="toolSpacing" aria-pressed="` + boolString(a.tool == "spacing") + `">两区域</button><span class="separator"></span><span class="snapLabel">磁吸定位：开 · Alt 暂停</span><button id="referenceButton">参照</button><button id="refreshSnapshot">更新画面</button><button id="adjustInterface">调整界面</button><button id="copyMenuButton"` + disabled + `>复制 ▾</button><button id="inspectorButton">详情</button><button id="exitMeasurement">退出</button></section>` +
		`</main>`
}

func measurementCSSProduct() string {
	return `:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#000;color:#f5f8fc}*{box-sizing:border-box}html,body,#measurementRoot{margin:0;width:100%;height:100%;overflow:hidden}#measurementRoot{position:relative;background:#000;user-select:none}#measurementPreview,#measurementOverlay{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block}#measurementOverlay{pointer-events:none;z-index:4}button,select{height:30px;border:1px solid rgba(255,255,255,.16);border-radius:7px;background:#202833;color:#f5f8fc;padding:0 9px}button{cursor:pointer}button[aria-pressed=true]{background:#1677b8;border-color:#58baff}button:disabled{opacity:.42;cursor:default}#measurementToolbar{position:absolute;z-index:20;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px;border:1px solid rgba(255,255,255,.18);border-radius:11px;background:rgba(14,18,24,.92);box-shadow:0 5px 22px rgba(0,0,0,.35);max-width:calc(100vw - 20px)}#measurementToolbar .separator{width:1px;height:22px;background:rgba(255,255,255,.18);margin:0 2px}.snapLabel{font-size:10px;color:#9ee9c2;white-space:nowrap;padding:0 3px}.hud{position:absolute;z-index:12;width:min(330px,calc(100vw - 24px));padding:9px 10px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,18,24,.88);pointer-events:none}.hud.top-left{left:12px;top:12px}.hud.top-right{right:12px;top:12px}.hud.bottom-left{left:12px;bottom:64px}.hud.bottom-right{right:12px;bottom:64px}.hud p{margin:4px 0;font-size:11px;line-height:1.4;white-space:pre-wrap}#measurementHUDValue{color:#fff;font-size:13px}#measurementStatus{color:#92d2ff}#referenceInfo{color:#ffd479;font-variant-numeric:tabular-nums}#snapInfo{color:#9ee9c2}.micro{position:absolute;z-index:13;max-width:250px;padding:5px 7px;border-radius:6px;background:rgba(10,13,18,.84);font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;pointer-events:none;white-space:pre}.micro.top-left{left:14px;top:14px}.micro.top-right{right:14px;top:14px}.micro.bottom-left{left:14px;bottom:64px}.micro.bottom-right{right:14px;bottom:64px}#measurementCopyMenu{position:absolute;z-index:30;left:50%;bottom:58px;transform:translateX(44px);display:flex;flex-direction:column;gap:4px;padding:5px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#151b23}#measurementCopyMenu[hidden],#measurementInspector[hidden]{display:none}#measurementInspector{position:absolute;z-index:25;right:14px;top:14px;width:min(360px,calc(100vw - 28px));max-height:calc(100vh - 86px);overflow:auto;padding:10px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(14,18,24,.96);box-shadow:0 8px 30px rgba(0,0,0,.45)}#measurementInspector header,#measurementInspector .row{display:flex;align-items:center;justify-content:space-between;gap:6px}#measurementInspector label{display:flex;flex-direction:column;gap:4px;margin-top:8px;color:#aebccc;font-size:10px}#measurementInspector select{width:100%}.inspectorResult{max-height:220px;overflow:auto;white-space:pre-wrap;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;background:rgba(0,0,0,.3);padding:7px;border-radius:6px}#measurementHint,#snapshotInfo{font-size:10px;color:#8290a1;white-space:pre-wrap}`
}

func (a *activeSession) conciseResult() string {
	if a.result == nil {
		return "尚无结果"
	}
	return a.result.ConciseText()
}

func (a *activeSession) selectedResult() string {
	if a.result == nil {
		return "尚无结果"
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return "结果编码失败：" + err.Error()
	}
	return outputValue(outputs, a.outputFormat)
}

func selectedTargetTitle(targets []TargetWindow, id string) string {
	for _, target := range targets {
		if target.ID == id {
			return target.Title
		}
	}
	return "候选窗口不可用"
}

func targetConfirmationInstruction(frame CaptureFrame) string {
	if frame.TargetConfirmed {
		return "当前窗口参照已由入口确认：" + selectedTargetTitle(frame.Targets, frame.SelectedTargetID) + "。"
	}
	return "当前候选：" + selectedTargetTitle(frame.Targets, frame.SelectedTargetID) + "。请确认窗口外框，或选择人工参照。"
}

func toolInstruction(tool string) string {
	switch tool {
	case "region":
		return "区域：拖拽创建；点击区域本体或八向控制点可编辑。"
	case "twoPoint":
		return "两点：依次选择两个点。"
	case "spacing":
		return "两区域：依次拖拽两个区域。"
	default:
		return "点：点击冻结画面读取坐标与原始 Capture Pixel 色值。"
	}
}

func referenceOptions(a *activeSession) string {
	window, manual := "", ""
	if a.reference.Type == ReferenceManualRegion || a.manualPending {
		manual = " selected"
	} else {
		window = " selected"
	}
	return `<option value="windowOuterBounds"` + window + `>整个窗口</option><option value="manualRegion"` + manual + `>局部参照</option>`
}

func referenceValue(a *activeSession) string {
	if a.reference.Type == ReferenceManualRegion || a.manualPending {
		return string(ReferenceManualRegion)
	}
	return string(ReferenceWindowOuter)
}

func outputOptions(selected string) string {
	values := []struct{ value, label string }{{"concise", "简明数值"}, {"human", "完整中文说明"}, {"json", "结构化数据"}}
	var builder strings.Builder
	for _, item := range values {
		marker := ""
		if item.value == selected {
			marker = " selected"
		}
		fmt.Fprintf(&builder, `<option value="%s"%s>%s</option>`, item.value, marker, item.label)
	}
	return builder.String()
}

func targetOptionsHTML(targets []TargetWindow, selected string) string {
	var builder strings.Builder
	for _, target := range targets {
		marker := ""
		if target.ID == selected {
			marker = " selected"
		}
		fmt.Fprintf(&builder, `<option value="%s"%s>%s</option>`, html.EscapeString(target.ID), marker, html.EscapeString(target.Title))
	}
	return builder.String()
}

func targetOptions(targets []TargetWindow) []customui.SelectOption {
	options := make([]customui.SelectOption, 0, len(targets))
	for _, target := range targets {
		options = append(options, customui.SelectOption{Value: target.ID, Label: target.Title})
	}
	return options
}

func referenceSummary(reference Reference) string {
	return fmt.Sprintf("参照 %s · x=%.2f y=%.2f w=%.2f h=%.2f logical", reference.Type, reference.Bounds.X, reference.Bounds.Y, reference.Bounds.Width, reference.Bounds.Height)
}

func measurementReferenceSummary(a *activeSession) string {
	if a == nil || a.result == nil || a.result.Region == nil {
		if a != nil && a.reference.Type == ReferenceManualRegion {
			return "边距参照：整个窗口 + 当前局部参照（完成区域测量后显示两组 signed margins）"
		}
		return "边距参照：整个窗口（局部参照暂无可靠证据）"
	}
	target := a.result.Region.Absolute
	references := TwoLevelReferences{Window: a.frame.Reference}
	if a.reference.Type == ReferenceManualRegion && !nearlySameRect(a.reference.Bounds, target) {
		references.Local = &LayoutReference{Reference: a.reference, Label: "局部参照", Source: "manual-region", Reliability: CandidateReliabilityConfirmed}
	}
	relations, err := BuildMarginRelations(target, references)
	if err != nil {
		return referenceSummary(a.reference)
	}
	window := relations.TargetToWindow
	text := fmt.Sprintf("边距参照       左      上      右      下\n整个窗口    %.1f   %.1f   %.1f   %.1f", window.Left, window.Top, window.Right, window.Bottom)
	if relations.TargetToLocal != nil {
		local := *relations.TargetToLocal
		text += fmt.Sprintf("\n局部参照    %.1f   %.1f   %.1f   %.1f", local.Left, local.Top, local.Right, local.Bottom)
	}
	return text
}

func snapshotSummary(frame CaptureFrame) string {
	mapping := frame.Snapshot.Mapping
	return fmt.Sprintf("冻结 %s · display=%s/%d · logical %.0fx%.0f · capture %dx%d px · scale %.3fx%.3f", frame.Snapshot.SampledAt.UTC().Format(time.RFC3339Nano), mapping.DisplayID, mapping.DisplayIndex, mapping.LogicalSize.Width, mapping.LogicalSize.Height, mapping.ImageSize.Width, mapping.ImageSize.Height, mapping.ScaleX, mapping.ScaleY)
}

func measurementHint(source string) string {
	return "入口：" + strings.TrimSpace(source) + " · 1/2/3/4 · Tab/Shift+Tab · Alt 暂停磁吸 · R 参照 · I 详情 · 更新画面 · 调整界面后再次使用任一统一入口继续测量 · Esc 分层退出"
}

func snapSummary(a *activeSession) string {
	if a.snapSuspended {
		return "磁吸定位：暂停（松开 Alt/Option 恢复）"
	}
	if len(a.frame.Targets) == 0 {
		return "磁吸定位：开 · 无真实候选"
	}
	return fmt.Sprintf("磁吸定位：开 · 候选 %d · Tab 切换", len(a.frame.Targets))
}

func microText(a *activeSession) string {
	if a == nil || a.pointer == nil {
		return "移动鼠标查看屏幕 / 窗口 / 区域坐标和源像素颜色"
	}
	var local *LayoutReference
	if a.result != nil && a.result.Region != nil && pointInsideRect(*a.pointer, a.result.Region.Absolute) {
		local = &LayoutReference{Reference: Reference{Type: ReferenceManualRegion, Bounds: a.result.Region.Absolute}, Label: "当前区域", Source: "user-selection", Reliability: CandidateReliabilityConfirmed}
	} else if a.reference.Type == ReferenceManualRegion && pointInsideRect(*a.pointer, a.reference.Bounds) {
		local = &LayoutReference{Reference: a.reference, Label: "局部参照", Source: "manual-region", Reliability: CandidateReliabilityConfirmed}
	}
	coordinates, err := CoordinatesAt(*a.pointer, a.frame.Reference, local)
	if err != nil {
		return fmt.Sprintf("屏幕   %.1f / %.1f\n窗口   —\n区域   —", a.pointer.X, a.pointer.Y)
	}
	region := "—"
	if coordinates.Region != nil {
		region = fmt.Sprintf("%.1f / %.1f", coordinates.Region.X, coordinates.Region.Y)
	}
	colour := "—"
	if pixel, err := a.frame.Snapshot.Mapping.PixelAt(*a.pointer); err == nil {
		if rgb, err := RGBAt(a.image, pixel); err == nil {
			colour = rgb.Hex
		}
	}
	return fmt.Sprintf("屏幕   %.1f / %.1f\n窗口   %.1f / %.1f\n区域   %s\n■ %s", coordinates.Screen.X, coordinates.Screen.Y, coordinates.Window.X, coordinates.Window.Y, region, colour)
}

func pointInsideRect(point Point, bounds Rect) bool {
	return point.X >= bounds.X && point.Y >= bounds.Y && point.X <= bounds.Right() && point.Y <= bounds.Bottom()
}

func outputValue(outputs Outputs, format string) string {
	switch format {
	case "human":
		return outputs.Human
	case "json":
		return outputs.JSON
	default:
		return outputs.Concise
	}
}

func outputFormatLabel(format string) string {
	switch format {
	case "human":
		return "完整中文说明"
	case "json":
		return "结构化数据"
	default:
		return "简明数值"
	}
}

func isOutputFormat(format string) bool {
	return format == "concise" || format == "human" || format == "json"
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

// Backward-compatible helpers retained for deterministic prototype/native parity tests.
func overlayRectStyle(mapping CaptureMapping, rect Rect) string {
	left := (rect.X - mapping.Origin.X) / mapping.LogicalSize.Width * 100
	top := (rect.Y - mapping.Origin.Y) / mapping.LogicalSize.Height * 100
	right := (rect.Right() - mapping.Origin.X) / mapping.LogicalSize.Width * 100
	bottom := (rect.Bottom() - mapping.Origin.Y) / mapping.LogicalSize.Height * 100
	left, top, right, bottom = clampPercent(left), clampPercent(top), clampPercent(right), clampPercent(bottom)
	if right < left {
		left, right = right, left
	}
	if bottom < top {
		top, bottom = bottom, top
	}
	return fmt.Sprintf("left:%.4f%%;top:%.4f%%;width:%.4f%%;height:%.4f%%", left, top, right-left, bottom-top)
}

func clampPercent(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func hudPlacement(mapping CaptureMapping, rect Rect) (string, bool) {
	ref := Reference{Type: ReferenceManualRegion, Bounds: rect}
	placement := ChooseHUDPlacement(mapping, ref, nil)
	limited := rect.Width >= mapping.LogicalSize.Width*.7 || rect.Height >= mapping.LogicalSize.Height*.7
	return placement.Corner, limited
}
