//go:build !darwin || !cgo

package main

import (
	"fmt"
	"os"
	"runtime"
)

func main() {
	fmt.Fprintf(os.Stderr, "opendesk-ui-host: custom UI is unsupported on %s\n", runtime.GOOS)
	os.Exit(2)
}
