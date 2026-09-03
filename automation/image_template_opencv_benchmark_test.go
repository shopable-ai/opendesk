//go:build opencv

package automation

import (
	"fmt"
	"testing"
)

// BenchmarkImageColorTemplateOpenCVComparison measures the old experimental
// TM_CCOEFF_NORMED primitive beside the canonical matcher. These are not
// interchangeable API backends; the benchmark is deliberately labelled as a
// comparison rather than an acceleration claim.
func BenchmarkImageColorTemplateOpenCVComparison(b *testing.B) {
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
			prefix := fmt.Sprintf("%s/template-%s", resolution.name, templateSize.name)
			b.Run(prefix+"/purego-canonical", func(b *testing.B) {
				b.ReportAllocs()
				for iteration := 0; iteration < b.N; iteration++ {
					if x, y, confidence := findTemplateMatchPureGo(source, template); x < 0 || y < 0 || confidence < 0.85 {
						b.Fatal("expected pure-Go match")
					}
				}
			})
			b.Run(prefix+"/opencv-tm_ccoeff_normed-experimental", func(b *testing.B) {
				b.ReportAllocs()
				for iteration := 0; iteration < b.N; iteration++ {
					if x, y, confidence, ok := findTemplateMatchOpenCVExperimental(source, template); !ok || x < 0 || y < 0 || confidence < 0.85 {
						b.Fatal("expected experimental OpenCV match")
					}
				}
			})
		}
	}
}
