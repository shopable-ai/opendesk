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
	uint32_t vendor;
	uint32_t model;
	uint32_t serial;
	uint32_t unit;
	int x;
	int y;
	int width;
	int height;
	int pixelWidth;
	int pixelHeight;
	int isPrimary;
	int isBuiltin;
} tm_display_meta;

typedef struct {
	int32_t ioModeID;
	int width;
	int height;
	int pixelWidth;
	int pixelHeight;
	double refreshRate;
	int usableForDesktopGUI;
} tm_display_mode_meta;

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
		out[i].vendor = CGDisplayVendorNumber(did);
		out[i].model = CGDisplayModelNumber(did);
		out[i].serial = CGDisplaySerialNumber(did);
		out[i].unit = CGDisplayUnitNumber(did);
		out[i].x = (int)b.origin.x;
		out[i].y = (int)b.origin.y;
		out[i].width = (int)b.size.width;
		out[i].height = (int)b.size.height;
		out[i].pixelWidth = (int)pw;
		out[i].pixelHeight = (int)ph;
		out[i].isPrimary = (did == mainID) ? 1 : 0;
		out[i].isBuiltin = CGDisplayIsBuiltin(did) ? 1 : 0;
	}

	free(ids);
	return (int)count;
}

void tm_mode_meta(CGDisplayModeRef mode, tm_display_mode_meta *out) {
	if (mode == NULL || out == NULL) return;
	out->ioModeID = CGDisplayModeGetIODisplayModeID(mode);
	out->width = (int)CGDisplayModeGetWidth(mode);
	out->height = (int)CGDisplayModeGetHeight(mode);
	out->pixelWidth = (int)CGDisplayModeGetPixelWidth(mode);
	out->pixelHeight = (int)CGDisplayModeGetPixelHeight(mode);
	out->refreshRate = CGDisplayModeGetRefreshRate(mode);
	out->usableForDesktopGUI = CGDisplayModeIsUsableForDesktopGUI(mode) ? 1 : 0;
}

int tm_get_current_display_mode(uint32_t displayID, tm_display_mode_meta *out) {
	if (out == NULL) return -1;
	CGDisplayModeRef mode = CGDisplayCopyDisplayMode((CGDirectDisplayID)displayID);
	if (mode == NULL) return -1;
	tm_mode_meta(mode, out);
	CGDisplayModeRelease(mode);
	return 0;
}

int tm_get_display_mode_count(uint32_t displayID) {
	CFArrayRef modes = CGDisplayCopyAllDisplayModes((CGDirectDisplayID)displayID, NULL);
	if (modes == NULL) return -1;
	CFIndex count = CFArrayGetCount(modes);
	CFRelease(modes);
	return (int)count;
}

int tm_list_display_modes(uint32_t displayID, tm_display_mode_meta *out, int max) {
	if (out == NULL || max <= 0) return 0;
	CFArrayRef modes = CGDisplayCopyAllDisplayModes((CGDirectDisplayID)displayID, NULL);
	if (modes == NULL) return -1;
	CFIndex count = CFArrayGetCount(modes);
	if (count > max) count = max;
	for (CFIndex i = 0; i < count; i++) {
		CGDisplayModeRef mode = (CGDisplayModeRef)CFArrayGetValueAtIndex(modes, i);
		tm_mode_meta(mode, &out[i]);
	}
	CFRelease(modes);
	return (int)count;
}

int tm_set_display_mode(uint32_t displayID, tm_display_mode_meta target) {
	CFArrayRef modes = CGDisplayCopyAllDisplayModes((CGDirectDisplayID)displayID, NULL);
	if (modes == NULL) return -1000;
	CGDisplayModeRef selected = NULL;
	CFIndex count = CFArrayGetCount(modes);
	for (CFIndex i = 0; i < count; i++) {
		CGDisplayModeRef mode = (CGDisplayModeRef)CFArrayGetValueAtIndex(modes, i);
		if (CGDisplayModeGetIODisplayModeID(mode) == target.ioModeID &&
			(int)CGDisplayModeGetWidth(mode) == target.width &&
			(int)CGDisplayModeGetHeight(mode) == target.height &&
			(int)CGDisplayModeGetPixelWidth(mode) == target.pixelWidth &&
			(int)CGDisplayModeGetPixelHeight(mode) == target.pixelHeight) {
			selected = mode;
			break;
		}
	}
	int result = selected == NULL ? -1001 : (int)CGDisplaySetDisplayMode((CGDirectDisplayID)displayID, selected, NULL);
	CFRelease(modes);
	return result;
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
			HardwareID:  fmt.Sprintf("darwin:%d:%d:%d:%d", uint32(m.vendor), uint32(m.model), uint32(m.serial), uint32(m.unit)),
			IsPrimary:   int(m.isPrimary) == 1,
			IsBuiltin:   int(m.isBuiltin) == 1,
			Vendor:      uint32(m.vendor),
			Model:       uint32(m.model),
			Serial:      uint32(m.serial),
			Unit:        uint32(m.unit),
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

type darwinDisplayControlBackend struct{}

func newDefaultDisplayControlBackend() displayControlBackend { return darwinDisplayControlBackend{} }

func (darwinDisplayControlBackend) Name() string        { return "coregraphics" }
func (darwinDisplayControlBackend) SupportsModes() bool { return true }

func displayModeFromDarwin(meta C.tm_display_mode_meta) DisplayModeInfo {
	return DisplayModeInfo{
		IOModeID:            int32(meta.ioModeID),
		Width:               int(meta.width),
		Height:              int(meta.height),
		PixelWidth:          int(meta.pixelWidth),
		PixelHeight:         int(meta.pixelHeight),
		RefreshRate:         float64(meta.refreshRate),
		UsableForDesktopGUI: int(meta.usableForDesktopGUI) == 1,
	}
}

func displayModeToDarwin(mode DisplayModeInfo) C.tm_display_mode_meta {
	return C.tm_display_mode_meta{
		ioModeID:            C.int32_t(mode.IOModeID),
		width:               C.int(mode.Width),
		height:              C.int(mode.Height),
		pixelWidth:          C.int(mode.PixelWidth),
		pixelHeight:         C.int(mode.PixelHeight),
		refreshRate:         C.double(mode.RefreshRate),
		usableForDesktopGUI: C.int(displayBoolToInt(mode.UsableForDesktopGUI)),
	}
}

func (darwinDisplayControlBackend) CurrentMode(displayID uint32) (DisplayModeInfo, error) {
	var meta C.tm_display_mode_meta
	if result := int(C.tm_get_current_display_mode(C.uint32_t(displayID), &meta)); result != 0 {
		return DisplayModeInfo{}, fmt.Errorf("CGDisplayCopyDisplayMode failed (%d)", result)
	}
	return displayModeFromDarwin(meta), nil
}

func (darwinDisplayControlBackend) ListModes(displayID uint32) ([]DisplayModeInfo, error) {
	count := int(C.tm_get_display_mode_count(C.uint32_t(displayID)))
	if count <= 0 {
		return nil, fmt.Errorf("CGDisplayCopyAllDisplayModes returned no modes")
	}
	metas := make([]C.tm_display_mode_meta, count)
	n := int(C.tm_list_display_modes(C.uint32_t(displayID), (*C.tm_display_mode_meta)(unsafe.Pointer(&metas[0])), C.int(count)))
	if n <= 0 {
		return nil, fmt.Errorf("CGDisplayCopyAllDisplayModes failed")
	}
	modes := make([]DisplayModeInfo, 0, n)
	for i := 0; i < n; i++ {
		modes = append(modes, displayModeFromDarwin(metas[i]))
	}
	return modes, nil
}

func (darwinDisplayControlBackend) SetMode(displayID uint32, mode DisplayModeInfo) error {
	result := int(C.tm_set_display_mode(C.uint32_t(displayID), displayModeToDarwin(mode)))
	if result != 0 {
		return fmt.Errorf("CGDisplaySetDisplayMode failed (%d)", result)
	}
	return nil
}

func displayBoolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
