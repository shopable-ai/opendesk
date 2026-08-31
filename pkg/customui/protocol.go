package customui

import (
	"encoding/json"
	"fmt"
)

const (
	protocolKindHello    = "hello"
	protocolKindRequest  = "request"
	protocolKindResponse = "response"
	protocolKindEvent    = "event"
)

type protocolFrame struct {
	Version   string          `json:"version"`
	Kind      string          `json:"kind"`
	RequestID string          `json:"requestId,omitempty"`
	SessionID string          `json:"sessionId,omitempty"`
	WindowID  string          `json:"windowId,omitempty"`
	Operation string          `json:"operation,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	OK        bool            `json:"ok,omitempty"`
	Result    json.RawMessage `json:"result,omitempty"`
	Error     *protocolError  `json:"error,omitempty"`
	Event     *Event          `json:"event,omitempty"`
}

type protocolError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	Operation  string `json:"operation,omitempty"`
	WindowID   string `json:"windowId,omitempty"`
	TargetID   string `json:"targetId,omitempty"`
	Capability string `json:"capability,omitempty"`
}

func protocolFailure(err error) *protocolError {
	if err == nil {
		return nil
	}
	if uiErr, ok := err.(*Error); ok {
		return &protocolError{
			Code: uiErr.Code, Message: uiErr.Message, Operation: uiErr.Operation,
			WindowID: uiErr.WindowID, TargetID: uiErr.TargetID, Capability: uiErr.Capability,
		}
	}
	return &protocolError{Code: CodeDriverFailure, Message: err.Error()}
}

func (e *protocolError) asError() error {
	if e == nil {
		return nil
	}
	return &Error{
		Code: e.Code, Message: e.Message, Operation: e.Operation,
		WindowID: e.WindowID, TargetID: e.TargetID, Capability: e.Capability,
	}
}

func marshalPayload(value any) (json.RawMessage, error) {
	if value == nil {
		return nil, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal custom UI protocol payload: %w", err)
	}
	return data, nil
}
