package nativeextension

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

const (
	testHelperEnabled = "OPENDESK_NATIVEEXT_TEST_HELPER"
	testHelperMode    = "OPENDESK_NATIVEEXT_TEST_MODE"
	testHelperPIDFile = "OPENDESK_NATIVEEXT_TEST_PID_FILE"
)

func TestMain(m *testing.M) {
	if os.Getenv(testHelperEnabled) == "1" {
		os.Exit(runExtensionTestHelper(os.Getenv(testHelperMode)))
	}
	os.Exit(m.Run())
}

func runExtensionTestHelper(mode string) int {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		return 91
	}
	var request protocolRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		return 92
	}
	if request.Protocol != ProtocolName || request.Version != ProtocolVersion || request.ID == "" || request.Method == "" {
		return 96
	}
	var paramsObject map[string]json.RawMessage
	if err := json.Unmarshal(request.Params, &paramsObject); err != nil || len(bytes.TrimSpace(request.Params)) == 0 || bytes.TrimSpace(request.Params)[0] != '{' {
		return 97
	}

	base := map[string]any{
		"protocol": ProtocolName,
		"version":  ProtocolVersion,
		"id":       request.ID,
	}
	write := func(payload any) int {
		if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
			return 93
		}
		return 0
	}

	switch mode {
	case "success", "stderr", "privacy":
		if mode == "stderr" {
			_, _ = fmt.Fprintln(os.Stderr, "debug line")
			_, _ = fmt.Fprintln(os.Stderr, "diagnostic line")
		}
		var params map[string]any
		_ = json.Unmarshal(request.Params, &params)
		var result any
		switch request.Method {
		case "add":
			result = map[string]any{"value": params["a"].(float64) + params["b"].(float64)}
		case "privacy":
			result = map[string]any{"echo": params["secret"]}
		default:
			result = map[string]any{"message": "Hello " + fmt.Sprint(params["name"])}
		}
		base["ok"] = true
		base["result"] = result
		return write(base)
	case "result-null":
		base["ok"] = true
		base["result"] = nil
		return write(base)
	case "extension-error":
		base["ok"] = false
		base["error"] = map[string]any{"code": "invalid_params", "message": "a and b are required"}
		return write(base)
	case "crash":
		_, _ = fmt.Fprintln(os.Stderr, "crash diagnostic")
		return 17
	case "timeout":
		time.Sleep(10 * time.Second)
		return 0
	case "spawn-child":
		child := exec.Command("/bin/sh", "-c", "sleep 10")
		if err := child.Start(); err != nil {
			return 94
		}
		if path := os.Getenv(testHelperPIDFile); path != "" {
			_ = os.WriteFile(path, []byte(fmt.Sprint(child.Process.Pid)), 0o600)
		}
		_ = child.Wait()
		return 0
	case "empty":
		return 0
	case "invalid-json":
		_, _ = io.WriteString(os.Stdout, "not-json SECRET_STDOUT_PAYLOAD")
		return 0
	case "invalid-utf8":
		_, _ = os.Stdout.Write([]byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'})
		return 0
	case "multiple-json":
		base["ok"] = true
		base["result"] = map[string]any{}
		if write(base) != 0 {
			return 93
		}
		return write(base)
	case "protocol-mismatch":
		base["protocol"] = "different-protocol"
		base["ok"] = true
		base["result"] = map[string]any{}
		return write(base)
	case "version-mismatch":
		base["version"] = ProtocolVersion + 1
		base["ok"] = true
		base["result"] = map[string]any{}
		return write(base)
	case "id-mismatch":
		base["id"] = "different-request"
		base["ok"] = true
		base["result"] = map[string]any{}
		return write(base)
	case "missing-ok":
		base["result"] = map[string]any{}
		return write(base)
	case "success-missing-result":
		base["ok"] = true
		return write(base)
	case "success-with-error":
		base["ok"] = true
		base["result"] = map[string]any{}
		base["error"] = map[string]any{"code": "unexpected", "message": "unexpected"}
		return write(base)
	case "error-missing-error":
		base["ok"] = false
		return write(base)
	case "error-with-result":
		base["ok"] = false
		base["result"] = map[string]any{}
		base["error"] = map[string]any{"code": "bad", "message": "bad"}
		return write(base)
	case "error-null":
		base["ok"] = false
		base["error"] = nil
		return write(base)
	case "error-empty-code":
		base["ok"] = false
		base["error"] = map[string]any{"code": "", "message": "bad"}
		return write(base)
	case "error-unsafe-code":
		base["ok"] = false
		base["error"] = map[string]any{"code": "REDTEAM_SECRET_EXTENSION_CODE_99", "message": "bad"}
		return write(base)
	case "unknown-field":
		base["ok"] = true
		base["result"] = map[string]any{}
		base["unexpected"] = true
		return write(base)
	case "unknown-error-field":
		base["ok"] = false
		base["error"] = map[string]any{"code": "bad", "message": "bad", "unexpected": true}
		return write(base)
	case "duplicate-response-field":
		_, _ = fmt.Fprintf(os.Stdout, `{"protocol":%q,"version":%d,"id":%q,"ok":true,"ok":false,"result":{}}`, ProtocolName, ProtocolVersion, request.ID)
		return 0
	case "case-variant-response-field":
		_, _ = fmt.Fprintf(os.Stdout, `{"protocol":%q,"Protocol":%q,"version":%d,"id":%q,"ok":true,"result":{}}`, ProtocolName, ProtocolName, ProtocolVersion, request.ID)
		return 0
	case "duplicate-error-field":
		_, _ = fmt.Fprintf(os.Stdout, `{"protocol":%q,"version":%d,"id":%q,"ok":false,"error":{"code":"bad","message":"first","message":"second"}}`, ProtocolName, ProtocolVersion, request.ID)
		return 0
	case "wrong-top-level":
		return write([]any{base})
	case "null-top-level":
		_, _ = io.WriteString(os.Stdout, "null")
		return 0
	case "oversized-stdout":
		_, _ = io.WriteString(os.Stdout, strings.Repeat("X", 512))
		return 0
	case "oversized-stderr":
		_, _ = io.WriteString(os.Stderr, strings.Repeat("diagnostic ", 64))
		base["ok"] = true
		base["result"] = map[string]any{"ok": true}
		return write(base)
	default:
		return 95
	}
}

func TestHostCallSuccessAndInjectedRequestID(t *testing.T) {
	host := NewHost()
	result, err := callHelper(t, host, "success", CallOptions{
		Method:    "add",
		Params:    map[string]any{"a": 20, "b": 22},
		Timeout:   30 * time.Second,
		RequestID: "req-fixed",
	})
	if err != nil {
		t.Fatalf("Call returned error: %v", err)
	}
	value, ok := result.Result.(map[string]any)["value"].(float64)
	if !ok || value != 42 {
		t.Fatalf("unexpected decoded result: %#v", result.Result)
	}
	if result.RequestID != "req-fixed" || result.Evidence.RequestID != "req-fixed" {
		t.Fatalf("request id was not preserved: %#v", result)
	}
	if result.Evidence.Status != StatusSucceeded || result.Evidence.ErrorCode != "" {
		t.Fatalf("unexpected success evidence: %#v", result.Evidence)
	}
	if result.Evidence.ExitCode == nil || *result.Evidence.ExitCode != 0 {
		t.Fatalf("success exit code = %#v", result.Evidence.ExitCode)
	}
	if result.Evidence.Protocol != ProtocolName || result.Evidence.ProtocolVersion != ProtocolVersion {
		t.Fatalf("protocol evidence = %#v", result.Evidence)
	}
	if result.Evidence.StartupDurationMS < 0 || result.Evidence.DurationMS < result.Evidence.StartupDurationMS {
		t.Fatalf("duration evidence = %#v", result.Evidence)
	}
}

func TestHostCallGeneratesRequestIDAndAcceptsNullResult(t *testing.T) {
	result, err := callHelper(t, NewHost(), "result-null", CallOptions{Method: "nullable", Params: nil})
	if err != nil {
		t.Fatal(err)
	}
	if result.RequestID == "" || !strings.HasPrefix(result.RequestID, "req-") {
		t.Fatalf("generated request id = %q", result.RequestID)
	}
	if result.Result != nil {
		t.Fatalf("null result decoded as %#v", result.Result)
	}
}

func TestHostKeepsStderrSeparateFromProtocol(t *testing.T) {
	result, err := callHelper(t, NewHost(), "stderr", CallOptions{
		Method: "hello", Params: map[string]any{"name": "OpenDesk"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Result.(map[string]any)["message"] != "Hello OpenDesk" {
		t.Fatalf("stdout protocol was corrupted: %#v", result.Result)
	}
	if result.Evidence.StderrSummary != "debug line diagnostic line" {
		t.Fatalf("stderr summary = %q", result.Evidence.StderrSummary)
	}
}

func TestHostValidatesInputsAndExecutable(t *testing.T) {
	helper := helperExecutable(t)
	dir := t.TempDir()
	missing := filepath.Join(dir, "missing-extension")
	directory := filepath.Join(dir, "extension-dir")
	if err := os.Mkdir(directory, 0o755); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name string
		opts CallOptions
		code ErrorCode
	}{
		{name: "empty executable", opts: CallOptions{Method: "hello", Params: map[string]any{}}, code: CodeInvalidExecutable},
		{name: "relative executable", opts: CallOptions{Executable: "extension", Method: "hello", Params: map[string]any{}}, code: CodeInvalidExecutable},
		{name: "missing executable", opts: CallOptions{Executable: missing, Method: "hello", Params: map[string]any{}}, code: CodeExecutableNotFound},
		{name: "directory", opts: CallOptions{Executable: directory, Method: "hello", Params: map[string]any{}}, code: CodeInvalidExecutable},
		{name: "missing method", opts: CallOptions{Executable: helper, Params: map[string]any{}}, code: CodeInvalidRequest},
		{name: "negative timeout", opts: CallOptions{Executable: helper, Method: "hello", Params: map[string]any{}, Timeout: -time.Millisecond}, code: CodeInvalidRequest},
		{name: "scalar params", opts: CallOptions{Executable: helper, Method: "hello", Params: 42}, code: CodeInvalidParams},
		{name: "unencodable params", opts: CallOptions{Executable: helper, Method: "hello", Params: map[string]any{"bad": func() {}}}, code: CodeInvalidParams},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := NewHost().Call(context.Background(), test.opts)
			callErr := requireCallError(t, err, test.code)
			assertFailureEvidence(t, result, callErr, test.code)
		})
	}

	if runtime.GOOS != "windows" {
		nonExecutable := filepath.Join(dir, "not-executable")
		if err := os.WriteFile(nonExecutable, []byte("#!/bin/sh\nexit 0\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		result, err := NewHost().Call(context.Background(), CallOptions{
			Executable: nonExecutable, Method: "hello", Params: map[string]any{},
		})
		callErr := requireCallError(t, err, CodePermissionDenied)
		assertFailureEvidence(t, result, callErr, CodePermissionDenied)

		invalidFormat := filepath.Join(dir, "invalid-format")
		if err := os.WriteFile(invalidFormat, []byte("not an executable format\n"), 0o755); err != nil {
			t.Fatal(err)
		}
		result, err = NewHost().Call(context.Background(), CallOptions{
			Executable: invalidFormat, Method: "hello", Params: map[string]any{},
		})
		callErr = requireCallError(t, err, CodeStartFailed)
		assertFailureEvidence(t, result, callErr, CodeStartFailed)
	}
}

func TestHostReportsChildExitAndRemoteExtensionError(t *testing.T) {
	t.Run("child exit", func(t *testing.T) {
		result, err := callHelper(t, NewHost(), "crash", CallOptions{Method: "hello", Params: map[string]any{}})
		callErr := requireCallError(t, err, CodeChildExitNonzero)
		assertFailureEvidence(t, result, callErr, CodeChildExitNonzero)
		if result.Evidence.ExitCode == nil || *result.Evidence.ExitCode != 17 {
			t.Fatalf("exit code = %#v", result.Evidence.ExitCode)
		}
		if result.Evidence.StderrSummary != "crash diagnostic" {
			t.Fatalf("stderr = %q", result.Evidence.StderrSummary)
		}
	})

	t.Run("extension error", func(t *testing.T) {
		result, err := callHelper(t, NewHost(), "extension-error", CallOptions{Method: "add", Params: map[string]any{"a": 20}})
		callErr := requireCallError(t, err, CodeExtensionError)
		assertFailureEvidence(t, result, callErr, CodeExtensionError)
		if callErr.ExtensionError == nil || callErr.ExtensionError.Code != "invalid_params" {
			t.Fatalf("remote error = %#v", callErr.ExtensionError)
		}
		if result.Evidence.ExtensionErrorCode != "invalid_params" {
			t.Fatalf("remote evidence = %#v", result.Evidence)
		}
	})
}

func TestHostEnforcesTimeoutAndCancellation(t *testing.T) {
	t.Run("explicit timeout", func(t *testing.T) {
		started := time.Now()
		result, err := callHelper(t, NewHost(), "timeout", CallOptions{
			Method: "hello", Params: map[string]any{}, Timeout: 30 * time.Millisecond,
		})
		callErr := requireCallError(t, err, CodeTimeout)
		assertFailureEvidence(t, result, callErr, CodeTimeout)
		if result.Evidence.Status != StatusTimedOut {
			t.Fatalf("status = %q", result.Evidence.Status)
		}
		if elapsed := time.Since(started); elapsed > time.Second {
			t.Fatalf("timeout took %s", elapsed)
		}
	})

	t.Run("host default timeout", func(t *testing.T) {
		host := NewHostWithOptions(HostOptions{DefaultTimeout: 25 * time.Millisecond})
		result, err := callHelper(t, host, "timeout", CallOptions{Method: "hello", Params: map[string]any{}})
		callErr := requireCallError(t, err, CodeTimeout)
		assertFailureEvidence(t, result, callErr, CodeTimeout)
	})

	t.Run("parent cancellation", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		time.AfterFunc(25*time.Millisecond, cancel)
		result, err := callHelperContext(t, ctx, NewHost(), "timeout", CallOptions{
			Method: "hello", Params: map[string]any{}, Timeout: time.Second,
		})
		callErr := requireCallError(t, err, CodeCanceled)
		assertFailureEvidence(t, result, callErr, CodeCanceled)
		if result.Evidence.Status != StatusCanceled {
			t.Fatalf("status = %q", result.Evidence.Status)
		}
	})

	t.Run("already canceled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		result, err := callHelperContext(t, ctx, NewHost(), "success", CallOptions{Method: "hello", Params: map[string]any{}})
		callErr := requireCallError(t, err, CodeCanceled)
		assertFailureEvidence(t, result, callErr, CodeCanceled)
		if result.Evidence.ExitCode != nil {
			t.Fatalf("already canceled call started a child: %#v", result.Evidence)
		}
	})
}

func TestHostRejectsInvalidProtocolOutput(t *testing.T) {
	tests := []struct {
		mode string
		code ErrorCode
	}{
		{mode: "empty", code: CodeEmptyResponse},
		{mode: "invalid-json", code: CodeInvalidJSON},
		{mode: "invalid-utf8", code: CodeInvalidJSON},
		{mode: "multiple-json", code: CodeInvalidJSON},
		{mode: "protocol-mismatch", code: CodeProtocolMismatch},
		{mode: "version-mismatch", code: CodeProtocolMismatch},
		{mode: "id-mismatch", code: CodeRequestIDMismatch},
		{mode: "missing-ok", code: CodeInvalidResponse},
		{mode: "success-missing-result", code: CodeInvalidResponse},
		{mode: "success-with-error", code: CodeInvalidResponse},
		{mode: "error-missing-error", code: CodeInvalidResponse},
		{mode: "error-with-result", code: CodeInvalidResponse},
		{mode: "error-null", code: CodeInvalidResponse},
		{mode: "error-empty-code", code: CodeInvalidResponse},
		{mode: "unknown-field", code: CodeInvalidResponse},
		{mode: "unknown-error-field", code: CodeInvalidResponse},
		{mode: "duplicate-response-field", code: CodeInvalidResponse},
		{mode: "case-variant-response-field", code: CodeInvalidResponse},
		{mode: "duplicate-error-field", code: CodeInvalidResponse},
		{mode: "error-unsafe-code", code: CodeInvalidResponse},
		{mode: "wrong-top-level", code: CodeInvalidResponse},
		{mode: "null-top-level", code: CodeInvalidResponse},
	}
	for _, test := range tests {
		t.Run(test.mode, func(t *testing.T) {
			result, err := callHelper(t, NewHost(), test.mode, CallOptions{
				Method: "hello", Params: map[string]any{"name": "OpenDesk"}, RequestID: "req-shape",
			})
			callErr := requireCallError(t, err, test.code)
			assertFailureEvidence(t, result, callErr, test.code)
		})
	}
}

func TestHostBoundsStdoutAndStderr(t *testing.T) {
	t.Run("stdout", func(t *testing.T) {
		host := NewHostWithOptions(HostOptions{MaxStdoutBytes: 64})
		result, err := callHelper(t, host, "oversized-stdout", CallOptions{Method: "hello", Params: map[string]any{}})
		callErr := requireCallError(t, err, CodeResponseTooLarge)
		assertFailureEvidence(t, result, callErr, CodeResponseTooLarge)
	})

	t.Run("stderr", func(t *testing.T) {
		host := NewHostWithOptions(HostOptions{MaxStderrBytes: 32, StderrSummaryBytes: 24})
		result, err := callHelper(t, host, "oversized-stderr", CallOptions{Method: "hello", Params: map[string]any{}})
		if err != nil {
			t.Fatal(err)
		}
		if !result.Evidence.StderrTruncated {
			t.Fatalf("stderr truncation not recorded: %#v", result.Evidence)
		}
		if len(result.Evidence.StderrSummary) > 24 || !strings.Contains(result.Evidence.StderrSummary, "[truncated]") {
			t.Fatalf("bounded stderr summary = %q", result.Evidence.StderrSummary)
		}
	})

	t.Run("summary only", func(t *testing.T) {
		const summaryLimit = 64
		host := NewHostWithOptions(HostOptions{MaxStderrBytes: 4 << 10, StderrSummaryBytes: summaryLimit})
		result, err := callHelper(t, host, "oversized-stderr", CallOptions{Method: "hello", Params: map[string]any{}})
		if err != nil {
			t.Fatal(err)
		}
		if !result.Evidence.StderrTruncated {
			t.Fatalf("summary-only truncation not recorded: %#v", result.Evidence)
		}
		if len(result.Evidence.StderrSummary) > summaryLimit {
			t.Fatalf("stderr summary exceeded privacy limit: len=%d summary=%q", len(result.Evidence.StderrSummary), result.Evidence.StderrSummary)
		}
		if !strings.HasSuffix(result.Evidence.StderrSummary, "[truncated]") {
			t.Fatalf("stderr summary lacks truncation marker: %q", result.Evidence.StderrSummary)
		}
	})
}

func TestEvidenceExcludesParamsResultAndStdout(t *testing.T) {
	const secret = "TOP_SECRET_PARAMS_AND_RESULT"
	result, err := callHelper(t, NewHost(), "privacy", CallOptions{
		Method: "privacy", Params: map[string]any{"secret": secret}, RequestID: "req-privacy",
	})
	if err != nil {
		t.Fatal(err)
	}
	evidenceJSON, err := json.Marshal(result.Evidence)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(evidenceJSON), secret) {
		t.Fatalf("evidence leaked params/result: %s", evidenceJSON)
	}
	var evidenceFields map[string]any
	if err := json.Unmarshal(evidenceJSON, &evidenceFields); err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"params", "result", "stdout"} {
		if _, exists := evidenceFields[forbidden]; exists {
			t.Fatalf("evidence contains forbidden field %q: %s", forbidden, evidenceJSON)
		}
	}

	failed, err := callHelper(t, NewHost(), "invalid-json", CallOptions{
		Method: "hello", Params: map[string]any{"secret": secret}, RequestID: "req-private-failure",
	})
	callErr := requireCallError(t, err, CodeInvalidJSON)
	for _, evidence := range []Evidence{failed.Evidence, callErr.Evidence} {
		raw, marshalErr := json.Marshal(evidence)
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		if strings.Contains(string(raw), secret) || strings.Contains(string(raw), "SECRET_STDOUT_PAYLOAD") {
			t.Fatalf("failure evidence leaked private protocol data: %s", raw)
		}
	}
}

func TestProtocolDefaults(t *testing.T) {
	if DefaultTimeout != 3*time.Second {
		t.Fatalf("DefaultTimeout = %s", DefaultTimeout)
	}
	if ProtocolName != "opendesk-native-extension" || ProtocolVersion != 1 {
		t.Fatalf("protocol constants = %q/%d", ProtocolName, ProtocolVersion)
	}
}

func TestZeroValueHostUsesDefaults(t *testing.T) {
	var host Host
	result, err := callHelper(t, &host, "success", CallOptions{
		Method: "hello", Params: map[string]any{"name": "OpenDesk"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Evidence.Status != StatusSucceeded {
		t.Fatalf("zero-value Host evidence = %#v", result.Evidence)
	}
}

func callHelper(t *testing.T, host *Host, mode string, opts CallOptions) (CallResult, error) {
	t.Helper()
	return callHelperContext(t, context.Background(), host, mode, opts)
}

func callHelperContext(t *testing.T, ctx context.Context, host *Host, mode string, opts CallOptions) (CallResult, error) {
	t.Helper()
	t.Setenv(testHelperEnabled, "1")
	t.Setenv(testHelperMode, mode)
	opts.Executable = helperExecutable(t)
	return host.Call(ctx, opts)
}

func helperExecutable(t *testing.T) string {
	t.Helper()
	path, err := filepath.Abs(os.Args[0])
	if err != nil {
		t.Fatal(err)
	}
	return path
}

func requireCallError(t *testing.T, err error, code ErrorCode) *CallError {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s error", code)
	}
	var callErr *CallError
	if !errors.As(err, &callErr) {
		t.Fatalf("expected *CallError, got %T: %v", err, err)
	}
	if callErr.Code != code {
		t.Fatalf("error code = %q, want %q: %v", callErr.Code, code, err)
	}
	return callErr
}

func assertFailureEvidence(t *testing.T, result CallResult, callErr *CallError, code ErrorCode) {
	t.Helper()
	if result.Evidence.ErrorCode != code || callErr.Evidence.ErrorCode != code {
		t.Fatalf("error evidence code mismatch: result=%#v error=%#v", result.Evidence, callErr.Evidence)
	}
	if result.Evidence.Status == StatusSucceeded || callErr.Evidence.Status == StatusSucceeded {
		t.Fatalf("failed call marked succeeded: result=%#v error=%#v", result.Evidence, callErr.Evidence)
	}
	if result.RequestID == "" || result.RequestID != result.Evidence.RequestID {
		t.Fatalf("failure request id missing: %#v", result)
	}
}
