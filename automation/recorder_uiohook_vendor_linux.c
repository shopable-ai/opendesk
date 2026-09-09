//go:build cgo && linux

/* Build-only source unit selected automatically by Go for a CGO Linux build.
 * It is compiled into the OpenDesk executable and is not a user entrypoint. */

#include "../third_party/libuiohook/src/logger.c"
#include "../third_party/libuiohook/src/x11/input_helper.c"
#include "../third_party/libuiohook/src/x11/input_hook.c"
#include "../third_party/libuiohook/src/x11/post_event.c"
#include "../third_party/libuiohook/src/x11/system_properties.c"
