package flow

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type transactionKind string

const (
	transactionInstall   transactionKind = "install"
	transactionPending   transactionKind = "pending-update"
	transactionUninstall transactionKind = "uninstall"
)

type transactionJournal struct {
	SchemaVersion int             `json:"schemaVersion"`
	ID            string          `json:"id"`
	Kind          transactionKind `json:"kind"`
	InstallID     string          `json:"installId"`
	PackageDigest string          `json:"packageDigest"`
	TrustToken    string          `json:"trustToken,omitempty"`
	TrustCreated  bool            `json:"trustCreated,omitempty"`
	PurgeData     bool            `json:"purgeData,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
}

type transaction struct {
	store   *Store
	journal transactionJournal
	root    string
}

func (store *Store) newTransaction(kind transactionKind, installID, digest string, trust *TrustRecord, purgeData bool, createdAt time.Time) (*transaction, error) {
	for attempts := 0; attempts < 4; attempts++ {
		id, err := randomLocalToken()
		if err != nil {
			return nil, newError(CodeTransactionFailed, "cannot generate flow transaction id", err)
		}
		root := filepath.Join(store.transactionsRoot(), id)
		if err := os.Mkdir(root, 0o700); errors.Is(err, os.ErrExist) {
			continue
		} else if err != nil {
			return nil, newError(CodeTransactionFailed, "cannot create flow transaction directory", err)
		}
		journal := transactionJournal{SchemaVersion: localStateSchemaVersion, ID: id, Kind: kind, InstallID: installID, PackageDigest: digest, PurgeData: purgeData, CreatedAt: createdAt.UTC()}
		if trust != nil {
			journal.TrustToken = trustRecordToken(*trust)
			journal.TrustCreated = true
		}
		encoded, err := encodeLocalJSON(journal)
		if err != nil {
			_ = os.RemoveAll(root)
			return nil, newError(CodeTransactionFailed, "cannot encode flow transaction journal", err)
		}
		if err := writeExclusiveRegularFile(root, filepath.Join(root, "journal.json"), encoded, 0o600); err != nil {
			_ = os.RemoveAll(root)
			return nil, newError(CodeTransactionFailed, "cannot write flow transaction journal", err)
		}
		return &transaction{store: store, journal: journal, root: root}, nil
	}
	return nil, newError(CodeTransactionFailed, "cannot allocate flow transaction directory", nil)
}

func (tx *transaction) mark(name string) error {
	if tx == nil || !validPhaseName(name) {
		return newError(CodeTransactionFailed, "invalid flow transaction phase", nil)
	}
	path := filepath.Join(tx.root, "phase-"+name)
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, os.ErrExist) {
		return nil
	}
	if err != nil {
		return newError(CodeTransactionFailed, "cannot persist flow transaction phase", err)
	}
	if _, err := file.Write([]byte("1\n")); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return newError(CodeTransactionFailed, "cannot write flow transaction phase", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return newError(CodeTransactionFailed, "cannot sync flow transaction phase", err)
	}
	return file.Close()
}

func (tx *transaction) marked(name string) bool {
	if tx == nil || !validPhaseName(name) {
		return false
	}
	info, err := os.Lstat(filepath.Join(tx.root, "phase-"+name))
	return err == nil && info.Mode().IsRegular()
}

func validPhaseName(name string) bool {
	if name == "" {
		return false
	}
	for _, r := range name {
		if (r < 'a' || r > 'z') && r != '-' {
			return false
		}
	}
	return true
}

func (store *Store) loadTransaction(root string) (*transaction, error) {
	id := filepath.Base(root)
	if !validLocalToken(id) || !pathWithinLocal(store.transactionsRoot(), root) {
		return nil, newError(CodeTransactionFailed, "invalid flow transaction directory", nil)
	}
	data, err := readBoundedRegularFile(filepath.Join(root, "journal.json"), MaxManifestSize)
	if errors.Is(err, os.ErrNotExist) {
		return nil, os.ErrNotExist
	}
	if err != nil {
		return nil, newError(CodeTransactionFailed, "cannot read flow transaction journal", err)
	}
	var journal transactionJournal
	if err := decodeLocalJSON(data, &journal); err != nil {
		return nil, newError(CodeTransactionFailed, "flow transaction journal is invalid", err)
	}
	if journal.SchemaVersion != localStateSchemaVersion || journal.ID != id || !validLocalToken(journal.InstallID) || !digestPattern.MatchString(journal.PackageDigest) || (journal.Kind != transactionInstall && journal.Kind != transactionPending && journal.Kind != transactionUninstall) {
		return nil, newError(CodeTransactionFailed, "flow transaction journal identity is invalid", nil)
	}
	if journal.TrustToken != "" && !digestPattern.MatchString(journal.TrustToken) {
		return nil, newError(CodeTransactionFailed, "flow transaction trust token is invalid", nil)
	}
	return &transaction{store: store, journal: journal, root: root}, nil
}

func (store *Store) recoverTransactions() error {
	entries, err := os.ReadDir(store.transactionsRoot())
	if err != nil {
		return newError(CodeTransactionFailed, "cannot enumerate flow transactions", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			return newError(CodeTransactionFailed, "flow transaction root contains an unexpected file", nil)
		}
		if !validLocalToken(entry.Name()) {
			return newError(CodeTransactionFailed, "flow transaction root contains an invalid directory", nil)
		}
		root := filepath.Join(store.transactionsRoot(), entry.Name())
		tx, err := store.loadTransaction(root)
		if errors.Is(err, os.ErrNotExist) {
			if err := os.RemoveAll(root); err != nil {
				return newError(CodeTransactionFailed, "cannot remove orphan flow staging directory", err)
			}
			continue
		}
		if err != nil {
			return err
		}
		if err := tx.recover(); err != nil {
			return err
		}
	}
	return nil
}

func (tx *transaction) recover() error {
	if tx == nil {
		return newError(CodeTransactionFailed, "flow transaction is nil", nil)
	}
	if tx.marked("committed") || tx.appearsCommitted() {
		return tx.cleanupCommitted()
	}
	return tx.rollback()
}

func (tx *transaction) appearsCommitted() bool {
	journal := tx.journal
	switch journal.Kind {
	case transactionInstall:
		entry, err := tx.store.loadCatalogEntry(journal.InstallID)
		if err != nil || entry.PackageDigest != journal.PackageDigest {
			return false
		}
		if info, err := os.Lstat(tx.store.contentRoot(journal.InstallID)); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return false
		}
		if journal.TrustCreated {
			if info, err := os.Lstat(filepath.Join(tx.store.trustRoot(), journal.TrustToken+".json")); err != nil || !info.Mode().IsRegular() {
				return false
			}
		}
		return true
	case transactionPending:
		entry, err := tx.store.loadCatalogEntry(journal.InstallID)
		if err != nil || entry.Pending == nil || entry.Pending.PackageDigest != journal.PackageDigest {
			return false
		}
		info, err := os.Lstat(tx.store.pendingInstallRoot(journal.InstallID, journal.PackageDigest))
		return err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0
	case transactionUninstall:
		_, catalogErr := os.Lstat(tx.store.catalogPath(journal.InstallID))
		_, contentErr := os.Lstat(tx.store.contentRoot(journal.InstallID))
		return errors.Is(catalogErr, os.ErrNotExist) && errors.Is(contentErr, os.ErrNotExist)
	default:
		return false
	}
}

func (tx *transaction) cleanupCommitted() error {
	if tx.journal.Kind == transactionUninstall && tx.journal.PurgeData {
		_ = removeAllIfExists(filepath.Join(tx.root, "data.prev"))
	}
	if err := os.RemoveAll(tx.root); err != nil {
		return newError(CodeTransactionFailed, "cannot clean committed flow transaction", err)
	}
	return nil
}

func (tx *transaction) rollback() error {
	journal := tx.journal
	catalog := tx.store.catalogPath(journal.InstallID)
	content := tx.store.contentRoot(journal.InstallID)
	catalogPrev := filepath.Join(tx.root, "catalog.prev.json")
	contentPrev := filepath.Join(tx.root, "content.prev")

	switch journal.Kind {
	case transactionInstall:
		if current, err := tx.store.loadCatalogEntry(journal.InstallID); err == nil && current.PackageDigest == journal.PackageDigest {
			if err := os.Remove(catalog); err != nil && !errors.Is(err, os.ErrNotExist) {
				return newError(CodeTransactionFailed, "cannot remove incomplete flow catalog entry", err)
			}
		}
		if _, err := os.Lstat(catalogPrev); err == nil {
			if _, existingErr := os.Lstat(catalog); existingErr == nil {
				_ = os.Remove(catalog)
			}
			if err := renameAbsent(catalogPrev, catalog); err != nil {
				return newError(CodeTransactionFailed, "cannot restore previous flow catalog entry", err)
			}
		}
		if tx.marked("content-active") {
			if err := removeAllIfExists(content); err != nil {
				return newError(CodeTransactionFailed, "cannot remove incomplete flow content", err)
			}
		}
		if _, err := os.Lstat(contentPrev); err == nil {
			if err := removeAllIfExists(content); err != nil {
				return newError(CodeTransactionFailed, "cannot clear incomplete flow content", err)
			}
			if err := renameAbsent(contentPrev, content); err != nil {
				return newError(CodeTransactionFailed, "cannot restore previous flow content", err)
			}
		}
		if journal.TrustCreated && tx.marked("trust-active") {
			trustPath := filepath.Join(tx.store.trustRoot(), journal.TrustToken+".json")
			if err := os.Remove(trustPath); err != nil && !errors.Is(err, os.ErrNotExist) {
				return newError(CodeTransactionFailed, "cannot rollback publisher trust approval", err)
			}
		}
	case transactionPending:
		pending := tx.store.pendingInstallRoot(journal.InstallID, journal.PackageDigest)
		if err := removeAllIfExists(pending); err != nil {
			return newError(CodeTransactionFailed, "cannot remove incomplete pending flow update", err)
		}
		if _, err := os.Lstat(catalogPrev); err == nil {
			_ = os.Remove(catalog)
			if err := renameAbsent(catalogPrev, catalog); err != nil {
				return newError(CodeTransactionFailed, "cannot restore flow catalog after pending update", err)
			}
		}
	case transactionUninstall:
		if _, err := os.Lstat(contentPrev); err == nil {
			if err := removeAllIfExists(content); err != nil {
				return newError(CodeTransactionFailed, "cannot clear uninstall content target", err)
			}
			if err := renameAbsent(contentPrev, content); err != nil {
				return newError(CodeTransactionFailed, "cannot restore uninstalled flow content", err)
			}
		}
		if _, err := os.Lstat(catalogPrev); err == nil {
			_ = os.Remove(catalog)
			if err := renameAbsent(catalogPrev, catalog); err != nil {
				return newError(CodeTransactionFailed, "cannot restore uninstalled flow catalog entry", err)
			}
		}
		pendingPrev := filepath.Join(tx.root, "pending.prev")
		pendingRoot := filepath.Join(tx.store.pendingRoot(), journal.InstallID)
		if _, err := os.Lstat(pendingPrev); err == nil {
			_ = removeAllIfExists(pendingRoot)
			if err := ensureRealDirectory(tx.store.Root, filepath.Dir(pendingRoot)); err != nil {
				return newError(CodeTransactionFailed, "cannot restore pending update parent", err)
			}
			if err := renameAbsent(pendingPrev, pendingRoot); err != nil {
				return newError(CodeTransactionFailed, "cannot restore pending flow updates", err)
			}
		}
		if journal.PurgeData {
			dataPrev := filepath.Join(tx.root, "data.prev")
			dataRoot := tx.store.flowDataRoot(journal.InstallID)
			if _, err := os.Lstat(dataPrev); err == nil {
				_ = removeAllIfExists(dataRoot)
				if err := renameAbsent(dataPrev, dataRoot); err != nil {
					return newError(CodeTransactionFailed, "cannot restore flow user data", err)
				}
			}
		}
	}
	if err := os.RemoveAll(tx.root); err != nil {
		return newError(CodeTransactionFailed, "cannot clean rolled back flow transaction", err)
	}
	return nil
}

func (tx *transaction) stagePackage(pkg *Package, directoryName string) (string, error) {
	if pkg == nil {
		return "", newError(CodeInvalidPackage, "flow package is nil", nil)
	}
	root := filepath.Join(tx.root, directoryName)
	if err := os.Mkdir(root, 0o700); err != nil {
		return "", newError(CodeTransactionFailed, "cannot create flow staging directory", err)
	}
	if err := writeExclusiveRegularFile(root, filepath.Join(root, ManifestEntryName), pkg.RawManifest, 0o644); err != nil {
		return "", newError(CodeTransactionFailed, "cannot stage flow.json", err)
	}
	if err := writeExclusiveRegularFile(root, filepath.Join(root, SignatureEntryName), pkg.Signature, 0o644); err != nil {
		return "", newError(CodeTransactionFailed, "cannot stage flow.sig", err)
	}
	for _, file := range pkg.Manifest.Files {
		data, ok := pkg.Files[file.Path]
		if !ok {
			return "", newError(CodeFileMismatch, "verified flow file inventory changed before staging", nil)
		}
		path := filepath.Join(root, filepath.FromSlash(file.Path))
		if err := writeExclusiveRegularFile(root, path, data, 0o644); err != nil {
			return "", newError(CodeTransactionFailed, "cannot stage flow content", err)
		}
	}
	return root, nil
}

func (tx *transaction) stageCatalog(entry CatalogEntry) error {
	data, err := encodeLocalJSON(entry)
	if err != nil {
		return newError(CodeTransactionFailed, "cannot encode flow catalog entry", err)
	}
	return writeExclusiveRegularFile(tx.root, filepath.Join(tx.root, "catalog.next.json"), data, 0o600)
}

func (tx *transaction) stageTrust(record TrustRecord) error {
	data, err := encodeLocalJSON(record)
	if err != nil {
		return newError(CodeTransactionFailed, "cannot encode flow trust record", err)
	}
	return writeExclusiveRegularFile(tx.root, filepath.Join(tx.root, "trust.next.json"), data, 0o600)
}

func (tx *transaction) activateTrust(record TrustRecord) error {
	staged := filepath.Join(tx.root, "trust.next.json")
	target := tx.store.trustPath(record)
	if _, err := os.Lstat(target); err == nil {
		return newError(CodeInstallConflict, "publisher trust record changed concurrently", nil)
	} else if !errors.Is(err, os.ErrNotExist) {
		return newError(CodeTransactionFailed, "cannot inspect publisher trust target", err)
	}
	if err := renameAbsent(staged, target); err != nil {
		return newError(CodeTransactionFailed, "cannot activate publisher trust approval", err)
	}
	return tx.mark("trust-active")
}

func moveExisting(source, target string) (bool, error) {
	if _, err := os.Lstat(source); errors.Is(err, os.ErrNotExist) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	if err := renameAbsent(source, target); err != nil {
		return false, err
	}
	return true, nil
}

func (tx *transaction) activateCatalog() error {
	catalog := tx.store.catalogPath(tx.journal.InstallID)
	if moved, err := moveExisting(catalog, filepath.Join(tx.root, "catalog.prev.json")); err != nil {
		return newError(CodeTransactionFailed, "cannot preserve previous flow catalog entry", err)
	} else if moved {
		if err := tx.mark("old-catalog-moved"); err != nil {
			return err
		}
	}
	if err := renameAbsent(filepath.Join(tx.root, "catalog.next.json"), catalog); err != nil {
		return newError(CodeTransactionFailed, "cannot activate flow catalog entry", err)
	}
	return tx.mark("catalog-active")
}

func (tx *transaction) fail(err error) error {
	rollbackErr := tx.recover()
	if rollbackErr != nil {
		return newError(CodeTransactionFailed, "flow transaction failed and rollback also failed", fmt.Errorf("operation: %v; rollback: %w", err, rollbackErr))
	}
	return err
}

func (tx *transaction) commit() error {
	if err := tx.mark("committed"); err != nil {
		return err
	}
	return tx.cleanupCommitted()
}
