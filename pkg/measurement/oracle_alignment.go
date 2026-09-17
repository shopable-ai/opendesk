package measurement

import (
	"context"
	"encoding/json"
	"os"
)

// snapshotCandidateDriverForOracle returns the existing candidate wrapper owned
// by the one Measurement Service. It deliberately does not create another
// resolver, session, or surface.
func (s *Service) snapshotCandidateDriverForOracle() *snapshotCandidateDriver {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	driver, _ := s.driver.(*snapshotCandidateDriver)
	return driver
}

// resetSnapshotCandidatesForOracle invalidates snapshot-bound candidate state
// after a product action that makes the current preview stale. DM-MAGNET-004,
// DM-MAGNET-006, and DM-TOOL-001 require the visible candidate/stack to be
// cleared rather than merely ignored while an old preview remains resident.
func (s *Service) resetSnapshotCandidatesForOracle(a *activeSession, magnet, suspended, resolveCurrentPointer bool) {
	driver := s.snapshotCandidateDriverForOracle()
	if driver == nil {
		return
	}

	driver.state.mu.Lock()
	driver.state.epoch++
	driver.state.request++
	if driver.state.cancel != nil {
		driver.state.cancel()
		driver.state.cancel = nil
	}
	preview := driver.state.preview
	driver.state.token = SnapshotToken{}
	driver.state.candidates = nil
	driver.state.failures = nil
	driver.state.index = 0
	driver.state.preview = ""
	driver.state.magnet = magnet
	driver.state.suspended = magnet && suspended
	driver.state.mu.Unlock()

	if preview != "" {
		_ = os.Remove(preview)
	}
	if resolveCurrentPointer && magnet && !suspended && a != nil && a.pointer != nil {
		point := *a.pointer
		go driver.resolveAsync(a, point)
	}
}

func (a *activeSession) copyEvidence(ctx context.Context) error {
	if err := a.service.clipboard.Copy(a.inspectorEvidence()); err != nil {
		return a.updateStatus(ctx, "复制失败："+err.Error())
	}
	a.copyMenuOpen = false
	a.status = "已复制当前 Measurement Evidence。"
	return a.renderSurface(ctx)
}

func (a *activeSession) inspectorEvidence() string {
	result := any(a.result)
	if a.result != nil {
		if outputs, err := a.outputsWithProductEvidence(); err == nil {
			var structured any
			if json.Unmarshal([]byte(outputs.JSON), &structured) == nil {
				result = structured
			}
		}
	}
	view := map[string]any{
		"schemaVersion":   "desktop-measurement-session/v1",
		"phase":           a.phaseValue(),
		"snapshot":        a.snapshotToken(),
		"captureMapping":  a.frame.Snapshot.Mapping,
		"windowReference": a.frame.Reference,
		"localReference":  nil,
		"pointer":         nil,
		"candidateStack":  a.service.SnapshotCandidates(),
		"result":          result,
		"runtimeEvidence": map[string]bool{"absoluteGeometryIsRuntimeEvidenceOnly": true, "sourcePixelsAreFrozenSnapshotOnly": true},
	}
	if hasLocalReference(a) {
		view["localReference"] = a.reference
	}
	if a.pointer != nil {
		point, err := BuildPointResult(a.frame.Snapshot, a.frame.Reference, *a.pointer, a.image)
		if err == nil {
			view["pointer"] = point.Point
		}
	}
	encoded, err := json.MarshalIndent(view, "", "  ")
	if err != nil {
		return "Measurement Evidence unavailable: " + err.Error()
	}
	return string(encoded)
}
