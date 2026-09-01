package recorder

import "time"

const SchemaVersion = "0.1.0"

type SessionState string

const (
	SessionActive  SessionState = "active"
	SessionStopped SessionState = "stopped"
)

type ObservationPolicy string

const (
	ObservationMinimal  ObservationPolicy = "minimal"
	ObservationStandard ObservationPolicy = "standard"
	ObservationEnriched ObservationPolicy = "enriched"
)

type ActionHint struct {
	Goal                   string          `json:"goal,omitempty"`
	Subgoal                string          `json:"subgoal,omitempty"`
	Intent                 string          `json:"intent,omitempty"`
	TargetDescription      string          `json:"targetDescription,omitempty"`
	ExpectedPostconditions []Postcondition `json:"expectedPostconditions,omitempty"`
	Risk                   string          `json:"risk,omitempty"`
	VariableHints          []VariableHint  `json:"variableHints,omitempty"`
	RecoveryReason         string          `json:"recoveryReason,omitempty"`
}

type VariableHint struct {
	Name           string `json:"name"`
	Classification string `json:"classification"`
	Argument       string `json:"argument,omitempty"`
}

type Postcondition struct {
	Kind  string `json:"kind"`
	Value any    `json:"value,omitempty"`
}

type ActionRequest struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

type WindowSnapshot struct {
	Title        string  `json:"title,omitempty"`
	PID          int64   `json:"pid,omitempty"`
	Executable   string  `json:"executable,omitempty"`
	X            float64 `json:"x,omitempty"`
	Y            float64 `json:"y,omitempty"`
	Width        float64 `json:"width,omitempty"`
	Height       float64 `json:"height,omitempty"`
	DisplayIndex int     `json:"displayIndex,omitempty"`
	Scale        float64 `json:"scale,omitempty"`
	Foreground   bool    `json:"foreground,omitempty"`
}

type LocatorCandidate struct {
	Kind            string         `json:"kind"`
	Role            string         `json:"role,omitempty"`
	Name            string         `json:"name,omitempty"`
	Identifier      string         `json:"identifier,omitempty"`
	WindowRelative  map[string]any `json:"windowRelative,omitempty"`
	AbsolutePoint   map[string]any `json:"absolutePoint,omitempty"`
	Confidence      float64        `json:"confidence,omitempty"`
	CapturedAt      string         `json:"capturedAt,omitempty"`
	EvidenceRefs    []string       `json:"evidenceRefs,omitempty"`
	ExpectedWindow  string         `json:"expectedWindow,omitempty"`
	ExpectedProcess int64          `json:"expectedProcessId,omitempty"`
	Ambiguous       bool           `json:"ambiguous,omitempty"`
}

type TargetSnapshot struct {
	Description string             `json:"description,omitempty"`
	Candidates  []LocatorCandidate `json:"candidates,omitempty"`
}

type Observation struct {
	CapturedAt       string          `json:"capturedAt"`
	Window           *WindowSnapshot `json:"window,omitempty"`
	WindowRef        string          `json:"windowRef,omitempty"`
	ScreenshotRef    string          `json:"screenshotRef,omitempty"`
	AccessibilityRef string          `json:"accessibilityRef,omitempty"`
	Target           *TargetSnapshot `json:"target,omitempty"`
	Error            string          `json:"error,omitempty"`
}

type ActionResult struct {
	OK         bool           `json:"ok"`
	DurationMs int64          `json:"durationMs"`
	Payload    map[string]any `json:"payload,omitempty"`
	Error      string         `json:"error,omitempty"`
}

type Verification struct {
	Status         string          `json:"status"`
	Postconditions []Postcondition `json:"postconditions,omitempty"`
	Actual         map[string]any  `json:"actual,omitempty"`
	EvidenceRefs   []string        `json:"evidenceRefs,omitempty"`
	FailureClass   string          `json:"failureClass,omitempty"`
	Message        string          `json:"message,omitempty"`
}

type TraceEvent struct {
	SchemaVersion  string         `json:"schemaVersion"`
	EventID        string         `json:"eventId"`
	EventType      string         `json:"eventType"`
	SessionID      string         `json:"sessionId"`
	ExecutionID    string         `json:"executionId,omitempty"`
	ActionID       string         `json:"actionId,omitempty"`
	ParentActionID string         `json:"parentActionId,omitempty"`
	Sequence       int64          `json:"sequence"`
	Timestamp      string         `json:"timestamp"`
	Source         string         `json:"source,omitempty"`
	Classification string         `json:"classification,omitempty"`
	Origin         string         `json:"origin,omitempty"`
	Internal       bool           `json:"internal,omitempty"`
	Hint           *ActionHint    `json:"hint,omitempty"`
	Request        *ActionRequest `json:"request,omitempty"`
	Before         *Observation   `json:"before,omitempty"`
	After          *Observation   `json:"after,omitempty"`
	Result         *ActionResult  `json:"result,omitempty"`
	Verification   *Verification  `json:"verification,omitempty"`
	Fields         map[string]any `json:"fields,omitempty"`
}

type Manifest struct {
	SchemaVersion     string            `json:"schemaVersion"`
	SessionID         string            `json:"sessionId"`
	ExecutionID       string            `json:"executionId,omitempty"`
	Goal              string            `json:"goal"`
	Source            string            `json:"source"`
	ObservationPolicy ObservationPolicy `json:"observationPolicy"`
	State             SessionState      `json:"state"`
	StartedAt         string            `json:"startedAt"`
	StoppedAt         string            `json:"stoppedAt,omitempty"`
	EventCount        int64             `json:"eventCount"`
	ActionCount       int64             `json:"actionCount"`
	InternalCount     int64             `json:"internalObservationCount"`
	InternalRecursion int64             `json:"internalObservationRecursionCount"`
	SecretLeakCount   int64             `json:"secretPlaintextLeakCount"`
	Paths             map[string]string `json:"paths"`
}

type ActionSpan struct {
	SessionID   string
	ExecutionID string
	ActionID    string
	Source      string
	StartedAt   time.Time
	Hint        ActionHint
	Request     ActionRequest
	Before      Observation
}

type Flow struct {
	SchemaVersion string     `json:"schemaVersion"`
	FlowID        string     `json:"flowId"`
	SessionID     string     `json:"sessionId"`
	Goal          string     `json:"goal"`
	Mode          string     `json:"mode"`
	CreatedAt     string     `json:"createdAt"`
	Steps         []FlowStep `json:"steps"`
}

type FlowStep struct {
	StepID                 string             `json:"stepId"`
	SourceActionIDs        []string           `json:"sourceActionIds"`
	Intent                 string             `json:"intent"`
	Target                 string             `json:"target"`
	Locators               []LocatorCandidate `json:"locatorCandidates"`
	Preconditions          []Postcondition    `json:"preconditions"`
	Action                 ActionRequest      `json:"action"`
	ExpectedPostconditions []Postcondition    `json:"expectedPostconditions"`
	Verification           Verification       `json:"verification"`
	Fallbacks              []LocatorCandidate `json:"fallbacks,omitempty"`
	Risk                   string             `json:"risk"`
}

type DistillReport struct {
	SchemaVersion        string   `json:"schemaVersion"`
	SessionID            string   `json:"sessionId"`
	RawEventCount        int      `json:"rawEventCount"`
	CompletedActionCount int      `json:"completedActionCount"`
	FlowStepCount        int      `json:"flowStepCount"`
	RemovedObservations  int      `json:"removedObservations"`
	RemovedFailed        int      `json:"removedFailedActions"`
	RemovedNoChange      int      `json:"removedNoStateChange"`
	MergedActions        int      `json:"mergedActions"`
	Warnings             []string `json:"warnings,omitempty"`
}
