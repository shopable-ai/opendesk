package measurement

import (
	"image/png"
	"os"
	"testing"
	"time"
)

func TestRenderOverlayPNGUsesCanonicalMappingDimensions(t *testing.T){mapping,err:=NewCaptureMapping(Point{X:-10,Y:20},Size{Width:100,Height:50},PixelSize{Width:200,Height:100},"display",1);if err!=nil{t.Fatal(err)};ref:=Reference{Type:ReferenceWindowOuter,Bounds:Rect{X:0,Y:25,Width:50,Height:30},Window:&WindowIdentity{ID:"w",PID:1}};result,err:=BuildRegionResult(Snapshot{SampledAt:time.Now(),Mapping:mapping},ref,Rect{X:10,Y:30,Width:20,Height:10});if err!=nil{t.Fatal(err)};path:=t.TempDir()+"/overlay.png";if err:=RenderOverlayPNG(path,mapping,ref,ref,&result,nil,nil);err!=nil{t.Fatal(err)};file,err:=os.Open(path);if err!=nil{t.Fatal(err)};defer file.Close();img,err:=png.Decode(file);if err!=nil{t.Fatal(err)};if img.Bounds().Dx()!=mapping.ImageSize.Width||img.Bounds().Dy()!=mapping.ImageSize.Height{t.Fatalf("overlay size=%v mapping=%+v",img.Bounds(),mapping.ImageSize)};nonTransparent:=false;for y:=0;y<img.Bounds().Dy()&&!nonTransparent;y++{for x:=0;x<img.Bounds().Dx();x++{_,_,_,a:=img.At(x,y).RGBA();if a!=0{nonTransparent=true;break}}};if !nonTransparent{t.Fatal("overlay contains no annotation pixels")}}
