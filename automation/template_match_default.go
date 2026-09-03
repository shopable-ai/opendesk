//go:build !opencv

package automation

import "image"

// Pure Go is the canonical public confidence/threshold contract.
const templateMatchBackend = "purego"

func findTemplateMatch(source, template *image.NRGBA) (bestX, bestY int, bestScore float64) {
	return findTemplateMatchPureGo(source, template)
}
