package flowinstall

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"opendesk/internal/processlock"
)

type MarketplaceProvenance struct {
	MarketplaceID string `json:"marketplaceId"`
	ReleaseID     string `json:"releaseId"`
	UpdateChannel string `json:"updateChannel,omitempty"`
}

func (provenance MarketplaceProvenance) validate() error {
	if !catalogSourcePattern.MatchString(provenance.MarketplaceID) || !catalogSourcePattern.MatchString(provenance.ReleaseID) {
		return fmt.Errorf("Marketplace provenance identity is invalid")
	}
	if provenance.UpdateChannel != "" && !catalogSourcePattern.MatchString(provenance.UpdateChannel) {
		return fmt.Errorf("Marketplace provenance update channel is invalid")
	}
	return nil
}

// MarkMarketplaceInstall records the canonical Marketplace Release that led to
// an already successful FlowInstallService installation. It uses the same
// per-Flow process lock as Install so provenance cannot race a concurrent
// update. The executable package and trust state are never derived from this
// metadata; it is update/discovery provenance only.
func (service *Service) MarkMarketplaceInstall(ctx context.Context, result InstallResult, provenance MarketplaceProvenance) (InstallResult, error) {
	if service == nil {
		return InstallResult{}, newError(CodeTransactionFailed, "Flow install service is unavailable", nil)
	}
	if err := provenance.validate(); err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "Marketplace provenance is invalid", err)
	}
	installID := result.Record.InstallID
	if !installIDPattern.MatchString(installID) {
		return InstallResult{}, newError(CodeTransactionFailed, "Marketplace installId is invalid", nil)
	}
	lease, err := processlock.Acquire(ctx, filepath.Join(service.Roots.locksRoot(), installID+".lock"), 25*time.Millisecond)
	if err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot acquire Flow install lock for Marketplace provenance", err)
	}
	defer lease.Close()
	if err := service.recoverLocked(installID); err != nil {
		return InstallResult{}, err
	}
	current, err := service.Catalog.Load(installID)
	if err != nil {
		return InstallResult{}, err
	}
	if current.FlowID != result.Record.FlowID || current.Version != result.Record.Version || current.ArchiveDigest != result.Record.ArchiveDigest || current.PublisherFingerprint != result.Record.PublisherFingerprint {
		return InstallResult{}, newError(CodeVersionConflict, "installed Flow changed before Marketplace provenance could be recorded", nil)
	}
	current.Origin = "marketplace"
	current.MarketplaceID = provenance.MarketplaceID
	current.ReleaseID = provenance.ReleaseID
	current.UpdateChannel = provenance.UpdateChannel
	if err := service.Catalog.write(current); err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot record Marketplace Flow provenance", err)
	}
	_ = syncDirectory(service.Roots.recordsRoot())
	result.Record = current
	return result, nil
}
