//go:build darwin && cgo

package nativeextension

/*
#include <errno.h>
#include <stdlib.h>
#include <sys/acl.h>

static int opendesk_acl_has_extended_allow(const char *path, int *error_code) {
	acl_t acl = acl_get_link_np(path, ACL_TYPE_EXTENDED);
	if (acl == NULL) {
		// macOS reports ENOENT both when a path has no extended ACL and when
		// the path no longer exists. Defer that distinction to Go, where we
		// can fail closed if the path disappeared or became a symlink.
		if (errno == ENOENT) {
			return 2;
		}
		*error_code = errno;
		return -1;
	}
	acl_entry_t entry;
	int entry_id = ACL_FIRST_ENTRY;
	while (acl_get_entry(acl, entry_id, &entry) == 0) {
		acl_tag_t tag;
		if (acl_get_tag_type(entry, &tag) != 0) {
			*error_code = errno;
			acl_free(acl);
			return -1;
		}
		if (tag == ACL_EXTENDED_ALLOW) {
			acl_free(acl);
			return 1;
		}
		entry_id = ACL_NEXT_ENTRY;
	}
	acl_free(acl);
	return 0;
}
*/
import "C"

import (
	"fmt"
	"os"
	"unsafe"
)

// macOS mode bits do not expose extended ACL allow entries. Reject every allow
// ACE so a nominally 0700 bundle cannot be made writable by another principal.
// Deny-only ACLs, such as the standard user-home delete denial, remain valid.
func validatePlatformACL(path string) error {
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))
	var errorCode C.int
	result := C.opendesk_acl_has_extended_allow(cPath, &errorCode)
	switch {
	case result < 0:
		return fmt.Errorf("%s extended ACL could not be inspected (errno %d)", path, int(errorCode))
	case result == 2:
		info, err := os.Lstat(path)
		if err != nil {
			return fmt.Errorf("%s extended ACL state is unavailable: %w", path, err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%s changed to a symlink during extended ACL validation", path)
		}
		return nil
	case result > 0:
		return fmt.Errorf("%s has an extended ACL allow entry", path)
	default:
		return nil
	}
}
