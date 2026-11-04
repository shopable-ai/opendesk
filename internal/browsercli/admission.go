package browsercli

import (
	"context"
	"encoding/json"
	"time"

	"opendesk/internal/browserbridge"
)

type admissionIdentity struct {
	ConnectionID   string `json:"connectionId,omitempty"`
	ExtensionID    string `json:"extensionId,omitempty"`
	RegistrationID string `json:"registrationId"`
	RequestID      string `json:"admissionRequestId"`
	Method         string `json:"admissionMethod"`
	Digest         string `json:"requestDigest"`
}
type invocationError struct {
	err          error
	requestID    string
	recovery     *admissionIdentity
	connectionID string
	extensionID  string
}

func (e *invocationError) Error() string { return e.err.Error() }
func (e *invocationError) Unwrap() error { return e.err }

// Resolve an omitted Sidebar exactly once before admission. This read cannot
// execute a project. Bind the subsequent mutation to that precise registration;
// a disappearing/changing owner is rejected by the existing Browser boundary.
func prepareAdmission(method string, params map[string]json.RawMessage, requestID string) (*admissionIdentity, error) {
	return prepareAdmissionAt(nil, method, params, requestID)
}
func prepareAdmissionAt(cfg *browserbridge.Installation, method string, params map[string]json.RawMessage, requestID string) (*admissionIdentity, error) {
	if method != "run.start" && method != "page.preview" {
		return nil, nil
	}
	var registration string
	if raw, ok := params["registrationId"]; ok {
		if json.Unmarshal(raw, &registration) != nil || !browserbridge.RequestIDValid(registration) {
			return nil, browserbridge.ErrSchema
		}
	} else {
		id, err := browserbridge.NewID()
		if err != nil {
			return nil, err
		}
		call := browserbridge.Call
		if cfg != nil {
			call = func(ctx context.Context, method string, params json.RawMessage, id string, timeout time.Duration) ([]byte, error) {
				return browserbridge.CallAt(ctx, *cfg, method, params, id, timeout)
			}
		}
		reply, err := call(context.Background(), "bridge.status", json.RawMessage(`{}`), id, 3*time.Second)
		if err != nil {
			return nil, &browserbridge.CallError{Code: "E_NATIVE_NOT_READY", Outcome: "NOT_DISPATCHED"}
		}
		var state struct {
			Result struct {
				Registrations []string `json:"hostRegistrations"`
			} `json:"result"`
			Error json.RawMessage `json:"error"`
		}
		if json.Unmarshal(reply, &state) != nil || len(state.Error) > 0 {
			return nil, &browserbridge.CallError{Code: "E_NATIVE_NOT_READY", Outcome: "NOT_DISPATCHED"}
		}
		if len(state.Result.Registrations) != 1 {
			code := "E_HOST_NOT_READY"
			if len(state.Result.Registrations) > 1 {
				code = "E_HOST_AMBIGUOUS"
			}
			return nil, &browserbridge.CallError{Code: code, Outcome: "NOT_DISPATCHED"}
		}
		registration = state.Result.Registrations[0]
		if !browserbridge.RequestIDValid(registration) {
			return nil, browserbridge.ErrSchema
		}
		params["registrationId"], _ = json.Marshal(registration)
	}
	payload, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	digest, err := browserbridge.AdmissionDigest(method, payload, registration)
	if err != nil {
		return nil, err
	}
	identity := &admissionIdentity{RegistrationID: registration, RequestID: requestID, Method: method, Digest: digest}
	if cfg != nil && cfg.ConnectionID != "" {
		identity.ConnectionID = cfg.ConnectionID
		identity.ExtensionID = cfg.ExtensionID
	}
	return identity, nil
}
