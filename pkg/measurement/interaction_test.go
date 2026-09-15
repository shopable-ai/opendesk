package measurement

import "testing"

func TestRegionEditBodyPreservesSizeAndClampsToCapture(t *testing.T){
	bounds:=Rect{X:-100,Y:0,Width:200,Height:100};original:=Rect{X:-80,Y:20,Width:40,Height:30}
	moved:=ApplyRegionEdit(original,RegionEditBody,500,500,bounds,1)
	if moved.Width!=original.Width||moved.Height!=original.Height{t.Fatalf("body drag changed size: %+v",moved)}
	if moved.Right()>bounds.Right()||moved.Bottom()>bounds.Bottom(){t.Fatalf("body drag escaped bounds: %+v",moved)}
}

func TestRegionEditEightHandlesOnlyMoveOwnedEdges(t *testing.T){
	bounds:=Rect{X:0,Y:0,Width:200,Height:200};original:=Rect{X:50,Y:60,Width:80,Height:70}
	cases:=map[RegionEditHandle]Rect{
		RegionEditN:{X:50,Y:50,Width:80,Height:80},RegionEditNE:{X:50,Y:50,Width:90,Height:80},RegionEditE:{X:50,Y:60,Width:90,Height:70},RegionEditSE:{X:50,Y:60,Width:90,Height:80},
		RegionEditS:{X:50,Y:60,Width:80,Height:80},RegionEditSW:{X:40,Y:60,Width:90,Height:80},RegionEditW:{X:40,Y:60,Width:90,Height:70},RegionEditNW:{X:40,Y:50,Width:90,Height:80},
	}
	for handle,want:=range cases{dx,dy:=10.0,10.0;if handle==RegionEditN||handle==RegionEditNE||handle==RegionEditNW{dy=-10};if handle==RegionEditW||handle==RegionEditSW||handle==RegionEditNW{dx=-10};got:=ApplyRegionEdit(original,handle,dx,dy,bounds,1);if got!=want{t.Fatalf("handle %s got=%+v want=%+v",handle,got,want)}}
}

func TestDetectRegionEditHandlePrefersHandlesThenBody(t *testing.T){r:=Rect{X:10,Y:10,Width:100,Height:80};cases:=map[Point]RegionEditHandle{{10,10}:RegionEditNW,{60,10}:RegionEditN,{110,50}:RegionEditE,{60,50}:RegionEditBody,{200,200}:RegionEditNone};for p,want:=range cases{if got:=DetectRegionEditHandle(p,r,4);got!=want{t.Fatalf("point %+v got=%s want=%s",p,got,want)}}}

func TestChooseHUDPlacementMinimizesOverlapDeterministically(t *testing.T){m,err:=NewCaptureMapping(Point{0,0},Size{Width:1000,Height:800},PixelSize{Width:1000,Height:800},"display",1);if err!=nil{t.Fatal(err)};ref:=Reference{Type:ReferenceManualRegion,Bounds:Rect{X:700,Y:550,Width:280,Height:230}};placement:=ChooseHUDPlacement(m,ref,nil);if placement.Corner!="top-left"{t.Fatalf("placement=%+v",placement)}}

func TestMicroPlacementFlipsAtDisplayEdges(t *testing.T){m,err:=NewCaptureMapping(Point{-100,20},Size{Width:500,Height:300},PixelSize{Width:500,Height:300},"display",1);if err!=nil{t.Fatal(err)};if got:=MicroPlacement(m,Rect{X:250,Y:220,Width:130,Height:80}).Corner;got!="top-left"{t.Fatalf("micro placement=%s",got)}}
