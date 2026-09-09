//go:build (!darwin && !windows) || (darwin && !cgo)

package automation

import "context"

func newRecorderTargetProbe() func(context.Context, *WindowInfo, recorderTargetPoint) (*recorderElementSnapshot, error) {
	return nil
}

func newRecorderTextProbe() recorderTextProbe {
	return nil
}
