//go:build darwin && !cgo

package nativeextension

import "fmt"

func validatePlatformACL(path string) error {
	return fmt.Errorf("%s extended ACL validation requires cgo", path)
}
