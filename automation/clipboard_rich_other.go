//go:build !darwin

package automation

import "runtime"

func newDefaultClipboardBackend() ClipboardBackend {
	return newUnsupportedClipboardBackend(runtime.GOOS, "rich clipboard formats are not implemented on this platform")
}
