package recorder

import (
	"errors"
	"fmt"
	"path"
	"strings"

	"opendesk/pkg/measurement"
)

func AttachMeasurementEvidence(candidate LocatorCandidate, evidencePath string, ev measurement.MeasurementEvidence) (LocatorCandidate, error) {
	if err := measurement.ValidateEvidence(ev); err != nil {
		return LocatorCandidate{}, fmt.Errorf("invalid measurement evidence: %w", err)
	}
	ref, err := normalizeMeasurementEvidenceRef(evidencePath)
	if err != nil {
		return LocatorCandidate{}, err
	}
	candidate.EvidenceRefs = appendUnique(candidate.EvidenceRefs, ref)
	if candidate.WindowRelative == nil {
		candidate.WindowRelative = map[string]any{}
	}
	candidate.WindowRelative["measurementEvidenceVersion"] = ev.Version
	candidate.WindowRelative["measurementKind"] = ev.Result.Kind
	candidate.WindowRelative["referenceType"] = string(ev.Reference.Type)
	candidate.WindowRelative["reference"] = map[string]any{
		"x":      ev.Reference.Bounds.X,
		"y":      ev.Reference.Bounds.Y,
		"width":  ev.Reference.Bounds.Width,
		"height": ev.Reference.Bounds.Height,
	}
	candidate.WindowRelative["displayId"] = ev.Mapping.DisplayID
	candidate.WindowRelative["displayIndex"] = ev.Mapping.DisplayIndex
	if ev.Reference.Window != nil {
		if candidate.ExpectedWindow == "" {
			candidate.ExpectedWindow = ev.Reference.Window.Title
		}
		if candidate.ExpectedProcess == 0 {
			candidate.ExpectedProcess = ev.Reference.Window.PID
		}
	}
	if candidate.Confidence == 0 && ev.Confidence.Overall > 0 {
		candidate.Confidence = ev.Confidence.Overall
	}
	return candidate, nil
}

func normalizeMeasurementEvidenceRef(value string) (string, error) {
	// Artifact references are repository paths, not host filesystem paths. Use a
	// platform-neutral slash contract so the same reference is accepted or
	// rejected identically on macOS, Linux, and Windows.
	ref := strings.ReplaceAll(strings.TrimSpace(value), "\\", "/")
	if ref == "" || strings.HasPrefix(ref, "/") || hasWindowsDrivePrefix(ref) {
		return "", errors.New("measurement evidence ref must be a repository-relative path")
	}
	for _, segment := range strings.Split(ref, "/") {
		if segment == ".." {
			return "", errors.New("measurement evidence ref must be a repository-relative path")
		}
	}
	cleaned := path.Clean(ref)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") || strings.HasPrefix(cleaned, "/") {
		return "", errors.New("measurement evidence ref must be a repository-relative path")
	}
	return cleaned, nil
}

func hasWindowsDrivePrefix(ref string) bool {
	if len(ref) < 2 || ref[1] != ':' {
		return false
	}
	c := ref[0]
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
}

func AttachMeasurementEvidenceToTarget(target *TargetSnapshot, candidateIndex int, evidencePath string, ev measurement.MeasurementEvidence) error {
	if target == nil {
		return errors.New("recorder target is required")
	}
	if candidateIndex < 0 || candidateIndex >= len(target.Candidates) {
		return errors.New("recorder measurement candidate index is out of range")
	}
	updated, err := AttachMeasurementEvidence(target.Candidates[candidateIndex], evidencePath, ev)
	if err != nil {
		return err
	}
	target.Candidates[candidateIndex] = updated
	return nil
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}
