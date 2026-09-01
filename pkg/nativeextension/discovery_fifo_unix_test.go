//go:build !windows

package nativeextension

import "syscall"

func makeTestFIFO(path string, mode uint32) error {
	return syscall.Mkfifo(path, mode)
}
