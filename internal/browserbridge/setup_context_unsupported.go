//go:build !darwin && !linux

package browserbridge

import "context"

// SetupAutomaticContext retains the Unix API shape for platform-independent
// startup. Native Host installation remains unsupported here; do not perform
// any registration or pretend that a pairing took place.
func SetupAutomaticContext(_ context.Context, _, _, _, _ string) (map[string]any, error) {
	return nil, errPlatform
}
