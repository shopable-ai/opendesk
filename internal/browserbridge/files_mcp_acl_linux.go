//go:build linux

package browserbridge

import (
	"golang.org/x/sys/unix"
	"os"
)

func filesMCPCheckACL(file *os.File) error {
	for _, name := range []string{"system.posix_acl_access", "system.posix_acl_default"} {
		n, e := unix.Fgetxattr(int(file.Fd()), name, nil)
		if e == unix.ENODATA || e == unix.ENOTSUP {
			continue
		}
		if e != nil || n != 0 {
			return filesMCPError("E_FILES_CREDENTIAL")
		}
	}
	return nil
}
