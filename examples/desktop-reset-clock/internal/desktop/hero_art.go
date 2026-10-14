package desktop

import (
	"bytes"
	_ "embed"
	"image"
	"image/draw"
	"image/png"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/webp"
)

// The approved C3 WebP is compiled into the binary on both native platforms.
//
//go:embed assets/r23-c3-reference-hero.webp
var c3HeroWebP []byte

const (
	c3HeroWidth  = 228
	c3HeroHeight = 172
	c3HeroScale  = 2 // Retina raster; native geometry remains in points
)

// Keep in sync with native_darwin.m; an empty state gets one 34pt news row.
func cardHeightForItems(count int) int {
	if count < 1 {
		count = 1
	}
	if count > 3 {
		count = 3
	}
	return 231 + count*34
}

type c3HeroArt struct {
	PNG  []byte // AppKit NSImage: platform-safe PNG, no runtime files
	BGRA []byte // Win32 AlphaBlend: premultiplied, top-down DIB
}

func loadC3Hero() (c3HeroArt, error) {
	src, err := webp.Decode(bytes.NewReader(c3HeroWebP))
	if err != nil {
		return c3HeroArt{}, err
	}
	pixels := image.NewNRGBA(image.Rect(0, 0, c3HeroWidth*c3HeroScale, c3HeroHeight*c3HeroScale))
	xdraw.ApproxBiLinear.Scale(pixels, pixels.Bounds(), src, src.Bounds(), draw.Src, nil)
	for y := 0; y < pixels.Bounds().Dy(); y++ {
		for x := 0; x < pixels.Bounds().Dx(); x++ {
			p := pixels.NRGBAAt(x, y)
			// Only left and bottom blend. Top/right retain the approved opaque pixels.
			fade := 1.0
			if x < 20*c3HeroScale {
				fade *= float64(x) / (20 * c3HeroScale)
			}
			if y > (c3HeroHeight-37)*c3HeroScale {
				fade *= float64(pixels.Bounds().Dy()-1-y) / (36 * c3HeroScale)
			}
			p.A = uint8(float64(p.A)*fade + 0.5)
			pixels.SetNRGBA(x, y, p)
		}
	}
	// Keep the Win32 DIB dimensions and premultiplied-alpha contract unchanged.
	dib := image.NewNRGBA(image.Rect(0, 0, c3HeroWidth, c3HeroHeight))
	xdraw.ApproxBiLinear.Scale(dib, dib.Bounds(), pixels, pixels.Bounds(), draw.Src, nil)
	bgra := make([]byte, c3HeroWidth*c3HeroHeight*4)
	for y := 0; y < c3HeroHeight; y++ {
		for x := 0; x < c3HeroWidth; x++ {
			p := dib.NRGBAAt(x, y)
			i := (y*c3HeroWidth + x) * 4
			bgra[i] = uint8((uint16(p.B)*uint16(p.A) + 127) / 255)
			bgra[i+1] = uint8((uint16(p.G)*uint16(p.A) + 127) / 255)
			bgra[i+2] = uint8((uint16(p.R)*uint16(p.A) + 127) / 255)
			bgra[i+3] = p.A
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, pixels); err != nil {
		return c3HeroArt{}, err
	}
	return c3HeroArt{PNG: output.Bytes(), BGRA: bgra}, nil
}
