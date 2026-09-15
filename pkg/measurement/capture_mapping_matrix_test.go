package measurement

import (
	"math"
	"testing"
)

func TestCaptureMappingDPIMatrixRoundTripsLogicalCoordinates(t *testing.T){
	cases:=[]struct{name string;origin Point;logical Size;scale float64;display string}{
		{"100-primary",Point{0,0},Size{1920,1080},1,"primary"},
		{"125-right",Point{1920,0},Size{1536,864},1.25,"right"},
		{"150-left-negative",Point{-1706,0},Size{1706,960},1.5,"left"},
		{"200-upper",Point{0,-900},Size{1440,900},2,"upper"},
	}
	for _,tc:=range cases{t.Run(tc.name,func(t *testing.T){
		pixels:=PixelSize{Width:int(math.Round(tc.logical.Width*tc.scale)),Height:int(math.Round(tc.logical.Height*tc.scale))}
		m,err:=NewCaptureMapping(tc.origin,tc.logical,pixels,tc.display,1);if err!=nil{t.Fatal(err)}
		points:=[]Point{{tc.origin.X,tc.origin.Y},{tc.origin.X+tc.logical.Width/2,tc.origin.Y+tc.logical.Height/2},{tc.origin.X+tc.logical.Width-1,tc.origin.Y+tc.logical.Height-1}}
		for _,p:=range points{imagePoint:=m.LogicalToImage(p);roundTrip:=m.ImageToLogical(imagePoint);if math.Abs(roundTrip.X-p.X)>1e-9||math.Abs(roundTrip.Y-p.Y)>1e-9{t.Fatalf("round trip %v -> %v -> %v",p,imagePoint,roundTrip)}}
	})}
}

func TestCaptureMappingKeepsDisplaySpacesSeparate(t *testing.T){
	left,err:=NewCaptureMapping(Point{X:-1280,Y:0},Size{Width:1280,Height:1024},PixelSize{Width:1280,Height:1024},"left",1);if err!=nil{t.Fatal(err)}
	right,err:=NewCaptureMapping(Point{X:0,Y:0},Size{Width:1920,Height:1080},PixelSize{Width:3840,Height:2160},"right",2);if err!=nil{t.Fatal(err)}
	pointOnLeft:=Point{X:-640,Y:500}
	if _,inside:=left.PixelAt(pointOnLeft);!inside{t.Fatal("left-display point should be inside left capture")}
	if _,inside:=right.PixelAt(pointOnLeft);inside{t.Fatal("left-display point must not be silently interpreted in right capture")}
	pointOnRight:=Point{X:960,Y:540}
	if _,inside:=right.PixelAt(pointOnRight);!inside{t.Fatal("right-display point should be inside right capture")}
	if _,inside:=left.PixelAt(pointOnRight);inside{t.Fatal("right-display point must not be silently interpreted in left capture")}
}

func TestCaptureMappingDesktopHoleRemainsOutsideCapture(t *testing.T){
	m,err:=NewCaptureMapping(Point{X:0,Y:0},Size{Width:1920,Height:1080},PixelSize{Width:1920,Height:1080},"primary",1);if err!=nil{t.Fatal(err)}
	for _,point:=range []Point{{X:-1,Y:200},{X:100,Y:-1},{X:1920,Y:500},{X:100,Y:1080},{X:-500,Y:-500}}{if _,inside:=m.PixelAt(point);inside{t.Fatalf("desktop-hole/outside point reported inside: %+v",point)}}
}

func TestReferenceAndMeasurementMayUseNegativeScreenLogicalCoordinates(t *testing.T){
	m,err:=NewCaptureMapping(Point{X:-1440,Y:-900},Size{Width:1440,Height:900},PixelSize{Width:2160,Height:1350},"upper-left",2);if err!=nil{t.Fatal(err)}
	ref:=Reference{Type:ReferenceWindowOuter,Bounds:Rect{X:-1300,Y:-800,Width:600,Height:500},Window:&WindowIdentity{ID:"w",PID:1,Title:"Fixture"}}
	snapshot:=Snapshot{SampledAt:testContextTime(),Mapping:m}
	result,err:=BuildRegionResult(snapshot,ref,Rect{X:-1200,Y:-700,Width:100,Height:80});if err!=nil{t.Fatal(err)}
	if result.Region.Relative.X!=100||result.Region.Relative.Y!=100{t.Fatalf("relative geometry=%+v",result.Region.Relative)}
}

func testContextTime() time.Time { return time.Date(2026,9,15,0,0,0,0,time.UTC) }
