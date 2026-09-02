//go:build darwin
// +build darwin

package automation

/*
#cgo darwin LDFLAGS: -framework ApplicationServices -framework CoreGraphics
#include <stdint.h>
#include <stdlib.h>
#include <CoreGraphics/CoreGraphics.h>

typedef struct {
	uint32_t id;
	int x;
	int y;
	int width;
	int height;
	int pixelWidth;
	int pixelHeight;
	int isPrimary;
} tm_display_meta;

int tm_get_display_count() {
	uint32_t count = 0;
	CGError err = CGGetActiveDisplayList(0, NULL, &count);
	if (err != kCGErrorSuccess) {
		return -1;
	}
	return (int)count;
}

int tm_list_displays(tm_display_meta *out, int max) {
	if (out == NULL || max <= 0) {
		return 0;
	}

	uint32_t count = 0;
	CGError err = CGGetActiveDisplayList(0, NULL, &count);
	if (err != kCGErrorSuccess || count == 0) {
		return -1;
	}

	if ((int)count > max) {
		count = (uint32_t)max;
	}

	CGDirectDisplayID *ids = (CGDirectDisplayID *)calloc(count, sizeof(CGDirectDisplayID));
	if (ids == NULL) {
		return -1;
	}

	err = CGGetActiveDisplayList(count, ids, &count);
	if (err != kCGErrorSuccess) {
		free(ids);
		return -1;
	}

	CGDirectDisplayID mainID = CGMainDisplayID();

	for (uint32_t i = 0; i < count; i++) {
		CGDirectDisplayID did = ids[i];
		CGRect b = CGDisplayBounds(did);
		size_t pw = CGDisplayPixelsWide(did);
		size_t ph = CGDisplayPixelsHigh(did);

		out[i].id = (uint32_t)did;
		out[i].x = (int)b.origin.x;
		out[i].y = (int)b.origin.y;
		out[i].width = (int)b.size.width;
		out[i].height = (int)b.size.height;
		out[i].pixelWidth = (int)pw;
		out[i].pixelHeight = (int)ph;
		out[i].isPrimary = (did == mainID) ? 1 : 0;
	}

	free(ids);
	return (int)count;
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

func listDisplaysPlatform() ([]DisplayInfo, error) {
	count := int(C.tm_get_display_count())
	if count <= 0 {
		return nil, fmt.Errorf("failed to get macOS display count")
	}

	metas := make([]C.tm_display_meta, count)
	n := int(C.tm_list_displays((*C.tm_display_meta)(unsafe.Pointer(&metas[0])), C.int(count)))
	if n <= 0 {
		return nil, fmt.Errorf("failed to list macOS displays")
	}

	displays := make([]DisplayInfo, 0, n)
	for i := 0; i < n; i++ {
		m := metas[i]
		width := int(m.width)
		pixelWidth := int(m.pixelWidth)
		scale := 1.0
		if width > 0 && pixelWidth > 0 {
			scale = float64(pixelWidth) / float64(width)
		}
		displays = append(displays, DisplayInfo{
			Index:       i + 1,
			ID:          fmt.Sprintf("%d", uint32(m.id)),
			IsPrimary:   int(m.isPrimary) == 1,
			X:           int(m.x),
			Y:           int(m.y),
			Width:       width,
			Height:      int(m.height),
			PixelWidth:  pixelWidth,
			PixelHeight: int(m.pixelHeight),
			Scale:       scale,
		})
	}

	return displays, nil
}
