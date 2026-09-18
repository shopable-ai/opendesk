//go:build !windows

package flowinstall

import "os"

// syncDirectory makes rename / directory-entry updates durable on platforms
// where Go exposes directory fsync through os.File.Sync.
func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
