//go:build !darwin && !windows

package appshell

import (
	"context"
	"fmt"
	"runtime"
)

func acquirePlatformSingleInstance(context.Context, string, func() bool) (InstanceLease, bool, error) {
	return nil, false, fmt.Errorf("App Mode single-instance is not supported on %s", runtime.GOOS)
}
