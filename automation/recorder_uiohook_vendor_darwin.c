//go:build cgo && darwin

/* Build-only source unit selected automatically by Go for a CGO macOS build.
 * Product users do not run or install this file. A CGO Windows build selects
 * recorder_uiohook_vendor_windows.c instead. */

/* automation contains Objective-C cgo owners, so their package-wide CFLAGS
 * compile every Darwin C translation unit as Objective-C with ARC. Upstream
 * libuiohook's USE_OBJC branch manually owns NSAutoreleasePool and stores it
 * in a global id. ARC inserts a retain for that assignment, which
 * NSAutoreleasePool rejects at runtime. Select the upstream CoreGraphics
 * fallback for NX_SYSDEFINED metadata and keep the vendor unit free of manual
 * Objective-C ownership. Normal keyboard and mouse capture is unchanged. */
#ifdef USE_OBJC
#undef USE_OBJC
#endif

/* libdispatch objects must also keep the upstream C-pointer ABI. */
#define OS_OBJECT_USE_OBJC 0

#include "../third_party/libuiohook/src/logger.c"
#include "../third_party/libuiohook/src/darwin/input_helper.c"
#include "../third_party/libuiohook/src/darwin/input_hook.c"
#include "../third_party/libuiohook/src/darwin/post_event.c"
#include "../third_party/libuiohook/src/darwin/system_properties.c"
