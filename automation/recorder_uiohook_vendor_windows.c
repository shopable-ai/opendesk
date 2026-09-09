//go:build cgo && windows

/* Build-only source unit selected automatically by Go for a CGO Windows build.
 * It is compiled into opendesk.exe; product users do not run this file or
 * install a separate libuiohook DLL. */

#include "../third_party/libuiohook/src/logger.c"
#include "../third_party/libuiohook/src/windows/input_helper.c"
#include "../third_party/libuiohook/src/windows/input_hook.c"
#include "../third_party/libuiohook/src/windows/post_event.c"
#include "../third_party/libuiohook/src/windows/system_properties.c"
