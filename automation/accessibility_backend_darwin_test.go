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

func TestDarwinPopUpButtonIsSelectableThroughAnExplicitWritableValue(t *testing.T) {
	if got := normalizeDarwinAXRole("AXPopUpButton"); got != "popUpButton" {
		t.Fatalf("normalized popup role = %q", got)
	}
	valueSettable := true
	nativeRole := "AXPopUpButton"
	node := (darwinAXInspection{NativeRole: &nativeRole, ValueSettable: valueSettable}).node()
	if node.Role != "popUpButton" {
		t.Fatalf("node role = %q", node.Role)
	}
	seen := false
	for _, action := range node.Actions {
		if action == "setValue" {
			seen = true
			break
		}
	}
	if !seen {
		t.Fatalf("writable popup actions = %#v", node.Actions)
	}
}
