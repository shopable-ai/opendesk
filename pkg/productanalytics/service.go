package productanalytics

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"time"
)

func (s *Service) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started || s.closed {
		return
	}
	s.started = true
	if s.consent != ConsentGranted || !s.captureConfiguredLocked() {
		return
	}
	s.ensureProcessLocked()
	s.captureLocked("app_started", nil, false, "")
}

func (s *Service) SetConsent(granted bool) (Status, error) {
	if granted {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.closed {
			return s.statusLocked(), errors.New("product analytics service is closed")
		}
		if s.consent == ConsentGranted {
			return s.statusLocked(), nil
		}
		installID := randomID()
		if installID == "" {
			s.lastErrorCode = "identity_generation_failed"
			return s.statusLocked(), errors.New("generate analytics install id")
		}
		if err := writeConsent(s.consentPath(), persistedConsent{SchemaVersion: SchemaVersion, State: ConsentGranted, InstallID: installID}); err != nil {
			s.lastErrorCode = "consent_write_failed"
			return s.statusLocked(), err
		}
		s.consent = ConsentGranted
		s.installID = installID
		s.processID = randomID()
		if s.processID == "" {
			s.lastErrorCode = "identity_generation_failed"
		}
		s.sessionID = ""
		s.lastForeground = time.Time{}
		s.runs = map[string]runContext{}
		s.lastErrorCode = ""
		if s.captureConfiguredLocked() {
			if err := s.ensureProviderLocked(); err != nil {
				s.lastErrorCode = "provider_init_failed"
			}
		}
		// Explicitly do not synthesize app_started or replay pre-consent activity.
		return s.statusLocked(), nil
	}

	s.mu.Lock()
	if s.closed {
		status := s.statusLocked()
		s.mu.Unlock()
		return status, errors.New("product analytics service is closed")
	}
	provider := s.provider
	if provider != nil {
		// Close the network gate while holding the service gate, before any state is
		// persisted as denied. New product events cannot race past this point.
		provider.Disable()
	}
	s.provider = nil
	s.consent = ConsentDenied
	s.installID = ""
	s.processID = ""
	s.sessionID = ""
	s.lastForeground = time.Time{}
	s.runs = map[string]runContext{}
	s.debug = nil
	err := writeConsent(s.consentPath(), persistedConsent{SchemaVersion: SchemaVersion, State: ConsentDenied})
	if err != nil {
		// Never leave a previous durable Granted record behind after an in-memory
		// withdrawal. Removing the preference fails closed to Unknown on restart.
		_ = os.Remove(s.consentPath())
		s.lastErrorCode = "consent_write_failed"
	} else {
		s.lastErrorCode = ""
	}
	status := s.statusLocked()
	s.mu.Unlock()
	if provider != nil {
		ctx, cancel := context.WithTimeout(context.Background(), s.config.ShutdownTimeout)
		_ = provider.Close(ctx, true)
		cancel()
	}
	return status, err
}

func (s *Service) ScreenViewed(surface string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !allowedSurfaces[surface] {
		s.rejectLocked("invalid_surface")
		return false
	}
	return s.captureLocked("screen_viewed", map[string]any{"surface": surface}, true, "")
}

func (s *Service) UIAction(surface, actionID, inputMethod string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !allowedSurfaces[surface] || !allowedActions[actionID] || !allowedInputMethods[inputMethod] {
		s.rejectLocked("invalid_action")
		return false
	}
	return s.captureLocked("ui_action", map[string]any{
		"surface": surface, "action_id": actionID, "input_method": inputMethod,
	}, true, "")
}

func NewRunID() string { return randomID() }

func (s *Service) FlowRunStarted(flowOrigin, runSource, runID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !allowedFlowOrigins[flowOrigin] || !allowedRunSources[runSource] || !validID(runID) {
		s.rejectLocked("invalid_run_start")
		return false
	}
	// Unknown/denied consent must not even manufacture an in-memory analytics
	// session identity. This check intentionally precedes ensureSessionLocked.
	if s.closed || s.consent != ConsentGranted || !s.captureConfiguredLocked() || !validID(s.installID) {
		return false
	}
	if _, exists := s.runs[runID]; exists {
		return false
	}
	sessionID := ""
	if runSource == "foreground" {
		sessionID = s.ensureSessionLocked(s.now().UTC())
		if sessionID == "" {
			return false
		}
	}
	accepted := s.captureLocked("flow_run_started", map[string]any{
		"flow_origin": flowOrigin, "run_source": runSource, "run_id": runID,
	}, false, sessionID)
	if accepted {
		s.runs[runID] = runContext{SessionID: sessionID, StartedAt: s.now().UTC(), Origin: flowOrigin, Source: runSource}
	}
	return accepted
}

func (s *Service) FlowRunFinished(runID, outcome, errorCode string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !validID(runID) || !allowedOutcomes[outcome] || !allowedErrorCodes[errorCode] {
		s.rejectLocked("invalid_run_finish")
		return false
	}
	ctx, exists := s.runs[runID]
	if !exists {
		s.rejectLocked("unknown_run")
		return false
	}
	delete(s.runs, runID)
	if outcome == "success" || outcome == "cancelled" {
		errorCode = ""
	}
	fields := map[string]any{
		"flow_origin":     ctx.Origin,
		"run_source":      ctx.Source,
		"run_id":          runID,
		"outcome":         outcome,
		"duration_bucket": durationBucket(s.now().UTC().Sub(ctx.StartedAt)),
	}
	if errorCode != "" {
		fields["error_code"] = errorCode
	}
	return s.captureLocked("flow_run_finished", fields, false, ctx.SessionID)
}

func (s *Service) Status() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.statusLocked()
}

func (s *Service) DebugEvents() []Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]Event, len(s.debug))
	copy(result, s.debug)
	return result
}

func (s *Service) Close(ctx context.Context) error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	provider := s.provider
	s.provider = nil
	granted := s.consent == ConsentGranted
	s.mu.Unlock()
	if provider == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return provider.Close(ctx, !granted)
}

func (s *Service) statusLocked() Status {
	return Status{
		Consent:        s.consent,
		Provider:       s.config.Provider,
		Configured:     s.captureConfiguredLocked(),
		CaptureEnabled: s.consent == ConsentGranted && s.captureConfiguredLocked() && !s.closed,
		InstallIDSet:   s.installID != "",
		DebugEvents:    len(s.debug),
		DroppedEvents:  s.dropped,
		LastErrorCode:  s.lastErrorCode,
	}
}

func (s *Service) captureConfiguredLocked() bool {
	switch s.config.Provider {
	case ProviderDebug:
		return true
	case ProviderPostHog:
		return s.config.Endpoint != "" && s.config.ProjectToken != ""
	default:
		return false
	}
}

func (s *Service) ensureProviderLocked() error {
	if s.provider != nil || s.config.Provider != ProviderPostHog || !s.captureConfiguredLocked() {
		return nil
	}
	provider, err := s.makeProvider(s.config, s.transport)
	if err != nil {
		return err
	}
	s.provider = provider
	return nil
}

func (s *Service) ensureProcessLocked() {
	if s.processID == "" {
		s.processID = randomID()
		if s.processID == "" {
			s.lastErrorCode = "identity_generation_failed"
		}
	}
}

func (s *Service) ensureSessionLocked(now time.Time) string {
	if s.sessionID != "" && !s.lastForeground.IsZero() && now.Sub(s.lastForeground) < s.config.SessionTimeout {
		s.lastForeground = now
		return s.sessionID
	}
	s.sessionID = randomID()
	if s.sessionID == "" {
		s.lastErrorCode = "identity_generation_failed"
		return ""
	}
	s.lastForeground = now
	// app_session_started does not recurse into foreground-session creation.
	if !s.captureLocked("app_session_started", nil, false, s.sessionID) {
		s.sessionID = ""
		s.lastForeground = time.Time{}
	}
	return s.sessionID
}

func (s *Service) captureLocked(name string, fields map[string]any, foreground bool, explicitSession string) bool {
	if s.closed || s.consent != ConsentGranted || !s.captureConfiguredLocked() || !validID(s.installID) {
		return false
	}
	s.ensureProcessLocked()
	if !validID(s.processID) {
		s.rejectLocked("identity_unavailable")
		return false
	}
	now := s.now().UTC()
	sessionID := explicitSession
	if foreground {
		sessionID = s.ensureSessionLocked(now)
		if sessionID == "" {
			// Preserve the root failure from session creation (for example a
			// provider enqueue failure or identity generation failure) instead of
			// hiding it behind the secondary fact that no foreground session was
			// available. The parent event is still counted as dropped.
			if s.lastErrorCode == "" {
				s.rejectLocked("session_unavailable")
			} else {
				s.dropped++
			}
			return false
		}
	}
	properties := map[string]any{
		"schema_version": SchemaVersion,
		"event_id":       randomID(),
		"occurred_at":    now.Format(time.RFC3339Nano),
		"install_id":     s.installID,
		"process_id":     s.processID,
		"app_version":    s.runtime.AppVersion,
		"platform":       s.runtime.Platform,
		"arch":           s.runtime.Arch,
		"environment":    s.config.Environment,
	}
	if sessionID != "" {
		properties["session_id"] = sessionID
	}
	for key, value := range fields {
		properties[key] = value
	}
	event := Event{
		Name: name, DistinctID: s.installID, EventID: properties["event_id"].(string),
		OccurredAt: now, Properties: properties,
	}
	if !eventAllowed(event) {
		s.rejectLocked("schema_rejected")
		return false
	}
	encoded, err := json.Marshal(event)
	if err != nil || len(encoded) > s.config.MaxEventBytes {
		s.rejectLocked("event_too_large")
		return false
	}
	if s.config.Provider == ProviderDebug {
		s.debug = append(s.debug, event)
		if len(s.debug) > s.debugCapacity {
			s.debug = append([]Event(nil), s.debug[len(s.debug)-s.debugCapacity:]...)
			s.dropped++
		}
		return true
	}
	if err := s.ensureProviderLocked(); err != nil || s.provider == nil {
		s.lastErrorCode = "provider_unavailable"
		s.dropped++
		return false
	}
	if err := s.provider.Enqueue(event); err != nil {
		s.lastErrorCode = "provider_enqueue_failed"
		s.dropped++
		return false
	}
	return true
}
