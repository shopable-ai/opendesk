//go:build !opencv

package automation

import "image"

const templateMatchBackend = "purego"

func findTemplateMatch(source, template *image.NRGBA) (bestX, bestY int, bestScore float64) {
	return findTemplateMatchPureGo(source, template)
}
