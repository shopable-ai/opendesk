package nativeextension

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

var extensionErrorCodePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

const (
	DefaultTimeout            = 3 * time.Second
	DefaultMaxStdoutBytes     = 1 << 20
	DefaultMaxStderrBytes     = 64 << 10
	DefaultStderrSummaryBytes = 4 << 10
	processWaitAfterKill      = 500 * time.Millisecond
)

// ErrorCode classifies host, transport, protocol, and remote extension errors.
type ErrorCode string

const (
	CodeInvalidRequest     ErrorCode = "invalid_request"
	CodeInvalidParams      ErrorCode = "invalid_params"
	CodeInvalidExecutable  ErrorCode = "invalid_executable"
	CodeExecutableNotFound ErrorCode = "executable_not_found"
	CodePermissionDenied   ErrorCode = "permission_denied"
	CodeStartFailed        ErrorCode = "start_failed"
	CodeProcessFailed      ErrorCode = "process_failed"
	CodeTimeout            ErrorCode = "timeout"
	CodeCanceled           ErrorCode = "canceled"
	CodeChildExitNonzero   ErrorCode = "child_exit_nonzero"
	CodeEmptyResponse      ErrorCode = "empty_response"
	CodeResponseTooLarge   ErrorCode = "response_too_large"
	CodeInvalidJSON        ErrorCode = "invalid_json"
	CodeInvalidResponse    ErrorCode = "invalid_response"
	CodeProtocolMismatch   ErrorCode = "protocol_mismatch"
	CodeRequestIDMismatch  ErrorCode = "request_id_mismatch"
	CodeExtensionError     ErrorCode = "extension_error"
)

const (
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusTimedOut  = "timed_out"
	StatusCanceled  = "canceled"
)

// CallOptions describes one one-shot extension invocation. Params must encode
// as a JSON object. A zero Timeout uses the host default. RequestID is optional;
// callers normally leave it empty, while deterministic harnesses may inject it.
type CallOptions struct {
	Executable string
	Method     string
	Params     any
	Timeout    time.Duration
	RequestID  string
}

// HostOptions controls bounded resource usage. Non-positive fields use the
// package defaults.
type HostOptions struct {
	DefaultTimeout     time.Duration
	MaxStdoutBytes     int
	MaxStderrBytes     int
	StderrSummaryBytes int
}

// Evidence is the privacy-minimized diagnostic record for one invocation. It
// intentionally excludes params, result data, and raw stdout.
type Evidence struct {
	Executable          string    `json:"executable"`
	Method              string    `json:"method"`
	Protocol            string    `json:"protocol"`
	ProtocolVersion     int       `json:"protocolVersion"`
	RequestID           string    `json:"requestId"`
	StartupDurationMS   int64     `json:"startupDurationMs"`
	DurationMS          int64     `json:"durationMs"`
	ExitCode            *int      `json:"exitCode,omitempty"`
	Status              string    `json:"status"`
	ErrorCode           ErrorCode `json:"errorCode,omitempty"`
	ExtensionErrorCode  string    `json:"extensionErrorCode,omitempty"`
	StderrSummary       string    `json:"stderrSummary,omitempty"`
	StderrCapturedBytes int       `json:"stderrCapturedBytes,omitempty"`
	StderrSHA256        string    `json:"stderrSha256,omitempty"`
	StderrTruncated     bool      `json:"stderrTruncated,omitempty"`
}

// CallResult contains the decoded JSON result and per-call Evidence. JSON
// numbers inside Result use encoding/json's normal float64 representation.
// On failure, Call still returns a CallResult containing diagnostic Evidence.
type CallResult struct {
	RequestID string   `json:"requestId"`
	Result    any      `json:"result"`
	Evidence  Evidence `json:"evidence"`
}

// CallError is returned for every unsuccessful host invocation. ExtensionError
// is populated only when a valid ok:false response was received.
type CallError struct {
	Code           ErrorCode       `json:"code"`
	Message        string          `json:"message"`
	ExtensionError *ExtensionError `json:"extensionError,omitempty"`
	Evidence       Evidence        `json:"evidence"`
	Cause          error           `json:"-"`
}

func (e *CallError) Error() string {
	if e == nil {
		return ""
	}
	if strings.TrimSpace(e.Message) == "" {
		return string(e.Code)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *CallError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

// Host runs one request per child process.
type Host struct {
	defaultTimeout     time.Duration
	maxStdoutBytes     int
	maxStderrBytes     int
	stderrSummaryBytes int
	requestSequence    atomic.Uint64
}

// NewHost returns a Host with conservative V0 defaults.
func NewHost() *Host {
	return NewHostWithOptions(HostOptions{})
}

// NewHostWithOptions returns a Host with selected resource limits.
func NewHostWithOptions(opts HostOptions) *Host {
	return &Host{
		defaultTimeout:     positiveDuration(opts.DefaultTimeout, DefaultTimeout),
		maxStdoutBytes:     positiveInt(opts.MaxStdoutBytes, DefaultMaxStdoutBytes),
		maxStderrBytes:     positiveInt(opts.MaxStderrBytes, DefaultMaxStderrBytes),
		stderrSummaryBytes: positiveInt(opts.StderrSummaryBytes, DefaultStderrSummaryBytes),
	}
}

// Call starts the configured executable, writes one request to stdin, reads one
// response from stdout, waits for process exit, and validates the V0 envelope.
func (h *Host) Call(ctx context.Context, opts CallOptions) (CallResult, error) {
	startedAt := time.Now()
	host := h
	if host == nil {
		host = NewHost()
	}
	config := host.normalizedConfig()
	method := strings.TrimSpace(opts.Method)
	requestID := strings.TrimSpace(opts.RequestID)
	if requestID == "" {
		requestID = host.nextRequestID()
	}
	evidence := Evidence{
		Executable:      strings.TrimSpace(opts.Executable),
		Method:          method,
		Protocol:        ProtocolName,
		ProtocolVersion: ProtocolVersion,
		RequestID:       requestID,
		Status:          StatusFailed,
	}

	finishError := func(code ErrorCode, status, message string, cause error, extensionError *ExtensionError) (CallResult, error) {
		evidence.Status = status
		evidence.ErrorCode = code
		if extensionError != nil {
			evidence.ExtensionErrorCode = extensionError.Code
		}
		evidence.DurationMS = time.Since(startedAt).Milliseconds()
		result := CallResult{RequestID: requestID, Evidence: evidence}
		return result, &CallError{
			Code:           code,
			Message:        message,
			ExtensionError: extensionError,
			Evidence:       evidence,
			Cause:          cause,
		}
	}

	if method == "" {
		return finishError(CodeInvalidRequest, StatusFailed, "method is required", nil, nil)
	}
	if opts.Timeout < 0 {
		return finishError(CodeInvalidRequest, StatusFailed, "timeout must not be negative", nil, nil)
	}

	executable, err := validateExecutable(opts.Executable)
	if err != nil {
		var validationErr *executableValidationError
		if errors.As(err, &validationErr) {
			return finishError(validationErr.code, StatusFailed, validationErr.message, validationErr.cause, nil)
		}
		return finishError(CodeInvalidExecutable, StatusFailed, "validate extension executable", err, nil)
	}
	evidence.Executable = executable

	params, err := marshalParams(opts.Params)
	if err != nil {
		return finishError(CodeInvalidParams, StatusFailed, "params must be a JSON object", err, nil)
	}
	requestPayload, err := json.Marshal(protocolRequest{
		Protocol: ProtocolName,
		Version:  ProtocolVersion,
		ID:       requestID,
		Method:   method,
		Params:   params,
	})
	if err != nil {
		return finishError(CodeInvalidRequest, StatusFailed, "encode extension request", err, nil)
	}
	requestPayload = append(requestPayload, '\n')

	parentContext := ctx
	if parentContext == nil {
		parentContext = context.Background()
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = config.defaultTimeout
	}
	runContext, cancel := context.WithTimeout(parentContext, timeout)
	defer cancel()
	if err := runContext.Err(); err != nil {
		return finishContextError(finishError, err)
	}

	stdout := newLimitedBuffer(config.maxStdoutBytes)
	stderr := newLimitedBuffer(config.maxStderrBytes)
	cmd := exec.Command(executable)
	configureCommand(cmd)
	cmd.Stdin = bytes.NewReader(requestPayload)
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	startupStartedAt := time.Now()
	if err := cmd.Start(); err != nil {
		evidence.StartupDurationMS = time.Since(startupStartedAt).Milliseconds()
		setStderrEvidence(&evidence, stderr, config.stderrSummaryBytes)
		code := classifyStartError(err)
		message := "start extension process"
		if code == CodeExecutableNotFound {
			message = "extension executable was not found"
		} else if code == CodePermissionDenied {
			message = "permission denied starting extension executable"
		}
		return finishError(code, StatusFailed, message, err, nil)
	}
	evidence.StartupDurationMS = time.Since(startupStartedAt).Milliseconds()

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	var runErr error
	select {
	case runErr = <-done:
	case <-runContext.Done():
		// Prefer a child result that was already available at the deadline. This
		// avoids signaling a process group after its leader has already been reaped.
		select {
		case runErr = <-done:
		default:
			terminateCommand(cmd)
			reaped := false
			select {
			case runErr = <-done:
				reaped = true
			case <-time.After(processWaitAfterKill):
				// SIGKILL should make Wait return immediately. Keep the host's
				// deadline bounded even if the operating system fails to reap the
				// process promptly; limitedBuffer remains safe for this rare path.
			}
			if reaped {
				evidence.ExitCode = processExitCode(cmd)
			}
			setStderrEvidence(&evidence, stderr, config.stderrSummaryBytes)
			return finishContextError(finishError, runContext.Err())
		}
	}

	evidence.ExitCode = processExitCode(cmd)
	setStderrEvidence(&evidence, stderr, config.stderrSummaryBytes)
	if runErr != nil {
		var exitErr *exec.ExitError
		if errors.As(runErr, &exitErr) {
			return finishError(CodeChildExitNonzero, StatusFailed, fmt.Sprintf("extension exited with code %d", exitErr.ExitCode()), runErr, nil)
		}
		return finishError(CodeProcessFailed, StatusFailed, "wait for extension process", runErr, nil)
	}

	if stdout.Truncated() {
		return finishError(CodeResponseTooLarge, StatusFailed, "extension response exceeded the stdout limit", nil, nil)
	}
	responsePayload := bytes.TrimSpace(stdout.Bytes())
	if len(responsePayload) == 0 {
		return finishError(CodeEmptyResponse, StatusFailed, "extension returned an empty response", nil, nil)
	}
	if !utf8.Valid(responsePayload) || !json.Valid(responsePayload) {
		return finishError(CodeInvalidJSON, StatusFailed, "extension stdout was not one UTF-8 JSON value", nil, nil)
	}

	wire, err := decodeResponseWire(responsePayload)
	if err != nil {
		return finishError(CodeInvalidResponse, StatusFailed, "extension response has an invalid shape", err, nil)
	}
	if wire.Protocol != ProtocolName || wire.Version != ProtocolVersion {
		return finishError(CodeProtocolMismatch, StatusFailed, "extension protocol or version does not match the host", nil, nil)
	}
	if wire.ID != requestID {
		return finishError(CodeRequestIDMismatch, StatusFailed, "extension response request id does not match", nil, nil)
	}
	if wire.OK == nil {
		return finishError(CodeInvalidResponse, StatusFailed, "extension response is missing ok", nil, nil)
	}

	if *wire.OK {
		if len(wire.Result) == 0 || len(wire.Error) != 0 {
			return finishError(CodeInvalidResponse, StatusFailed, "successful response must contain result and omit error", nil, nil)
		}
		var decodedResult any
		if err := json.Unmarshal(wire.Result, &decodedResult); err != nil {
			return finishError(CodeInvalidResponse, StatusFailed, "decode extension result", err, nil)
		}
		evidence.Status = StatusSucceeded
		evidence.DurationMS = time.Since(startedAt).Milliseconds()
		return CallResult{RequestID: requestID, Result: decodedResult, Evidence: evidence}, nil
	}

	if len(wire.Result) != 0 || len(wire.Error) == 0 {
		return finishError(CodeInvalidResponse, StatusFailed, "error response must contain error and omit result", nil, nil)
	}
	extensionError, err := decodeExtensionError(wire.Error)
	if err != nil {
		return finishError(CodeInvalidResponse, StatusFailed, "extension error has an invalid shape", err, nil)
	}
	if !extensionErrorCodePattern.MatchString(extensionError.Code) || strings.TrimSpace(extensionError.Message) == "" {
		return finishError(CodeInvalidResponse, StatusFailed, "extension error code and message are required", nil, nil)
	}
	return finishError(CodeExtensionError, StatusFailed, extensionError.Message, nil, extensionError)
}

type finishErrorFunc func(ErrorCode, string, string, error, *ExtensionError) (CallResult, error)

func finishContextError(finish finishErrorFunc, err error) (CallResult, error) {
	if errors.Is(err, context.DeadlineExceeded) {
		return finish(CodeTimeout, StatusTimedOut, "extension call timed out", err, nil)
	}
	return finish(CodeCanceled, StatusCanceled, "extension call was canceled", err, nil)
}

type hostConfig struct {
	defaultTimeout     time.Duration
	maxStdoutBytes     int
	maxStderrBytes     int
	stderrSummaryBytes int
}

func (h *Host) normalizedConfig() hostConfig {
	return hostConfig{
		defaultTimeout:     positiveDuration(h.defaultTimeout, DefaultTimeout),
		maxStdoutBytes:     positiveInt(h.maxStdoutBytes, DefaultMaxStdoutBytes),
		maxStderrBytes:     positiveInt(h.maxStderrBytes, DefaultMaxStderrBytes),
		stderrSummaryBytes: positiveInt(h.stderrSummaryBytes, DefaultStderrSummaryBytes),
	}
}

func (h *Host) nextRequestID() string {
	sequence := h.requestSequence.Add(1)
	return fmt.Sprintf("req-%d-%d", time.Now().UnixNano(), sequence)
}

func marshalParams(params any) (json.RawMessage, error) {
	if params == nil {
		return json.RawMessage(`{}`), nil
	}
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) < 2 || trimmed[0] != '{' {
		return nil, fmt.Errorf("params encoded as %s instead of an object", jsonTypeName(trimmed))
	}
	return json.RawMessage(trimmed), nil
}

func jsonTypeName(raw []byte) string {
	if len(raw) == 0 {
		return "empty JSON"
	}
	switch raw[0] {
	case '[':
		return "array"
	case '"':
		return "string"
	case 'n':
		return "null"
	case 't', 'f':
		return "boolean"
	default:
		return "number"
	}
}

func decodeResponseWire(raw []byte) (responseWire, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return responseWire{}, fmt.Errorf("response must be a JSON object")
	}
	if err := validateStrictJSONDepth(trimmed, 64); err != nil {
		return responseWire{}, err
	}
	object, err := decodeExactJSONObject(trimmed, "response")
	if err != nil {
		return responseWire{}, err
	}
	if err := validateExactObjectFields(object, "response", []string{"protocol", "version", "id", "ok"}, []string{"result", "error"}); err != nil {
		return responseWire{}, err
	}
	var wire responseWire
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return responseWire{}, err
	}
	return wire, nil
}

func decodeExtensionError(raw []byte) (*ExtensionError, error) {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, fmt.Errorf("error must be an object")
	}
	if err := validateStrictJSONDepth(raw, 16); err != nil {
		return nil, err
	}
	object, err := decodeExactJSONObject(raw, "response.error")
	if err != nil {
		return nil, err
	}
	if err := validateExactObjectFields(object, "response.error", []string{"code", "message"}, nil); err != nil {
		return nil, err
	}
	var extensionError ExtensionError
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&extensionError); err != nil {
		return nil, err
	}
	return &extensionError, nil
}

type executableValidationError struct {
	code    ErrorCode
	message string
	cause   error
}

func (e *executableValidationError) Error() string { return e.message }
func (e *executableValidationError) Unwrap() error { return e.cause }

func validateExecutable(input string) (string, error) {
	executable := strings.TrimSpace(input)
	if executable == "" {
		return "", &executableValidationError{code: CodeInvalidExecutable, message: "extension executable is required"}
	}
	if !filepath.IsAbs(executable) {
		return "", &executableValidationError{code: CodeInvalidExecutable, message: "extension executable must be an absolute path"}
	}
	executable = filepath.Clean(executable)
	info, err := os.Stat(executable)
	if err != nil {
		switch {
		case errors.Is(err, fs.ErrNotExist):
			return "", &executableValidationError{code: CodeExecutableNotFound, message: "extension executable was not found", cause: err}
		case errors.Is(err, fs.ErrPermission):
			return "", &executableValidationError{code: CodePermissionDenied, message: "permission denied inspecting extension executable", cause: err}
		default:
			return "", &executableValidationError{code: CodeInvalidExecutable, message: "inspect extension executable", cause: err}
		}
	}
	if !info.Mode().IsRegular() {
		return "", &executableValidationError{code: CodeInvalidExecutable, message: "extension executable must be a regular file"}
	}
	if lacksExecutePermission(info) {
		return "", &executableValidationError{code: CodePermissionDenied, message: "extension executable is not executable"}
	}
	return executable, nil
}

func classifyStartError(err error) ErrorCode {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return CodeExecutableNotFound
	case errors.Is(err, fs.ErrPermission):
		return CodePermissionDenied
	default:
		return CodeStartFailed
	}
}

func processExitCode(cmd *exec.Cmd) *int {
	if cmd == nil || cmd.ProcessState == nil {
		return nil
	}
	code := cmd.ProcessState.ExitCode()
	return &code
}

func positiveDuration(value, fallback time.Duration) time.Duration {
	if value > 0 {
		return value
	}
	return fallback
}

func positiveInt(value, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}

type limitedBuffer struct {
	mu        sync.Mutex
	buffer    bytes.Buffer
	limit     int
	truncated bool
}

func newLimitedBuffer(limit int) *limitedBuffer {
	return &limitedBuffer{limit: limit}
}

func (b *limitedBuffer) Write(data []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	originalLength := len(data)
	remaining := b.limit - b.buffer.Len()
	if remaining > 0 {
		if len(data) > remaining {
			_, _ = b.buffer.Write(data[:remaining])
			b.truncated = true
		} else {
			_, _ = b.buffer.Write(data)
		}
	} else if len(data) > 0 {
		b.truncated = true
	}
	return originalLength, nil
}

func (b *limitedBuffer) Bytes() []byte {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]byte(nil), b.buffer.Bytes()...)
}

func (b *limitedBuffer) Truncated() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.truncated
}

func setStderrEvidence(evidence *Evidence, stderr *limitedBuffer, summaryLimit int) {
	if evidence == nil || stderr == nil {
		return
	}
	raw := stderr.Bytes()
	evidence.StderrCapturedBytes = len(raw)
	if len(raw) > 0 {
		evidence.StderrSHA256 = fmt.Sprintf("%x", sha256.Sum256(raw))
	}
	evidence.StderrSummary, evidence.StderrTruncated = summarizeStderr(raw, stderr.Truncated(), summaryLimit)
}

func summarizeStderr(raw []byte, captureTruncated bool, limit int) (string, bool) {
	if limit <= 0 {
		return "", len(raw) > 0 || captureTruncated
	}
	valid := strings.ToValidUTF8(string(raw), "�")
	summary := strings.Join(strings.Fields(valid), " ")
	truncated := captureTruncated || len(summary) > limit
	if !truncated {
		return summary, false
	}

	const marker = "[truncated]"
	if limit <= len(marker) {
		return truncateUTF8(marker, limit), true
	}
	contentLimit := limit - len(marker)
	if summary != "" {
		contentLimit-- // reserve one byte for the separator
	}
	content := truncateUTF8(summary, contentLimit)
	if content != "" {
		content += " "
	}
	return content + marker, true
}

func truncateUTF8(value string, limit int) string {
	if limit <= 0 || len(value) == 0 {
		return ""
	}
	if len(value) <= limit {
		return value
	}
	end := limit
	for end > 0 && !utf8.RuneStart(value[end]) {
		end--
	}
	return value[:end]
}
