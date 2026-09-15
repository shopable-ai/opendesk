package measurement

import (
	"context"
	"testing"

	"opendesk/pkg/customui"
)

func TestEscHierarchyClosesOnlyInnermostMeasurementState(t *testing.T){
	service,_,_,_:=newSessionService(t);ctx:=context.Background();if err:=service.Open(ctx,"product-menu");err!=nil{t.Fatal(err)};a:=service.active
	_=a.handle(ctx,customui.Event{Type:"measurement.pointerup",Fields:map[string]any{"u":.25,"v":.25}})
	a.copyMenuOpen=true;a.inspectorOpen=true;a.manualPending=true;a.regionHandle=RegionEditBody
	if err:=a.handleKey(ctx,map[string]any{"key":"Escape"});err!=nil{t.Fatal(err)};if a.copyMenuOpen||!a.inspectorOpen||!a.manualPending||a.regionHandle!=RegionEditBody{t.Fatalf("copy menu esc hierarchy failed: %+v",a)}
	if err:=a.handleKey(ctx,map[string]any{"key":"Escape"});err!=nil{t.Fatal(err)};if a.inspectorOpen||!a.manualPending||a.regionHandle!=RegionEditBody{t.Fatal("inspector esc must not pop deeper layers")}
	if err:=a.handleKey(ctx,map[string]any{"key":"Escape"});err!=nil{t.Fatal(err)};if a.regionHandle!=RegionEditNone||!a.manualPending{t.Fatal("local edit esc must precede reference edit")}
	if err:=a.handleKey(ctx,map[string]any{"key":"Escape"});err!=nil{t.Fatal(err)};if a.manualPending{t.Fatal("reference edit esc did not cancel")};if service.Counts().Sessions!=1{t.Fatal("reference edit esc exited session")}
	if err:=a.handleKey(ctx,map[string]any{"key":"Escape"});err!=nil{t.Fatal(err)};if service.Counts().Sessions!=0{t.Fatal("final esc did not exit session")}
}

func TestInspectorShortcutAndAltSuspendRemainInSameSurface(t *testing.T){
	base:=customui.NewMemoryDriver();driver:=&createCountingDriver{Driver:base};capture:=&sessionCapture{};service,err:=NewService(ServiceOptions{Driver:driver,Capture:capture,Clipboard:&sessionClipboard{},BaseDir:t.TempDir()});if err!=nil{t.Fatal(err)};ctx:=context.Background();if err:=service.Open(ctx,"product-menu");err!=nil{t.Fatal(err)};a:=service.active;w:=a.currentWindow()
	if err:=a.handleKey(ctx,map[string]any{"key":"i"});err!=nil{t.Fatal(err)};if !a.inspectorOpen{t.Fatal("I did not open inspector")}
	if err:=a.handleKey(ctx,map[string]any{"key":"Alt","phase":"down","alt":true});err!=nil{t.Fatal(err)};if !a.snapSuspended{t.Fatal("Alt keydown did not suspend snap")}
	if err:=a.handleKey(ctx,map[string]any{"key":"Alt","phase":"up"});err!=nil{t.Fatal(err)};if a.snapSuspended{t.Fatal("Alt keyup did not restore snap")}
	if driver.CreateCount()!=1||a.currentWindow()!=w||capture.Count()!=1{t.Fatalf("shortcut recreated native surface creates=%d captures=%d",driver.CreateCount(),capture.Count())};_=service.Close(ctx)
}

func TestRegionPointerBodyAndHandleEditing(t *testing.T){
	service,_,_,_:=newSessionService(t);ctx:=context.Background();if err:=service.Open(ctx,"product-menu");err!=nil{t.Fatal(err)};a:=service.active
	_=a.handleKey(ctx,map[string]any{"key":"2"});_=a.handle(ctx,customui.Event{Type:"measurement.pointerdown",Fields:map[string]any{"u":.2,"v":.2}});_=a.handle(ctx,customui.Event{Type:"measurement.pointerup",Fields:map[string]any{"u":.6,"v":.6}})
	original:=a.result.Region.Absolute
	center:=original.Center();m:=a.frame.Snapshot.Mapping;imagePoint:=m.LogicalToImage(center);u:=imagePoint.X/float64(m.ImageSize.Width);v:=imagePoint.Y/float64(m.ImageSize.Height)
	_=a.handle(ctx,customui.Event{Type:"measurement.pointerdown",Fields:map[string]any{"u":u,"v":v}});if a.regionHandle!=RegionEditBody{t.Fatalf("body handle=%s",a.regionHandle)}
	_=a.handle(ctx,customui.Event{Type:"measurement.pointerup",Fields:map[string]any{"u":u+.05,"v":v}});moved:=a.result.Region.Absolute;if moved.Width!=original.Width||moved.Height!=original.Height||moved.X==original.X{t.Fatalf("body drag=%+v original=%+v",moved,original)}
	corner:=Point{X:moved.Right(),Y:moved.Bottom()};imagePoint=m.LogicalToImage(corner);u=imagePoint.X/float64(m.ImageSize.Width);v=imagePoint.Y/float64(m.ImageSize.Height)
	_=a.handle(ctx,customui.Event{Type:"measurement.pointerdown",Fields:map[string]any{"u":u,"v":v}});if a.regionHandle!=RegionEditSE{t.Fatalf("corner handle=%s",a.regionHandle)}
	_=a.handle(ctx,customui.Event{Type:"measurement.pointerup",Fields:map[string]any{"u":u+.03,"v":v+.03}});resized:=a.result.Region.Absolute;if resized.X!=moved.X||resized.Y!=moved.Y||resized.Width<=moved.Width||resized.Height<=moved.Height{t.Fatalf("se resize=%+v moved=%+v",resized,moved)};_=service.Close(ctx)
}

func TestTabUsesOnlyRealCaptureCandidates(t *testing.T){service,_,capture,_:=newSessionService(t);ctx:=context.Background();if err:=service.Open(ctx,"product-menu");err!=nil{t.Fatal(err)};a:=service.active;if err:=a.handleKey(ctx,map[string]any{"key":"Tab"});err!=nil{t.Fatal(err)};if a.selectedTarget!="other"||capture.Count()!=2{t.Fatalf("tab candidate=%q captures=%d",a.selectedTarget,capture.Count())};_=service.Close(ctx)}
