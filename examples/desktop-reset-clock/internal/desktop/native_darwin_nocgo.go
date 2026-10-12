//go:build darwin && !cgo

package desktop

import (
	"context"
	"errors"
)

type unavailable struct{}

func newNative() UI { return unavailable{} }
func (unavailable) Run(context.Context, func(Action)) error {
	return errors.New("macOS desktop requires CGO_ENABLED=1 and AppKit")
}
func (unavailable) Update(Display) {}
func (unavailable) Notify(string)  {}
