//go:build !darwin || !cgo

package machost

import (
	"fmt"
	"io"
	"runtime"
)

func Run(io.Reader, io.Writer, io.Writer) error {
	return fmt.Errorf("custom UI native host is unsupported on %s", runtime.GOOS)
}
