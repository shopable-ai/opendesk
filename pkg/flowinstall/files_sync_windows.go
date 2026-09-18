//go:build windows

package flowinstall

// Windows does not expose a portable directory fsync through os.File.Sync;
// calling Sync on a directory handle returns an error even after every staged
// file has already been individually flushed. Keep the transaction protocol
// and atomic rename semantics, but do not turn an unsupported directory flush
// into a false install failure.
func syncDirectory(string) error {
	return nil
}
