//go:build darwin && !cgo

package automation

func newDefaultClipboardBackend() ClipboardBackend {
	return newUnsupportedClipboardBackend("darwin", "rich clipboard formats require a CGO-enabled AppKit build")
}
