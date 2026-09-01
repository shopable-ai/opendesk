// Package nativeextension implements the experimental OpenDesk Native Process
// Extension Protocol V0 host. Extensions are independent executables and do not
// import this package; these types describe the host-side wire contract only.
package nativeextension

import "encoding/json"

const (
	// ProtocolName is the fixed Native Process Extension protocol discriminator.
	ProtocolName = "opendesk-native-extension"
	// ProtocolVersion is the first experimental wire protocol version.
	ProtocolVersion = 1
)

type protocolRequest struct {
	Protocol string          `json:"protocol"`
	Version  int             `json:"version"`
	ID       string          `json:"id"`
	Method   string          `json:"method"`
	Params   json.RawMessage `json:"params"`
}

// ExtensionError is the structured error returned by an extension response.
type ExtensionError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// responseWire keeps result and error raw so the host can distinguish an
// absent field from an explicitly supplied null field while validating the
// mutually exclusive success and error response shapes.
type responseWire struct {
	Protocol string          `json:"protocol"`
	Version  int             `json:"version"`
	ID       string          `json:"id"`
	OK       *bool           `json:"ok"`
	Result   json.RawMessage `json:"result"`
	Error    json.RawMessage `json:"error"`
}
