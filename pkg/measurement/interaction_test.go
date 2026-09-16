package measurement

import "testing"

func TestDeprecatedRegionEditHelpersRemainInert(t *testing.T){
	bounds:=Rect{X:-100,Y:0,Width:200,Height:100};original:=Rect{X:-80,Y:20,Width:40,Height:30}
	if got:=DetectRegionEditHandle(original.Center(),original,6);got!=RegionEditNone{t.Fatalf("Frozen Oracle forbids post-lock Region handles: got=%q",got)}
	for _,handle:=range []RegionEditHandle{RegionEditBody,RegionEditN,RegionEditNE,RegionEditE,RegionEditSE,RegionEditS,RegionEditSW,RegionEditW,RegionEditNW}{
		if got:=ApplyRegionEdit(original,handle,25,15,bounds,1);got!=original{t.Fatalf("deprecated Region edit mutated geometry handle=%q got=%+v want=%+v",handle,got,original)}
	}
}

func TestChooseHUDPlacementMinimizesOverlapDeterministically(t *testing.T){m,err:=NewCaptureMapping(Point{0,0},Size{Width:1000,Height:800},PixelSize{Width:1000,Height:800},"display",1);if err!=nil{t.Fatal(err)};ref:=Reference{Type:ReferenceManualRegion,Bounds:Rect{X:700,Y:550,Width:280,Height:230}};placement:=ChooseHUDPlacement(m,ref,nil);if placement.Corner!="top-left"{t.Fatalf("placement=%+v",placement)}}

func TestMicroPlacementFlipsAtDisplayEdges(t *testing.T){m,err:=NewCaptureMapping(Point{-100,20},Size{Width:500,Height:300},PixelSize{Width:500,Height:300},"display",1);if err!=nil{t.Fatal(err)};if got:=MicroPlacement(m,Rect{X:250,Y:220,Width:130,Height:80}).Corner;got!="top-left"{t.Fatalf("micro placement=%s",got)}}
