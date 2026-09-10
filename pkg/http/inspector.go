package http

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"opendesk/pkg/inspector"
)

const (
	inspectorAPIPrefix         = "/api/accessibility-inspector/v1"
	inspectorBodyLimit         = 64 << 10
	inspectorResponseLimit     = 8 << 20
	inspectorPairTTL           = 5 * time.Minute
	inspectorClientTTL         = 30 * time.Minute
	inspectorSessionTTL        = 15 * time.Minute
	inspectorMaximumSessions   = 16
	inspectorSessionsPerClient = 4
	inspectorMaximumWindows    = 256
	inspectorMaximumReceipts   = 100
)

var (
	errInspectorUnauthorized = errors.New("inspector authorization is required")
	errInspectorExpired      = errors.New("inspector authorization expired")
	errInspectorBusy         = errors.New("inspector request limit reached")
	errInspectorNotFound     = errors.New("inspector session not found")
	errInspectorConflict     = errors.New("inspector session already has an operation in progress")
	errInspectorInvalid      = errors.New("invalid inspector input")
	errInspectorPrecondition = errors.New("inspector precondition failed")
)

type inspectorClient struct {
	ID        string
	TokenHash [32]byte
	ExpiresAt time.Time
	Windows   map[string]inspector.WindowCandidate
}

type inspectorSession struct {
	ID           string
	ClientID     string
	TokenHash    [32]byte
	CreatedAt    time.Time
	ExpiresAt    time.Time
	WindowID     string
	Window       inspector.WindowCandidate
	Limits       inspector.Limits
	Generation   int64
	InFlight     bool
	Cancel       context.CancelFunc
	Observation  map[string]any
	Review       *inspectorReview
	Validations  []map[string]any
	ArtifactPath string
}

type inspectorReview struct {
	SchemaVersion    string            `json:"schemaVersion"`
	ReviewID         string            `json:"reviewId"`
	SessionID        string            `json:"sessionId"`
	ObservationID    string            `json:"observationId"`
	SelectedNodeID   string            `json:"selectedNodeId"`
	BusinessAlias    string            `json:"businessAlias"`
	HumanNote        string            `json:"humanNote"`
	IntendedUsage    string            `json:"intendedUsage"`
	Locator          inspector.Locator `json:"locator"`
	EvidenceSource   string            `json:"evidenceSource"`
	ImportSourceHash string            `json:"importSourceHash,omitempty"`
	ReviewedAt       string            `json:"reviewedAt"`
}

type inspectorService struct {
	mu                sync.Mutex
	runner            inspector.Runner
	artifactRoot      string
	pairCode          string
	pairHash          [32]byte
	pairExpiresAt     time.Time
	pairRedeemed      bool
	clients           map[[32]byte]*inspectorClient
	sessions          map[string]*inspectorSession
	operationSlots    chan struct{}
	ctx               context.Context
	cancel            context.CancelFunc
	wg                sync.WaitGroup
	now               func() time.Time
	initializationErr error
}

func newInspectorService(runner inspector.Runner, artifactRoot string) *inspectorService {
	ctx, cancel := context.WithCancel(context.Background())
	service := &inspectorService{
		runner: runner, artifactRoot: strings.TrimSpace(artifactRoot),
		clients: map[[32]byte]*inspectorClient{}, sessions: map[string]*inspectorSession{},
		operationSlots: make(chan struct{}, 2), ctx: ctx, cancel: cancel, now: time.Now,
	}
	if service.artifactRoot == "" {
		service.artifactRoot = filepath.Join(".runtime", "accessibility-inspector")
	}
	code, err := inspectorRandomToken(24)
	if err != nil {
		service.initializationErr = fmt.Errorf("initialize inspector pairing: %w", err)
	} else {
		service.pairCode = code
		service.pairHash = sha256.Sum256([]byte(code))
		service.pairExpiresAt = service.now().Add(inspectorPairTTL)
	}
	service.wg.Add(1)
	go service.cleanupLoop()
	return service
}

func (s *inspectorService) cleanupLoop() {
	defer s.wg.Done()
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.cleanupExpired()
		}
	}
}

func (s *inspectorService) close() {
	if s == nil {
		return
	}
	s.cancel()
	s.mu.Lock()
	for _, session := range s.sessions {
		if session.Cancel != nil {
			session.Cancel()
		}
	}
	s.sessions = map[string]*inspectorSession{}
	s.clients = map[[32]byte]*inspectorClient{}
	s.mu.Unlock()
	s.wg.Wait()
}

func (s *inspectorService) cleanupExpired() {
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, client := range s.clients {
		if !now.Before(client.ExpiresAt) {
			delete(s.clients, key)
		}
	}
	for id, session := range s.sessions {
		if !now.Before(session.ExpiresAt) || s.clientByIDLocked(session.ClientID) == nil {
			if session.Cancel != nil {
				session.Cancel()
			}
			delete(s.sessions, id)
		}
	}
}

func (s *inspectorService) pairingURL(authority string) (string, error) {
	if s == nil {
		return "", errors.New("accessibility workbench is disabled")
	}
	if s.initializationErr != nil {
		return "", s.initializationErr
	}
	parsed, err := url.Parse("http://" + strings.TrimSpace(authority))
	if err != nil || parsed.User != nil || parsed.Host == "" || parsed.Host != strings.TrimSpace(authority) {
		return "", errors.New("accessibility workbench listener authority is invalid")
	}
	return parsed.String() + "/#pair=" + url.QueryEscape(s.pairCode), nil
}

func (s *inspectorService) pair(code string) (map[string]any, error) {
	if s == nil || s.initializationErr != nil {
		return nil, errors.New("accessibility workbench is unavailable")
	}
	presented := sha256.Sum256([]byte(code))
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pairRedeemed || !now.Before(s.pairExpiresAt) || subtle.ConstantTimeCompare(presented[:], s.pairHash[:]) != 1 {
		return nil, errInspectorUnauthorized
	}
	token, err := inspectorRandomToken(32)
	if err != nil {
		return nil, errors.New("could not create inspector authorization")
	}
	clientID, err := inspectorRandomID("client")
	if err != nil {
		return nil, errors.New("could not create inspector client")
	}
	hash := sha256.Sum256([]byte(token))
	expiresAt := now.Add(inspectorClientTTL)
	s.clients[hash] = &inspectorClient{
		ID: clientID, TokenHash: hash, ExpiresAt: expiresAt,
		Windows: map[string]inspector.WindowCandidate{},
	}
	s.pairRedeemed = true
	s.pairCode = ""
	return map[string]any{
		"token": token, "tokenType": "Bearer", "expiresAt": expiresAt.UTC().Format(time.RFC3339Nano),
	}, nil
}

func (s *inspectorService) authorize(header string) (*inspectorClient, error) {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) || strings.TrimSpace(strings.TrimPrefix(header, prefix)) == "" {
		return nil, errInspectorUnauthorized
	}
	hash := sha256.Sum256([]byte(strings.TrimSpace(strings.TrimPrefix(header, prefix))))
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	client := s.clients[hash]
	if client == nil {
		return nil, errInspectorUnauthorized
	}
	if !now.Before(client.ExpiresAt) {
		delete(s.clients, hash)
		return nil, errInspectorExpired
	}
	copy := *client
	return &copy, nil
}

func (s *inspectorService) revokeClient(clientID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	found := false
	for hash, client := range s.clients {
		if client.ID == clientID {
			delete(s.clients, hash)
			found = true
		}
	}
	if !found {
		return errInspectorUnauthorized
	}
	for id, session := range s.sessions {
		if session.ClientID != clientID {
			continue
		}
		if session.Cancel != nil {
			session.Cancel()
		}
		delete(s.sessions, id)
	}
	return nil
}

func (s *inspectorService) listWindows(ctx context.Context, clientID string) ([]map[string]any, error) {
	var candidates []inspector.WindowCandidate
	err := s.withOperation(ctx, func(operationContext context.Context) error {
		var err error
		candidates, err = s.runner.Windows(operationContext)
		return err
	})
	if err != nil {
		return nil, err
	}
	if len(candidates) > inspectorMaximumWindows {
		candidates = candidates[:inspectorMaximumWindows]
	}
	catalog := make(map[string]inspector.WindowCandidate, len(candidates))
	result := make([]map[string]any, 0, len(candidates))
	for _, candidate := range candidates {
		windowID, err := inspectorRandomID("window")
		if err != nil {
			return nil, err
		}
		catalog[windowID] = candidate
		result = append(result, map[string]any{
			"windowId": windowID, "title": candidate.Title, "pid": candidate.PID,
			"application": candidate.Application, "bounds": candidate.Bounds,
		})
	}
	s.mu.Lock()
	if client := s.clientByIDLocked(clientID); client != nil {
		client.Windows = catalog
	}
	s.mu.Unlock()
	return result, nil
}

func (s *inspectorService) capabilities(ctx context.Context) (map[string]any, error) {
	var result map[string]any
	err := s.withOperation(ctx, func(operationContext context.Context) error {
		var err error
		result, err = s.runner.Capabilities(operationContext)
		return err
	})
	return result, err
}

func (s *inspectorService) createSession(clientID, windowID string, limits inspector.Limits) (map[string]any, error) {
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.sessions) >= inspectorMaximumSessions || s.sessionCountLocked(clientID) >= inspectorSessionsPerClient {
		return nil, errInspectorBusy
	}
	client := s.clientByIDLocked(clientID)
	if client == nil {
		return nil, errInspectorUnauthorized
	}
	window, ok := client.Windows[windowID]
	if !ok {
		return nil, errors.New("window selection is stale; refresh the window list")
	}
	sessionID, err := inspectorRandomID("session")
	if err != nil {
		return nil, err
	}
	sessionToken, err := inspectorRandomToken(32)
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256([]byte(sessionToken))
	session := &inspectorSession{
		ID: sessionID, ClientID: clientID, TokenHash: hash, CreatedAt: now,
		ExpiresAt: now.Add(inspectorSessionTTL), WindowID: windowID, Window: window,
		Limits: limits, Generation: 1,
		ArtifactPath: filepath.Join(s.artifactRoot, sessionID),
	}
	s.sessions[sessionID] = session
	return map[string]any{
		"sessionId": sessionID, "sessionToken": sessionToken,
		"expiresAt":  session.ExpiresAt.UTC().Format(time.RFC3339Nano),
		"generation": session.Generation, "window": safeWindow(windowID, window), "limits": limits,
	}, nil
}

func (s *inspectorService) session(clientID, sessionID, token string) (*inspectorSession, error) {
	hash := sha256.Sum256([]byte(strings.TrimSpace(token)))
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[sessionID]
	if session == nil || session.ClientID != clientID || strings.TrimSpace(token) == "" ||
		subtle.ConstantTimeCompare(hash[:], session.TokenHash[:]) != 1 {
		return nil, errInspectorNotFound
	}
	if !now.Before(session.ExpiresAt) {
		if session.Cancel != nil {
			session.Cancel()
		}
		delete(s.sessions, sessionID)
		return nil, errInspectorExpired
	}
	return cloneSession(session), nil
}

func (s *inspectorService) sessionStatus(clientID, sessionID, token string) (map[string]any, error) {
	session, err := s.session(clientID, sessionID, token)
	if err != nil {
		return nil, err
	}
	result := map[string]any{
		"sessionId": session.ID, "createdAt": session.CreatedAt.UTC().Format(time.RFC3339Nano),
		"expiresAt": session.ExpiresAt.UTC().Format(time.RFC3339Nano), "generation": session.Generation,
		"window": safeWindow(session.WindowID, session.Window), "limits": session.Limits,
		"hasObservation": session.Observation != nil, "hasReview": session.Review != nil,
	}
	if session.Observation != nil {
		result["latestObservation"] = cloneJSONMap(session.Observation)
	}
	if session.Review != nil {
		copy := *session.Review
		result["review"] = copy
	}
	return result, nil
}

func (s *inspectorService) observe(ctx context.Context, clientID, sessionID, token string, override *inspector.Limits) (map[string]any, error) {
	session, operationContext, finish, err := s.beginSessionOperation(ctx, clientID, sessionID, token)
	if err != nil {
		return nil, err
	}
	defer finish()
	limits := session.Limits
	if override != nil {
		limits = *override
	}
	started := s.now().UTC()
	var result inspector.SnapshotResult
	err = s.withOperation(operationContext, func(runContext context.Context) error {
		var runErr error
		result, runErr = s.runner.Snapshot(runContext, cloneJSONMap(session.Window.Target), limits)
		return runErr
	})
	if err != nil {
		s.markObservationStale(session.ID, session.Generation, err)
		return nil, err
	}
	finished := s.now().UTC()
	projection := inspectorTreeProjection{}
	root := projectInspectorSnapshotNode(result.Snapshot["root"], 0, limits, &projection)
	if root == nil {
		err = errors.New("inspector runtime returned an invalid snapshot root")
		s.markObservationStale(session.ID, session.Generation, err)
		return nil, err
	}
	assignSnapshotNodeIDs(root)
	requestID, _ := result.Snapshot["requestId"].(string)
	backend, _ := result.Snapshot["backend"].(string)
	complete, _ := result.Snapshot["complete"].(bool)
	truncated, _ := result.Snapshot["truncated"].(bool)
	reason := result.Snapshot["reason"]
	if projection.Truncated {
		complete = false
		truncated = true
		reason = projection.Reason
	}
	observationID, err := inspectorRandomID("observation")
	if err != nil {
		return nil, err
	}
	observation := map[string]any{
		"schemaVersion": "opendesk.inspector.observation/v1",
		"observationId": observationID, "sessionId": session.ID, "generation": session.Generation,
		"window": safeObservedWindow(session.WindowID, session.Window, result.Window),
		"limits": limits, "executionId": result.ExecutionID, "requestId": requestID, "backend": backend,
		"startedAt": started.Format(time.RFC3339Nano), "observedAt": finished.Format(time.RFC3339Nano),
		"root": root, "complete": complete, "truncated": truncated,
		"reason": reason, "stats": map[string]any{"nodes": projection.Nodes, "maxDepth": projection.MaxDepth},
		"freshness": "current", "evidenceSource": "accessibility-runtime",
	}
	encoded, err := json.Marshal(observation)
	if err != nil || len(encoded) > inspectorResponseLimit {
		err = errors.New("inspector observation exceeds its response limit")
		s.markObservationStale(session.ID, session.Generation, err)
		return nil, err
	}
	sourceHash := sha256.Sum256(encoded)
	observation["sourceHash"] = fmt.Sprintf("sha256:%x", sourceHash[:])
	encoded, err = json.Marshal(observation)
	if err != nil || len(encoded) > inspectorResponseLimit {
		err = errors.New("inspector observation exceeds its response limit")
		s.markObservationStale(session.ID, session.Generation, err)
		return nil, err
	}
	if err := writeInspectorJSON(session.ArtifactPath, observationID+".json", observation); err != nil {
		s.markObservationStale(session.ID, session.Generation, err)
		return nil, err
	}
	s.mu.Lock()
	current := s.sessions[session.ID]
	if current == nil || current.Generation != session.Generation {
		s.mu.Unlock()
		return nil, errors.New("inspector observation target became stale")
	}
	if !s.now().Before(current.ExpiresAt) || s.clientByIDLocked(current.ClientID) == nil {
		if current.Cancel != nil {
			current.Cancel()
		}
		delete(s.sessions, session.ID)
		s.mu.Unlock()
		return nil, errInspectorExpired
	}
	current.Observation = cloneJSONMap(observation)
	// A review and its validation receipts are tied to one immutable
	// observation. A refresh must never let a repeated display node ID attach
	// those claims to different native facts.
	current.Review = nil
	current.Validations = nil
	s.mu.Unlock()
	return observation, nil
}

func (s *inspectorService) markObservationStale(sessionID string, generation int64, cause error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.sessions[sessionID]
	if current == nil || current.Generation != generation {
		return
	}
	if current.Observation != nil {
		stale := cloneJSONMap(current.Observation)
		stale["freshness"] = "stale"
		stale["staleReason"] = inspectorFailureCode(cause)
		stale["refreshFailedAt"] = s.now().UTC().Format(time.RFC3339Nano)
		current.Observation = stale
	}
	current.Review = nil
	current.Validations = nil
}

func inspectorFailureCode(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "TIMEOUT"
	}
	if errors.Is(err, context.Canceled) {
		return "CANCELED"
	}
	var runtimeErr *inspector.RuntimeError
	if errors.As(err, &runtimeErr) && strings.TrimSpace(runtimeErr.Code) != "" {
		return runtimeErr.Code
	}
	return "BACKEND_FAILED"
}

func (s *inspectorService) validate(ctx context.Context, clientID, sessionID, token string, locator inspector.Locator, override *inspector.Limits) (map[string]any, error) {
	session, operationContext, finish, err := s.beginSessionOperation(ctx, clientID, sessionID, token)
	if err != nil {
		return nil, err
	}
	defer finish()
	limits := session.Limits
	if override != nil {
		limits = *override
	}
	started := s.now().UTC()
	var result inspector.ValidationResult
	err = s.withOperation(operationContext, func(runContext context.Context) error {
		var runErr error
		result, runErr = s.runner.Validate(runContext, cloneJSONMap(session.Window.Target), locator, limits)
		return runErr
	})
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(operationContext.Err(), context.DeadlineExceeded) {
			result.Status = "TIMEOUT"
		} else {
			return nil, err
		}
	}
	if !validValidationStatus(result.Status) {
		result.Status = "BACKEND_UNAVAILABLE"
	}
	receiptID, err := inspectorRandomID("validation")
	if err != nil {
		return nil, err
	}
	receipt := map[string]any{
		"schemaVersion": "opendesk.inspector.validation/v1",
		"receiptId":     receiptID, "sessionId": session.ID, "generation": session.Generation,
		"locator": locator, "status": result.Status, "executionId": result.ExecutionID,
		"startedAt": started.Format(time.RFC3339Nano), "validatedAt": s.now().UTC().Format(time.RFC3339Nano),
		"limits": limits, "performedAction": false,
	}
	if result.Element != nil {
		receipt["element"] = result.Element
	}
	if result.Error != nil {
		receipt["error"] = result.Error
	}
	s.mu.Lock()
	current := s.sessions[session.ID]
	if current == nil || current.Generation != session.Generation {
		s.mu.Unlock()
		return nil, errors.New("inspector validation target became stale")
	}
	if !s.now().Before(current.ExpiresAt) || s.clientByIDLocked(current.ClientID) == nil {
		if current.Cancel != nil {
			current.Cancel()
		}
		delete(s.sessions, session.ID)
		s.mu.Unlock()
		return nil, errInspectorExpired
	}
	current.Validations = append(current.Validations, cloneJSONMap(receipt))
	if len(current.Validations) > inspectorMaximumReceipts {
		current.Validations = append([]map[string]any(nil), current.Validations[len(current.Validations)-inspectorMaximumReceipts:]...)
	}
	s.mu.Unlock()
	return receipt, nil
}

func (s *inspectorService) saveReview(clientID, sessionID, token string, input inspectorReviewInput) (map[string]any, error) {
	session, err := s.session(clientID, sessionID, token)
	if err != nil {
		return nil, err
	}
	if session.Observation == nil {
		return nil, fmt.Errorf("%w: take an observation before saving a review", errInspectorPrecondition)
	}
	if freshness, _ := session.Observation["freshness"].(string); freshness != "current" {
		return nil, fmt.Errorf("%w: refresh the stale observation before saving a review", errInspectorPrecondition)
	}
	observationID, _ := session.Observation["observationId"].(string)
	if input.ObservationID != observationID {
		return nil, errors.New("review observation is stale")
	}
	if findSnapshotNode(session.Observation["root"], input.SelectedNodeID) == nil {
		return nil, fmt.Errorf("%w: selected node is not present in the current observation", errInspectorInvalid)
	}
	reviewID, err := inspectorRandomID("review")
	if err != nil {
		return nil, err
	}
	review := &inspectorReview{
		SchemaVersion: "opendesk.inspector.review/v1", ReviewID: reviewID,
		SessionID: session.ID, ObservationID: observationID, SelectedNodeID: input.SelectedNodeID,
		BusinessAlias: input.BusinessAlias, HumanNote: input.HumanNote,
		IntendedUsage: input.IntendedUsage, Locator: input.Locator,
		EvidenceSource: "human-review", ReviewedAt: s.now().UTC().Format(time.RFC3339Nano),
	}
	s.mu.Lock()
	current := s.sessions[session.ID]
	if current == nil || current.Generation != session.Generation {
		s.mu.Unlock()
		return nil, errors.New("inspector review target became stale")
	}
	current.Review = review
	handoff := s.buildHandoffLocked(current)
	s.mu.Unlock()
	if err := writeInspectorJSON(session.ArtifactPath, reviewID+".json", review); err != nil {
		return nil, err
	}
	if err := writeInspectorJSON(session.ArtifactPath, "review.json", review); err != nil {
		return nil, err
	}
	if err := writeInspectorJSON(session.ArtifactPath, "handoff.json", handoff); err != nil {
		return nil, err
	}
	return map[string]any{
		"review": review, "handoff": handoff,
		"artifactPath": filepath.ToSlash(filepath.Join(session.ArtifactPath, "handoff.json")),
	}, nil
}

func (s *inspectorService) importReview(clientID, sessionID, token string, input inspectorImportInput) (map[string]any, error) {
	session, err := s.session(clientID, sessionID, token)
	if err != nil {
		return nil, err
	}
	if session.Observation == nil {
		return nil, fmt.Errorf("%w: take an observation before importing a review", errInspectorPrecondition)
	}
	if freshness, _ := session.Observation["freshness"].(string); freshness != "current" {
		return nil, fmt.Errorf("%w: refresh the stale observation before importing a review", errInspectorPrecondition)
	}
	if !validSnapshotNodeID(input.SelectedNodeID) || findSnapshotNode(session.Observation["root"], input.SelectedNodeID) == nil {
		return nil, fmt.Errorf("%w: select a node from the current observation before importing", errInspectorInvalid)
	}
	if len(input.Handoff) == 0 || len(input.Handoff) > inspectorBodyLimit {
		return nil, fmt.Errorf("%w: imported handoff is empty or exceeds its size limit", errInspectorInvalid)
	}
	var payload map[string]any
	decoder := json.NewDecoder(strings.NewReader(string(input.Handoff)))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return nil, fmt.Errorf("%w: imported handoff is not valid JSON data", errInspectorInvalid)
	}
	if schema, _ := payload["schemaVersion"].(string); schema != "opendesk.inspector.handoff/v1" {
		return nil, fmt.Errorf("%w: imported handoff schemaVersion is not supported", errInspectorInvalid)
	}
	human, _ := payload["humanReview"].(map[string]any)
	candidate, _ := payload["locatorCandidate"].(map[string]any)
	selector, _ := candidate["selector"].(map[string]any)
	locator, err := locatorFromJSONMap(selector)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", errInspectorInvalid, err)
	}
	reviewInput := inspectorReviewInput{
		ObservationID:  stringValueFromMap(session.Observation, "observationId"),
		SelectedNodeID: input.SelectedNodeID,
		BusinessAlias:  stringValueFromMap(human, "businessAlias"),
		HumanNote:      stringValueFromMap(human, "humanNote"),
		IntendedUsage:  stringValueFromMap(human, "intendedUsage"),
		Locator:        locator,
	}
	if err := validateInspectorReview(reviewInput); err != nil {
		return nil, fmt.Errorf("%w: imported handoff review is invalid: %v", errInspectorInvalid, err)
	}
	reviewID, err := inspectorRandomID("review")
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256(input.Handoff)
	review := &inspectorReview{
		SchemaVersion: "opendesk.inspector.review/v1", ReviewID: reviewID,
		SessionID: session.ID, ObservationID: reviewInput.ObservationID,
		SelectedNodeID: input.SelectedNodeID, BusinessAlias: reviewInput.BusinessAlias,
		HumanNote: reviewInput.HumanNote, IntendedUsage: reviewInput.IntendedUsage,
		Locator: locator, EvidenceSource: "human-review-import",
		ImportSourceHash: fmt.Sprintf("sha256:%x", hash[:]),
		ReviewedAt:       s.now().UTC().Format(time.RFC3339Nano),
	}
	s.mu.Lock()
	current := s.sessions[session.ID]
	if current == nil || current.Generation != session.Generation {
		s.mu.Unlock()
		return nil, errors.New("inspector import target became stale")
	}
	current.Review = review
	handoff := s.buildHandoffLocked(current)
	s.mu.Unlock()
	if err := writeInspectorJSON(session.ArtifactPath, reviewID+".json", review); err != nil {
		return nil, err
	}
	if err := writeInspectorJSON(session.ArtifactPath, "review.json", review); err != nil {
		return nil, err
	}
	if err := writeInspectorJSON(session.ArtifactPath, "handoff.json", handoff); err != nil {
		return nil, err
	}
	return map[string]any{
		"review": review, "handoff": handoff,
		"artifactPath":     filepath.ToSlash(filepath.Join(session.ArtifactPath, "handoff.json")),
		"validationStatus": "NOT_VALIDATED",
	}, nil
}

func (s *inspectorService) handoff(clientID, sessionID, token string) (map[string]any, error) {
	session, err := s.session(clientID, sessionID, token)
	if err != nil {
		return nil, err
	}
	if session.Review == nil || session.Observation == nil {
		return nil, fmt.Errorf("%w: save a current review before exporting a handoff", errInspectorPrecondition)
	}
	observationID, _ := session.Observation["observationId"].(string)
	freshness, _ := session.Observation["freshness"].(string)
	if freshness != "current" || session.Review.ObservationID != observationID {
		return nil, fmt.Errorf("%w: refresh and review the current observation before exporting a handoff", errInspectorPrecondition)
	}
	s.mu.Lock()
	current := s.sessions[session.ID]
	handoff := s.buildHandoffLocked(current)
	s.mu.Unlock()
	return handoff, nil
}

func (s *inspectorService) buildHandoffLocked(session *inspectorSession) map[string]any {
	review := *session.Review
	selected := safeSelectedElementFacts(findSnapshotNode(session.Observation["root"], review.SelectedNodeID))
	observationID, _ := session.Observation["observationId"].(string)
	sourceRefs := []string{"inspector-observation:" + observationID, "inspector-human-review:" + review.ReviewID}
	var latestValidation map[string]any
	for index := len(session.Validations) - 1; index >= 0; index-- {
		candidate := session.Validations[index]
		if reflect.DeepEqual(candidate["locator"], jsonRoundTrip(review.Locator)) && inspectorGenerationEqual(candidate["generation"], session.Generation) {
			latestValidation = cloneJSONMap(candidate)
			break
		}
	}
	locatorStatus := "candidate"
	unknowns := []string{}
	validationStatus := "NOT_VALIDATED"
	if latestValidation != nil {
		validationStatus, _ = latestValidation["status"].(string)
		if validationStatus == "UNIQUE" {
			locatorStatus = "verified"
			receiptID, _ := latestValidation["receiptId"].(string)
			sourceRefs = append(sourceRefs, "inspector-validation:"+receiptID)
		} else {
			unknowns = append(unknowns, "locator validation status: "+validationStatus)
		}
	} else {
		unknowns = append(unknowns, "locator has not been validated against the live backend")
	}
	complete, _ := session.Observation["complete"].(bool)
	if !complete {
		unknowns = append(unknowns, "source accessibility observation is incomplete")
	}
	description := strings.TrimSpace(review.BusinessAlias)
	if description == "" {
		description = snapshotNodeDescription(selected)
	}
	strategyJSON, _ := json.Marshal(review.Locator)
	target := map[string]any{
		"id": "workbench-target", "description": description,
		"locator": map[string]any{
			"status":         locatorStatus,
			"strategies":     []string{"Accessibility.find(" + string(strategyJSON) + ") within the exact window scope"},
			"fallbackPolicy": "none", "sourceRefs": sourceRefs,
		},
		"geometry": map[string]any{
			"space": "semantic-only", "projectionApi": "none", "values": map[string]any{},
			"sourceRefs": []string{"inspector-observation:" + observationID},
		},
		"sourceRefs": sourceRefs, "unknowns": unknowns,
	}
	windowTarget := handoffWindowTarget(session.Window)
	return map[string]any{
		"schemaVersion": "opendesk.inspector.handoff/v1",
		"kind":          "accessibility-human-review-handoff",
		"createdAt":     s.now().UTC().Format(time.RFC3339Nano),
		"scope": map[string]any{
			"application": session.Window.Application, "windowTarget": windowTarget,
			"observedWindow": safeWindow(session.WindowID, session.Window),
		},
		"observation": map[string]any{
			"observationId": observationID, "complete": session.Observation["complete"],
			"truncated": session.Observation["truncated"], "reason": session.Observation["reason"],
			"observedAt": session.Observation["observedAt"], "backend": session.Observation["backend"],
			"sourceHash":           session.Observation["sourceHash"],
			"selectedElementFacts": selected, "evidenceSource": "accessibility-runtime",
		},
		"humanReview": handoffReview(review),
		"locatorCandidate": map[string]any{
			"selector": review.Locator, "validationStatus": validationStatus,
			"validationReceipt": latestValidation,
		},
		"semanticBuildPlanTarget": target,
		"recipeVerification":      "not-run",
		"agentStatus":             "waiting-for-agent",
		"evidenceExtensions": map[string]any{
			"accessibility": sourceRefs, "visual": []any{}, "ocr": []any{}, "imageTargets": []any{},
		},
		"unresolved": unknowns,
	}
}

func inspectorGenerationEqual(value any, expected int64) bool {
	switch typed := value.(type) {
	case int64:
		return typed == expected
	case int:
		return int64(typed) == expected
	case float64:
		return typed == float64(expected)
	case json.Number:
		parsed, err := typed.Int64()
		return err == nil && parsed == expected
	default:
		return false
	}
}

func (s *inspectorService) closeSession(clientID, sessionID, token string) error {
	if _, err := s.session(clientID, sessionID, token); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[sessionID]
	if session == nil {
		return errInspectorNotFound
	}
	if session.Cancel != nil {
		session.Cancel()
	}
	delete(s.sessions, sessionID)
	return nil
}

func (s *inspectorService) beginSessionOperation(ctx context.Context, clientID, sessionID, token string) (*inspectorSession, context.Context, func(), error) {
	if _, err := s.session(clientID, sessionID, token); err != nil {
		return nil, nil, nil, err
	}
	s.mu.Lock()
	session := s.sessions[sessionID]
	if session == nil {
		s.mu.Unlock()
		return nil, nil, nil, errInspectorNotFound
	}
	if session.InFlight {
		s.mu.Unlock()
		return nil, nil, nil, errInspectorConflict
	}
	operationContext, cancel := context.WithCancel(ctx)
	stopServiceCancel := context.AfterFunc(s.ctx, cancel)
	session.InFlight = true
	session.Cancel = cancel
	copy := cloneSession(session)
	s.mu.Unlock()
	finish := func() {
		stopServiceCancel()
		cancel()
		s.mu.Lock()
		if current := s.sessions[sessionID]; current != nil {
			current.InFlight = false
			current.Cancel = nil
		}
		s.mu.Unlock()
	}
	return copy, operationContext, finish, nil
}

func (s *inspectorService) withOperation(ctx context.Context, operation func(context.Context) error) error {
	select {
	case s.operationSlots <- struct{}{}:
		defer func() { <-s.operationSlots }()
	case <-ctx.Done():
		return ctx.Err()
	default:
		return errInspectorBusy
	}
	return operation(ctx)
}

func (s *inspectorService) clientByIDLocked(id string) *inspectorClient {
	for _, client := range s.clients {
		if client.ID == id {
			return client
		}
	}
	return nil
}

func (s *inspectorService) sessionCountLocked(clientID string) int {
	count := 0
	for _, session := range s.sessions {
		if session.ClientID == clientID {
			count++
		}
	}
	return count
}

type inspectorPairInput struct {
	Code string `json:"code"`
}

type inspectorCreateSessionInput struct {
	WindowID string            `json:"windowId"`
	Limits   *inspector.Limits `json:"limits,omitempty"`
}

type inspectorObservationInput struct {
	Limits *inspector.Limits `json:"limits,omitempty"`
}

type inspectorValidationInput struct {
	Locator inspector.Locator `json:"locator"`
	Limits  *inspector.Limits `json:"limits,omitempty"`
}

type inspectorReviewInput struct {
	ObservationID  string            `json:"observationId"`
	SelectedNodeID string            `json:"selectedNodeId"`
	BusinessAlias  string            `json:"businessAlias"`
	HumanNote      string            `json:"humanNote"`
	IntendedUsage  string            `json:"intendedUsage"`
	Locator        inspector.Locator `json:"locator"`
}

type inspectorImportInput struct {
	SelectedNodeID string          `json:"selectedNodeId"`
	Handoff        json.RawMessage `json:"handoff"`
}

func (h *Handler) inspectorEnabled() bool { return h != nil && h.inspector != nil }

func (h *Handler) HandleInspectorAPI(w http.ResponseWriter, r *http.Request) {
	setInspectorSecurityHeaders(w)
	if !h.inspectorEnabled() {
		h.sendError(w, http.StatusNotFound, "accessibility workbench is not enabled")
		return
	}
	if err := h.validateInspectorNetwork(r); err != nil {
		h.sendError(w, http.StatusForbidden, err.Error())
		return
	}
	preflight, err := h.configureInspectorCORS(w, r)
	if err != nil {
		h.sendError(w, http.StatusForbidden, err.Error())
		return
	}
	if preflight {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err := h.validateInspectorTransport(r); err != nil {
		h.sendError(w, http.StatusForbidden, err.Error())
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, inspectorAPIPrefix), "/")
	if path == "pair" {
		if r.Method != http.MethodPost {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var input inspectorPairInput
		if err := decodeInspectorJSON(w, r, &input); err != nil {
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		if utf8.RuneCountInString(input.Code) > 128 {
			h.sendError(w, http.StatusBadRequest, "pairing code exceeds its length limit")
			return
		}
		value, err := h.inspector.pair(input.Code)
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
		if h.inspectorOnPaired != nil {
			h.inspectorOnPaired()
		}
		return
	}
	client, err := h.inspector.authorize(r.Header.Get("Authorization"))
	if err != nil {
		h.sendInspectorError(w, err)
		return
	}
	if path == "authorization" {
		if r.Method != http.MethodDelete {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if err := h.inspector.revokeClient(client.ID); err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, map[string]any{"revoked": true})
		if h.inspectorOnIdle != nil {
			go h.inspectorOnIdle()
		}
		return
	}
	if path == "capabilities" {
		if r.Method != http.MethodGet {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		value, err := h.inspector.capabilities(r.Context())
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
		return
	}
	if path == "windows" {
		if r.Method != http.MethodGet {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		value, err := h.inspector.listWindows(r.Context(), client.ID)
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
		return
	}
	if path == "sessions" {
		if r.Method != http.MethodPost {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var input inspectorCreateSessionInput
		if err := decodeInspectorJSON(w, r, &input); err != nil {
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		limits, err := normalizeInspectorLimits(input.Limits)
		if err != nil || !validShortID(input.WindowID, "window") {
			if err == nil {
				err = errors.New("windowId is invalid")
			}
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		value, err := h.inspector.createSession(client.ID, input.WindowID, limits)
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
		return
	}
	h.handleInspectorSessionRoute(w, r, client, path)
}

func (h *Handler) handleInspectorSessionRoute(w http.ResponseWriter, r *http.Request, client *inspectorClient, path string) {
	parts := strings.Split(path, "/")
	if len(parts) < 2 || len(parts) > 3 || parts[0] != "sessions" || !validShortID(parts[1], "session") {
		h.sendError(w, http.StatusNotFound, "inspector route not found")
		return
	}
	sessionID := parts[1]
	sessionToken := r.Header.Get("X-OpenDesk-Inspector-Session")
	if len(parts) == 2 {
		switch r.Method {
		case http.MethodGet:
			value, err := h.inspector.sessionStatus(client.ID, sessionID, sessionToken)
			if err != nil {
				h.sendInspectorError(w, err)
				return
			}
			h.sendSuccess(w, value)
		case http.MethodDelete:
			if err := h.inspector.closeSession(client.ID, sessionID, sessionToken); err != nil {
				h.sendInspectorError(w, err)
				return
			}
			h.sendSuccess(w, map[string]any{"sessionId": sessionID, "closed": true})
		default:
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}
	switch parts[2] {
	case "observations":
		if r.Method != http.MethodPost {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var input inspectorObservationInput
		if err := decodeInspectorJSON(w, r, &input); err != nil {
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		if input.Limits != nil {
			limits, err := normalizeInspectorLimits(input.Limits)
			if err != nil {
				h.sendError(w, http.StatusBadRequest, err.Error())
				return
			}
			input.Limits = &limits
		}
		value, err := h.inspector.observe(r.Context(), client.ID, sessionID, sessionToken, input.Limits)
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
	case "validate":
		if r.Method != http.MethodPost {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var input inspectorValidationInput
		if err := decodeInspectorJSON(w, r, &input); err != nil {
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := validateInspectorLocator(input.Locator); err != nil {
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		if input.Limits != nil {
			limits, err := normalizeInspectorLimits(input.Limits)
			if err != nil {
				h.sendError(w, http.StatusBadRequest, err.Error())
				return
			}
			input.Limits = &limits
		}
		value, err := h.inspector.validate(r.Context(), client.ID, sessionID, sessionToken, input.Locator, input.Limits)
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
	case "review":
		if r.Method != http.MethodPut {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var input inspectorReviewInput
		if err := decodeInspectorJSON(w, r, &input); err != nil {
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := validateInspectorReview(input); err != nil {
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		value, err := h.inspector.saveReview(client.ID, sessionID, sessionToken, input)
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
	case "import":
		if r.Method != http.MethodPost {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var input inspectorImportInput
		if err := decodeInspectorJSON(w, r, &input); err != nil {
			h.sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		value, err := h.inspector.importReview(client.ID, sessionID, sessionToken, input)
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
	case "handoff":
		if r.Method != http.MethodGet {
			h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		value, err := h.inspector.handoff(client.ID, sessionID, sessionToken)
		if err != nil {
			h.sendInspectorError(w, err)
			return
		}
		h.sendSuccess(w, value)
	default:
		h.sendError(w, http.StatusNotFound, "inspector route not found")
	}
}

func (h *Handler) sendInspectorError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, errInspectorUnauthorized), errors.Is(err, errInspectorExpired):
		status = http.StatusUnauthorized
	case errors.Is(err, errInspectorNotFound):
		status = http.StatusNotFound
	case errors.Is(err, errInspectorConflict):
		status = http.StatusConflict
	case errors.Is(err, errInspectorPrecondition):
		status = http.StatusConflict
	case errors.Is(err, errInspectorInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, errInspectorBusy):
		status = http.StatusTooManyRequests
	default:
		var runtimeErr *inspector.RuntimeError
		if errors.As(err, &runtimeErr) {
			switch runtimeErr.Code {
			case "PERMISSION_DENIED":
				status = http.StatusForbidden
			case "NOT_FOUND", "TARGET_NOT_FOUND", "STALE_TARGET", "AMBIGUOUS_TARGET":
				status = http.StatusConflict
			case "TIMEOUT", "CANCELED":
				status = http.StatusGatewayTimeout
			case "INVALID_ARGUMENT":
				status = http.StatusBadRequest
			case "NOT_SUPPORTED", "CAPABILITY_DISABLED", "BACKEND_FAILED":
				status = http.StatusServiceUnavailable
			}
		} else if strings.Contains(err.Error(), "stale") {
			status = http.StatusConflict
		}
	}
	h.sendError(w, status, err.Error())
}

func (h *Handler) inspectorHostAllowed(value string) bool {
	return h != nil && strings.EqualFold(strings.TrimSpace(value), strings.TrimSpace(h.inspectorHost))
}

func (h *Handler) inspectorRemoteAllowed(remoteAddress string) bool {
	host, _, err := net.SplitHostPort(strings.TrimSpace(remoteAddress))
	if err != nil {
		host = strings.TrimSpace(remoteAddress)
	}
	address, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err != nil {
		return false
	}
	return address.Unmap().IsLoopback()
}

func (h *Handler) validateInspectorNetwork(r *http.Request) error {
	if r == nil || !h.inspectorRemoteAllowed(r.RemoteAddr) || !h.inspectorHostAllowed(r.Host) {
		return errors.New("accessibility workbench socket source or Host is outside the configured access boundary")
	}
	for name := range r.Header {
		if strings.HasPrefix(strings.ToLower(name), "x-forwarded-") || strings.EqualFold(name, "Forwarded") {
			return errors.New("forwarded inspector requests are not allowed")
		}
	}
	return nil
}

func (h *Handler) validateInspectorTransport(r *http.Request) error {
	if err := h.validateInspectorNetwork(r); err != nil {
		return err
	}
	if r.Header.Get("X-OpenDesk-Inspector") != "1" {
		return errors.New("inspector request marker is required")
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "null" {
		return errors.New("null Origin is not allowed")
	}
	if h.inspectorFrontendOrigin != "" {
		if origin != h.inspectorFrontendOrigin {
			return errors.New("inspector request Origin does not match the authorized frontend")
		}
		return nil
	}
	if origin != "" {
		parsed, err := url.Parse(origin)
		expectedOrigin := "http://" + strings.TrimSpace(h.inspectorHost)
		if err != nil || origin != expectedOrigin || parsed.Scheme != "http" || parsed.User != nil ||
			parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Host != strings.TrimSpace(h.inspectorHost) {
			return errors.New("cross-origin inspector requests are not allowed")
		}
		if site := strings.TrimSpace(r.Header.Get("Sec-Fetch-Site")); site != "" && site != "same-origin" {
			return errors.New("cross-site inspector requests are not allowed")
		}
		return nil
	}
	// Same-origin browser GET requests do not consistently include Origin. The
	// dedicated page has a no-referrer policy, so Fetch Metadata is the browser
	// proof in that case. Non-browser clients must opt into the explicit client
	// contract; bearer/session authentication is still required by the route.
	if r.Header.Get("Sec-Fetch-Site") == "same-origin" && r.Header.Get("Sec-Fetch-Mode") == "cors" {
		return nil
	}
	if r.Header.Get("X-OpenDesk-Inspector-Client") == "non-browser" {
		return nil
	}
	return errors.New("inspector request source metadata is required")
}

func (h *Handler) configureInspectorCORS(w http.ResponseWriter, r *http.Request) (bool, error) {
	if h == nil || h.inspectorFrontendOrigin == "" {
		return false, nil
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin != h.inspectorFrontendOrigin {
		return false, errors.New("inspector request Origin does not match the authorized frontend")
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-OpenDesk-Inspector, X-OpenDesk-Inspector-Session")
	w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	w.Header().Add("Vary", "Origin")
	if r.Method != http.MethodOptions {
		return false, nil
	}
	method := strings.TrimSpace(r.Header.Get("Access-Control-Request-Method"))
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete:
	default:
		return false, errors.New("inspector CORS preflight method is not allowed")
	}
	allowedHeaders := map[string]bool{
		"authorization": true, "content-type": true, "x-opendesk-inspector": true,
		"x-opendesk-inspector-session": true,
	}
	for _, name := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
		name = strings.ToLower(strings.TrimSpace(name))
		if name != "" && !allowedHeaders[name] {
			return false, errors.New("inspector CORS preflight header is not allowed")
		}
	}
	return true, nil
}

func setInspectorSecurityHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
}

func decodeInspectorJSON(w http.ResponseWriter, r *http.Request, destination any) error {
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))), "application/json") {
		return errors.New("Content-Type must be application/json")
	}
	r.Body = http.MaxBytesReader(w, r.Body, inspectorBodyLimit)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("invalid inspector request: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return errors.New("invalid inspector request: one JSON object is required")
	}
	return nil
}

func normalizeInspectorLimits(input *inspector.Limits) (inspector.Limits, error) {
	result := inspector.Limits{TimeoutMS: 3000, MaxDepth: 6, MaxNodes: 500}
	if input == nil {
		return result, nil
	}
	result = *input
	if result.TimeoutMS < 100 || result.TimeoutMS > 10000 {
		return result, errors.New("limits.timeout must be between 100 and 10000 milliseconds")
	}
	if result.MaxDepth < 1 || result.MaxDepth > 16 {
		return result, errors.New("limits.maxDepth must be between 1 and 16")
	}
	if result.MaxNodes < 1 || result.MaxNodes > 1000 {
		return result, errors.New("limits.maxNodes must be between 1 and 1000")
	}
	return result, nil
}

func validateInspectorLocator(locator inspector.Locator) error {
	count := 0
	if locator.Role != "" {
		if strings.TrimSpace(locator.Role) != locator.Role || utf8.RuneCountInString(locator.Role) > 128 {
			return errors.New("locator.role is invalid")
		}
		if !inspectorLocatorRoles[locator.Role] {
			return errors.New("locator.role is not a normalized Accessibility role")
		}
		count++
	}
	for name, value := range map[string]*string{"name": locator.Name, "identifier": locator.Identifier} {
		if value == nil {
			continue
		}
		if *value == "" {
			return fmt.Errorf("locator.%s must be non-empty when provided", name)
		}
		if utf8.RuneCountInString(*value) > 1024 {
			return fmt.Errorf("locator.%s exceeds its length limit", name)
		}
		count++
	}
	if count == 0 {
		return errors.New("locator requires role, name, or identifier")
	}
	return nil
}

var inspectorLocatorRoles = map[string]bool{
	"application": true, "window": true, "button": true, "checkbox": true,
	"radioButton": true, "textField": true, "staticText": true, "menuBar": true,
	"menu": true, "menuItem": true, "group": true, "list": true,
	"listItem": true, "table": true, "row": true, "cell": true, "unknown": true,
}

func validValidationStatus(status string) bool {
	switch status {
	case "UNIQUE", "NOT_FOUND", "AMBIGUOUS", "SEARCH_INCOMPLETE", "STALE_TARGET", "TIMEOUT", "PERMISSION_DENIED", "BACKEND_UNAVAILABLE":
		return true
	default:
		return false
	}
}

func validateInspectorReview(input inspectorReviewInput) error {
	if !validShortID(input.ObservationID, "observation") || !validSnapshotNodeID(input.SelectedNodeID) {
		return errors.New("review observationId or selectedNodeId is invalid")
	}
	for name, value := range map[string]string{
		"businessAlias": input.BusinessAlias, "humanNote": input.HumanNote, "intendedUsage": input.IntendedUsage,
	} {
		limit := 4096
		if name == "businessAlias" {
			limit = 256
		} else if name == "intendedUsage" {
			limit = 512
		}
		if utf8.RuneCountInString(value) > limit {
			return fmt.Errorf("review.%s exceeds its length limit", name)
		}
	}
	return validateInspectorLocator(input.Locator)
}

func inspectorRandomToken(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func inspectorRandomID(prefix string) (string, error) {
	token, err := inspectorRandomToken(12)
	if err != nil {
		return "", err
	}
	return prefix + "-" + token, nil
}

func validShortID(value, prefix string) bool {
	if !strings.HasPrefix(value, prefix+"-") || len(value) > 80 {
		return false
	}
	for _, character := range strings.TrimPrefix(value, prefix+"-") {
		if !((character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z') ||
			(character >= '0' && character <= '9') || character == '-' || character == '_') {
			return false
		}
	}
	return true
}

func validSnapshotNodeID(value string) bool {
	if !strings.HasPrefix(value, "node-") || len(value) > 40 {
		return false
	}
	for _, character := range strings.TrimPrefix(value, "node-") {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func safeWindow(windowID string, window inspector.WindowCandidate) map[string]any {
	return map[string]any{
		"windowId": windowID, "title": window.Title, "pid": window.PID,
		"application": window.Application, "bounds": window.Bounds,
		"windowTarget": handoffWindowTarget(window),
	}
}

func safeObservedWindow(windowID string, selected inspector.WindowCandidate, observed map[string]any) map[string]any {
	result := safeWindow(windowID, selected)
	for _, key := range []string{"title", "pid", "x", "y", "width", "height", "exeName"} {
		if value, ok := observed[key]; ok {
			result[key] = value
		}
	}
	return result
}

func handoffWindowTarget(window inspector.WindowCandidate) map[string]any {
	if id, _ := window.Target["id"].(string); strings.TrimSpace(id) != "" && !strings.HasSuffix(id, ":unresolved") {
		return map[string]any{"id": id}
	}
	return map[string]any{"pid": window.PID, "title": window.Title}
}

type inspectorTreeProjection struct {
	Nodes     int
	MaxDepth  int
	Truncated bool
	Reason    string
}

func projectInspectorSnapshotNode(value any, depth int, limits inspector.Limits, state *inspectorTreeProjection) map[string]any {
	node, _ := value.(map[string]any)
	if node == nil || state == nil {
		return nil
	}
	if state.Nodes >= limits.MaxNodes {
		state.Truncated = true
		state.Reason = "controllerMaxNodes"
		return nil
	}
	state.Nodes++
	if depth > state.MaxDepth {
		state.MaxDepth = depth
	}
	result := map[string]any{}
	// This is an independent HTTP projection boundary. Even if the internal
	// runner changes, value, native handles, unknown provider fields, and
	// executable content cannot reach the page.
	for _, key := range []string{
		"role", "nativeRole", "nativeSubrole", "name", "nameSource", "identifier",
		"enabled", "focused", "selected", "checked", "expanded", "actions",
		"nativeBounds", "bounds",
	} {
		if field, ok := node[key]; ok {
			result[key] = jsonRoundTrip(field)
		}
	}
	result["children"] = []any{}
	children, _ := node["children"].([]any)
	if len(children) == 0 {
		return result
	}
	if depth >= limits.MaxDepth {
		state.Truncated = true
		if state.Reason == "" {
			state.Reason = "controllerMaxDepth"
		}
		return result
	}
	projectedChildren := make([]any, 0, len(children))
	for _, child := range children {
		projected := projectInspectorSnapshotNode(child, depth+1, limits, state)
		if projected == nil {
			break
		}
		projectedChildren = append(projectedChildren, projected)
	}
	result["children"] = projectedChildren
	return result
}

func assignSnapshotNodeIDs(root map[string]any) {
	next := 0
	var visit func(map[string]any)
	visit = func(node map[string]any) {
		if node == nil {
			return
		}
		next++
		node["nodeId"] = fmt.Sprintf("node-%d", next)
		children, _ := node["children"].([]any)
		for _, value := range children {
			child, _ := value.(map[string]any)
			visit(child)
		}
	}
	visit(root)
}

func findSnapshotNode(value any, id string) map[string]any {
	node, _ := value.(map[string]any)
	if node == nil {
		return nil
	}
	if nodeID, _ := node["nodeId"].(string); nodeID == id {
		return cloneJSONMap(node)
	}
	children, _ := node["children"].([]any)
	for _, child := range children {
		if found := findSnapshotNode(child, id); found != nil {
			return found
		}
	}
	return nil
}

func snapshotNodeDescription(node map[string]any) string {
	if node == nil {
		return "Reviewed accessibility target"
	}
	role, _ := node["role"].(string)
	name, _ := node["name"].(string)
	if name != "" {
		return role + " " + name
	}
	if role != "" {
		return role
	}
	return "Reviewed accessibility target"
}

func safeSelectedElementFacts(node map[string]any) map[string]any {
	if node == nil {
		return nil
	}
	result := map[string]any{}
	for _, key := range []string{
		"role", "nativeRole", "nativeSubrole", "name", "identifier", "enabled", "focused",
		"selected", "checked", "expanded", "actions", "nativeBounds", "bounds",
	} {
		if value, ok := node[key]; ok {
			result[key] = jsonRoundTrip(value)
		}
	}
	return result
}

func handoffReview(review inspectorReview) map[string]any {
	result := map[string]any{
		"schemaVersion": review.SchemaVersion, "reviewId": review.ReviewID,
		"observationId": review.ObservationID, "businessAlias": review.BusinessAlias,
		"humanNote": review.HumanNote, "intendedUsage": review.IntendedUsage,
		"locator": review.Locator, "evidenceSource": review.EvidenceSource,
		"reviewedAt": review.ReviewedAt,
	}
	if review.ImportSourceHash != "" {
		result["importSourceHash"] = review.ImportSourceHash
	}
	return result
}

func locatorFromJSONMap(value map[string]any) (inspector.Locator, error) {
	if value == nil {
		return inspector.Locator{}, errors.New("imported handoff has no locator selector")
	}
	locator := inspector.Locator{}
	if role, exists := value["role"]; exists {
		text, ok := role.(string)
		if !ok {
			return locator, errors.New("imported locator.role must be a string")
		}
		locator.Role = text
	}
	for name, destination := range map[string]**string{"name": &locator.Name, "identifier": &locator.Identifier} {
		raw, exists := value[name]
		if !exists {
			continue
		}
		text, ok := raw.(string)
		if !ok {
			return locator, fmt.Errorf("imported locator.%s must be a string", name)
		}
		copy := text
		*destination = &copy
	}
	if err := validateInspectorLocator(locator); err != nil {
		return locator, err
	}
	return locator, nil
}

func stringValueFromMap(value map[string]any, key string) string {
	result, _ := value[key].(string)
	return result
}

func cloneSession(source *inspectorSession) *inspectorSession {
	if source == nil {
		return nil
	}
	copy := *source
	copy.Window.Target = cloneJSONMap(source.Window.Target)
	copy.Observation = cloneJSONMap(source.Observation)
	if source.Review != nil {
		review := *source.Review
		copy.Review = &review
	}
	copy.Validations = make([]map[string]any, 0, len(source.Validations))
	for _, receipt := range source.Validations {
		copy.Validations = append(copy.Validations, cloneJSONMap(receipt))
	}
	return &copy
}

func cloneJSONMap(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	encoded, _ := json.Marshal(source)
	var result map[string]any
	_ = json.Unmarshal(encoded, &result)
	return result
}

func jsonRoundTrip(value any) any {
	encoded, _ := json.Marshal(value)
	var result any
	_ = json.Unmarshal(encoded, &result)
	return result
}

func writeInspectorJSON(directory, name string, value any) error {
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create inspector artifact directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".inspector-*.json")
	if err != nil {
		return fmt.Errorf("create inspector artifact: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		temporary.Close()
		return fmt.Errorf("encode inspector artifact: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := inspectorAtomicReplace(temporaryName, filepath.Join(directory, name)); err != nil {
		return fmt.Errorf("publish inspector artifact: %w", err)
	}
	return nil
}
