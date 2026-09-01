//go:build !darwin
// +build !darwin

package automation

import "fmt"

func listDisplaysPlatform() ([]DisplayInfo, error) {
	return nil, fmt.Errorf("display enumeration is not implemented on this platform")
}

type unsupportedDisplayControlBackend struct{}

func newDefaultDisplayControlBackend() displayControlBackend {
	return unsupportedDisplayControlBackend{}
}

func (unsupportedDisplayControlBackend) Name() string        { return "unsupported" }
func (unsupportedDisplayControlBackend) SupportsModes() bool { return false }
func (unsupportedDisplayControlBackend) CurrentMode(uint32) (DisplayModeInfo, error) {
	return DisplayModeInfo{}, fmt.Errorf("display mode reading is not implemented on this platform")
}
func (unsupportedDisplayControlBackend) ListModes(uint32) ([]DisplayModeInfo, error) {
	return nil, fmt.Errorf("display mode enumeration is not implemented on this platform")
}
func (unsupportedDisplayControlBackend) SetMode(uint32, DisplayModeInfo) error {
	return fmt.Errorf("display mode mutation is not implemented on this platform")
}
