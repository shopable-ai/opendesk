//go:build darwin && !cgo

package browserbridge

import "os"

// As with Native Extension discovery, unavailable ACL inspection fails closed.
func filesMCPCheckACL(*os.File) error { return filesMCPError("E_FILES_CREDENTIAL") }
