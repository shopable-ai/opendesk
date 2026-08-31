package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
)

const defaultOutputDir = ".runtime/generated/opencv/image-color"

type sourceSpec struct {
	Path   string `json:"path"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type colorSample struct {
	ID       string `json:"id"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Expected string `json:"expected"`
}

type expectedMatch struct {
	Found         bool    `json:"found"`
	X             int     `json:"x"`
	Y             int     `json:"y"`
	Width         int     `json:"width"`
	Height        int     `json:"height"`
	MinConfidence float64 `json:"minConfidence,omitempty"`
}

type pairSpec struct {
	ID           string        `json:"id"`
	Description  string        `json:"description"`
	TemplatePath string        `json:"templatePath"`
	Threshold    float64       `json:"threshold"`
	Expected     expectedMatch `json:"expected"`
}

type fixtureManifest struct {
	SchemaVersion   int           `json:"schemaVersion"`
	Description     string        `json:"description"`
	GeneratedBy     string        `json:"generatedBy"`
	RequiredBackend string        `json:"requiredBackend"`
	Source          sourceSpec    `json:"source"`
	ColorSamples    []colorSample `json:"colorSamples"`
	Pairs           []pairSpec    `json:"pairs"`
}

type panelSpec struct {
	ID          string
	Description string
	Rect        image.Rectangle
	Base        color.NRGBA
	Accent      color.NRGBA
	Variant     int
}

func main() {
	outputDir := flag.String("output", defaultOutputDir, "fixture output directory")
	flag.Parse()

	if err := generateFixtures(*outputDir); err != nil {
		fmt.Fprintf(os.Stderr, "generate OpenCV fixtures: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("OpenCV fixtures generated in %s\n", *outputDir)
}

func generateFixtures(outputDir string) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}

	scene := image.NewNRGBA(image.Rect(0, 0, 320, 240))
	drawBackground(scene)

	panels := []panelSpec{
		{
			ID:          "red-panel",
			Description: "red block with yellow bar and white marker",
			Rect:        image.Rect(24, 32, 88, 80),
			Base:        color.NRGBA{R: 230, G: 40, B: 60, A: 255},
			Accent:      color.NRGBA{R: 250, G: 205, B: 40, A: 255},
			Variant:     0,
		},
		{
			ID:          "green-panel",
			Description: "green block with cyan header and yellow marker",
			Rect:        image.Rect(128, 28, 200, 84),
			Base:        color.NRGBA{R: 35, G: 185, B: 90, A: 255},
			Accent:      color.NRGBA{R: 35, G: 220, B: 225, A: 255},
			Variant:     1,
		},
		{
			ID:          "blue-panel",
			Description: "blue block with magenta rail and cyan marker",
			Rect:        image.Rect(202, 132, 290, 196),
			Base:        color.NRGBA{R: 45, G: 95, B: 225, A: 255},
			Accent:      color.NRGBA{R: 225, G: 55, B: 195, A: 255},
			Variant:     2,
		},
	}

	manifest := fixtureManifest{
		SchemaVersion:   1,
		Description:     "Deterministic color-block fixtures for OpenDesk ImageColor OpenCV template matching tests.",
		GeneratedBy:     "go run ./cmd/generate-opencv-fixtures",
		RequiredBackend: "opencv",
		Source: sourceSpec{
			Path:   fixturePath(outputDir, "scene_color_blocks.png"),
			Width:  scene.Bounds().Dx(),
			Height: scene.Bounds().Dy(),
		},
	}

	for _, panel := range panels {
		drawPanel(scene, panel)
		templateName := "template_" + panel.ID + ".png"
		manifest.Pairs = append(manifest.Pairs, pairSpec{
			ID:           panel.ID,
			Description:  panel.Description,
			TemplatePath: fixturePath(outputDir, templateName),
			Threshold:    0.995,
			Expected: expectedMatch{
				Found:         true,
				X:             panel.Rect.Min.X,
				Y:             panel.Rect.Min.Y,
				Width:         panel.Rect.Dx(),
				Height:        panel.Rect.Dy(),
				MinConfidence: 0.999,
			},
		})
		manifest.ColorSamples = append(manifest.ColorSamples, colorSample{
			ID:       panel.ID + "-base",
			X:        panel.Rect.Min.X + 5,
			Y:        panel.Rect.Min.Y + 5,
			Expected: colorHex(panel.Base),
		})
	}

	if err := writePNG(filepath.Join(outputDir, "scene_color_blocks.png"), scene); err != nil {
		return err
	}
	for _, panel := range panels {
		if err := writePNG(filepath.Join(outputDir, "template_"+panel.ID+".png"), crop(scene, panel.Rect)); err != nil {
			return err
		}
	}

	absent := image.NewNRGBA(image.Rect(0, 0, 52, 44))
	drawAbsentTemplate(absent)
	if err := writePNG(filepath.Join(outputDir, "template_absent.png"), absent); err != nil {
		return err
	}
	manifest.Pairs = append(manifest.Pairs, pairSpec{
		ID:           "absent-pattern",
		Description:  "orange checker pattern that does not occur in the source image",
		TemplatePath: fixturePath(outputDir, "template_absent.png"),
		Threshold:    0.995,
		Expected: expectedMatch{
			Found:  false,
			X:      -1,
			Y:      -1,
			Width:  absent.Bounds().Dx(),
			Height: absent.Bounds().Dy(),
		},
	})

	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	manifestBytes = append(manifestBytes, '\n')
	return os.WriteFile(filepath.Join(outputDir, "pairs.json"), manifestBytes, 0o644)
}

func drawBackground(img *image.NRGBA) {
	for y := 0; y < img.Bounds().Dy(); y++ {
		for x := 0; x < img.Bounds().Dx(); x++ {
			shade := uint8((x/20 + y/16) % 18)
			img.SetNRGBA(x, y, color.NRGBA{R: 24 + shade, G: 31 + shade, B: 45 + shade, A: 255})
		}
	}
	grid := color.NRGBA{R: 58, G: 68, B: 84, A: 255}
	for x := 0; x < img.Bounds().Dx(); x += 40 {
		fillRect(img, image.Rect(x, 0, x+1, img.Bounds().Dy()), grid)
	}
	for y := 0; y < img.Bounds().Dy(); y += 40 {
		fillRect(img, image.Rect(0, y, img.Bounds().Dx(), y+1), grid)
	}
}

func drawPanel(img *image.NRGBA, panel panelSpec) {
	fillRect(img, panel.Rect, panel.Base)
	strokeRect(img, panel.Rect, 2, color.NRGBA{R: 8, G: 12, B: 18, A: 255})
	white := color.NRGBA{R: 245, G: 248, B: 250, A: 255}
	dark := color.NRGBA{R: 18, G: 24, B: 32, A: 255}
	yellow := color.NRGBA{R: 250, G: 205, B: 40, A: 255}
	cyan := color.NRGBA{R: 35, G: 220, B: 225, A: 255}
	x, y := panel.Rect.Min.X, panel.Rect.Min.Y

	switch panel.Variant {
	case 0:
		fillRect(img, image.Rect(x+12, y+11, x+20, y+39), panel.Accent)
		fillRect(img, image.Rect(x+29, y+10, x+53, y+18), white)
		fillRect(img, image.Rect(x+34, y+27, x+54, y+39), dark)
	case 1:
		fillRect(img, image.Rect(x+12, y+12, x+58, y+20), panel.Accent)
		fillRect(img, image.Rect(x+12, y+29, x+22, y+48), yellow)
		fillRect(img, image.Rect(x+31, y+28, x+60, y+46), dark)
	case 2:
		fillRect(img, image.Rect(x+11, y+10, x+29, y+54), panel.Accent)
		fillRect(img, image.Rect(x+39, y+12, x+77, y+22), white)
		fillRect(img, image.Rect(x+43, y+32, x+74, y+53), cyan)
	}
}

func drawAbsentTemplate(img *image.NRGBA) {
	orange := color.NRGBA{R: 235, G: 120, B: 25, A: 255}
	purple := color.NRGBA{R: 115, G: 35, B: 170, A: 255}
	cyan := color.NRGBA{R: 20, G: 225, B: 220, A: 255}
	dark := color.NRGBA{R: 10, G: 14, B: 22, A: 255}
	fillRect(img, img.Bounds(), orange)
	strokeRect(img, img.Bounds(), 3, dark)
	for y := 7; y < img.Bounds().Dy()-7; y += 10 {
		for x := 7; x < img.Bounds().Dx()-7; x += 10 {
			blockColor := purple
			if (x/10+y/10)%2 == 0 {
				blockColor = cyan
			}
			fillRect(img, image.Rect(x, y, x+6, y+6), blockColor)
		}
	}
}

func fillRect(img *image.NRGBA, rect image.Rectangle, value color.NRGBA) {
	draw.Draw(img, rect.Intersect(img.Bounds()), &image.Uniform{C: value}, image.Point{}, draw.Src)
}

func strokeRect(img *image.NRGBA, rect image.Rectangle, thickness int, value color.NRGBA) {
	fillRect(img, image.Rect(rect.Min.X, rect.Min.Y, rect.Max.X, rect.Min.Y+thickness), value)
	fillRect(img, image.Rect(rect.Min.X, rect.Max.Y-thickness, rect.Max.X, rect.Max.Y), value)
	fillRect(img, image.Rect(rect.Min.X, rect.Min.Y, rect.Min.X+thickness, rect.Max.Y), value)
	fillRect(img, image.Rect(rect.Max.X-thickness, rect.Min.Y, rect.Max.X, rect.Max.Y), value)
}

func crop(source *image.NRGBA, rect image.Rectangle) *image.NRGBA {
	destination := image.NewNRGBA(image.Rect(0, 0, rect.Dx(), rect.Dy()))
	draw.Draw(destination, destination.Bounds(), source, rect.Min, draw.Src)
	return destination
}

func writePNG(path string, img image.Image) error {
	var buffer bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestCompression}
	if err := encoder.Encode(&buffer, img); err != nil {
		return fmt.Errorf("encode %s: %w", path, err)
	}
	if err := os.WriteFile(path, buffer.Bytes(), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

func fixturePath(outputDir, name string) string {
	return filepath.ToSlash(filepath.Join(outputDir, name))
}

func colorHex(value color.NRGBA) string {
	return fmt.Sprintf("#%02x%02x%02x", value.R, value.G, value.B)
}
