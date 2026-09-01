//go:build darwin && !cgo

package automation

func darwinSessionStateSupported() bool { return false }

func currentDarwinSessionState() (SystemSessionState, error) {
	return SystemSessionState{}, systemSessionOperationError("", SystemSessionNotSupported, "CGSession state requires a cgo-enabled macOS build", nil)
}
