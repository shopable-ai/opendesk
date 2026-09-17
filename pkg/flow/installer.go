package flow

import (
	"errors"
	"os"
	"path/filepath"
	"time"
)

type Installer struct {
	Store *Store
}

func NewInstaller(root string) (*Installer, error) {
	store, err := NewStore(root)
	if err != nil {
		return nil, err
	}
	return &Installer{Store: store}, nil
}

func (installer *Installer) Recover() error {
	if installer == nil || installer.Store == nil {
		return newError(CodeInvalidInstallRoot, "flow installer is not configured", nil)
	}
	return installer.Store.recoverTransactions()
}

func (installer *Installer) List() ([]CatalogEntry, error) {
	if err := installer.Recover(); err != nil {
		return nil, err
	}
	entries, err := installer.Store.List()
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		info, err := os.Lstat(installer.Store.contentRoot(entry.InstallID))
		if err != nil || info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return nil, newError(CodeCatalogCorrupt, "flow catalog references missing or unsafe content", err)
		}
	}
	return entries, nil
}

func (installer *Installer) InstallFile(packagePath string, options InstallOptions) (*InstallResult, error) {
	if err := installer.Recover(); err != nil {
		return nil, err
	}
	pkg, err := ReadFile(packagePath)
	if err != nil {
		return nil, err
	}
	_, fingerprint, err := candidatePublisher(pkg)
	if err != nil {
		return nil, err
	}
	decision, err := installer.Store.evaluateTrust(pkg.Manifest, fingerprint)
	if err != nil {
		return nil, err
	}
	if decision.Status == TrustStatusRejected {
		return nil, newError(CodePublisherRejected, "publisher is explicitly rejected for this flow", nil)
	}

	now := nowUTC(options.Now)
	var trustRecord *TrustRecord
	trustScope := decision.Scope
	if decision.Status != TrustStatusTrusted {
		switch options.Approval {
		case TrustApprovalFlow:
			record := makeTrustRecord(pkg.Manifest, fingerprint, TrustScopeFlow, TrustStatusTrusted, now)
			trustRecord = &record
			trustScope = TrustScopeFlow
		case TrustApprovalPublisher:
			record := makeTrustRecord(pkg.Manifest, fingerprint, TrustScopePublisher, TrustStatusTrusted, now)
			trustRecord = &record
			trustScope = TrustScopePublisher
		case TrustApprovalNone:
			return nil, newError(CodePublisherTrustRequired, "publisher signature is valid but publisher trust approval is required", nil)
		default:
			return nil, newError(CodePublisherTrustRequired, "unknown publisher trust approval scope", nil)
		}
	}

	desiredState := InstallStateReady
	productID := ""
	if pkg.Manifest.Commercial != nil {
		desiredState = InstallStateNeedsActivation
		productID = pkg.Manifest.Commercial.ProductID
	}

	existing, err := installer.Store.findIdentity(fingerprint, pkg.Manifest.FlowID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if existing.Version == pkg.Manifest.Version {
			if existing.PackageDigest != pkg.PackageDigest {
				return nil, newError(CodeInstallConflict, "same flow version is already installed with a different package digest", nil)
			}
			if trustRecord == nil {
				return &InstallResult{Entry: *existing, Idempotent: true, SignatureStatus: "verified_candidate_key", TrustStatus: "trusted"}, nil
			}
		}
		if existing.Pending != nil && existing.Pending.Version == pkg.Manifest.Version {
			if existing.Pending.PackageDigest != pkg.PackageDigest {
				return nil, newError(CodeInstallConflict, "same pending flow version has a different package digest", nil)
			}
			if trustRecord == nil {
				return &InstallResult{Entry: *existing, Idempotent: true, PendingUpdate: true, SignatureStatus: "verified_candidate_key", TrustStatus: "trusted"}, nil
			}
		}
	}

	installID := ""
	installedAt := now
	if existing != nil {
		installID = existing.InstallID
		installedAt = existing.InstalledAt
	} else {
		installID, err = randomLocalToken()
		if err != nil {
			return nil, newError(CodeTransactionFailed, "cannot generate flow install id", err)
		}
	}
	entry := CatalogEntry{
		SchemaVersion:        localStateSchemaVersion,
		InstallID:            installID,
		FlowID:               pkg.Manifest.FlowID,
		Name:                 pkg.Manifest.Name,
		Version:              pkg.Manifest.Version,
		PublisherID:          pkg.Manifest.PublisherID,
		PublisherKeyID:       pkg.Manifest.PublisherKeyID,
		PublisherFingerprint: fingerprint,
		PackageDigest:        pkg.PackageDigest,
		Entry:                pkg.Manifest.Entry,
		State:                desiredState,
		TrustScope:           trustScope,
		ProductID:            productID,
		InstalledAt:          installedAt,
		UpdatedAt:            now,
	}
	if existing != nil && existing.State == InstallStateReady && desiredState != InstallStateReady {
		return installer.installPending(pkg, *existing, entry, trustRecord, now)
	}
	return installer.installActive(pkg, entry, trustRecord, now)
}

func (installer *Installer) installActive(pkg *Package, entry CatalogEntry, trustRecord *TrustRecord, now time.Time) (*InstallResult, error) {
	tx, err := installer.Store.newTransaction(transactionInstall, entry.InstallID, pkg.PackageDigest, trustRecord, false, now)
	if err != nil {
		return nil, err
	}
	if _, err := tx.stagePackage(pkg, "content.next"); err != nil {
		_ = os.RemoveAll(tx.root)
		return nil, err
	}
	if err := tx.stageCatalog(entry); err != nil {
		_ = os.RemoveAll(tx.root)
		return nil, err
	}
	if trustRecord != nil {
		if err := tx.stageTrust(*trustRecord); err != nil {
			_ = os.RemoveAll(tx.root)
			return nil, err
		}
	}
	if err := tx.mark("prepared"); err != nil {
		return nil, tx.fail(err)
	}
	if trustRecord != nil && tx.journal.TrustCreated {
		if err := tx.activateTrust(*trustRecord); err != nil {
			return nil, tx.fail(err)
		}
	}

	live := installer.Store.contentRoot(entry.InstallID)
	if moved, err := moveExisting(live, filepath.Join(tx.root, "content.prev")); err != nil {
		return nil, tx.fail(newError(CodeTransactionFailed, "cannot preserve previous flow content", err))
	} else if moved {
		if err := tx.mark("old-content-moved"); err != nil {
			return nil, tx.fail(err)
		}
	}
	if err := renameAbsent(filepath.Join(tx.root, "content.next"), live); err != nil {
		return nil, tx.fail(newError(CodeTransactionFailed, "cannot activate flow content", err))
	}
	if err := tx.mark("content-active"); err != nil {
		return nil, tx.fail(err)
	}
	if err := tx.activateCatalog(); err != nil {
		return nil, tx.fail(err)
	}
	if err := tx.commit(); err != nil {
		return nil, tx.fail(err)
	}
	if err := ensureRealDirectory(installer.Store.Root, installer.Store.flowDataRoot(entry.InstallID)); err != nil {
		return nil, newError(CodeTransactionFailed, "flow installed but user data directory could not be created", err)
	}
	return &InstallResult{Entry: entry, SignatureStatus: "verified_candidate_key", TrustStatus: "trusted"}, nil
}

func (installer *Installer) installPending(pkg *Package, existing CatalogEntry, candidate CatalogEntry, trustRecord *TrustRecord, now time.Time) (*InstallResult, error) {
	if trustRecord != nil {
		return nil, newError(CodeTransactionFailed, "trusted installed flow unexpectedly requires a new trust record", nil)
	}
	updated := existing
	updated.Pending = &PendingUpdate{Version: candidate.Version, PackageDigest: candidate.PackageDigest, State: candidate.State, StagedAt: now}
	updated.UpdatedAt = now
	tx, err := installer.Store.newTransaction(transactionPending, existing.InstallID, pkg.PackageDigest, nil, false, now)
	if err != nil {
		return nil, err
	}
	if _, err := tx.stagePackage(pkg, "pending.next"); err != nil {
		_ = os.RemoveAll(tx.root)
		return nil, err
	}
	if err := tx.stageCatalog(updated); err != nil {
		_ = os.RemoveAll(tx.root)
		return nil, err
	}
	if err := tx.mark("prepared"); err != nil {
		return nil, tx.fail(err)
	}
	pending := installer.Store.pendingInstallRoot(existing.InstallID, pkg.PackageDigest)
	if err := ensureRealDirectory(installer.Store.Root, filepath.Dir(pending)); err != nil {
		return nil, tx.fail(newError(CodeTransactionFailed, "cannot create pending flow update parent", err))
	}
	if err := renameAbsent(filepath.Join(tx.root, "pending.next"), pending); err != nil {
		return nil, tx.fail(newError(CodeTransactionFailed, "cannot activate pending flow update", err))
	}
	if err := tx.mark("pending-active"); err != nil {
		return nil, tx.fail(err)
	}
	if err := tx.activateCatalog(); err != nil {
		return nil, tx.fail(err)
	}
	if err := tx.commit(); err != nil {
		return nil, tx.fail(err)
	}
	return &InstallResult{Entry: updated, PendingUpdate: true, SignatureStatus: "verified_candidate_key", TrustStatus: "trusted"}, nil
}

func (installer *Installer) Uninstall(installID string, options UninstallOptions) error {
	if err := installer.Recover(); err != nil {
		return err
	}
	entry, err := installer.Store.FindInstall(installID)
	if err != nil {
		return err
	}
	now := nowUTC(nil)
	tx, err := installer.Store.newTransaction(transactionUninstall, installID, entry.PackageDigest, nil, options.PurgeData, now)
	if err != nil {
		return err
	}
	if err := tx.mark("prepared"); err != nil {
		return tx.fail(err)
	}
	if moved, err := moveExisting(installer.Store.contentRoot(installID), filepath.Join(tx.root, "content.prev")); err != nil {
		return tx.fail(newError(CodeTransactionFailed, "cannot stage installed flow for uninstall", err))
	} else if moved {
		if err := tx.mark("old-content-moved"); err != nil {
			return tx.fail(err)
		}
	}
	if moved, err := moveExisting(installer.Store.catalogPath(installID), filepath.Join(tx.root, "catalog.prev.json")); err != nil {
		return tx.fail(newError(CodeTransactionFailed, "cannot stage flow catalog for uninstall", err))
	} else if !moved {
		return tx.fail(newError(CodeCatalogCorrupt, "installed flow catalog entry disappeared during uninstall", nil))
	}
	if err := tx.mark("catalog-removed"); err != nil {
		return tx.fail(err)
	}
	pendingRoot := filepath.Join(installer.Store.pendingRoot(), installID)
	if moved, err := moveExisting(pendingRoot, filepath.Join(tx.root, "pending.prev")); err != nil {
		return tx.fail(newError(CodeTransactionFailed, "cannot stage pending flow updates for uninstall", err))
	} else if moved {
		if err := tx.mark("pending-moved"); err != nil {
			return tx.fail(err)
		}
	}
	if options.PurgeData {
		if moved, err := moveExisting(installer.Store.flowDataRoot(installID), filepath.Join(tx.root, "data.prev")); err != nil {
			return tx.fail(newError(CodeTransactionFailed, "cannot stage flow user data for purge", err))
		} else if moved {
			if err := tx.mark("data-moved"); err != nil {
				return tx.fail(err)
			}
		}
	}
	return tx.commit()
}

// DecidePublisher records an explicit customer-side trust decision after
// verifying the package with its embedded candidate publisher key. It never
// installs content, grants commercial authorization, or executes JavaScript.
func (installer *Installer) DecidePublisher(packagePath string, scope TrustScope, status TrustStatus, now func() time.Time) (*TrustRecord, error) {
	if err := installer.Recover(); err != nil {
		return nil, err
	}
	if scope != TrustScopeFlow && scope != TrustScopePublisher {
		return nil, newError(CodePublisherTrustRequired, "publisher trust scope must be flow or publisher", nil)
	}
	if status != TrustStatusTrusted && status != TrustStatusRejected {
		return nil, newError(CodePublisherTrustRequired, "publisher trust status must be trusted or rejected", nil)
	}
	pkg, err := ReadFile(packagePath)
	if err != nil {
		return nil, err
	}
	_, fingerprint, err := candidatePublisher(pkg)
	if err != nil {
		return nil, err
	}
	record := makeTrustRecord(pkg.Manifest, fingerprint, scope, status, nowUTC(now))
	path := installer.Store.trustPath(record)
	if data, err := readBoundedRegularFile(path, MaxManifestSize); err == nil {
		var existing TrustRecord
		if decodeErr := decodeLocalJSON(data, &existing); decodeErr != nil || validateTrustRecord(existing) != nil {
			return nil, newError(CodeTrustStoreCorrupt, "existing publisher trust record is invalid", decodeErr)
		}
		if existing.Status != record.Status {
			return nil, newError(CodeInstallConflict, "publisher trust decision conflicts with an existing decision", nil)
		}
		return &existing, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, newError(CodeTrustStoreCorrupt, "cannot inspect publisher trust record", err)
	}
	encoded, err := encodeLocalJSON(record)
	if err != nil {
		return nil, newError(CodeTransactionFailed, "cannot encode publisher trust decision", err)
	}
	if err := writeExclusiveRegularFile(installer.Store.trustRoot(), path, encoded, 0o600); err != nil {
		return nil, newError(CodeTransactionFailed, "cannot persist publisher trust decision", err)
	}
	return &record, nil
}
