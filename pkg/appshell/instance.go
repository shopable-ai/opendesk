package appshell

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrInstanceQuitting = errors.New("the primary App Mode instance is quitting")

const appInstanceActivationTimeout = 3 * time.Second

type appInstanceRequest struct {
	Command string `json:"command"`
	Token   string `json:"token,omitempty"`
}

type appInstanceResponse struct {
	Accepted bool   `json:"accepted"`
	State    string `json:"state"`
}

type InstanceLease interface {
	Close() error
	Wait()
}

// AcquireSingleInstance either becomes the primary owner or sends one bounded
// activation request to the existing primary. A secondary result never owns a
// lease and must exit before creating an execution.
func AcquireSingleInstance(ctx context.Context, manifest Manifest, activate func() bool) (lease InstanceLease, primary bool, err error) {
	if !manifest.SingleInstance {
		return nil, true, nil
	}
	if activate == nil {
		return nil, false, fmt.Errorf("single-instance activation handler is required")
	}
	return acquirePlatformSingleInstance(ctx, manifest.InstanceKey(), activate)
}
