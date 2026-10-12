//go:build darwin || linux

package instance

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

type Lease struct{ file *os.File }

func Acquire(path string) (*Lease, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("Reset Clock already running: %w", err)
	}
	return &Lease{file: f}, nil
}
func (l *Lease) Close() error {
	if l == nil || l.file == nil {
		return nil
	}
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	return l.file.Close()
}
