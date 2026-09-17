package flow

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const localStateSchemaVersion = 1

type Store struct {
	Root string
}

func NewStore(root string) (*Store, error) {
	root = filepath.Clean(strings.TrimSpace(root))
	if root == "" || !filepath.IsAbs(root) {
		return nil, newError(CodeInvalidInstallRoot, "flow install root must be an absolute path", nil)
	}
	store := &Store{Root: root}
	for _, directory := range []string{
		store.flowsRoot(), store.dataRoot(), store.stateRoot(), store.catalogRoot(),
		store.trustRoot(), store.transactionsRoot(), store.pendingRoot(),
	} {
		if err := ensureRealDirectory(store.Root, directory); err != nil {
			return nil, newError(CodeInvalidInstallRoot, "flow install root contains an unsafe directory", err)
		}
	}
	return store, nil
}

func (store *Store) List() ([]CatalogEntry, error) {
	if store == nil {
		return nil, newError(CodeInvalidInstallRoot, "flow store is nil", nil)
	}
	entries, err := os.ReadDir(store.catalogRoot())
	if err != nil {
		return nil, newError(CodeCatalogCorrupt, "cannot read flow catalog", err)
	}
	result := make([]CatalogEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		installID := strings.TrimSuffix(entry.Name(), ".json")
		if !validLocalToken(installID) {
			return nil, newError(CodeCatalogCorrupt, "flow catalog contains an invalid install id", nil)
		}
		item, err := store.loadCatalogEntry(installID)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].PublisherID != result[j].PublisherID {
			return result[i].PublisherID < result[j].PublisherID
		}
		if result[i].FlowID != result[j].FlowID {
			return result[i].FlowID < result[j].FlowID
		}
		return result[i].InstallID < result[j].InstallID
	})
	return result, nil
}

func (store *Store) FindInstall(installID string) (*CatalogEntry, error) {
	if !validLocalToken(installID) {
		return nil, newError(CodeNotInstalled, "flow install id is invalid", nil)
	}
	entry, err := store.loadCatalogEntry(installID)
	if errors.Is(err, os.ErrNotExist) {
		return nil, newError(CodeNotInstalled, "flow is not installed", err)
	}
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (store *Store) findIdentity(fingerprint, flowID string) (*CatalogEntry, error) {
	entries, err := store.List()
	if err != nil {
		return nil, err
	}
	for index := range entries {
		entry := entries[index]
		if entry.PublisherFingerprint == fingerprint && entry.FlowID == flowID {
			return &entry, nil
		}
	}
	return nil, nil
}

func (store *Store) loadCatalogEntry(installID string) (CatalogEntry, error) {
	var entry CatalogEntry
	data, err := readBoundedRegularFile(store.catalogPath(installID), MaxManifestSize)
	if err != nil {
		return entry, err
	}
	if err := decodeLocalJSON(data, &entry); err != nil {
		return entry, newError(CodeCatalogCorrupt, "flow catalog entry is invalid", err)
	}
	if err := validateCatalogEntry(entry, installID); err != nil {
		return entry, err
	}
	return entry, nil
}

func validateCatalogEntry(entry CatalogEntry, fileInstallID string) error {
	if entry.SchemaVersion != localStateSchemaVersion || entry.InstallID != fileInstallID || !validLocalToken(entry.InstallID) {
		return newError(CodeCatalogCorrupt, "flow catalog identity is invalid", nil)
	}
	if !identifierPattern.MatchString(entry.FlowID) || !identifierPattern.MatchString(entry.PublisherID) || !identifierPattern.MatchString(entry.PublisherKeyID) {
		return newError(CodeCatalogCorrupt, "flow catalog publisher or flow identity is invalid", nil)
	}
	if !digestPattern.MatchString(entry.PackageDigest) || !digestPattern.MatchString(entry.PublisherFingerprint) {
		return newError(CodeCatalogCorrupt, "flow catalog digest is invalid", nil)
	}
	if !validSemanticVersion(entry.Version) || (entry.Entry != EntrypointMainJS && entry.Entry != EntrypointMainPackage) {
		return newError(CodeCatalogCorrupt, "flow catalog version or entry is invalid", nil)
	}
	if entry.State != InstallStateReady && entry.State != InstallStateNeedsActivation {
		return newError(CodeCatalogCorrupt, "flow catalog install state is invalid", nil)
	}
	if entry.TrustScope != TrustScopeFlow && entry.TrustScope != TrustScopePublisher {
		return newError(CodeCatalogCorrupt, "flow catalog trust scope is invalid", nil)
	}
	if entry.ProductID != "" && !identifierPattern.MatchString(entry.ProductID) {
		return newError(CodeCatalogCorrupt, "flow catalog product identity is invalid", nil)
	}
	if entry.Pending != nil {
		if !validSemanticVersion(entry.Pending.Version) || !digestPattern.MatchString(entry.Pending.PackageDigest) ||
			(entry.Pending.State != InstallStateReady && entry.Pending.State != InstallStateNeedsActivation) {
			return newError(CodeCatalogCorrupt, "flow pending update is invalid", nil)
		}
	}
	return nil
}

func decodeLocalJSON(data []byte, destination any) error {
	if err := rejectDuplicateObjectKeys(data); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("local flow state contains trailing JSON data")
	}
	return nil
}

func encodeLocalJSON(value any) ([]byte, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	data = append(data, '\n')
	return data, nil
}

func (store *Store) flowsRoot() string   { return filepath.Join(store.Root, "flows") }
func (store *Store) dataRoot() string    { return filepath.Join(store.Root, "flow-data") }
func (store *Store) stateRoot() string   { return filepath.Join(store.Root, "flow-state") }
func (store *Store) catalogRoot() string { return filepath.Join(store.stateRoot(), "catalog") }
func (store *Store) trustRoot() string   { return filepath.Join(store.stateRoot(), "trust") }
func (store *Store) transactionsRoot() string {
	return filepath.Join(store.stateRoot(), "transactions")
}
func (store *Store) pendingRoot() string { return filepath.Join(store.stateRoot(), "pending") }
func (store *Store) contentRoot(id string) string {
	return filepath.Join(store.flowsRoot(), id)
}
func (store *Store) flowDataRoot(id string) string {
	return filepath.Join(store.dataRoot(), id)
}
func (store *Store) catalogPath(id string) string {
	return filepath.Join(store.catalogRoot(), id+".json")
}
func (store *Store) pendingInstallRoot(id, digest string) string {
	return filepath.Join(store.pendingRoot(), id, digest)
}

func readBoundedRegularFile(path string, limit int64) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || info.Size() < 1 || info.Size() > limit {
		return nil, fmt.Errorf("file is not a bounded regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || opened.Size() != info.Size() {
		return nil, fmt.Errorf("file changed during secure read")
	}
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, fmt.Errorf("cannot read bounded file")
	}
	return data, nil
}
