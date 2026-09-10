//go:build darwin && cgo

package automation

import (
	"errors"
	"testing"
)

func TestDarwinSetValueAcceptsMissingEnabledOnlyAsNotExplicitlyDisabled(t *testing.T) {
	if err := requireDarwinSetValueNotDisabled(darwinAXInspection{}); err != nil {
		t.Fatalf("standard writable AXTextArea may omit AXEnabled: %v", err)
	}
	enabled := true
	if err := requireDarwinSetValueNotDisabled(darwinAXInspection{Enabled: &enabled}); err != nil {
		t.Fatalf("enabled text input rejected: %v", err)
	}
	disabled := false
	err := requireDarwinSetValueNotDisabled(darwinAXInspection{Enabled: &disabled})
	var accessibilityErr *AccessibilityError
	if !errors.As(err, &accessibilityErr) || accessibilityErr.Code != AccessibilityElementDisabled || accessibilityErr.ActionState != AccessibilityActionNotStarted {
		t.Fatalf("disabled text input error=%#v", err)
	}
}
