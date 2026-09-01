//go:build windows

package nativeextension

import "fmt"

func makeTestFIFO(string, uint32) error {
	return fmt.Errorf("FIFO is unavailable on Windows")
}
