package measurement

import (
	"strings"
	"testing"
)

func TestMeasurementWindowSpecUsesDisplaySizedProductSurface(t *testing.T){
	snapshot,reference:=testContext(t)
	frame:=CaptureFrame{Snapshot:snapshot,Reference:reference,Targets:[]TargetWindow{{ID:"window-1",Title:"Target",PID:42}},SelectedTargetID:"window-1"}
	spec:=measurementWindowSpec(frame,"snapshot.png","test")
	if spec.Kind!="measurement"||spec.Title!=""||!spec.AlwaysOnTop{t.Fatalf("surface = kind=%q title=%q top=%v",spec.Kind,spec.Title,spec.AlwaysOnTop)}
	if spec.Bounds.X!=snapshot.Mapping.Origin.X||spec.Bounds.Y!=snapshot.Mapping.Origin.Y||spec.Bounds.Width!=snapshot.Mapping.LogicalSize.Width||spec.Bounds.Height!=snapshot.Mapping.LogicalSize.Height{t.Fatalf("bounds=%+v mapping=%+v",spec.Bounds,snapshot.Mapping)}
	html:=spec.Content.HTML
	for _,token:=range []string{"measurementToolbar","measurementHUD","measurementMicro","measurementInspector","measurementCopyMenu","toolPoint","toolRegion","toolTwoPoint","toolSpacing","① 简明数值","② 完整中文说明","③ 结构化数据"}{if !strings.Contains(html,token){t.Fatalf("measurement HTML missing %q",token)}}
	if strings.Contains(html,"<details")||strings.Contains(html,"PID 42"){t.Fatalf("details must be independent and PID must not be persistently displayed: %s",html)}
	toolbar:=html[strings.Index(html,"id=\"measurementToolbar\""):]
	for _,label:=range []string{">点<",">区域<",">两点<",">两区域<",">参照<",">复制 ▾<",">详情<",">退出<"}{if !strings.Contains(toolbar,label){t.Fatalf("bottom toolbar missing %q",label)}}
}

func TestHUDPlacementOpposesTargetAndMarksLargeTarget(t *testing.T){mapping,err:=NewCaptureMapping(Point{X:-100,Y:20},Size{Width:1000,Height:800},PixelSize{Width:2000,Height:1600},"display",1);if err!=nil{t.Fatal(err)};corner,constrained:=hudPlacement(mapping,Rect{X:-80,Y:40,Width:100,Height:100});if corner!="bottom-right"||constrained{t.Fatalf("top-left target => %q constrained=%v",corner,constrained)};corner,constrained=hudPlacement(mapping,Rect{X:20,Y:100,Width:800,Height:650});if !constrained{t.Fatalf("large target must enter constrained HUD mode, got corner=%q constrained=%v",corner,constrained)}}
func TestOverlayRectStyleClipsCrossDisplayBounds(t *testing.T){mapping,err:=NewCaptureMapping(Point{X:-100,Y:0},Size{Width:500,Height:300},PixelSize{Width:1000,Height:600},"display",1);if err!=nil{t.Fatal(err)};style:=overlayRectStyle(mapping,Rect{X:-200,Y:-20,Width:700,Height:400});for _,token:=range []string{"left:0.0000%","top:0.0000%","width:100.0000%","height:100.0000%"}{if !strings.Contains(style,token){t.Fatalf("style %q missing %q",style,token)}}}
