//go:build darwin && cgo

package automation

/*
#cgo LDFLAGS: -framework AppKit
#include <stdint.h>
#include <stdlib.h>

int32_t opendesk_app_terminate(int32_t pid, int force);
char *opendesk_app_bundle_identifier(const char *path);
*/
import "C"

import (
	"context"
	"unsafe"
)

func applicationNativeIdentityAvailable() bool { return true }

func terminateApplicationPlatform(ctx context.Context, pid int64, force bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if pid <= 0 || pid > 1<<31-1 {
		return appOperationError("", AppInvalidArgument, "pid must be a positive 32-bit integer", nil)
	}
	forceValue := C.int(0)
	if force {
		forceValue = 1
	}
	switch int32(C.opendesk_app_terminate(C.int32_t(pid), forceValue)) {
	case 0:
		return nil
	case 1:
		return appOperationError("", AppNotFound, "application process is unavailable", nil)
	default:
		return appOperationError("", AppTerminateFailed, "NSRunningApplication refused the termination request", nil)
	}
}

func applicationBundleIdentifierPlatform(path string) string {
	value := C.CString(path)
	defer C.free(unsafe.Pointer(value))
	result := C.opendesk_app_bundle_identifier(value)
	if result == nil {
		return ""
	}
	defer C.free(unsafe.Pointer(result))
	return C.GoString(result)
}
