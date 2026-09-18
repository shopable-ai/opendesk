package measurement

import (
	"strings"
	"testing"
)

func TestMeasurementWindowSpecUsesDisplaySizedProductSurface(t *testing.T) {
	snapshot, reference := testContext(t)
	frame := CaptureFrame{Snapshot: snapshot, Reference: reference, Targets: []TargetWindow{{ID: "window-1", Title: "Target", PID: 42}}, SelectedTargetID: "window-1"}
	spec := measurementWindowSpec(frame, "snapshot.png", "test")
	if spec.Kind != "measurement" || spec.Title != "" || !spec.AlwaysOnTop {
		t.Fatalf("surface = kind=%q title=%q top=%v", spec.Kind, spec.Title, spec.AlwaysOnTop)
	}
	if spec.Bounds.X != snapshot.Mapping.Origin.X || spec.Bounds.Y != snapshot.Mapping.Origin.Y || spec.Bounds.Width != snapshot.Mapping.LogicalSize.Width || spec.Bounds.Height != snapshot.Mapping.LogicalSize.Height {
		t.Fatalf("bounds=%+v mapping=%+v", spec.Bounds, snapshot.Mapping)
	}
	html := spec.Content.HTML
	for _, token := range []string{"measurementToolbar", "measurementMicro", "measurementInspector", "measurementCopyMenu", "measurementStatus", "referenceInfo", "snapInfo", "toolPoint", "toolRegion", "toolTwoPoint", "toolSpacing", "magnetToggle", "marginToggle", "refreshSnapshot", "adjustInterface", "copyStructured", "referenceButton"} {
		if !strings.Contains(html, token) {
			t.Fatalf("measurement HTML missing %q", token)
		}
	}
	if strings.Contains(html, "<details") || strings.Contains(html, "PID 42") {
		t.Fatalf("details must be independent and PID must not be persistently displayed: %s", html)
	}
	for _, retired := range []string{"measurementHUD", "measurementHUDValue", "class=\"hud"} {
		if strings.Contains(html, retired) {
			t.Fatalf("measurement surface retained redundant corner HUD %q", retired)
		}
	}
	toolbarIndex := strings.Index(html, `id="measurementToolbar"`)
	if toolbarIndex < 0 {
		t.Fatal("measurement toolbar missing")
	}
	toolbar := html[toolbarIndex:]
	for _, label := range []string{">点<", ">区域<", ">两点<", ">两区域<", ">磁吸定位<", ">边距：窗口<", ">更新画面<", ">调整界面<", ">详情<", ">退出<"} {
		if !strings.Contains(toolbar, label) {
			t.Fatalf("bottom toolbar missing current Oracle label %q", label)
		}
	}
	for _, retired := range []string{">参照<", ">复制 ▾<"} {
		if strings.Contains(toolbar, retired) {
			t.Fatalf("bottom toolbar retained obsolete P0 control %q", retired)
		}
	}
	inspectorIndex := strings.Index(html, `id="measurementInspector"`)
	if inspectorIndex < 0 || inspectorIndex >= toolbarIndex {
		t.Fatal("independent Inspector must be rendered outside the bottom toolbar")
	}
	inspector := html[inspectorIndex:toolbarIndex]
	for _, relocated := range []string{"measurementStatus", "referenceInfo", "snapInfo"} {
		if !strings.Contains(inspector, relocated) {
			t.Fatalf("Inspector lost relocated supplemental information %q", relocated)
		}
	}
	for _, preserved := range []string{"选择局部参照", "复制结构化数据", "更多复制格式", "简明数值", "完整中文说明", "结构化数据", "保存结果"} {
		if !strings.Contains(inspector, preserved) {
			t.Fatalf("Inspector lost preserved low-frequency capability %q", preserved)
		}
	}
}

func TestHUDPlacementMatchesFrozenOracleAndMarksLargeTarget(t *testing.T) {
	mapping, err := NewCaptureMapping(Point{X: -100, Y: 20}, Size{Width: 1000, Height: 800}, PixelSize{Width: 2000, Height: 1600}, "display", 1)
	if err != nil {
		t.Fatal(err)
	}
	corner, constrained := hudPlacement(mapping, Rect{X: -80, Y: 40, Width: 100, Height: 100})
	if corner != "top-right" || constrained {
		t.Fatalf("top-left target => %q constrained=%v", corner, constrained)
	}
	corner, constrained = hudPlacement(mapping, Rect{X: 20, Y: 100, Width: 800, Height: 650})
	if !constrained {
		t.Fatalf("large target must enter constrained HUD mode, got corner=%q constrained=%v", corner, constrained)
	}
}

func TestOverlayRectStyleClipsCrossDisplayBounds(t *testing.T) {
	mapping, err := NewCaptureMapping(Point{X: -100, Y: 0}, Size{Width: 500, Height: 300}, PixelSize{Width: 1000, Height: 600}, "display", 1)
	if err != nil {
		t.Fatal(err)
	}
	style := overlayRectStyle(mapping, Rect{X: -200, Y: -20, Width: 700, Height: 400})
	for _, token := range []string{"left:0.0000%", "top:0.0000%", "width:100.0000%", "height:100.0000%"} {
		if !strings.Contains(style, token) {
			t.Fatalf("style %q missing %q", style, token)
		}
	}
}
