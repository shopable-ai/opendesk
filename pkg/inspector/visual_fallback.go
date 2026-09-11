//go:build !darwin || !cgo

package inspector

import "context"

func captureVisualPixels(ctx context.Context, window WindowCandidate) (visualPixels, error) {
	return captureVisibleBounds(ctx, window)
}
