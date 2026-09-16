package measurement

import "math"

// RegionEditHandle is retained only as a compatibility sentinel for the
// pre-Frozen-Oracle region-edit path. The current product contract never enters
// post-lock move/resize editing: a new valid Region drag starts a new
// measurement instead.
type RegionEditHandle string

const (
	RegionEditNone RegionEditHandle = ""
	RegionEditBody RegionEditHandle = "body"
	RegionEditN RegionEditHandle = "n"
	RegionEditNE RegionEditHandle = "ne"
	RegionEditE RegionEditHandle = "e"
	RegionEditSE RegionEditHandle = "se"
	RegionEditS RegionEditHandle = "s"
	RegionEditSW RegionEditHandle = "sw"
	RegionEditW RegionEditHandle = "w"
	RegionEditNW RegionEditHandle = "nw"
)

// DetectRegionEditHandle is intentionally inert. Region handles are not part of
// the Frozen Oracle and must not be rediscovered by Production.
func DetectRegionEditHandle(point Point, rect Rect, tolerance float64) RegionEditHandle {
	return RegionEditNone
}

// ApplyRegionEdit is intentionally inert. It remains only so stale internal
// compatibility branches fail closed instead of reintroducing body/8-handle
// editing. Current Region adjustment is a fresh measurement gesture.
func ApplyRegionEdit(original Rect, handle RegionEditHandle, dx,dy float64, bounds Rect, minSize float64) Rect {
	return original
}

func captureLogicalBounds(mapping CaptureMapping) Rect { return Rect{X:mapping.Origin.X,Y:mapping.Origin.Y,Width:mapping.LogicalSize.Width,Height:mapping.LogicalSize.Height} }

func clamp(v,minV,maxV float64)float64{if v<minV{return minV};if v>maxV{return maxV};return v}

func resultBounds(result *Result) (Rect,bool) {
	if result==nil{return Rect{},false}
	switch{case result.Region!=nil:return result.Region.Absolute,true;case result.Point!=nil:return Rect{X:result.Point.Absolute.X-1,Y:result.Point.Absolute.Y-1,Width:2,Height:2},true;case result.TwoPoint!=nil:return RectFromPoints(result.TwoPoint.First,result.TwoPoint.Second),true;case result.Spacing!=nil:
		a,b:=result.Spacing.First,result.Spacing.Second;left:=math.Min(a.X,b.X);top:=math.Min(a.Y,b.Y);right:=math.Max(a.Right(),b.Right());bottom:=math.Max(a.Bottom(),b.Bottom());return Rect{X:left,Y:top,Width:right-left,Height:bottom-top},true}
	return Rect{},false
}

type OverlayPlacement struct{Corner string;Classes []string}

func ChooseHUDPlacement(mapping CaptureMapping, reference Reference, result *Result) OverlayPlacement {
	bounds:=captureLogicalBounds(mapping)
	occupied:=[]Rect{reference.Bounds};if r,ok:=resultBounds(result);ok{occupied=append(occupied,r)}
	boxW:=math.Min(280,bounds.Width*.32);boxH:=math.Min(180,bounds.Height*.28);margin:=12.0
	candidates:=[]struct{name string;rect Rect}{{"top-left",Rect{bounds.X+margin,bounds.Y+margin,boxW,boxH}},{"top-right",Rect{bounds.Right()-margin-boxW,bounds.Y+margin,boxW,boxH}},{"bottom-left",Rect{bounds.X+margin,bounds.Bottom()-margin-boxH,boxW,boxH}},{"bottom-right",Rect{bounds.Right()-margin-boxW,bounds.Bottom()-margin-boxH,boxW,boxH}}}
	best:=candidates[0];bestOverlap:=math.Inf(1);bestDistance:=-1.0
	for _,candidate:=range candidates{
		overlap:=0.0;distance:=0.0
		for _,r:=range occupied{
			overlap+=intersectionArea(candidate.rect,r)
			dx:=candidate.rect.Center().X-r.Center().X;dy:=candidate.rect.Center().Y-r.Center().Y
			distance+=dx*dx+dy*dy
		}
		// Overlap is the primary product rule. When several corners cover the
		// same area, prefer the corner farthest from the measured/reference
		// geometry so top-left content deterministically chooses bottom-right.
		if overlap<bestOverlap || (math.Abs(overlap-bestOverlap)<1e-9 && distance>bestDistance){bestOverlap=overlap;bestDistance=distance;best=candidate}
	}
	return OverlayPlacement{Corner:best.name,Classes:[]string{"hud",best.name}}
}

func MicroPlacement(mapping CaptureMapping, target Rect) OverlayPlacement {
	bounds:=captureLogicalBounds(mapping);corner:="bottom-right"
	if target.Right()+220>bounds.Right(){corner="bottom-left"};if target.Bottom()+80>bounds.Bottom(){if corner=="bottom-right"{corner="top-right"}else{corner="top-left"}}
	return OverlayPlacement{Corner:corner,Classes:[]string{"micro",corner}}
}

func intersectionArea(a,b Rect)float64{left:=math.Max(a.X,b.X);top:=math.Max(a.Y,b.Y);right:=math.Min(a.Right(),b.Right());bottom:=math.Min(a.Bottom(),b.Bottom());if right<=left||bottom<=top{return 0};return(right-left)*(bottom-top)}
