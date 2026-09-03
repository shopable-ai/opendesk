//go:build opencv

package automation

import (
	"image"
	"math"

	"gocv.io/x/gocv"
)

// The public ImageColor contract is intentionally pure Go even when this file
// is compiled. TM_CCOEFF_NORMED has a different score model from the canonical
// mean absolute RGB error score, so dispatching to it would make the same JS
// threshold mean different things across builds.
const templateMatchBackend = "purego"

func findTemplateMatch(source, template *image.NRGBA) (bestX, bestY int, bestScore float64) {
	return findTemplateMatchPureGo(source, template)
}

// findTemplateMatchOpenCVExperimental remains available only to tagged
// conformance and benchmark tests. It is not an interchangeable backend for
// ImageColor.findImage/findImages/findPos.
func findTemplateMatchOpenCVExperimental(source, template *image.NRGBA) (bestX, bestY int, bestScore float64, ok bool) {
	sw := source.Bounds().Dx()
	sh := source.Bounds().Dy()
	tw := template.Bounds().Dx()
	th := template.Bounds().Dy()
	if tw == 0 || th == 0 || tw > sw || th > sh {
		return -1, -1, 0, false
	}

	sourceMat, err := gocv.ImageToMatRGB(source)
	if err != nil {
		return -1, -1, 0, false
	}
	defer sourceMat.Close()

	templateMat, err := gocv.ImageToMatRGB(template)
	if err != nil {
		return -1, -1, 0, false
	}
	defer templateMat.Close()

	result := gocv.NewMat()
	defer result.Close()
	mask := gocv.NewMat()
	defer mask.Close()

	gocv.MatchTemplate(sourceMat, templateMat, &result, gocv.TmCcoeffNormed, mask)
	if result.Empty() {
		return -1, -1, 0, false
	}

	_, maxScore, _, maxLocation := gocv.MinMaxLoc(result)
	if math.IsNaN(float64(maxScore)) || math.IsInf(float64(maxScore), 0) {
		return -1, -1, 0, false
	}

	return maxLocation.X, maxLocation.Y, float64(maxScore), true
}
