package inspector

import (
	"context"
	"strings"
	"testing"
)

func TestRuntimeRunnerCapabilitiesUseRestrictedPrivateExecution(t *testing.T) {
	result, err := NewRuntimeRunner().Capabilities(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	accessibility, _ := result["accessibility"].(map[string]any)
	host, _ := accessibility["hostAuthorization"].(map[string]any)
	if host["enabled"] != true || host["readOnly"] != true || host["valueAllowed"] != false {
		t.Fatalf("restricted host authorization = %#v", host)
	}
}

func TestInternalProgramsAreFixedReadOnlyAndDoNotInterpolateInput(t *testing.T) {
	for name, program := range map[string]string{
		"capabilities": capabilitiesProgram,
		"windows":      windowsProgram,
		"snapshot":     snapshotProgram,
		"validate":     validateProgram,
	} {
		for _, forbidden := range []string{"Accessibility.perform", "UI.tapMenuItem", "eval(", "Function("} {
			if strings.Contains(program, forbidden) {
				t.Errorf("%s program contains forbidden %q", name, forbidden)
			}
		}
		if !strings.Contains(program, "__opendeskInspectorResult") {
			t.Errorf("%s program does not use the private result transport", name)
		}
	}
	if !strings.Contains(snapshotProgram, "Execution.input.windowTarget") ||
		!strings.Contains(validateProgram, "Execution.input.locator") {
		t.Fatal("bounded programs do not consume structured input")
	}
}

func TestInspectorWindowIDAndValidationStatus(t *testing.T) {
	if got := inspectorWindowID(map[string]any{"windowTarget": map[string]any{"id": " exact-window "}}); got != "exact-window" {
		t.Fatalf("window ID = %q", got)
	}
	for _, test := range []struct {
		err  *RuntimeError
		want string
	}{
		{err: &RuntimeError{Code: "AMBIGUOUS_TARGET"}, want: "AMBIGUOUS"},
		{err: &RuntimeError{Code: "SEARCH_INCOMPLETE"}, want: "SEARCH_INCOMPLETE"},
		{err: &RuntimeError{Code: "TARGET_NOT_FOUND", Stage: "window"}, want: "STALE_TARGET"},
		{err: &RuntimeError{Code: "PERMISSION_DENIED"}, want: "PERMISSION_DENIED"},
		{err: nil, want: "BACKEND_UNAVAILABLE"},
	} {
		if got := validationStatus(test.err); got != test.want {
			t.Errorf("validationStatus(%#v) = %q, want %q", test.err, got, test.want)
		}
	}
}

func TestRuntimeInputsUseJavaScriptFieldNames(t *testing.T) {
	name := "Save"
	identifier := "fixture.save"
	limits := runtimeLimitsInput(Limits{TimeoutMS: 5000, MaxDepth: 6, MaxNodes: 500})
	if limits["timeout"] != 5000 || limits["maxDepth"] != 6 || limits["maxNodes"] != 500 {
		t.Fatalf("runtime limits projection = %#v", limits)
	}
	locator := runtimeLocatorInput(Locator{Role: "button", Name: &name, Identifier: &identifier})
	if locator["role"] != "button" || locator["name"] != "Save" || locator["identifier"] != "fixture.save" {
		t.Fatalf("runtime locator projection = %#v", locator)
	}
	for _, goField := range []string{"TimeoutMS", "MaxDepth", "MaxNodes", "Role", "Name", "Identifier"} {
		if _, exists := limits[goField]; exists {
			t.Fatalf("limits projection leaked Go field %q: %#v", goField, limits)
		}
		if _, exists := locator[goField]; exists {
			t.Fatalf("locator projection leaked Go field %q: %#v", goField, locator)
		}
	}
}
