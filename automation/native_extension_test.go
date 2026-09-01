package automation

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"opendesk/pkg/nativeextension"
)

func TestNativeExtensionOptionsResolveDefaultExtension(t *testing.T) {
	options, evidence, optionErr := parseNativeExtensionOptions(t, map[string]any{
		"extension": "native-ext-go-basic",
		"method":    "hello",
	})
	if optionErr != nil {
		t.Fatalf("optionsFromCall returned error: %#v", optionErr)
	}
	want, err := nativeextension.ResolveDefaultExecutable("native-ext-go-basic")
	if err != nil {
		t.Fatal(err)
	}
	if options.executable != want {
		t.Fatalf("options executable = %q, want %q", options.executable, want)
	}
	if evidence.Executable != want {
		t.Fatalf("evidence executable = %q, want %q", evidence.Executable, want)
	}
	if !filepath.IsAbs(evidence.Executable) {
		t.Fatalf("evidence executable is not absolute: %q", evidence.Executable)
	}
}

func TestNativeExtensionOptionsAcceptAbsoluteExecutableOverride(t *testing.T) {
	executable := filepath.Join(string(filepath.Separator), "tmp", "native-ext-go-basic")
	options, evidence, optionErr := parseNativeExtensionOptions(t, map[string]any{
		"executable": "  " + executable + "  ",
		"method":     "hello",
	})
	if optionErr != nil {
		t.Fatalf("optionsFromCall returned error: %#v", optionErr)
	}
	if options.executable != executable || evidence.Executable != executable {
		t.Fatalf("executable override was not preserved: options=%q evidence=%q", options.executable, evidence.Executable)
	}
}

func TestNativeExtensionOptionsRequireExactlyOneExecutableSelector(t *testing.T) {
	tests := []struct {
		name    string
		options map[string]any
	}{
		{name: "neither", options: map[string]any{"method": "hello"}},
		{name: "both", options: map[string]any{
			"extension":  "native-ext-go-basic",
			"executable": filepath.Join(string(filepath.Separator), "tmp", "native-ext-go-basic"),
			"method":     "hello",
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, _, optionErr := parseNativeExtensionOptions(t, test.options)
			if optionErr == nil || optionErr.code != nativeextension.CodeInvalidParams {
				t.Fatalf("option error = %#v, want invalid_params", optionErr)
			}
		})
	}
}

func TestNativeExtensionOptionsRejectUnsafeExtensionNames(t *testing.T) {
	for _, extension := range []any{"", "..", "../native-ext", "nested/native-ext", `nested\native-ext`, 42} {
		t.Run(testName(extension), func(t *testing.T) {
			_, evidence, optionErr := parseNativeExtensionOptions(t, map[string]any{
				"extension": extension,
				"method":    "hello",
			})
			if optionErr == nil || optionErr.code != nativeextension.CodeInvalidParams {
				t.Fatalf("option error = %#v, want invalid_params", optionErr)
			}
			if evidence.Method != "hello" {
				t.Fatalf("evidence method = %q, want hello", evidence.Method)
			}
		})
	}
}

func TestNativeExtensionEvidenceMapRedactsUnsafeRouteAndExtensionText(t *testing.T) {
	evidence := nativeextension.Evidence{
		Executable:         "/private/tmp/untrusted-extension",
		Method:             "untrusted-method",
		RequestID:          "untrusted-request",
		ExtensionErrorCode: "untrusted_extension_error",
		StderrSummary:      "UNTRUSTED_EXTENSION_STDERR",
		Protocol:           nativeextension.ProtocolName,
		ProtocolVersion:    nativeextension.ProtocolVersion,
		Status:             nativeextension.StatusFailed,
		ErrorCode:          nativeextension.CodeExtensionError,
	}
	mapped := nativeExtensionEvidenceMap(evidence)
	for _, key := range []string{"executable", "method", "requestId", "extensionErrorCode", "stderrSummary"} {
		if _, found := mapped[key]; found {
			t.Fatalf("unsafe native extension evidence retained %s: %#v", key, mapped)
		}
	}
	encoded := fmt.Sprint(mapped)
	for _, secret := range []string{evidence.Executable, evidence.Method, evidence.RequestID, evidence.ExtensionErrorCode, evidence.StderrSummary} {
		if strings.Contains(encoded, secret) {
			t.Fatalf("unsafe native extension evidence leaked %q: %s", secret, encoded)
		}
	}
}

func parseNativeExtensionOptions(t *testing.T, options map[string]any) (nativeExtensionCallOptions, nativeextension.Evidence, *nativeExtensionOptionError) {
	t.Helper()
	runtime := goja.New()
	bridge := &nativeExtensionRuntime{runtime: runtime}
	return bridge.optionsFromCall(goja.FunctionCall{Arguments: []goja.Value{runtime.ToValue(options)}})
}

func testName(value any) string {
	if text, ok := value.(string); ok {
		if text == "" {
			return "empty"
		}
		return text
	}
	return "non-string"
}
