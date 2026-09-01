//go:build !windows && !darwin

package nativeextension

func validatePlatformACL(string) error {
	return nil
}
