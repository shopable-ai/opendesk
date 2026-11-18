package browserbridge

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
)

// Managed services are an internal Native/socket subprotocol, not a Runtime API.
const ManagedServicesVersion = 1
const ManagedServicesProtocol = "opendesk.managed-services.v1"

type managedDescriptor struct {
	ServiceID         string   `json:"serviceId"`
	ServiceInstanceID string   `json:"serviceInstanceId"`
	ProductName       string   `json:"productName"`
	Origin            string   `json:"origin"`
	Capabilities      []string `json:"capabilities"`
}

type managedOwner struct {
	ExtensionID  string `json:"extensionId"`
	ToolID       string `json:"toolId"`
	PackageHash  string `json:"packageHash"`
	InstallEpoch string `json:"installEpoch"`
}

type managedRequest struct {
	V             int             `json:"v"`
	Kind          string          `json:"kind"`
	Protocol      string          `json:"protocol"`
	RequestID     string          `json:"requestId"`
	ServiceID     string          `json:"serviceId"`
	ProviderEpoch string          `json:"providerEpoch"`
	Owner         managedOwner    `json:"owner"`
	Action        string          `json:"action"`
	Payload       json.RawMessage `json:"payload"`
}

type managedResult struct {
	V             int             `json:"v"`
	Kind          string          `json:"kind"`
	Protocol      string          `json:"protocol"`
	RequestID     string          `json:"requestId"`
	ServiceID     string          `json:"serviceId"`
	ProviderEpoch string          `json:"providerEpoch"`
	Result        json.RawMessage `json:"result,omitempty"`
	Error         *managedError   `json:"error,omitempty"`
}

type managedError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Outcome string `json:"outcome"`
}

var (
	managedIDPattern         = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$`)
	managedCapabilityPattern = regexp.MustCompile(`^[-a-z0-9:]{1,64}$`)
	managedOriginPattern     = regexp.MustCompile(`^http://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.localhost:([1-9][0-9]{0,4})$`)
	managedUUIDPattern       = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	managedProviderIDPattern = regexp.MustCompile(`^req_[1-9][0-9]{0,15}$`)
	managedErrorCodePattern  = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,63}$`)
)

// decodeFilesObject supplies bounded UTF-8 JSON, duplicate/null rejection and
// unknown-field checks. Checking exact keys separately also rejects Go's
// case-insensitive struct field aliases and missing fields.
func managedExact(raw []byte, target any, keys ...string) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if decodeFilesObject(raw, &fields) != nil || len(fields) != len(keys) {
		return nil, ErrSchema
	}
	for _, key := range keys {
		if _, ok := fields[key]; !ok {
			return nil, ErrSchema
		}
	}
	if decodeFilesObject(raw, target) != nil {
		return nil, ErrSchema
	}
	return fields, nil
}

// JavaScript string bounds count UTF-16 code units, rather than bytes or runes.
func managedStringLength(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}

func managedNoControl(s string) bool {
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}

func managedOriginValid(origin string) bool {
	match := managedOriginPattern.FindStringSubmatch(origin)
	if match == nil {
		return false
	}
	port, err := strconv.Atoi(match[1])
	// URL.origin omits default port 80 and canonicalizes leading zeroes.
	return err == nil && port <= 65535 && port != 80
}

func decodeManagedRegistration(raw []byte) (managedDescriptor, error) {
	var descriptor managedDescriptor
	var envelope struct {
		V          int             `json:"v"`
		Kind       string          `json:"kind"`
		Protocol   string          `json:"protocol"`
		Descriptor json.RawMessage `json:"descriptor"`
	}
	if _, err := managedExact(raw, &envelope, "v", "kind", "protocol", "descriptor"); err != nil ||
		envelope.V != ManagedServicesVersion || envelope.Kind != "services.register" || envelope.Protocol != ManagedServicesProtocol {
		return descriptor, ErrSchema
	}
	if _, err := managedExact(envelope.Descriptor, &descriptor, "serviceId", "serviceInstanceId", "productName", "origin", "capabilities"); err != nil {
		return managedDescriptor{}, ErrSchema
	}
	// ECMAScript String.trim whitespace (including BOM, excluding U+0085).
	const jsWhitespace = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
	if !managedIDPattern.MatchString(descriptor.ServiceID) || !managedIDPattern.MatchString(descriptor.ServiceInstanceID) ||
		strings.Trim(descriptor.ProductName, jsWhitespace) == "" || managedStringLength(descriptor.ProductName) > 80 || !managedNoControl(descriptor.ProductName) ||
		!managedOriginValid(descriptor.Origin) || descriptor.Capabilities == nil || len(descriptor.Capabilities) > 16 {
		return managedDescriptor{}, ErrSchema
	}
	seen := map[string]bool{}
	for _, capability := range descriptor.Capabilities {
		// A JSON null decoded into a string is empty, which this pattern rejects.
		if !managedCapabilityPattern.MatchString(capability) || seen[capability] {
			return managedDescriptor{}, ErrSchema
		}
		seen[capability] = true
	}
	return descriptor, nil
}

// Only the business body's outer object is constrained. Nested keys and nulls
// belong to the provider and are deliberately not interpreted by the broker.
func managedBusinessObject(raw json.RawMessage) bool {
	var object map[string]json.RawMessage
	return json.Unmarshal(raw, &object) == nil && object != nil
}

func decodeManagedRequest(raw []byte) (managedRequest, error) {
	var request managedRequest
	fields, err := managedExact(raw, &request, "v", "kind", "protocol", "requestId", "serviceId", "providerEpoch", "owner", "action", "payload")
	if err != nil {
		return managedRequest{}, ErrSchema
	}
	if _, err = managedExact(fields["owner"], &request.Owner, "extensionId", "toolId", "packageHash", "installEpoch"); err != nil {
		return managedRequest{}, ErrSchema
	}
	owner := request.Owner
	if request.V != ManagedServicesVersion || request.Kind != "services.request" || request.Protocol != ManagedServicesProtocol ||
		!managedUUIDPattern.MatchString(request.RequestID) || !managedIDPattern.MatchString(request.ServiceID) || !managedIDPattern.MatchString(request.ProviderEpoch) ||
		!ExtensionIDValid(owner.ExtensionID) || !managedIDPattern.MatchString(owner.ToolID) || !CredentialValid(owner.PackageHash) ||
		managedStringLength(owner.InstallEpoch) < 1 || managedStringLength(owner.InstallEpoch) > 160 || !managedNoControl(owner.InstallEpoch) ||
		!managedAction(request.Action) || !managedBusinessObject(request.Payload) {
		return managedRequest{}, ErrSchema
	}
	return request, nil
}

func decodeManagedResult(raw []byte) (managedResult, error) {
	var result managedResult
	var fields map[string]json.RawMessage
	if decodeFilesObject(raw, &fields) != nil {
		return result, ErrSchema
	}
	_, hasResult := fields["result"]
	_, hasError := fields["error"]
	if hasResult == hasError {
		return result, ErrSchema
	}
	body := "result"
	if hasError {
		body = "error"
	}
	if _, err := managedExact(raw, &result, "v", "kind", "protocol", "requestId", "serviceId", "providerEpoch", body); err != nil {
		return managedResult{}, ErrSchema
	}
	if result.V != ManagedServicesVersion || result.Kind != "services.result" || result.Protocol != ManagedServicesProtocol ||
		!managedIDPattern.MatchString(result.ServiceID) || !managedIDPattern.MatchString(result.ProviderEpoch) || !managedProviderIDPattern.MatchString(result.RequestID) {
		return managedResult{}, ErrSchema
	}
	sequence, err := strconv.ParseUint(strings.TrimPrefix(result.RequestID, "req_"), 10, 64)
	if err != nil || sequence > 9007199254740991 {
		return managedResult{}, ErrSchema
	}
	if hasResult {
		if !managedBusinessObject(result.Result) {
			return managedResult{}, ErrSchema
		}
	} else {
		var serviceError managedError
		if _, err := managedExact(fields["error"], &serviceError, "code", "message", "outcome"); err != nil {
			return managedResult{}, ErrSchema
		}
		if !managedErrorCodePattern.MatchString(serviceError.Code) || managedStringLength(serviceError.Message) > 240 {
			return managedResult{}, ErrSchema
		}
		switch serviceError.Outcome {
		case "NOT_DISPATCHED", "FAILED_CONFIRMED", "OUTCOME_UNKNOWN":
		default:
			return managedResult{}, ErrSchema
		}
		result.Error = &serviceError
	}
	return result, nil
}

func managedAction(action string) bool {
	switch action {
	case "connect", "accounts", "bind", "unbind", "policy", "accept", "operation", "open", "disconnect":
		return true
	}
	return false
}

func managedRead(action string) bool {
	return action == "accounts" || action == "policy" || action == "operation"
}
