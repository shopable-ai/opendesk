package automation

// ReadWindowContentExact reads native content for an already resolved window.
// It is a Go-only entry point, not a reflected WindowManager/JavaScript method.
// The private native reader must verify this identity before reading values;
// title selection and fallback to a sibling window are never permitted here.
func ReadWindowContentExact(target WindowInfo) (string, error) {
	const operation = "window.getContent"
	if err := validateExactWindowTarget(operation, target); err != nil {
		return "", err
	}
	reader, ok := newPlatformWindowManager().(interface {
		windowContent(*WindowInfo) (string, error)
	})
	if !ok {
		return "", windowOperationError(operation, WindowNotSupported, "exact native window content is not supported on this platform", nil)
	}
	text, err := reader.windowContent(&target)
	if err != nil {
		return "", wrapWindowError(operation, err, true)
	}
	return text, nil
}
