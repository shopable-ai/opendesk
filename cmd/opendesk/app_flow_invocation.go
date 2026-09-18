package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"opendesk/automation"
	"opendesk/pkg/flowinstall"
)

const (
	appFlowInvocationFile     = "assistant-use.json"
	appFlowInvocationMaxBytes = 64 << 10
)

func loadAppFlowInvocation(lease *flowinstall.RunLease) (*automation.AppOwnedFlowInvocation, error) {
	if lease == nil {
		return nil, errors.New("Flow RunLease is unavailable")
	}
	// Local one-file installs do not have a signed package inventory for an
	// auxiliary invocation resource. They stay usable from Runner, but the
	// assistant must not invent an effect/parameter contract for them.
	if lease.Record.Origin == "js" {
		return nil, nil
	}
	path := filepath.Join(lease.Root, appFlowInvocationFile)
	info, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("inspect Flow assistant invocation contract: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return nil, errors.New("Flow assistant invocation contract must be a real regular file")
	}
	if info.Size() <= 0 || info.Size() > appFlowInvocationMaxBytes {
		return nil, errors.New("Flow assistant invocation contract exceeds its size limit")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read Flow assistant invocation contract: %w", err)
	}
	if len(data) > appFlowInvocationMaxBytes {
		return nil, errors.New("Flow assistant invocation contract exceeds its size limit")
	}
	var contract automation.AppOwnedFlowInvocation
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&contract); err != nil {
		return nil, fmt.Errorf("decode Flow assistant invocation contract: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != nil && !errors.Is(err, os.ErrClosed) {
		// json.Decoder reports io.EOF for a clean single document.
		if err.Error() != "EOF" {
			return nil, errors.New("Flow assistant invocation contract contains trailing JSON data")
		}
	}
	if err := validateAppFlowInvocation(&contract); err != nil {
		return nil, err
	}
	return &contract, nil
}

func validateAppFlowInvocation(contract *automation.AppOwnedFlowInvocation) error {
	if contract == nil || contract.SchemaVersion != 1 {
		return errors.New("Flow assistant invocation contract schemaVersion must be 1")
	}
	summary := strings.TrimSpace(contract.EffectSummary)
	if summary != contract.EffectSummary || summary == "" || utf8.RuneCountInString(summary) > 500 ||
		strings.ContainsAny(summary, "\r\n\x00") {
		return errors.New("Flow assistant invocation effectSummary must be a bounded single line")
	}
	if len(contract.Parameters) > 64 || len(contract.FixedInputs) > 64 {
		return errors.New("Flow assistant invocation contract contains too many inputs")
	}
	for name, parameter := range contract.Parameters {
		if !validAppFlowParameterName(name) {
			return fmt.Errorf("Flow assistant invocation parameter %q is invalid", name)
		}
		switch parameter.Type {
		case "string", "number", "integer", "boolean", "object", "array":
		default:
			return fmt.Errorf("Flow assistant invocation parameter %q has unsupported type", name)
		}
		if utf8.RuneCountInString(parameter.Description) > 240 || strings.ContainsAny(parameter.Description, "\r\n\x00") {
			return fmt.Errorf("Flow assistant invocation parameter %q description is invalid", name)
		}
	}
	for name, value := range contract.FixedInputs {
		parameter, ok := contract.Parameters[name]
		if !ok {
			return fmt.Errorf("Flow assistant fixed input %q is not declared as a parameter", name)
		}
		if !appFlowValueMatchesType(value, parameter.Type) {
			return fmt.Errorf("Flow assistant fixed input %q does not match declared type", name)
		}
	}
	return nil
}

func validAppFlowParameterName(value string) bool {
	if len(value) == 0 || len(value) > 64 {
		return false
	}
	for index, r := range value {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || r == '_' || (index > 0 && r >= '0' && r <= '9') {
			continue
		}
		return false
	}
	return true
}

func appFlowValueMatchesType(value any, kind string) bool {
	switch kind {
	case "string":
		_, ok := value.(string)
		return ok
	case "number":
		number, ok := value.(float64)
		return ok && !math.IsNaN(number) && !math.IsInf(number, 0)
	case "integer":
		number, ok := value.(float64)
		return ok && !math.IsNaN(number) && !math.IsInf(number, 0) && math.Trunc(number) == number
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "object":
		_, ok := value.(map[string]any)
		return ok
	case "array":
		_, ok := value.([]any)
		return ok
	default:
		return false
	}
}
