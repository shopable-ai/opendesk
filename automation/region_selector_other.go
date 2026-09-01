//go:build !darwin

package automation

import (
	"context"
	"io"
)

func MacOSRegionSelectorHelperRequested([]string) bool { return false }

func RunMacOSRegionSelectorHelper(io.Reader, io.Writer, io.Writer) int { return 1 }

func runMacOSRegionSelector(context.Context, RegionSelectorOptions) (SelectedRegion, error) {
	return SelectedRegion{}, captureOperationError("", ScreenCaptureNotSupported, "region selector is available only on macOS", nil)
}
