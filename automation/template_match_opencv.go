//go:build opencv

package automation

import (
	"image"
	"math"

	"gocv.io/x/gocv"
)

const templateMatchBackend = "opencv"

func findTemplateMatch(source, template *image.NRGBA) (bestX, bestY int, bestScore float64) {
	bestX, bestY, bestScore, ok := findTemplateMatchOpenCV(source, template)
	if !ok {
		return findTemplateMatchPureGo(source, template)
	}
	return bestX, bestY, bestScore
}

func findTemplateMatchOpenCV(source, template *image.NRGBA) (bestX, bestY int, bestScore float64, ok bool) {
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
