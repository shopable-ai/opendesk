//go:build !darwin || !cgo

package automation

import "context"

func newRecorderTargetProbe() func(context.Context, *WindowInfo, int, int) (*recorderElementSnapshot, error) {
	return nil
}

func newRecorderTextProbe() recorderTextProbe {
	return nil
}
