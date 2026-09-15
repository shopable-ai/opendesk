package measurement

import (
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
)

var (
	overlayTargetColor=color.RGBA{R:70,G:174,B:255,A:245}
	overlayReferenceColor=color.RGBA{R:255,G:206,B:82,A:245}
	overlayResultColor=color.RGBA{R:113,G:238,B:169,A:250}
)

func RenderOverlayPNG(path string,mapping CaptureMapping,target Reference,reference Reference,result *Result,pendingPoint *Point,pendingRect *Rect)error{
	if mapping.ImageSize.Width<=0||mapping.ImageSize.Height<=0{return fmt.Errorf("measurement overlay requires positive image dimensions")}
	img:=image.NewRGBA(image.Rect(0,0,mapping.ImageSize.Width,mapping.ImageSize.Height))
	drawRect(img,mapping,target.Bounds,overlayTargetColor,false);drawRect(img,mapping,reference.Bounds,overlayReferenceColor,true)
	if pendingPoint!=nil{drawPoint(img,mapping,*pendingPoint,overlayReferenceColor)};if pendingRect!=nil{drawRect(img,mapping,*pendingRect,overlayReferenceColor,true)}
	if result!=nil{switch{case result.Point!=nil:drawPoint(img,mapping,result.Point.Absolute,overlayResultColor);case result.Region!=nil:drawRect(img,mapping,result.Region.Absolute,overlayResultColor,false);drawRegionHandles(img,mapping,result.Region.Absolute,overlayResultColor);case result.TwoPoint!=nil:drawPoint(img,mapping,result.TwoPoint.First,overlayResultColor);drawPoint(img,mapping,result.TwoPoint.Second,overlayResultColor);drawLine(img,logicalPixel(mapping,result.TwoPoint.First),logicalPixel(mapping,result.TwoPoint.Second),overlayResultColor);case result.Spacing!=nil:drawRect(img,mapping,result.Spacing.First,overlayResultColor,false);drawRect(img,mapping,result.Spacing.Second,overlayResultColor,false);drawLine(img,logicalPixel(mapping,result.Spacing.First.Center()),logicalPixel(mapping,result.Spacing.Second.Center()),overlayResultColor)}}
	file,err:=os.OpenFile(path,os.O_CREATE|os.O_TRUNC|os.O_WRONLY,0o600);if err!=nil{return fmt.Errorf("create measurement overlay: %w",err)};defer file.Close();if err:=png.Encode(file,img);err!=nil{return fmt.Errorf("encode measurement overlay: %w",err)};return nil
}

func logicalPixel(mapping CaptureMapping,point Point)image.Point{p:=mapping.LogicalToImage(point);return image.Pt(int(math.Round(p.X)),int(math.Round(p.Y)))}
func rectPixels(mapping CaptureMapping,rect Rect)image.Rectangle{first:=logicalPixel(mapping,Point{X:rect.X,Y:rect.Y});second:=logicalPixel(mapping,Point{X:rect.Right(),Y:rect.Bottom()});minX,maxX:=min(first.X,second.X),max(first.X,second.X);minY,maxY:=min(first.Y,second.Y),max(first.Y,second.Y);return image.Rect(minX,minY,maxX,maxY)}
func drawRect(img *image.RGBA,mapping CaptureMapping,rect Rect,c color.RGBA,dashed bool){r:=rectPixels(mapping,rect);if r.Empty(){return};for x:=r.Min.X;x<=r.Max.X;x++{if !dashed||((x-r.Min.X)/5)%2==0{setSafe(img,x,r.Min.Y,c);setSafe(img,x,r.Max.Y,c)}};for y:=r.Min.Y;y<=r.Max.Y;y++{if !dashed||((y-r.Min.Y)/5)%2==0{setSafe(img,r.Min.X,y,c);setSafe(img,r.Max.X,y,c)}}}
func drawPoint(img *image.RGBA,mapping CaptureMapping,point Point,c color.RGBA){p:=logicalPixel(mapping,point);for d:=-6;d<=6;d++{setSafe(img,p.X+d,p.Y,c);setSafe(img,p.X,p.Y+d,c)}}
func drawRegionHandles(img *image.RGBA,mapping CaptureMapping,rect Rect,c color.RGBA){cx,cy:=rect.X+rect.Width/2,rect.Y+rect.Height/2;points:=[]Point{{rect.X,rect.Y},{cx,rect.Y},{rect.Right(),rect.Y},{rect.Right(),cy},{rect.Right(),rect.Bottom()},{cx,rect.Bottom()},{rect.X,rect.Bottom()},{rect.X,cy}};for _,point:=range points{p:=logicalPixel(mapping,point);for y:=-3;y<=3;y++{for x:=-3;x<=3;x++{setSafe(img,p.X+x,p.Y+y,c)}}}}
func drawLine(img *image.RGBA,first,second image.Point,c color.RGBA){dx:=int(math.Abs(float64(second.X-first.X)));sx:=-1;if first.X<second.X{sx=1};dy:=-int(math.Abs(float64(second.Y-first.Y)));sy:=-1;if first.Y<second.Y{sy=1};err:=dx+dy;for{setSafe(img,first.X,first.Y,c);if first==second{break};e2:=2*err;if e2>=dy{err+=dy;first.X+=sx};if e2<=dx{err+=dx;first.Y+=sy}}}
func setSafe(img *image.RGBA,x,y int,c color.RGBA){if image.Pt(x,y).In(img.Bounds()){img.SetRGBA(x,y,c)}}
