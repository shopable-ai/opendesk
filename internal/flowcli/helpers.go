package flowcli

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"

	"opendesk/pkg/flow"
)

type envelope struct {
	OK      bool           `json:"ok"`
	Command string         `json:"command"`
	Result  any            `json:"result,omitempty"`
	Error   *errorEnvelope `json:"error,omitempty"`
}
type errorEnvelope struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func resolveDirectory(value string) (string, error) {
	absolute, err := filepath.Abs(value)
	if err != nil {
		return "", newError("invalid_argument", "cannot resolve flow input root")
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", newError("invalid_argument", "cannot resolve flow input root")
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return "", newError("invalid_argument", "flow input root must be an existing directory")
	}
	return resolved, nil
}

func readInputFile(root, relative string) ([]byte, error) {
	candidate := filepath.Join(root, filepath.FromSlash(relative))
	info, err := os.Lstat(candidate)
	if err != nil {
		return nil, newError("invalid_argument", "cannot stat input file "+relative)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return nil, newError("invalid_argument", "input files must be regular files without symlinks")
	}
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil || !pathWithin(root, resolved) {
		return nil, newError("invalid_argument", "input file escapes flow input root")
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return nil, newError("invalid_argument", "cannot read input file "+relative)
	}
	return data, nil
}

func pathWithin(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}

type cliError struct{ code, message string }

func (e *cliError) Error() string         { return e.message }
func newError(code, message string) error { return &cliError{code: code, message: message} }
func clear(value []byte) {
	for index := range value {
		value[index] = 0
	}
}

func writeFailure(stdout io.Writer, command string, err error) int {
	code := string(flow.CodeOf(err))
	if code == "" {
		var ce *cliError
		if errors.As(err, &ce) {
			code = ce.code
		} else {
			code = "invalid_flow"
		}
	}
	return writeErrorWithExit(stdout, command, code, safeMessage(err), 1)
}
func safeMessage(err error) string {
	var fe *flow.Error
	if errors.As(err, &fe) {
		return fe.Message
	}
	var ce *cliError
	if errors.As(err, &ce) {
		return ce.message
	}
	return "flow operation failed"
}
func writeSuccess(stdout io.Writer, command string, result any) int {
	_ = json.NewEncoder(stdout).Encode(envelope{OK: true, Command: command, Result: result})
	return 0
}
func writeError(stdout io.Writer, command, code, message string) int {
	return writeErrorWithExit(stdout, command, code, message, 2)
}

func writeErrorWithExit(stdout io.Writer, command, code, message string, exitCode int) int {
	_ = json.NewEncoder(stdout).Encode(envelope{OK: false, Command: command, Error: &errorEnvelope{Code: code, Message: message}})
	return exitCode
}
