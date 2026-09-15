package measurement

import "os"

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
