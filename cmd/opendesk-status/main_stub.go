//go:build !darwin || !cgo

package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "opendesk-status is available only in a macOS cgo App bundle")
	os.Exit(1)
}
