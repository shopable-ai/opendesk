package semanticexec

const SchemaVersion = "0.1.0"

const (
	StatusPending               = "pending"
	StatusRunning               = "running"
	StatusSucceeded             = "succeeded"
	StatusFailed                = "failed"
	StatusBlocked               = "blocked"
	StatusDegraded              = "degraded"
	StatusPartial               = "partial"
	StatusFalseSuccessSuspected = "false_success_suspected"
)

const (
	FailureClassNone               = ""
	FailureClassPreconditionFailed = "precondition_failed"
	FailureClassTargetNotFound     = "target_not_found"
	FailureClassAmbiguous          = "ambiguous"
	FailureClassPermissionBlocked  = "permission_blocked"
	FailureClassVerificationFailed = "verification_failed"
	FailureClassDriverError        = "driver_error"
	FailureClassTimeout            = "timeout"
	FailureClassEnvironmentalDrift = "environmental_drift"
	FailureClassFalseSuccess       = "false_success"
)

const (
	VerifierUI       = "ui_observable"
	VerifierState    = "state_observable"
	VerifierBusiness = "business_observable"
	VerifierEvidence = "evidence_observable"
)

const (
	RouteDOM           = "dom"
	RouteDevTools      = "devtools"
	RouteAccessibility = "accessibility"
	RouteRegion        = "region"
	RouteOCR           = "ocr"
	RouteAnchor        = "anchor"
	RouteTemplate      = "template"
	RouteAIRecovery    = "ai_recovery"
	RouteMock          = "mock"
)

type Scenario struct {
	SchemaVersion  string         `json:"schemaVersion"`
	ScenarioID     string         `json:"scenarioId"`
	ScenarioType   string         `json:"scenarioType"`
	Description    string         `json:"description,omitempty"`
	Steps          []ScenarioStep `json:"steps"`
	RoutePolicy    RoutePolicy    `json:"routePolicy"`
	RecoveryBudget int            `json:"recoveryBudget"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type ScenarioStep struct {
	StepID            string         `json:"stepId"`
	Action            string         `json:"action"`
	Target            string         `json:"target,omitempty"`
	Preconditions     []string       `json:"preconditions,omitempty"`
	ExpectedVerifiers []string       `json:"expectedVerifiers,omitempty"`
	MockOutcome       string         `json:"mockOutcome"`
	MockFailureClass  string         `json:"mockFailureClass,omitempty"`
	AllowDegraded     bool           `json:"allowDegraded,omitempty"`
	RequiresHumanGate bool           `json:"requiresHumanGate,omitempty"`
	EvidenceRefs      []EvidenceRef  `json:"evidenceRefs,omitempty"`
	Metadata          map[string]any `json:"metadata,omitempty"`
}

type RoutePolicy struct {
	PreferredOrder    []string `json:"preferredOrder,omitempty"`
	AllowFallback     bool     `json:"allowFallback"`
	MaxAttemptsPerStep int     `json:"maxAttemptsPerStep"`
}

type RouteAttempt struct {
	AttemptIndex  int            `json:"attemptIndex"`
	RouteKind     string         `json:"routeKind"`
	RouteSelector string         `json:"routeSelector,omitempty"`
	Success       bool           `json:"success"`
	FailureClass  string         `json:"failureClass,omitempty"`
	Detail        string         `json:"detail,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type VerificationCheck struct {
	CheckID      string         `json:"checkId"`
	CheckType    string         `json:"checkType"`
	Passed       bool           `json:"passed"`
	Inconclusive bool           `json:"inconclusive,omitempty"`
	EvidenceRef  string         `json:"evidenceRef,omitempty"`
	Message      string         `json:"message,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

type StepResult struct {
	StepID                string              `json:"stepId"`
	Status                string              `json:"status"`
	RouteAttempts         []RouteAttempt      `json:"routeAttempts"`
	Verifications         []VerificationCheck `json:"verifications"`
	FalseSuccessSuspected bool                `json:"falseSuccessSuspected"`
	HumanGateRequired     bool                `json:"humanGateRequired"`
	FailureClass          string              `json:"failureClass,omitempty"`
	Summary               string              `json:"summary,omitempty"`
}

type ExecutionResult struct {
	SchemaVersion  string         `json:"schemaVersion"`
	ScenarioID     string         `json:"scenarioId"`
	Status         string         `json:"status"`
	Steps          []StepResult   `json:"steps"`
	RecoveryBudget int            `json:"recoveryBudget"`
	RecoveryUsed   int            `json:"recoveryUsed"`
	Summary        string         `json:"summary,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type ExpectedOutcome struct {
	SchemaVersion           string `json:"schemaVersion"`
	ScenarioID              string `json:"scenarioId"`
	ExpectedStatus          string `json:"expectedStatus"`
	ExpectedFailureClass    string `json:"expectedFailureClass,omitempty"`
	ExpectedHumanGate       bool   `json:"expectedHumanGate"`
	ExpectedFalseSuccess    bool   `json:"expectedFalseSuccess"`
	ExpectedSuiteDisposition string `json:"expectedSuiteDisposition,omitempty"`
}

type EvidenceRef struct {
	Kind string `json:"kind"`
	Path string `json:"path"`
}
