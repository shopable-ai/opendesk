package productanalytics

import "time"

const defaultDiagnosticCapacity = 20

type DiagnosticEvent struct {
	Event      string    `json:"event"`
	Result     string    `json:"result"`
	ErrorCode  string    `json:"errorCode,omitempty"`
	OccurredAt time.Time `json:"occurredAt"`
}

type Diagnostics struct {
	Consent             string            `json:"consent"`
	Provider            string            `json:"provider"`
	Configured          bool              `json:"configured"`
	CaptureEnabled      bool              `json:"captureEnabled"`
	Initialized         bool              `json:"initialized"`
	Closed              bool              `json:"closed"`
	ProviderInitialized bool              `json:"providerInitialized"`
	QueueMode           string            `json:"queueMode"`
	QueueCapacity       int               `json:"queueCapacity"`
	QueueDepthKnown     bool              `json:"queueDepthKnown"`
	MaxEnqueuedRequests int               `json:"maxEnqueuedRequests"`
	DroppedEvents       uint64            `json:"droppedEvents"`
	LastErrorCode       string            `json:"lastErrorCode"`
	LastSendResult      string            `json:"lastSendResult"`
	RecentEvents        []DiagnosticEvent `json:"recentEvents"`
}

func (s *Service) Diagnostics() Diagnostics {
	s.mu.Lock()
	defer s.mu.Unlock()
	recent := make([]DiagnosticEvent, len(s.diagnostic))
	copy(recent, s.diagnostic)
	queueMode := "disabled"
	queueCapacity := 0
	queueDepthKnown := false
	maxRequests := 0
	switch s.config.Provider {
	case ProviderDebug:
		queueMode = "local-debug-ring"
		queueCapacity = s.debugCapacity
		queueDepthKnown = true
	case ProviderPostHog:
		queueMode = "sdk-managed"
		queueCapacity = s.config.MaxQueueSize
		maxRequests = s.config.MaxEnqueuedRequests
	}
	return Diagnostics{
		Consent: s.consent, Provider: s.config.Provider,
		Configured: s.captureConfiguredLocked(),
		CaptureEnabled: s.consent == ConsentGranted && s.captureConfiguredLocked() && !s.closed,
		Initialized: s.started, Closed: s.closed, ProviderInitialized: s.provider != nil,
		QueueMode: queueMode, QueueCapacity: queueCapacity, QueueDepthKnown: queueDepthKnown,
		MaxEnqueuedRequests: maxRequests, DroppedEvents: s.dropped,
		LastErrorCode: s.lastErrorCode, LastSendResult: s.lastSendResult,
		RecentEvents: recent,
	}
}

func (s *Service) recordDiagnosticLocked(name, result, errorCode string, occurredAt time.Time) {
	if s.diagnosticCapacity <= 0 || name == "" || result == "" {
		return
	}
	s.diagnostic = append(s.diagnostic, DiagnosticEvent{
		Event: name, Result: result, ErrorCode: errorCode, OccurredAt: occurredAt.UTC(),
	})
	if len(s.diagnostic) > s.diagnosticCapacity {
		s.diagnostic = append([]DiagnosticEvent(nil), s.diagnostic[len(s.diagnostic)-s.diagnosticCapacity:]...)
	}
	s.lastSendResult = result
}
