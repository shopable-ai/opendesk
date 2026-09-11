//go:build darwin && cgo

package inspector

/*
#cgo LDFLAGS: -framework CoreGraphics -framework CoreFoundation -framework ImageIO
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <ImageIO/ImageIO.h>

static int inspector_screen_capture_allowed(void) {
	return CGPreflightScreenCaptureAccess() ? 1 : 0;
}

static CFDataRef inspector_capture_window_png(uint32_t window_id, size_t *width, size_t *height) {
	CGImageRef image = CGWindowListCreateImage(
		CGRectNull,
		kCGWindowListOptionIncludingWindow,
		(CGWindowID)window_id,
		kCGWindowImageBoundsIgnoreFraming | kCGWindowImageNominalResolution
	);
	if (image == NULL) return NULL;
	*width = CGImageGetWidth(image);
	*height = CGImageGetHeight(image);
	CFMutableDataRef data = CFDataCreateMutable(kCFAllocatorDefault, 0);
	if (data == NULL) {
		CGImageRelease(image);
		return NULL;
	}
	CGImageDestinationRef destination = CGImageDestinationCreateWithData(data, CFSTR("public.png"), 1, NULL);
	if (destination == NULL) {
		CFRelease(data);
		CGImageRelease(image);
		return NULL;
	}
	CGImageDestinationAddImage(destination, image, NULL);
	int ok = CGImageDestinationFinalize(destination) ? 1 : 0;
	CFRelease(destination);
	CGImageRelease(image);
	if (!ok) {
		CFRelease(data);
		return NULL;
	}
	return data;
}

static void inspector_release_capture_data(CFDataRef data) {
	if (data != NULL) CFRelease(data);
}
*/
import "C"

import (
	"context"
	"unsafe"
)

func captureVisualPixels(ctx context.Context, window WindowCandidate) (visualPixels, error) {
	if err := ctx.Err(); err != nil {
		return visualPixels{}, err
	}
	if C.inspector_screen_capture_allowed() == 0 {
		return visualPixels{}, visualCaptureError("PERMISSION_DENIED", "macos-coregraphics-window", nil)
	}
	if window.NativeHandle == 0 || window.NativeHandle > uint64(^uint32(0)) {
		return captureVisibleBounds(ctx, window)
	}
	var width, height C.size_t
	data := C.inspector_capture_window_png(C.uint32_t(window.NativeHandle), &width, &height)
	if data == 0 {
		return captureVisibleBounds(ctx, window)
	}
	defer C.inspector_release_capture_data(data)
	length := C.CFDataGetLength(data)
	if length <= 0 || uint64(length) > visualMaximumPNGBytes {
		return visualPixels{}, visualCaptureError("BACKEND_FAILED", "macos-coregraphics-window", nil)
	}
	pointer := C.CFDataGetBytePtr(data)
	if pointer == nil {
		return visualPixels{}, visualCaptureError("BACKEND_FAILED", "macos-coregraphics-window", nil)
	}
	pngBytes := C.GoBytes(unsafe.Pointer(pointer), C.int(length))
	return visualPixels{
		png: pngBytes, width: int(width), height: int(height),
		method: "macos-coregraphics-window-id", scope: "exact-window", occlusionRisk: false,
	}, nil
}
