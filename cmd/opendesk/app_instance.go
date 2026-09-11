package main

import (
	"errors"
	"syscall"
)

// addressInUse classifies an explicit endpoint bind failure. The command
// never probes or reuses another process's listener.
func addressInUse(err error) bool {
	return errors.Is(err, syscall.EADDRINUSE)
}
