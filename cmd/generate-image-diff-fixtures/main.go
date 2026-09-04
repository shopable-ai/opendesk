package main

import (
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
)

const defaultOutputDir = ".runtime/generated/image-color/fixtures"

func main() {
	outputDir := flag.String("output", defaultOutputDir, "fixture output directory")
	flag.Parse()

	if err := generateFixtures(*outputDir); err != nil {
		fmt.Fprintf(os.Stderr, "generate ImageColor.diff fixtures: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("ImageColor.diff fixtures generated in %s\n", *outputDir)
}

func generateFixtures(outputDir string) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}

	expected := newPatternImage(16, 12)
	identical := cloneImage(expected)
	rgb := cloneImage(expected)
	adjust(rgb, 2, 1, 8, 0, 0, 0)
	adjust(rgb, 4, 2, 0, 9, 0, 0)
	adjust(rgb, 11, 8, 0, 0, 20, 0)
	adjust(rgb, 12, 9, 12, -12, 12, 0)

	alpha := cloneImage(expected)
	alpha.SetNRGBA(7, 5, withAlpha(alpha.NRGBAAt(7, 5), 127))

	ignored := cloneImage(expected)
	adjust(ignored, 1, 1, 30, 0, 0, 0)
	adjust(ignored, 2, 1, 0, 30, 0, 0)
	adjust(ignored, 3, 2, 0, 0, 30, 0)
	adjust(ignored, 4, 2, 30, 0, 0, 0)
	adjust(ignored, 14, 10, 0, 0, 30, 0)

	fixtures := []struct {
		name  string
		image image.Image
	}{
		{name: "expected.png", image: expected},
		{name: "actual-identical.png", image: identical},
		{name: "actual-rgb.png", image: rgb},
		{name: "actual-alpha.png", image: alpha},
		{name: "actual-ignore.png", image: ignored},
		{name: "different-size.png", image: newPatternImage(12, 8)},
	}

	for _, fixture := range fixtures {
		if err := writePNG(filepath.Join(outputDir, fixture.name), fixture.image); err != nil {
			return err
		}
	}
	return nil
}

func newPatternImage(width, height int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetNRGBA(x, y, color.NRGBA{
				R: uint8(32 + x*7),
				G: uint8(40 + y*11),
				B: uint8(48 + ((x*3+y*5)%9)*18),
				A: 255,
			})
		}
	}
	return img
}

func cloneImage(source *image.NRGBA) *image.NRGBA {
	destination := image.NewNRGBA(source.Bounds())
	draw.Draw(destination, destination.Bounds(), source, source.Bounds().Min, draw.Src)
	return destination
}

func adjust(img *image.NRGBA, x, y, red, green, blue, alpha int) {
	value := img.NRGBAAt(x, y)
	value.R = uint8(int(value.R) + red)
	value.G = uint8(int(value.G) + green)
	value.B = uint8(int(value.B) + blue)
	value.A = uint8(int(value.A) + alpha)
	img.SetNRGBA(x, y, value)
}

func withAlpha(value color.NRGBA, alpha uint8) color.NRGBA {
	value.A = alpha
	return value
}

func writePNG(path string, img image.Image) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	encoder := png.Encoder{CompressionLevel: png.BestCompression}
	encodeErr := encoder.Encode(file, img)
	closeErr := file.Close()
	if encodeErr != nil {
		return encodeErr
	}
	return closeErr
}
