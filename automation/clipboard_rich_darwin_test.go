//go:build darwin && cgo

package automation

import "testing"

func TestDarwinRichClipboardMetadataCanBeReadWithoutContent(t *testing.T) {
	backend := &darwinClipboardBackend{}
	formats, err := backend.NativeFormats()
	if err != nil {
		t.Fatalf("native formats: %v", err)
	}
	for _, format := range formats {
		if format == "" {
			t.Fatal("native pasteboard returned an empty format identifier")
		}
	}
	if changeCount, err := backend.ChangeCount(); err != nil || changeCount < 0 {
		t.Fatalf("changeCount=%d err=%v", changeCount, err)
	}
}
