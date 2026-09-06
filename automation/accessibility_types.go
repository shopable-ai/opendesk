package automation

import (
	"context"
	"errors"
	"runtime"
	"strings"
	"time"
)

const (
	accessibilityDefaultTimeout  = 3 * time.Second
	accessibilityMaximumTimeout  = 30 * time.Second
	accessibilityDefaultMaxDepth = 8
	accessibilityMaximumMaxDepth = 32
	accessibilityDefaultMaxNodes = 1000
	accessibilityMaximumMaxNodes = 5000
	accessibilityMaximumRefs     = 256
	accessibilityMaximumQueued   = 32
)

// AccessibilityErrorCode is shared by Accessibility and the native UI menu
// composition. Values are intentionally transport- and platform-neutral.
type AccessibilityErrorCode string

const (
	AccessibilityInvalidArgument    AccessibilityErrorCode = "INVALID_ARGUMENT"
	AccessibilityCapabilityDisabled AccessibilityErrorCode = "CAPABILITY_DISABLED"
	AccessibilityNotSupported       AccessibilityErrorCode = "NOT_SUPPORTED"
	AccessibilityPermissionDenied   AccessibilityErrorCode = "PERMISSION_DENIED"
	AccessibilityTargetNotFound     AccessibilityErrorCode = "TARGET_NOT_FOUND"
	AccessibilityAmbiguousTarget    AccessibilityErrorCode = "AMBIGUOUS_TARGET"
	AccessibilitySearchIncomplete   AccessibilityErrorCode = "SEARCH_INCOMPLETE"
	AccessibilityStaleTarget        AccessibilityErrorCode = "STALE_TARGET"
	AccessibilityElementDisabled    AccessibilityErrorCode = "ELEMENT_DISABLED"
	AccessibilityActionUnsupported  AccessibilityErrorCode = "ACTION_NOT_SUPPORTED"
	AccessibilityStateUnknown       AccessibilityErrorCode = "STATE_UNKNOWN"
	AccessibilityTimeout            AccessibilityErrorCode = "TIMEOUT"
	AccessibilityCanceled           AccessibilityErrorCode = "CANCELED"
	AccessibilityQueueFull          AccessibilityErrorCode = "QUEUE_FULL"
	AccessibilityResourceLimit      AccessibilityErrorCode = "RESOURCE_LIMIT"
	AccessibilityBackendFailed      AccessibilityErrorCode = "BACKEND_FAILED"
)

type AccessibilityActionState string

const (
	AccessibilityActionNotStarted   AccessibilityActionState = "not_started"
	AccessibilityActionNotNeeded    AccessibilityActionState = "not_needed"
	AccessibilityActionAcknowledged AccessibilityActionState = "acknowledged"
	AccessibilityActionUnknown      AccessibilityActionState = "unknown"
)

// AccessibilityError is projected to JavaScript without target names, values,
// selectors, menu text, or native addresses. Those can contain user data.
type AccessibilityError struct {
	Code              AccessibilityErrorCode
	Operation         string
	Backend           string
	Phase             string
	RequestID         string
	ActionState       AccessibilityActionState
	Message           string
	Cause             error
	FailedLevel       *int
	CompletedLevels   int
	ExpansionOccurred bool
}

func (e *AccessibilityError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" {
		message = "accessibility operation failed"
	}
	return string(e.Code) + ": " + message
}

func (e *AccessibilityError) Unwrap() error { return e.Cause }

func accessibilityExplicitActionState(err error) (AccessibilityActionState, bool) {
	var typed *AccessibilityError
	if !errors.As(err, &typed) || typed == nil {
		return "", false
	}
	switch typed.ActionState {
	case AccessibilityActionNotStarted, AccessibilityActionNotNeeded,
		AccessibilityActionAcknowledged, AccessibilityActionUnknown:
		return typed.ActionState, true
	default:
		return "", false
	}
}

func (e *AccessibilityError) JSProperties() map[string]interface{} {
	properties := map[string]interface{}{
		"code":        string(e.Code),
		"operation":   e.Operation,
		"backend":     e.Backend,
		"phase":       e.Phase,
		"requestId":   e.RequestID,
		"actionState": string(e.ActionState),
	}
	if e.FailedLevel != nil {
		properties["failedLevel"] = *e.FailedLevel
		properties["completedLevels"] = e.CompletedLevels
		properties["expansionOccurred"] = e.ExpansionOccurred
	}
	return properties
}

func accessibilityError(code AccessibilityErrorCode, phase, message string, cause error) error {
	return &AccessibilityError{
		Code: code, Phase: phase, Message: message, Cause: cause,
		ActionState: AccessibilityActionNotStarted,
	}
}

func accessibilityMenuError(code AccessibilityErrorCode, phase, message string, cause error, failedLevel, completedLevels int, expanded bool, state AccessibilityActionState) error {
	return &AccessibilityError{
		Code: code, Phase: phase, Message: message, Cause: cause,
		ActionState: state, FailedLevel: &failedLevel,
		CompletedLevels: completedLevels, ExpansionOccurred: expanded,
	}
}

func normalizeAccessibilityError(operation, backend, requestID string, err error) *AccessibilityError {
	if err == nil {
		return nil
	}
	var typed *AccessibilityError
	if errors.As(err, &typed) {
		result := *typed
		result.Operation = operation
		result.Backend = backend
		result.RequestID = requestID
		if result.Phase == "" {
			result.Phase = "backend"
		}
		if result.ActionState == "" {
			result.ActionState = AccessibilityActionNotStarted
		}
		return &result
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return &AccessibilityError{Code: AccessibilityTimeout, Operation: operation, Backend: backend, Phase: "deadline", RequestID: requestID, ActionState: AccessibilityActionNotStarted, Message: "accessibility request timed out", Cause: err}
	}
	if errors.Is(err, context.Canceled) {
		return &AccessibilityError{Code: AccessibilityCanceled, Operation: operation, Backend: backend, Phase: "canceled", RequestID: requestID, ActionState: AccessibilityActionNotStarted, Message: "accessibility request was canceled", Cause: err}
	}
	return &AccessibilityError{Code: AccessibilityBackendFailed, Operation: operation, Backend: backend, Phase: "backend", RequestID: requestID, ActionState: AccessibilityActionNotStarted, Message: "native accessibility backend failed", Cause: err}
}

type AccessibilityPermissionStatus struct {
	Required bool
	State    string
	Granted  bool
	Cached   bool
}

type AccessibilityBackendCapabilities struct {
	Platform          string
	Backend           string
	Implemented       bool
	Status            string
	Menus             bool
	Actions           map[string]bool
	Permission        AccessibilityPermissionStatus
	CoordinateMapping bool
	Notes             string
}

type AccessibilityLimits struct {
	Timeout    time.Duration
	MaxDepth   int
	MaxNodes   int
	Properties []string
}

type AccessibilitySelector struct {
	Role       string
	Name       *string
	Identifier *string
}

type AccessibilityMenuSegment struct {
	Name       *string
	Identifier *string
}

type AccessibilityAction struct {
	Action  string
	Value   string
	Checked bool
}

type AccessibilityNativeBounds struct {
	X               float64
	Y               float64
	Width           float64
	Height          float64
	CoordinateSpace string
}

type AccessibilityScreenBounds struct {
	X               float64
	Y               float64
	Width           float64
	Height          float64
	CoordinateSpace string
}

type AccessibilityNode struct {
	Role          string
	NativeRole    string
	Name          *string
	Identifier    *string
	Enabled       *bool
	Focused       *bool
	Selected      *bool
	Checked       *bool
	Expanded      *bool
	Actions       []string
	Value         interface{}
	ValueIncluded bool
	NativeBounds  *AccessibilityNativeBounds
	Bounds        *AccessibilityScreenBounds
	Children      []AccessibilityNode
}

type AccessibilitySnapshotData struct {
	Root      *AccessibilityNode
	Complete  bool
	Truncated bool
	Reason    string
	Nodes     int
	MaxDepth  int
}

type AccessibilityFindData struct {
	Found    bool
	Handle   uint64
	Node     AccessibilityNode
	Complete bool
	Reason   string
}

type AccessibilityReadData struct {
	Properties map[string]interface{}
}

type AccessibilityActionData struct {
	State AccessibilityActionState
}

type AccessibilityMenuData struct {
	Items     []AccessibilityNode
	Complete  bool
	Truncated bool
	Reason    string
	Nodes     int
	MaxDepth  int
}

type AccessibilityMenuMatch struct {
	Handle uint64
	Node   AccessibilityNode
}

type AccessibilityScopeKind string

const (
	AccessibilityScopeApplication AccessibilityScopeKind = "application"
	AccessibilityScopeMenuBar     AccessibilityScopeKind = "menuBar"
	AccessibilityScopeWindow      AccessibilityScopeKind = "window"
	AccessibilityScopeElement     AccessibilityScopeKind = "element"
)

type AccessibilityTargetIdentity struct {
	PID              int64
	LaunchTimeMS     int64
	BundleIdentifier string
	Path             string
	ExecutablePath   string
}

type AccessibilityWindowIdentity struct {
	ID           string
	PID          int64
	Handle       uint64
	Title        string
	X            int64
	Y            int64
	Width        int64
	Height       int64
	IsForeground bool
}

type AccessibilityScope struct {
	Kind          AccessibilityScopeKind
	PID           int64
	Target        AccessibilityTargetIdentity
	Window        *AccessibilityWindowIdentity
	ElementHandle uint64
}

type AccessibilityResourceCounts struct {
	Workers         int64
	Pending         int
	Queued          int
	Refs            int
	NativeResources int
}

func defaultAccessibilityBackendCapabilities(name string) AccessibilityBackendCapabilities {
	return AccessibilityBackendCapabilities{
		Platform: runtime.GOOS, Backend: name, Status: "unsupported",
		Actions: map[string]bool{
			"invoke": false, "setValue": false, "expand": false,
			"collapse": false, "select": false, "setChecked": false,
		},
		Permission: AccessibilityPermissionStatus{State: "unsupported"},
	}
}
