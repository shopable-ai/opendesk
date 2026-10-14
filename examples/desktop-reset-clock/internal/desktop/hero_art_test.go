package desktop

import (
	"bytes"
	"image/png"
	"testing"
)

func TestC3HeroEmbeddedAndTransparentEdges(t *testing.T) {
	hero,err:=loadC3Hero()
	if err!=nil {t.Fatal(err)}
	if len(hero.PNG)==0||len(hero.BGRA)!=c3HeroWidth*c3HeroHeight*4 {t.Fatal("invalid image bytes")}
	im,err:=png.Decode(bytes.NewReader(hero.PNG))
	if err!=nil {t.Fatal(err)}
	if im.Bounds().Dx()!=c3HeroWidth||im.Bounds().Dy()!=c3HeroHeight {t.Fatalf("size %v",im.Bounds())}
	for _,xy:=range [][2]int{{0,40},{50,0},{50,c3HeroHeight-1}} {
		i:=(xy[1]*c3HeroWidth+xy[0])*4
		if hero.BGRA[i+3]!=0 {t.Fatalf("fade missing at %v",xy)}
	}
	visible:=false
	for i:=3;i<len(hero.BGRA);i+=4 {if hero.BGRA[i]>60 {visible=true;break}}
	if !visible {t.Fatal("image artwork decoded transparent")}
}
func TestC3NewsDensity(t *testing.T) {
	for _,v:=range []struct{count,want int}{{-1,265},{0,265},{1,265},{2,299},{3,333},{4,333}} {
		if got:=cardHeightForItems(v.count);got!=v.want {t.Errorf("height(%d) = %d, want %d",v.count,got,v.want)}
	}
}
