package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/nativeextension"
)

type fakeNativeExtensionCaller struct {
	result  nativeextension.CallResult
	err     error
	options nativeextension.CallOptions
	calls   int
}

func (f *fakeNativeExtensionCaller) Call(_ context.Context, options nativeextension.CallOptions) (nativeextension.CallResult, error) {
	f.calls++
	f.options = options
	return f.result, f.err
}

func TestNativeExtensionCLIRequested(t *testing.T) {
	for _, args := range [][]string{
		{"-native-extension", "/tmp/ext"},
		{"--native-extension", "/tmp/ext"},
		{"-native-extension=/tmp/ext"},
		{"--native-extension=/tmp/ext"},
	} {
		if !nativeExtensionCLIRequested(args) {
			t.Fatalf("nativeExtensionCLIRequested(%q) = false", args)
		}
	}
	if nativeExtensionCLIRequested([]string{"-script-text", "console.log(1)"}) {
		t.Fatal("ordinary script invocation was classified as native extension CLI")
	}
	if nativeExtensionCLIRequested([]string{"--", "-native-extension", "/tmp/ext"}) {
		t.Fatal("flag after -- was classified as native extension CLI")
	}
}

func TestDecodeNativeExtensionParamsRequiresJSONObject(t *testing.T) {
	params, err := decodeNativeExtensionParams(`{"a":20,"b":22}`)
	if err != nil {
		t.Fatalf("decodeNativeExtensionParams returned error: %v", err)
	}
	if params["a"] != float64(20) || params["b"] != float64(22) {
		t.Fatalf("unexpected params: %#v", params)
	}

	for _, raw := range []string{"", "null", "[]", `"value"`, "{invalid"} {
		if _, err := decodeNativeExtensionParams(raw); err == nil {
			t.Fatalf("decodeNativeExtensionParams(%q) unexpectedly succeeded", raw)
		}
	}
}

func TestExecuteNativeExtensionCLISuccessWritesSingleEnvelope(t *testing.T) {
	caller := &fakeNativeExtensionCaller{result: nativeextension.CallResult{
		Result: map[string]any{"message": "Hello OpenDesk"},
	}}
	config := &Config{
		NativeExtension: "/tmp/native-ext-go-basic",
		NativeMethod:    "hello",
		NativeParams:    `{"name":"OpenDesk"}`,
		NativeTimeoutMS: 3456,
		NativeRequestID: "req-cli-test",
	}
	var stdout, stderr bytes.Buffer

	if code := executeNativeExtensionCLI(context.Background(), config, &stdout, &stderr, caller); code != 0 {
		t.Fatalf("exit code = %d, stderr=%q", code, stderr.String())
	}
	if caller.calls != 1 {
		t.Fatalf("host calls = %d, want 1", caller.calls)
	}
	if caller.options.Executable != config.NativeExtension || caller.options.Method != "hello" {
		t.Fatalf("unexpected call options: %+v", caller.options)
	}
	if caller.options.Timeout != 3456*time.Millisecond || caller.options.RequestID != "req-cli-test" {
		t.Fatalf("timeout/request id not forwarded: %+v", caller.options)
	}
	params, ok := caller.options.Params.(map[string]any)
	if !ok || params["name"] != "OpenDesk" {
		t.Fatalf("params not forwarded as object: %#v", caller.options.Params)
	}

	envelope := decodeSingleNativeCLIEnvelope(t, stdout.Bytes())
	if envelope["ok"] != true {
		t.Fatalf("unexpected envelope: %#v", envelope)
	}
	if _, ok := envelope["result"]; !ok {
		t.Fatalf("success envelope omitted result: %#v", envelope)
	}
	if _, ok := envelope["error"]; ok {
		t.Fatalf("success envelope included error: %#v", envelope)
	}
	if _, ok := envelope["evidence"]; !ok {
		t.Fatalf("success envelope omitted evidence: %#v", envelope)
	}
}

func TestExecuteNativeExtensionCLIRejectsNonObjectWithoutCallingHost(t *testing.T) {
	const privateValue = "private-param-must-not-enter-evidence"
	caller := &fakeNativeExtensionCaller{}
	config := &Config{
		NativeExtension: "  /tmp/native-ext-go-basic  ",
		NativeMethod:    "  add  ",
		NativeParams:    `["` + privateValue + `"]`,
		NativeRequestID: "  req-local-invalid-params  ",
	}
	var stdout, stderr bytes.Buffer

	if code := executeNativeExtensionCLI(context.Background(), config, &stdout, &stderr, caller); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if caller.calls != 0 {
		t.Fatalf("host calls = %d, want 0", caller.calls)
	}
	envelope := decodeSingleNativeCLIEnvelope(t, stdout.Bytes())
	if envelope["ok"] != false {
		t.Fatalf("unexpected envelope: %#v", envelope)
	}
	errorBody, ok := envelope["error"].(map[string]any)
	if !ok || errorBody["code"] != "invalid_params" {
		t.Fatalf("unexpected error body: %#v", envelope["error"])
	}
	if _, ok := envelope["result"]; ok {
		t.Fatalf("error envelope included result: %#v", envelope)
	}
	evidence, ok := envelope["evidence"].(map[string]any)
	if !ok {
		t.Fatalf("error envelope omitted evidence: %#v", envelope)
	}
	if evidence["executable"] != "/tmp/native-ext-go-basic" || evidence["method"] != "add" {
		t.Fatalf("attempt identity was not recorded: %#v", evidence)
	}
	if evidence["protocol"] != nativeextension.ProtocolName || evidence["protocolVersion"] != float64(nativeextension.ProtocolVersion) {
		t.Fatalf("protocol identity was not recorded: %#v", evidence)
	}
	if evidence["requestId"] != "req-local-invalid-params" || evidence["status"] != nativeextension.StatusFailed || evidence["errorCode"] != "invalid_params" {
		t.Fatalf("failure identity was not recorded: %#v", evidence)
	}
	if evidence["startupDurationMs"] != float64(0) {
		t.Fatalf("local validation must not report child startup: %#v", evidence)
	}
	if duration, ok := evidence["durationMs"].(float64); !ok || duration < 0 {
		t.Fatalf("local validation duration is invalid: %#v", evidence)
	}
	for _, forbidden := range []string{"exitCode", "stderrSummary", "stderrTruncated", "extensionErrorCode"} {
		if _, exists := evidence[forbidden]; exists {
			t.Fatalf("local validation fabricated child field %q: %#v", forbidden, evidence)
		}
	}
	if strings.Contains(stdout.String(), privateValue) {
		t.Fatalf("private params leaked to CLI output: %q", stdout.String())
	}
}

func TestExecuteNativeExtensionCLIMapsCallErrorAndHostEvidence(t *testing.T) {
	evidence := nativeextension.Evidence{
		Executable:         "/tmp/native-ext-go-basic",
		Method:             "add",
		Protocol:           nativeextension.ProtocolName,
		ProtocolVersion:    nativeextension.ProtocolVersion,
		RequestID:          "req-extension-error",
		Status:             nativeextension.StatusFailed,
		ErrorCode:          nativeextension.CodeExtensionError,
		ExtensionErrorCode: "invalid_params",
	}
	caller := &fakeNativeExtensionCaller{
		result: nativeextension.CallResult{RequestID: evidence.RequestID, Evidence: evidence},
		err: &nativeextension.CallError{
			Code:    nativeextension.CodeExtensionError,
			Message: "a and b are required",
			ExtensionError: &nativeextension.ExtensionError{
				Code:    "invalid_params",
				Message: "a and b are required",
			},
			Evidence: evidence,
		},
	}
	config := &Config{
		NativeExtension: evidence.Executable,
		NativeMethod:    evidence.Method,
		NativeParams:    `{}`,
		NativeTimeoutMS: 3000,
	}
	var stdout, stderr bytes.Buffer

	if code := executeNativeExtensionCLI(context.Background(), config, &stdout, &stderr, caller); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	envelope := decodeSingleNativeCLIEnvelope(t, stdout.Bytes())
	errorBody, ok := envelope["error"].(map[string]any)
	if !ok {
		t.Fatalf("unexpected error body: %#v", envelope["error"])
	}
	if errorBody["code"] != "extension_error" || errorBody["message"] != "a and b are required" || errorBody["extensionCode"] != "invalid_params" {
		t.Fatalf("typed call error was not preserved: %#v", errorBody)
	}
	encodedEvidence, ok := envelope["evidence"].(map[string]any)
	if !ok || encodedEvidence["requestId"] != evidence.RequestID || encodedEvidence["extensionErrorCode"] != "invalid_params" {
		t.Fatalf("host evidence was not preserved: %#v", envelope["evidence"])
	}
	if _, ok := envelope["result"]; ok {
		t.Fatalf("error envelope included result: %#v", envelope)
	}
}

func decodeSingleNativeCLIEnvelope(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(raw))
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		t.Fatalf("decode CLI envelope: %v; raw=%q", err, raw)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		t.Fatalf("stdout contained trailing data: %q (decode error: %v)", raw, err)
	}
	return envelope
}
