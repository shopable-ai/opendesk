package browserbridge

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"unicode/utf8"
)

// Local files use an independently negotiated Native subprotocol. They are
// never added to the CLI-to-Browser RPC allowlist or to the page SDK.
const FilesProtocol = "opendesk.local-files.v1"
const FilesVersion = 1
const FilesMaxContentBytes = 32 * 1024

type filesRequest struct {
	V         int             `json:"v"`
	Kind      string          `json:"kind"`
	Protocol  string          `json:"protocol"`
	RequestID string          `json:"requestId"`
	SessionID string          `json:"sessionId"`
	Method    string          `json:"method"`
	Params    json.RawMessage `json:"params"`
}

type filesError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Outcome string `json:"outcome,omitempty"`
}

func (e *filesError) Error() string { return e.Code }

type filesResponse struct {
	V         int         `json:"v"`
	Kind      string      `json:"kind"`
	Protocol  string      `json:"protocol"`
	RequestID string      `json:"requestId"`
	SessionID string      `json:"sessionId"`
	Result    any         `json:"result,omitempty"`
	Error     *filesError `json:"error,omitempty"`
}

func filesFailure(code string) *filesError {
	// Error text is fixed. Filesystem errors can contain private absolute paths.
	return &filesError{Code: code, Message: code, Outcome: "NOT_DISPATCHED"}
}

func filesAsError(err error) *filesError {
	var typed *filesError
	if errors.As(err, &typed) {
		return typed
	}
	return filesFailure("E_FILES_IO")
}

func decodeFilesObject(raw []byte, target any) error {
	if len(raw) == 0 || len(raw) > MaxBytes || !utf8.Valid(raw) {
		return ErrSchema
	}
	// Reject duplicate keys as well as unknown fields. The only nested object
	// in the envelope is params, which is validated separately by the method.
	check := json.NewDecoder(bytes.NewReader(raw))
	opening, err := check.Token()
	if err != nil || opening != json.Delim('{') {
		return ErrSchema
	}
	seen := map[string]bool{}
	for check.More() {
		token, err := check.Token()
		key, ok := token.(string)
		if err != nil || !ok || seen[key] {
			return ErrSchema
		}
		seen[key] = true
		var value json.RawMessage
		if check.Decode(&value) != nil {
			return ErrSchema
		}
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return ErrSchema
		}
	}
	if _, err := check.Token(); err != nil {
		return ErrSchema
	}
	var extra any
	if check.Decode(&extra) != io.EOF {
		return ErrSchema
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return ErrSchema
	}
	return nil
}

func decodeFilesRequest(raw []byte) (filesRequest, error) {
	var req filesRequest
	if err := decodeFilesObject(raw, &req); err != nil {
		return req, err
	}
	if req.V != 1 || req.Kind != "files.request" || req.Protocol != FilesProtocol ||
		!RequestIDValid(req.RequestID) || !RequestIDValid(req.SessionID) {
		return req, ErrSchema
	}
	switch req.Method {
	case "files.status", "workspaces.list", "files.list", "files.read", "files.write", "files.create":
	default:
		return req, ErrSchema
	}
	var params map[string]json.RawMessage
	if err := decodeFilesObject(req.Params, &params); err != nil {
		return req, err
	}
	return req, nil
}

func newFilesResponse(req filesRequest) filesResponse {
	return filesResponse{V: 1, Kind: "files.response", Protocol: FilesProtocol,
		RequestID: req.RequestID, SessionID: req.SessionID}
}
