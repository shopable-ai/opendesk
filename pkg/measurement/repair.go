package measurement

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const RepairSchemaVersion = "measurement-repair/v1"

type FailureClass string

const (
	FailureTargetNotFound        FailureClass = "target-not-found"
	FailureAmbiguousTarget       FailureClass = "ambiguous-target"
	FailureWindowChanged         FailureClass = "window-changed"
	FailureGeometryDrift         FailureClass = "geometry-drift"
	FailureOCRMismatch           FailureClass = "ocr-mismatch"
	FailureAccessibility         FailureClass = "accessibility-unavailable"
	FailureVisualMismatch        FailureClass = "visual-mismatch"
	FailureStateMismatch         FailureClass = "state-mismatch"
	FailurePermission            FailureClass = "permission"
	FailureBusinessVerification  FailureClass = "business-verification-failure"
)

type NeededEvidence string

const (
	NeedTargetRegion       NeededEvidence = "target-region"
	NeedReference          NeededEvidence = "reference"
	NeedPointColor         NeededEvidence = "point-color"
	NeedRegionSpacing      NeededEvidence = "region-spacing"
	NeedSemanticCandidate  NeededEvidence = "semantic-candidate"
)

type AutomationFailure struct {
	Class        FailureClass   `json:"class"`
	Message      string         `json:"message,omitempty"`
	StepID       string         `json:"stepId"`
	EvidenceRefs []string       `json:"evidenceRefs,omitempty"`
	Details      map[string]any `json:"details,omitempty"`
}

type RepairRequest struct {
	SchemaVersion      string           `json:"schemaVersion"`
	TaskID             string           `json:"taskId"`
	Failure            AutomationFailure `json:"failure"`
	ExistingEvidence   []string         `json:"existingEvidence,omitempty"`
	NeededEvidence     []NeededEvidence `json:"neededEvidence"`
	AllowedInteraction string           `json:"allowedInteraction"`
	CreatedAt          time.Time        `json:"createdAt"`
}

type ProposedChange struct {
	Kind       string         `json:"kind"`
	Target     string         `json:"target,omitempty"`
	Locator    map[string]any `json:"locator,omitempty"`
	Constraint map[string]any `json:"constraint,omitempty"`
	Reason     string         `json:"reason"`
}

type RepairCandidateStatus string

const (
	RepairProposed  RepairCandidateStatus = "proposed"
	RepairExecuting RepairCandidateStatus = "executing"
	RepairRejected  RepairCandidateStatus = "rejected"
	RepairQualified RepairCandidateStatus = "qualified"
)

type RepairAttemptOutcome struct {
	Pass     bool           `json:"pass"`
	Message  string         `json:"message,omitempty"`
	Evidence map[string]any `json:"evidence,omitempty"`
}

type RepairCandidate struct {
	SchemaVersion  string                `json:"schemaVersion"`
	TaskID         string                `json:"taskId"`
	FailedStep     string                `json:"failedStep"`
	OldEvidence    []string              `json:"oldEvidence,omitempty"`
	NewEvidence    []string              `json:"newEvidence"`
	ProposedChange ProposedChange        `json:"proposedChange"`
	Status         RepairCandidateStatus `json:"status"`
	Execution      *RepairAttemptOutcome `json:"execution,omitempty"`
	Verification   *RepairAttemptOutcome `json:"verification,omitempty"`
	CreatedAt      time.Time             `json:"createdAt"`
	QualifiedAt    *time.Time            `json:"qualifiedAt,omitempty"`
}

type RepairHistoryEntry struct {
	SchemaVersion string            `json:"schemaVersion"`
	RecordedAt    time.Time         `json:"recordedAt"`
	Failure       AutomationFailure `json:"failure"`
	Request       RepairRequest     `json:"request"`
	Candidate     RepairCandidate   `json:"candidate"`
}

type RepairExecutor interface {
	RetryFailedStep(context.Context, RepairCandidate) (RepairAttemptOutcome, error)
}

type RepairVerifier interface {
	VerifyBusinessResult(context.Context, RepairCandidate) (RepairAttemptOutcome, error)
}

// MeasurementEligibleFailure is deliberately conservative. A generic
// target-not-found, OCR failure or unavailable Accessibility backend does not,
// by itself, prove a geometry/layout problem. Those failures stay on their
// native diagnostic paths unless further evidence reclassifies the failure as
// ambiguity, reference/window drift, geometry drift or visual mismatch.
func MeasurementEligibleFailure(class FailureClass) bool {
	switch class {
	case FailureAmbiguousTarget, FailureWindowChanged, FailureGeometryDrift, FailureVisualMismatch:
		return true
	default:
		return false
	}
}

func DefaultNeededEvidence(class FailureClass) []NeededEvidence {
	switch class {
	case FailureAmbiguousTarget:
		return []NeededEvidence{NeedSemanticCandidate, NeedTargetRegion}
	case FailureWindowChanged:
		return []NeededEvidence{NeedReference, NeedTargetRegion}
	case FailureGeometryDrift:
		return []NeededEvidence{NeedTargetRegion, NeedRegionSpacing}
	case FailureVisualMismatch:
		return []NeededEvidence{NeedPointColor, NeedTargetRegion}
	default:
		return nil
	}
}

func NewRepairRequest(taskID string, failure AutomationFailure, existing []string, now time.Time) (RepairRequest, error) {
	if err := validateEvidenceTaskID(taskID); err != nil {
		return RepairRequest{}, err
	}
	if strings.TrimSpace(failure.StepID) == "" {
		return RepairRequest{}, errors.New("repair failure step id is required")
	}
	if !MeasurementEligibleFailure(failure.Class) {
		return RepairRequest{}, fmt.Errorf("failure class %q is not measurement-assisted", failure.Class)
	}
	if now.IsZero() {
		now = time.Now()
	}
	return RepairRequest{
		SchemaVersion:      RepairSchemaVersion,
		TaskID:             taskID,
		Failure:            failure,
		ExistingEvidence:   appendUniqueStrings(existing, failure.EvidenceRefs...),
		NeededEvidence:     DefaultNeededEvidence(failure.Class),
		AllowedInteraction: "measure-only",
		CreatedAt:          now.UTC(),
	}, nil
}

func NewRepairCandidate(request RepairRequest, evidenceRefs []string, change ProposedChange, now time.Time) (RepairCandidate, error) {
	if request.SchemaVersion != RepairSchemaVersion {
		return RepairCandidate{}, errors.New("unsupported repair request schema")
	}
	if len(evidenceRefs) == 0 {
		return RepairCandidate{}, errors.New("repair candidate requires new measurement evidence")
	}
	if strings.TrimSpace(change.Kind) == "" || strings.TrimSpace(change.Reason) == "" {
		return RepairCandidate{}, errors.New("repair candidate requires a structured proposed change and reason")
	}
	if now.IsZero() {
		now = time.Now()
	}
	candidate := RepairCandidate{
		SchemaVersion:  RepairSchemaVersion,
		TaskID:         request.TaskID,
		FailedStep:     request.Failure.StepID,
		OldEvidence:    append([]string(nil), request.ExistingEvidence...),
		NewEvidence:    appendUniqueStrings(nil, evidenceRefs...),
		ProposedChange: change,
		Status:         RepairProposed,
		CreatedAt:      now.UTC(),
	}
	return candidate, nil
}

// ExecuteRepair coordinates the retry and verification gates through adapters
// to OpenDesk's existing execution/recipe path. It never executes a second
// runtime and never edits the golden Recipe.
func ExecuteRepair(ctx context.Context, candidate RepairCandidate, executor RepairExecutor, verifier RepairVerifier, now time.Time) (RepairCandidate, error) {
	if executor == nil || verifier == nil {
		return candidate, errors.New("repair execution requires existing execution and business verification adapters")
	}
	if candidate.Status != RepairProposed {
		return candidate, fmt.Errorf("repair candidate must be proposed, got %q", candidate.Status)
	}
	candidate.Status = RepairExecuting
	execution, err := executor.RetryFailedStep(ctx, candidate)
	if err != nil {
		candidate.Status = RepairRejected
		candidate.Execution = &RepairAttemptOutcome{Pass: false, Message: err.Error()}
		return candidate, nil
	}
	candidate.Execution = &execution
	if !execution.Pass {
		candidate.Status = RepairRejected
		return candidate, nil
	}
	verification, err := verifier.VerifyBusinessResult(ctx, candidate)
	if err != nil {
		candidate.Status = RepairRejected
		candidate.Verification = &RepairAttemptOutcome{Pass: false, Message: err.Error()}
		return candidate, nil
	}
	candidate.Verification = &verification
	if !verification.Pass {
		candidate.Status = RepairRejected
		return candidate, nil
	}
	if now.IsZero() {
		now = time.Now()
	}
	qualified := now.UTC()
	candidate.Status = RepairQualified
	candidate.QualifiedAt = &qualified
	return candidate, nil
}

func RepairHistoryPath(repoRoot, taskID string) (string, error) {
	paths, err := EvidencePathsForTask(repoRoot, taskID)
	if err != nil {
		return "", err
	}
	return filepath.Join(paths.Directory, "repair-history.jsonl"), nil
}

func AppendRepairHistory(repoRoot string, failure AutomationFailure, request RepairRequest, candidate RepairCandidate, now time.Time) (string, error) {
	if candidate.TaskID != request.TaskID || request.Failure.StepID != failure.StepID || candidate.FailedStep != failure.StepID {
		return "", errors.New("repair history contains inconsistent task or failed step identity")
	}
	if now.IsZero() {
		now = time.Now()
	}
	path, err := RepairHistoryPath(repoRoot, request.TaskID)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create repair history directory: %w", err)
	}
	entry := RepairHistoryEntry{SchemaVersion: RepairSchemaVersion, RecordedAt: now.UTC(), Failure: failure, Request: request, Candidate: candidate}
	data, err := json.Marshal(entry)
	if err != nil {
		return "", err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	defer file.Close()
	if _, err := file.Write(append(data, '\n')); err != nil {
		return "", err
	}
	return path, nil
}

func LoadRepairHistory(repoRoot, taskID string) ([]RepairHistoryEntry, error) {
	path, err := RepairHistoryPath(repoRoot, taskID)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	entries := make([]RepairHistoryEntry, 0)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var entry RepairHistoryEntry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			return nil, fmt.Errorf("decode repair history: %w", err)
		}
		if entry.SchemaVersion != RepairSchemaVersion || entry.Request.TaskID != taskID || entry.Candidate.TaskID != taskID {
			return nil, errors.New("repair history identity or schema mismatch")
		}
		entries = append(entries, entry)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return entries, nil
}

func appendUniqueStrings(base []string, values ...string) []string {
	result := append([]string(nil), base...)
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		found := false
		for _, existing := range result {
			if existing == value {
				found = true
				break
			}
		}
		if !found {
			result = append(result, value)
		}
	}
	return result
}
