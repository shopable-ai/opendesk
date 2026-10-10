// Package browserai owns restricted Codex App Server planning sessions. It has
// no browser driver, desktop automation, task store, or generic RPC surface.
package browserai

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"regexp"
)

const (
	Protocol           = "opendesk.workflow-ai.v1"
	MaxMessageBytes    = 60 * 1024
	MaxInputBytes      = 32 * 1024
	MaxSchemaBytes     = 16 * 1024
	MaxToolResultBytes = 12 * 1024
	MaxEventsBytes     = 44 * 1024
)

var identifier = regexp.MustCompile(`^[a-zA-Z0-9._:-]{1,100}$`)
var sourceHashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type Scope struct {
	OwnerID        string `json:"ownerId"`
	RegistrationID string `json:"registrationId"`
	Generation     int64  `json:"generation"`
}

func (s Scope) valid() bool {
	return identifier.MatchString(s.OwnerID) && identifier.MatchString(s.RegistrationID) && s.Generation > 0
}

type Request struct {
	V         int    `json:"v"`
	Kind      string `json:"kind"`
	Protocol  string `json:"protocol"`
	RequestID string `json:"requestId"`
	Scope
	SessionID string          `json:"sessionId,omitempty"`
	Method    string          `json:"method"`
	Params    json.RawMessage `json:"params"`
}

type Response struct {
	V         int    `json:"v"`
	Kind      string `json:"kind"`
	Protocol  string `json:"protocol"`
	RequestID string `json:"requestId"`
	Scope
	SessionID string `json:"sessionId,omitempty"`
	Result    any    `json:"result,omitempty"`
	Error     *Error `json:"error,omitempty"`
}

// Errors use fixed public text. Provider diagnostics, account objects, stderr,
// paths, and credentials are never forwarded to a browser or a log.
type Error struct {
	Code         string `json:"code"`
	Message      string `json:"message"`
	Outcome      string `json:"outcome,omitempty"`
	ProviderCode string `json:"providerCode,omitempty"`
}

func (e *Error) Error() string { return e.Code }

func failure(code string) *Error {
	text := map[string]string{
		"E_SCHEMA": "Invalid workflow AI request.", "E_LIMIT": "Workflow AI safety budget exceeded.",
		"E_OWNER": "Workflow AI owner is no longer authorized.", "E_SESSION": "Workflow AI session is not available.",
		"E_BUSY": "A planning turn is already active.", "E_REQUEST_CONFLICT": "The request identifier was already used.",
		"E_CONSENT_REQUIRED": "Confirm the model data scope before starting a planning turn.",
		"E_APPROVAL":         "The requested tool approval is not available.", "E_CAPABILITY": "This capability is not allowed for workflow planning.",
		"E_CODEX_MISSING":        "Codex CLI was not found for this native host user.",
		"E_CODEX_LOGIN_REQUIRED": "Sign in through the official Codex CLI before using this provider.",
		"E_CODEX_UNSUPPORTED":    "This Codex App Server cannot verify the required restricted planning protocol.",
		"E_CODEX_POLICY":         "Codex configuration enables capabilities outside the workflow planning scope.",
		"E_MODEL_UNAVAILABLE":    "The requested model is unavailable for this Codex account.",
		"E_RATE_LIMITED":         "The Codex account has reached a usage or rate limit.",
		"E_NETWORK":              "Codex could not reach the model service.",
		"E_PROVIDER":             "Codex could not complete this planning turn.",
		"E_TIMEOUT":              "The planning request exceeded its time budget.",
		"E_DISCONNECTED":         "The Codex App Server connection ended.",
		"E_CURSOR_EXPIRED":       "Planning events were missed. Review the session before continuing.",
		"E_OUTCOME_UNKNOWN":      "The planning request outcome is unknown. It will not be repeated automatically.",
	}[code]
	if text == "" {
		code = "E_PROVIDER"
		text = "Codex could not complete this planning turn."
	}
	e := &Error{Code: code, Message: text}
	if code == "E_OUTCOME_UNKNOWN" {
		e.Outcome = "OUTCOME_UNKNOWN"
	}
	return e
}

func publicError(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return failure("E_PROVIDER")
}

func providerState(err error) string {
	switch publicError(err).Code {
	case "E_CODEX_MISSING":
		return "CODEX_MISSING"
	case "E_CODEX_LOGIN_REQUIRED":
		return "CODEX_LOGIN_REQUIRED"
	case "E_CODEX_UNSUPPORTED", "E_CODEX_POLICY", "E_CAPABILITY":
		return "CODEX_UNSUPPORTED"
	case "E_NETWORK":
		return "NETWORK_ERROR"
	case "E_RATE_LIMITED":
		return "RATE_LIMITED"
	case "E_MODEL_UNAVAILABLE":
		return "MODEL_UNAVAILABLE"
	case "E_DISCONNECTED":
		return "DISCONNECTED"
	case "E_OUTCOME_UNKNOWN", "E_TIMEOUT":
		return "OUTCOME_UNKNOWN"
	default:
		return "PROVIDER_ERROR"
	}
}

func strict(data []byte, into any) error {
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(into); err != nil {
		return failure("E_SCHEMA")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return failure("E_SCHEMA")
	}
	return nil
}

func DecodeRequest(data []byte) (Request, error) {
	var r Request
	if len(data) == 0 || len(data) > MaxMessageBytes {
		return r, failure("E_LIMIT")
	}
	if err := strict(data, &r); err != nil {
		return r, err
	}
	if r.V != 1 || r.Kind != "ai.request" || r.Protocol != Protocol || !r.Scope.valid() ||
		!identifier.MatchString(r.RequestID) || (r.SessionID != "" && !identifier.MatchString(r.SessionID)) ||
		len(r.Params) < 2 || r.Params[0] != '{' {
		return r, failure("E_SCHEMA")
	}
	switch r.Method {
	case "ai.capabilities.read", "ai.session.open", "ai.plan.start", "ai.events.read", "ai.approval.answer", "ai.plan.cancel", "ai.session.close":
	default:
		return r, failure("E_CAPABILITY")
	}
	return r, nil
}

type Consent struct {
	Model       bool `json:"model"`
	Workflow    bool `json:"workflow"`
	Observation bool `json:"observation"`
}

type Target struct {
	WindowID   int64  `json:"windowId"`
	TabID      int64  `json:"tabId"`
	FrameID    int64  `json:"frameId"`
	DocumentID string `json:"documentId"`
	URL        string `json:"url"`
	Origin     string `json:"origin"`
}

func (t *Target) valid() bool {
	if t == nil || t.WindowID < 0 || t.TabID < 0 || t.FrameID != 0 || !identifier.MatchString(t.DocumentID) || len(t.URL) > 8192 {
		return false
	}
	u, err := url.Parse(t.URL)
	if err != nil || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return false
	}
	return u.Scheme+"://"+u.Host == t.Origin
}

type Capabilities struct {
	SourceKey           string   `json:"sourceKey"`
	State               string   `json:"state"`
	CLIInstalled        bool     `json:"cliInstalled"`
	CLIVersion          string   `json:"cliVersion,omitempty"`
	AuthState           string   `json:"authState"`
	AppServerCompatible bool     `json:"appServerCompatible"`
	ReadyForTurn        bool     `json:"readyForTurn"`
	InferenceVerified   bool     `json:"inferenceVerified"`
	ResumeSupported     bool     `json:"resumeSupported"`
	SupportedTools      []string `json:"supportedTools"`
	OnlineInference     bool     `json:"onlineInference"`
	Reason              string   `json:"reason,omitempty"`
}

func initialCapabilities() Capabilities {
	return Capabilities{SourceKey: "local_codex", State: "CODEX_INITIALIZING", AuthState: "unknown", SupportedTools: []string{}, OnlineInference: true}
}

type Event struct {
	Sequence   uint64          `json:"sequence"`
	SessionID  string          `json:"sessionId"`
	ThreadID   string          `json:"threadId,omitempty"`
	TurnID     string          `json:"turnId,omitempty"`
	Type       string          `json:"type"`
	Text       string          `json:"text,omitempty"`
	ItemID     string          `json:"itemId,omitempty"`
	Phase      string          `json:"phase,omitempty"`
	Status     string          `json:"status,omitempty"`
	Plan       json.RawMessage `json:"plan,omitempty"`
	ApprovalID string          `json:"approvalId,omitempty"`
	Tool       string          `json:"tool,omitempty"`
	Target     *Target         `json:"target,omitempty"`
	Kind       string          `json:"kind,omitempty"`
	CanApprove bool            `json:"canApprove"`
	Error      *Error          `json:"error,omitempty"`
}
