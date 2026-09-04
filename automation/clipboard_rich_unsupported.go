//go:build !darwin || !cgo

package automation

import "runtime"

func newDefaultClipboardBackend() ClipboardBackend {
	if runtime.GOOS == "darwin" {
		return newUnsupportedClipboardBackend("darwin", "rich clipboard formats require a CGO-enabled AppKit build")
	}
	return newUnsupportedClipboardBackend(runtime.GOOS, "rich clipboard formats are not implemented on this platform")
}
