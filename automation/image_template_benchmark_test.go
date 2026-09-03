package automation

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"testing"
)

// BenchmarkImageColorTemplate measures the canonical matcher after image
// decoding. It intentionally records matching cost (rather than PNG/base64
// decoding cost), and covers representative desktop screenshot/template sizes.
func BenchmarkImageColorTemplate(b *testing.B) {
	resolutions := []struct {
		name          string
		width, height int
	}{
		{"1280x720", 1280, 720},
		{"1920x1080", 1920, 1080},
		{"2560x1440", 2560, 1440},
	}
	templates := []struct {
		name          string
		width, height int
	}{
		{"24x24", 24, 24},
		{"80x40", 80, 40},
		{"200x100", 200, 100},
	}

	for _, resolution := range resolutions {
		for _, templateSize := range templates {
			source, template := templateBenchmarkScene(resolution.width, resolution.height, templateSize.width, templateSize.height)
			roi := imageTemplateRegion{X: 0, Y: 0, Width: min(600, resolution.width), Height: min(400, resolution.height)}
			cases := []struct {
				name    string
				many    bool
				options imageTemplateOptions
			}{
				{"findImage/full/single-scale", false, imageTemplateOptions{Threshold: 0.85, Scales: []float64{1}, MaxResults: defaultTemplateMatchMaxResults}},
				{"findImage/roi/single-scale", false, imageTemplateOptions{Threshold: 0.85, Region: &roi, Scales: []float64{1}, MaxResults: defaultTemplateMatchMaxResults}},
				{"findImage/full/multi-scale", false, imageTemplateOptions{Threshold: 0.85, Scales: []float64{0.9, 1, 1.1}, MaxResults: defaultTemplateMatchMaxResults}},
				{"findImage/roi/multi-scale", false, imageTemplateOptions{Threshold: 0.85, Region: &roi, Scales: []float64{0.9, 1, 1.1}, MaxResults: defaultTemplateMatchMaxResults}},
				{"findImages/full", true, imageTemplateOptions{Threshold: 0.85, Scales: []float64{1}, MaxResults: defaultTemplateMatchMaxResults}},
				{"findImages/roi", true, imageTemplateOptions{Threshold: 0.85, Region: &roi, Scales: []float64{1}, MaxResults: defaultTemplateMatchMaxResults}},
			}
			for _, benchmark := range cases {
				b.Run(fmt.Sprintf("%s/template-%s/%s", resolution.name, templateSize.name, benchmark.name), func(b *testing.B) {
					b.ReportAllocs()
					b.ResetTimer()
					for iteration := 0; iteration < b.N; iteration++ {
						if benchmark.many {
							grids, err := findTemplateCandidates(source, template, benchmark.options)
							if err != nil {
								b.Fatal(err)
							}
							if matches := selectDistinctTemplateCandidates(grids, benchmark.options.Threshold, benchmark.options.MaxResults); len(matches) == 0 {
								b.Fatal("expected at least one template match")
							}
						} else {
							match, err := findBestTemplateCandidate(source, template, benchmark.options)
							if err != nil {
								b.Fatal(err)
							}
							if match.X < 0 || match.Confidence < benchmark.options.Threshold {
								b.Fatal("expected template match")
							}
						}
					}
				})
			}
		}
	}
}

func templateBenchmarkScene(width, height, templateWidth, templateHeight int) (*image.NRGBA, *image.NRGBA) {
	source := image.NewNRGBA(image.Rect(0, 0, width, height))
	draw.Draw(source, source.Bounds(), &image.Uniform{C: color.NRGBA{R: 5, G: 9, B: 13, A: 255}}, image.Point{}, draw.Src)
	template := templateTestPattern(templateWidth, templateHeight, 13)
	positions := []image.Point{
		{X: 2, Y: 2},
		{X: width/2 - templateWidth/2, Y: height/3 - templateHeight/2},
		{X: width - templateWidth - 3, Y: height - templateHeight - 3},
	}
	for _, point := range positions {
		templateTestBlit(source, template, point.X, point.Y)
	}
	return source, template
}
