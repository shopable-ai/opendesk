//go:build darwin && cgo

package browserbridge

/*
#include <errno.h>
#include <sys/acl.h>

// Same deny-only policy as nativeextension/path_acl_darwin.go, applied to the
// pinned FD instead of a pathname. A credential must never gain an allow ACE
// through inheritance, even when its POSIX mode remains 0600.
static int opendesk_files_mcp_acl_safe(int fd) {
 acl_t acl = acl_get_fd_np(fd, ACL_TYPE_EXTENDED);
 if (acl == NULL) return errno == ENOENT;
 acl_entry_t entry;
 int entry_id = ACL_FIRST_ENTRY;
 while (acl_get_entry(acl, entry_id, &entry) == 0) {
  acl_tag_t tag;
  if (acl_get_tag_type(entry, &tag) != 0 || tag != ACL_EXTENDED_DENY) {
   acl_free(acl);
   return 0;
  }
  entry_id = ACL_NEXT_ENTRY;
 }
 acl_free(acl);
 return 1;
}
*/
import "C"

import "os"

func filesMCPCheckACL(file *os.File) error {
	if C.opendesk_files_mcp_acl_safe(C.int(file.Fd())) != 1 {
		return filesMCPError("E_FILES_CREDENTIAL")
	}
	return nil
}
