package flowinstall

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"opendesk/internal/processlock"
)

type MarketplaceProvenance struct {
	MarketplaceID     string `json:"marketplaceId"`
	ReleaseID         string `json:"releaseId"`
	UpdateChannel     string `json:"updateChannel,omitempty"`
	MetadataRevision int    `json:"metadataRevision,omitempty"`
}

func (provenance MarketplaceProvenance) validate() error {
	if !catalogSourcePattern.MatchString(provenance.MarketplaceID) || !catalogSourcePattern.MatchString(provenance.ReleaseID) {
		return fmt.Errorf("Marketplace provenance identity is invalid")
	}
	if provenance.UpdateChannel != "" && !catalogSourcePattern.MatchString(provenance.UpdateChannel) {
		return fmt.Errorf("Marketplace provenance update channel is invalid")
	}
	if provenance.MetadataRevision < 0 || provenance.MetadataRevision > 1_000_000_000 {
		return fmt.Errorf("Marketplace provenance metadata revision is invalid")
	}
	return nil
}

// applyMarketplaceProvenance only annotates catalog/update provenance. It is
// deliberately not a trust or authorization primitive: Publisher Trust still
// comes from the verified .odflow identity plus an explicit local decision.
func applyMarketplaceProvenance(record Record, provenance *MarketplaceProvenance) (Record, bool, error) {
	if provenance == nil {
		return record, false, nil
	}
	if err := provenance.validate(); err != nil {
		return Record{}, false, err
	}
	if record.Origin == "marketplace" &&
		record.MarketplaceID == provenance.MarketplaceID &&
		record.ReleaseID == provenance.ReleaseID &&
		provenance.MetadataRevision < record.MarketplaceMetadataRevision {
		return Record{}, false, fmt.Errorf("Marketplace metadata revision rollback is not allowed")
	}
	updated := record
	updated.Origin = "marketplace"
	updated.MarketplaceID = provenance.MarketplaceID
	updated.ReleaseID = provenance.ReleaseID
	updated.UpdateChannel = provenance.UpdateChannel
	updated.MarketplaceMetadataRevision = provenance.MetadataRevision
	return updated, updated != record, nil
}

// MarkMarketplaceInstall is retained for compatibility with callers that need
// to annotate an already-existing identical installation. New Marketplace
// installs pass provenance through InstallOptions so fresh installs and updates
// commit package content, trust state, and catalog provenance in one install
// transaction.
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
	current, changed, err := applyMarketplaceProvenance(current, &provenance)
	if err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "Marketplace provenance is invalid", err)
	}
	if changed {
		if err := service.Catalog.write(current); err != nil {
			return InstallResult{}, newError(CodeTransactionFailed, "cannot record Marketplace Flow provenance", err)
		}
		_ = syncDirectory(service.Roots.recordsRoot())
	}
	result.Record = current
	return result, nil
}
