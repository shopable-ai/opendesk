//go:build darwin && cgo

package main

import (
	"fmt"
	"opendesk/pkg/customui/machost"
	"os"
	"runtime"
)

func init() {
	// Pin the primordial process thread before Go can schedule main elsewhere;
	// AppKit must own this thread for the host lifetime.
	runtime.LockOSThread()
}

func main() {
	if err := machost.Run(os.Stdin, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "opendesk-ui-host: %v\n", err)
		os.Exit(1)
	}
}
