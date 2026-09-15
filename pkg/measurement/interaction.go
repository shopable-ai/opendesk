package measurement

import "math"

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

var regionEditHandles = []RegionEditHandle{RegionEditN,RegionEditNE,RegionEditE,RegionEditSE,RegionEditS,RegionEditSW,RegionEditW,RegionEditNW}

func DetectRegionEditHandle(point Point, rect Rect, tolerance float64) RegionEditHandle {
	if tolerance <= 0 { tolerance = 6 }
	cx,cy:=rect.X+rect.Width/2,rect.Y+rect.Height/2
	points:=map[RegionEditHandle]Point{
		RegionEditNW:{rect.X,rect.Y},RegionEditN:{cx,rect.Y},RegionEditNE:{rect.Right(),rect.Y},RegionEditE:{rect.Right(),cy},
		RegionEditSE:{rect.Right(),rect.Bottom()},RegionEditS:{cx,rect.Bottom()},RegionEditSW:{rect.X,rect.Bottom()},RegionEditW:{rect.X,cy},
	}
	for _,handle:=range []RegionEditHandle{RegionEditNW,RegionEditNE,RegionEditSE,RegionEditSW,RegionEditN,RegionEditE,RegionEditS,RegionEditW}{p:=points[handle];if math.Abs(point.X-p.X)<=tolerance&&math.Abs(point.Y-p.Y)<=tolerance{return handle}}
	if point.X>=rect.X&&point.X<=rect.Right()&&point.Y>=rect.Y&&point.Y<=rect.Bottom(){return RegionEditBody}
	return RegionEditNone
}

func ApplyRegionEdit(original Rect, handle RegionEditHandle, dx,dy float64, bounds Rect, minSize float64) Rect {
	if minSize <= 0 { minSize = 1 }
	left,top,right,bottom:=original.X,original.Y,original.Right(),original.Bottom()
	switch handle {
	case RegionEditBody:
		left+=dx;right+=dx;top+=dy;bottom+=dy
		if left<bounds.X{d:=bounds.X-left;left+=d;right+=d};if right>bounds.Right(){d:=right-bounds.Right();left-=d;right-=d}
		if top<bounds.Y{d:=bounds.Y-top;top+=d;bottom+=d};if bottom>bounds.Bottom(){d:=bottom-bounds.Bottom();top-=d;bottom-=d}
	case RegionEditN: top+=dy
	case RegionEditNE: top+=dy;right+=dx
	case RegionEditE: right+=dx
	case RegionEditSE: right+=dx;bottom+=dy
	case RegionEditS: bottom+=dy
	case RegionEditSW: left+=dx;bottom+=dy
	case RegionEditW: left+=dx
	case RegionEditNW: left+=dx;top+=dy
	default:return original
	}
	if handle!=RegionEditBody{
		left=clamp(left,bounds.X,bounds.Right());right=clamp(right,bounds.X,bounds.Right());top=clamp(top,bounds.Y,bounds.Bottom());bottom=clamp(bottom,bounds.Y,bounds.Bottom())
		if right-left<minSize{
			if handle==RegionEditW||handle==RegionEditNW||handle==RegionEditSW{left=right-minSize}else{right=left+minSize}
		}
		if bottom-top<minSize{
			if handle==RegionEditN||handle==RegionEditNW||handle==RegionEditNE{top=bottom-minSize}else{bottom=top+minSize}
		}
		left=clamp(left,bounds.X,bounds.Right()-minSize);right=clamp(right,left+minSize,bounds.Right());top=clamp(top,bounds.Y,bounds.Bottom()-minSize);bottom=clamp(bottom,top+minSize,bounds.Bottom())
	}
	return Rect{X:left,Y:top,Width:right-left,Height:bottom-top}
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
	best:=candidates[0];bestScore:=math.Inf(1);for _,candidate:=range candidates{score:=0.0;for _,r:=range occupied{score+=intersectionArea(candidate.rect,r)};if score<bestScore{bestScore=score;best=candidate}}
	return OverlayPlacement{Corner:best.name,Classes:[]string{"hud",best.name}}
}

func MicroPlacement(mapping CaptureMapping, target Rect) OverlayPlacement {
	bounds:=captureLogicalBounds(mapping);corner:="bottom-right"
	if target.Right()+220>bounds.Right(){corner="bottom-left"};if target.Bottom()+80>bounds.Bottom(){if corner=="bottom-right"{corner="top-right"}else{corner="top-left"}}
	return OverlayPlacement{Corner:corner,Classes:[]string{"micro",corner}}
}

func intersectionArea(a,b Rect)float64{left:=math.Max(a.X,b.X);top:=math.Max(a.Y,b.Y);right:=math.Min(a.Right(),b.Right());bottom:=math.Min(a.Bottom(),b.Bottom());if right<=left||bottom<=top{return 0};return(right-left)*(bottom-top)}
