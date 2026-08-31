//go:build !darwin || !cgo

package automation

import "fmt"

func clickForPIDPlatform(processID int32, x, y float64) error {
	return fmt.Errorf("mouse.clickForPID is only supported on macOS with cgo enabled")
}
