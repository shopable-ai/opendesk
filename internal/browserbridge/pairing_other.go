//go:build !darwin && !linux

package browserbridge

import "context"

type PairingService struct{}

func (*PairingService) Handle(context.Context, string, func(context.Context, PairingIntent) (bool, error)) (map[string]any, error) {
	return nil, errPlatform
}
