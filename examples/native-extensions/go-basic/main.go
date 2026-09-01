package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"strings"
)

const (
	protocolName    = "opendesk-native-extension"
	protocolVersion = 1
)

type request struct {
	Protocol string          `json:"protocol"`
	Version  int             `json:"version"`
	ID       string          `json:"id"`
	Method   string          `json:"method"`
	Params   json.RawMessage `json:"params"`
}

type protocolError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type response struct {
	Protocol string         `json:"protocol"`
	Version  int            `json:"version"`
	ID       string         `json:"id"`
	OK       bool           `json:"ok"`
	Result   any            `json:"result,omitempty"`
	Error    *protocolError `json:"error,omitempty"`
}

func main() {
	req, failure := readRequest(os.Stdin)
	if failure != nil {
		writeError(req.ID, safeMethod(req.Method), failure)
		return
	}

	result, failure := dispatch(req)
	if failure != nil {
		writeError(req.ID, safeMethod(req.Method), failure)
		return
	}

	writeResponse(response{
		Protocol: protocolName,
		Version:  protocolVersion,
		ID:       req.ID,
		OK:       true,
		Result:   result,
	})
	fmt.Fprintf(os.Stderr, "native-ext-go-basic method=%s status=ok\n", safeMethod(req.Method))
}

func readRequest(reader io.Reader) (request, *protocolError) {
	var req request
	data, err := io.ReadAll(reader)
	if err != nil {
		return req, &protocolError{Code: "invalid_request", Message: "failed to read request"}
	}
	data = bytes.TrimSpace(data)
	if len(data) == 0 || !json.Valid(data) {
		return req, &protocolError{Code: "invalid_json", Message: "stdin must contain one valid JSON request"}
	}
	if err := json.Unmarshal(data, &req); err != nil {
		return req, &protocolError{Code: "invalid_request", Message: "request fields have invalid types"}
	}
	if req.Protocol != protocolName {
		return req, &protocolError{Code: "protocol_mismatch", Message: "unsupported protocol"}
	}
	if req.Version != protocolVersion {
		return req, &protocolError{Code: "unsupported_version", Message: "unsupported protocol version"}
	}
	if strings.TrimSpace(req.ID) == "" {
		return req, &protocolError{Code: "invalid_request", Message: "id must be a non-empty string"}
	}
	if strings.TrimSpace(req.Method) == "" {
		return req, &protocolError{Code: "invalid_request", Message: "method must be a non-empty string"}
	}
	return req, nil
}

func dispatch(req request) (any, *protocolError) {
	switch req.Method {
	case "hello":
		return callHello(req.Params)
	case "add":
		return callAdd(req.Params)
	default:
		return nil, &protocolError{Code: "unknown_method", Message: "unknown method"}
	}
}

func callHello(raw json.RawMessage) (any, *protocolError) {
	params, failure := objectParams(raw)
	if failure != nil {
		return nil, failure
	}
	nameRaw, exists := params["name"]
	if !exists {
		return nil, &protocolError{Code: "invalid_params", Message: "name is required"}
	}
	var name string
	if err := json.Unmarshal(nameRaw, &name); err != nil {
		return nil, &protocolError{Code: "invalid_params", Message: "name must be a string"}
	}
	if strings.TrimSpace(name) == "" {
		return nil, &protocolError{Code: "invalid_params", Message: "name must be a non-empty string"}
	}
	return map[string]any{"message": "Hello " + name}, nil
}

func callAdd(raw json.RawMessage) (any, *protocolError) {
	params, failure := objectParams(raw)
	if failure != nil {
		return nil, failure
	}
	aRaw, hasA := params["a"]
	bRaw, hasB := params["b"]
	if !hasA && !hasB {
		return nil, &protocolError{Code: "invalid_params", Message: "a and b are required"}
	}
	if !hasA {
		return nil, &protocolError{Code: "invalid_params", Message: "a is required"}
	}
	if !hasB {
		return nil, &protocolError{Code: "invalid_params", Message: "b is required"}
	}

	var a, b float64
	if err := json.Unmarshal(aRaw, &a); err != nil || math.IsNaN(a) || math.IsInf(a, 0) {
		return nil, &protocolError{Code: "invalid_params", Message: "a must be a finite number"}
	}
	if err := json.Unmarshal(bRaw, &b); err != nil || math.IsNaN(b) || math.IsInf(b, 0) {
		return nil, &protocolError{Code: "invalid_params", Message: "b must be a finite number"}
	}
	value := a + b
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return nil, &protocolError{Code: "invalid_params", Message: "a plus b must be a finite number"}
	}
	return map[string]any{"value": value}, nil
}

func objectParams(raw json.RawMessage) (map[string]json.RawMessage, *protocolError) {
	if len(bytes.TrimSpace(raw)) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, &protocolError{Code: "invalid_params", Message: "params must be an object"}
	}
	var params map[string]json.RawMessage
	if err := json.Unmarshal(raw, &params); err != nil || params == nil {
		return nil, &protocolError{Code: "invalid_params", Message: "params must be an object"}
	}
	return params, nil
}

func writeError(id, method string, failure *protocolError) {
	writeResponse(response{
		Protocol: protocolName,
		Version:  protocolVersion,
		ID:       id,
		OK:       false,
		Error:    failure,
	})
	fmt.Fprintf(os.Stderr, "native-ext-go-basic method=%s status=error code=%s\n", method, failure.Code)
}

func writeResponse(resp response) {
	if err := json.NewEncoder(os.Stdout).Encode(resp); err != nil {
		fmt.Fprintln(os.Stderr, "native-ext-go-basic status=fatal code=response_encode_failed")
		os.Exit(1)
	}
}

func safeMethod(method string) string {
	switch method {
	case "hello", "add":
		return method
	case "":
		return "missing"
	default:
		return "unknown"
	}
}
