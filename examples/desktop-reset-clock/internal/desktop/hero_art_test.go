package desktop

import (
	"bytes"
	"context"
	"image/png"
	"runtime"
	"strings"
	"testing"
)

func TestC3HeroEmbeddedAndTransparentEdges(t *testing.T) {
	hero, err := loadC3Hero()
	if err != nil {
		t.Fatal(err)
	}
	if len(hero.PNG) == 0 || len(hero.BGRA) != c3HeroWidth*c3HeroHeight*4 {
		t.Fatal("invalid image bytes")
	}
	im, err := png.Decode(bytes.NewReader(hero.PNG))
	if err != nil {
		t.Fatal(err)
	}
	if im.Bounds().Dx() != c3HeroWidth*c3HeroScale || im.Bounds().Dy() != c3HeroHeight*c3HeroScale {
		t.Fatalf("size %v", im.Bounds())
	}
	// Transparent left/bottom, fully visible top/right (outside the rounded card corner).
	for _, xy := range [][2]int{{0, 80}, {80, c3HeroHeight*c3HeroScale - 1}} {
		_, _, _, alpha := im.At(xy[0], xy[1]).RGBA()
		if alpha != 0 {
			t.Fatalf("blend edge %v = %d", xy, alpha)
		}
	}
	for _, xy := range [][2]int{{80, 0}, {c3HeroWidth*c3HeroScale - 1, 80}} {
		_, _, _, alpha := im.At(xy[0], xy[1]).RGBA()
		if alpha != 65535 {
			t.Fatalf("top/right %v faded: %d", xy, alpha)
		}
	}
	visible := false
	for i := 3; i < len(hero.BGRA); i += 4 {
		if hero.BGRA[i] > 60 {
			visible = true
			break
		}
	}
	if !visible {
		t.Fatal("image artwork decoded transparent")
	}
}
func TestC3NewsDensity(t *testing.T) {
	for _, v := range []struct{ count, want int }{{-1, 265}, {0, 265}, {1, 265}, {2, 299}, {3, 333}, {4, 333}} {
		if got := cardHeightForItems(v.count); got != v.want {
			t.Errorf("height(%d) = %d, want %d", v.count, got, v.want)
		}
	}
}

// Resource failure must stop macOS startup before entering AppKit; otherwise a
// blank gradient could be mistaken for a successfully loaded approved design.
func TestC3HeroCorruptionIsReported(t *testing.T) {
	original := c3HeroWebP
	c3HeroWebP = []byte("invalid WebP acceptance fixture")
	t.Cleanup(func() { c3HeroWebP = original })
	art, err := loadC3Hero()
	if err == nil || len(art.PNG) != 0 || len(art.BGRA) != 0 {
		t.Fatalf("corrupt artwork should fail without an image: %v", err)
	}
	if runtime.GOOS == "darwin" {
		err = newNative().Run(context.Background(), func(Action) {})
		if err != nil && strings.Contains(err.Error(), "requires CGO_ENABLED=1") {
			t.Log("AppKit startup unavailable in this non-CGO test binary")
			return
		}
		if err == nil || !strings.Contains(err.Error(), "decode approved C3 artwork") {
			t.Fatalf("macOS startup did not report resource failure: %v", err)
		}
	}
}
