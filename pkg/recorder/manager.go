package recorder

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	ErrSessionNotFound   = errors.New("recorder session not found")
	ErrSessionStopped    = errors.New("recorder session is stopped")
	ErrInternalRecursion = errors.New("recorder internal observation recursion blocked")
)

type StartOptions struct {
	SessionID         string
	ExecutionID       string
	Goal              string
	Source            string
	ObservationPolicy ObservationPolicy
}

type session struct {
	mu             sync.Mutex
	manifest       Manifest
	sequence       int64
	actionSequence int64
	internalDepth  int
}

type Manager struct {
	store    *Store
	mu       sync.RWMutex
	sessions map[string]*session
	clock    func() time.Time
}

func NewManager(root string) (*Manager, error) {
	store, err := NewStore(root)
	if err != nil {
		return nil, err
	}
	return &Manager{store: store, sessions: make(map[string]*session), clock: time.Now}, nil
}

func (m *Manager) Store() *Store { return m.store }

func (m *Manager) LoadFlow(sessionID string) (Flow, error) {
	path, err := m.store.ArtifactPath(sessionID, "distilled/flow.json")
	if err != nil {
		return Flow{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Flow{}, err
	}
	var flow Flow
	if err := json.Unmarshal(data, &flow); err != nil {
		return Flow{}, err
	}
	return flow, nil
}

func (m *Manager) Start(options StartOptions) (Manifest, error) {
	options.Goal = strings.TrimSpace(options.Goal)
	if options.Goal == "" {
		return Manifest{}, errors.New("goal is required")
	}
	if options.Source == "" {
		options.Source = "unknown"
	}
	if options.ObservationPolicy == "" {
		options.ObservationPolicy = ObservationStandard
	}
	if options.ObservationPolicy != ObservationMinimal && options.ObservationPolicy != ObservationStandard && options.ObservationPolicy != ObservationEnriched {
		return Manifest{}, fmt.Errorf("invalid observation policy %q", options.ObservationPolicy)
	}
	if options.SessionID == "" {
		options.SessionID = newID("rec")
	}
	if !validID(options.SessionID) {
		return Manifest{}, fmt.Errorf("invalid session id %q", options.SessionID)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.sessions[options.SessionID]; exists {
		return Manifest{}, fmt.Errorf("duplicate recorder session %q", options.SessionID)
	}
	dir, err := m.store.PrepareSession(options.SessionID)
	if err != nil {
		return Manifest{}, err
	}
	startedAt := m.clock().UTC().Format(time.RFC3339Nano)
	manifest := Manifest{
		SchemaVersion:     SchemaVersion,
		SessionID:         options.SessionID,
		ExecutionID:       options.ExecutionID,
		Goal:              options.Goal,
		Source:            options.Source,
		ObservationPolicy: options.ObservationPolicy,
		State:             SessionActive,
		StartedAt:         startedAt,
		Paths: map[string]string{
			"root":        dir,
			"rawTrace":    dir + "/raw/events.ndjson",
			"flow":        dir + "/distilled/flow.json",
			"variables":   dir + "/distilled/variables.json",
			"report":      dir + "/distilled/report.json",
			"generatedJS": dir + "/generated/flow.js",
		},
	}
	state := &session{manifest: manifest}
	m.sessions[manifest.SessionID] = state
	if _, err := m.store.WriteJSON(manifest.SessionID, "manifest.json", manifest); err != nil {
		delete(m.sessions, manifest.SessionID)
		return Manifest{}, err
	}
	state.sequence++
	start := TraceEvent{
		SchemaVersion: SchemaVersion, EventID: eventID(manifest.SessionID, state.sequence),
		EventType: "session.started", SessionID: manifest.SessionID, ExecutionID: manifest.ExecutionID,
		Sequence: state.sequence, Timestamp: startedAt, Source: manifest.Source, Classification: "meta",
		Fields: map[string]any{"goal": manifest.Goal, "observationPolicy": manifest.ObservationPolicy},
	}
	if err := m.store.AppendEvent(manifest.SessionID, start); err != nil {
		delete(m.sessions, manifest.SessionID)
		return Manifest{}, err
	}
	state.manifest.EventCount++
	if _, err := m.store.WriteJSON(manifest.SessionID, "manifest.json", state.manifest); err != nil {
		return Manifest{}, err
	}
	return state.manifest, nil
}

func (m *Manager) Before(sessionID, executionID, source string, request ActionRequest, hint ActionHint, before Observation) (ActionSpan, error) {
	state, err := m.lookup(sessionID)
	if err != nil {
		return ActionSpan{}, err
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.manifest.State != SessionActive {
		return ActionSpan{}, ErrSessionStopped
	}
	if executionID == "" {
		executionID = state.manifest.ExecutionID
	}
	if source == "" {
		source = state.manifest.Source
	}
	request.Arguments, _ = RedactArguments(request.Arguments, hint.VariableHints)
	state.sequence++
	state.actionSequence++
	actionID := fmt.Sprintf("act-%06d", state.actionSequence)
	span := ActionSpan{
		SessionID: sessionID, ExecutionID: executionID, ActionID: actionID, Source: source,
		StartedAt: m.clock(), Hint: hint, Request: request, Before: before,
	}
	event := TraceEvent{
		SchemaVersion: SchemaVersion, EventID: eventID(sessionID, state.sequence), EventType: "action.before",
		SessionID: sessionID, ExecutionID: executionID, ActionID: actionID, Sequence: state.sequence,
		Timestamp: span.StartedAt.UTC().Format(time.RFC3339Nano), Source: source, Classification: classifyRequest(request.Name),
		Origin: "agent", Hint: &span.Hint, Request: &span.Request, Before: &span.Before,
	}
	if err := m.store.AppendEvent(sessionID, event); err != nil {
		state.actionSequence--
		return ActionSpan{}, err
	}
	state.manifest.EventCount++
	state.manifest.ActionCount++
	if _, err := m.store.WriteJSON(sessionID, "manifest.json", state.manifest); err != nil {
		return ActionSpan{}, err
	}
	return span, nil
}

func (m *Manager) After(span ActionSpan, result ActionResult, after Observation, verification Verification) error {
	state, err := m.lookup(span.SessionID)
	if err != nil {
		return err
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.manifest.State != SessionActive {
		return ErrSessionStopped
	}
	if result.DurationMs == 0 {
		result.DurationMs = m.clock().Sub(span.StartedAt).Milliseconds()
	}
	state.sequence++
	event := TraceEvent{
		SchemaVersion: SchemaVersion, EventID: eventID(span.SessionID, state.sequence), EventType: "action.after",
		SessionID: span.SessionID, ExecutionID: span.ExecutionID, ActionID: span.ActionID, Sequence: state.sequence,
		Timestamp: m.clock().UTC().Format(time.RFC3339Nano), Source: span.Source, Classification: classifyRequest(span.Request.Name),
		Origin: "agent", Hint: &span.Hint, Request: &span.Request, Before: &span.Before, After: &after,
		Result: &result, Verification: &verification,
	}
	if err := m.store.AppendEvent(span.SessionID, event); err != nil {
		return err
	}
	state.manifest.EventCount++
	_, err = m.store.WriteJSON(span.SessionID, "manifest.json", state.manifest)
	return err
}

func (m *Manager) Annotate(sessionID, executionID string, hint ActionHint, fields map[string]any) (TraceEvent, error) {
	state, err := m.lookup(sessionID)
	if err != nil {
		return TraceEvent{}, err
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.manifest.State != SessionActive {
		return TraceEvent{}, ErrSessionStopped
	}
	state.sequence++
	event := TraceEvent{
		SchemaVersion: SchemaVersion, EventID: eventID(sessionID, state.sequence), EventType: "annotation",
		SessionID: sessionID, ExecutionID: executionID, Sequence: state.sequence,
		Timestamp: m.clock().UTC().Format(time.RFC3339Nano), Source: state.manifest.Source,
		Classification: "meta", Origin: "agent", Hint: &hint, Fields: fields,
	}
	if err := m.store.AppendEvent(sessionID, event); err != nil {
		return TraceEvent{}, err
	}
	state.manifest.EventCount++
	_, err = m.store.WriteJSON(sessionID, "manifest.json", state.manifest)
	return event, err
}

func (m *Manager) Verify(sessionID, executionID, actionID string, verification Verification) (TraceEvent, error) {
	state, err := m.lookup(sessionID)
	if err != nil {
		return TraceEvent{}, err
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.manifest.State != SessionActive {
		return TraceEvent{}, ErrSessionStopped
	}
	if strings.TrimSpace(actionID) == "" {
		return TraceEvent{}, errors.New("action id is required")
	}
	state.sequence++
	event := TraceEvent{
		SchemaVersion: SchemaVersion, EventID: eventID(sessionID, state.sequence), EventType: "action.verification",
		SessionID: sessionID, ExecutionID: executionID, ActionID: actionID, Sequence: state.sequence,
		Timestamp: m.clock().UTC().Format(time.RFC3339Nano), Source: state.manifest.Source,
		Classification: "verify", Origin: "agent", Verification: &verification,
	}
	if err := m.store.AppendEvent(sessionID, event); err != nil {
		return TraceEvent{}, err
	}
	state.manifest.EventCount++
	_, err = m.store.WriteJSON(sessionID, "manifest.json", state.manifest)
	return event, err
}

func (m *Manager) EnterInternal(sessionID, parentActionID string) (func(), error) {
	state, err := m.lookup(sessionID)
	if err != nil {
		return nil, err
	}
	state.mu.Lock()
	if state.internalDepth != 0 {
		state.manifest.InternalRecursion++
		_, _ = m.store.WriteJSON(sessionID, "manifest.json", state.manifest)
		state.mu.Unlock()
		return nil, ErrInternalRecursion
	}
	state.internalDepth++
	state.mu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			state.mu.Lock()
			state.internalDepth--
			state.mu.Unlock()
		})
	}, nil
}

func (m *Manager) RecordInternal(sessionID, executionID, parentActionID, kind string, observation Observation) (TraceEvent, error) {
	state, err := m.lookup(sessionID)
	if err != nil {
		return TraceEvent{}, err
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.manifest.State != SessionActive {
		return TraceEvent{}, ErrSessionStopped
	}
	state.sequence++
	event := TraceEvent{
		SchemaVersion: SchemaVersion, EventID: eventID(sessionID, state.sequence), EventType: "observation.internal",
		SessionID: sessionID, ExecutionID: executionID, ParentActionID: parentActionID, Sequence: state.sequence,
		Timestamp: m.clock().UTC().Format(time.RFC3339Nano), Source: state.manifest.Source,
		Classification: "observe", Origin: "recorder", Internal: true, After: &observation,
		Fields: map[string]any{"kind": kind},
	}
	if err := m.store.AppendEvent(sessionID, event); err != nil {
		return TraceEvent{}, err
	}
	state.manifest.EventCount++
	state.manifest.InternalCount++
	_, err = m.store.WriteJSON(sessionID, "manifest.json", state.manifest)
	return event, err
}

func (m *Manager) Status(sessionID string) (Manifest, error) {
	state, err := m.lookup(sessionID)
	if err != nil {
		return Manifest{}, err
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	return cloneManifest(state.manifest), nil
}

func (m *Manager) Stop(sessionID string) (Manifest, error) {
	state, err := m.lookup(sessionID)
	if err != nil {
		return Manifest{}, err
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.manifest.State != SessionActive {
		return Manifest{}, ErrSessionStopped
	}
	state.sequence++
	stoppedAt := m.clock().UTC().Format(time.RFC3339Nano)
	event := TraceEvent{
		SchemaVersion: SchemaVersion, EventID: eventID(sessionID, state.sequence), EventType: "session.stopped",
		SessionID: sessionID, ExecutionID: state.manifest.ExecutionID, Sequence: state.sequence,
		Timestamp: stoppedAt, Source: state.manifest.Source, Classification: "meta",
	}
	if err := m.store.AppendEvent(sessionID, event); err != nil {
		return Manifest{}, err
	}
	state.manifest.EventCount++
	state.manifest.State = SessionStopped
	state.manifest.StoppedAt = stoppedAt
	if _, err := m.store.WriteJSON(sessionID, "manifest.json", state.manifest); err != nil {
		return Manifest{}, err
	}
	return cloneManifest(state.manifest), nil
}

func (m *Manager) lookup(sessionID string) (*session, error) {
	m.mu.RLock()
	state := m.sessions[sessionID]
	m.mu.RUnlock()
	if state == nil {
		return nil, ErrSessionNotFound
	}
	return state, nil
}

func newID(prefix string) string {
	bytes := make([]byte, 4)
	_, _ = rand.Read(bytes)
	return fmt.Sprintf("%s-%s-%s", prefix, time.Now().UTC().Format("20060102T150405.000000000Z"), hex.EncodeToString(bytes))
}

func eventID(sessionID string, sequence int64) string {
	return fmt.Sprintf("%s-%08d", sessionID, sequence)
}

func classifyRequest(name string) string {
	switch strings.TrimSpace(name) {
	case "getActiveWindow", "listWindows", "screenshot", "ocr", "detectUI", "analyzeLayout":
		return "observe"
	case "verify":
		return "verify"
	default:
		return "act"
	}
}

func cloneManifest(manifest Manifest) Manifest {
	copy := manifest
	copy.Paths = make(map[string]string, len(manifest.Paths))
	for key, value := range manifest.Paths {
		copy.Paths[key] = value
	}
	return copy
}
