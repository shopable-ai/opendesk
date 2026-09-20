package flowinstall

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type State string

const (
	StateReady           State = "ready"
	StateNeedsActivation State = "needs-activation"
	StateBlocked         State = "blocked"
)

type Record struct {
	SchemaVersion        int       `json:"schemaVersion"`
	InstallID            string    `json:"installId"`
	FlowID               string    `json:"flowId"`
	Name                 string    `json:"name"`
	Version              string    `json:"version"`
	PublisherID          string    `json:"publisherId"`
	PublisherKeyID       string    `json:"publisherKeyId"`
	PublisherFingerprint string    `json:"publisherFingerprint"`
	Entry                string    `json:"entry"`
	ArchiveDigest        string    `json:"archiveDigest"`
	ManifestDigest       string    `json:"manifestDigest"`
	State                State     `json:"state"`
	StateReason          string    `json:"stateReason,omitempty"`
	InstalledAt          time.Time `json:"installedAt"`
	Origin               string    `json:"origin"`
	MarketplaceID        string    `json:"marketplaceId,omitempty"`
	ReleaseID            string    `json:"releaseId,omitempty"`
	UpdateChannel        string    `json:"updateChannel,omitempty"`
	MarketplaceMetadataRevision int `json:"marketplaceMetadataRevision,omitempty"`
}

var (
	installIDPattern     = regexp.MustCompile(`^(?:flow|local)-[a-f0-9]{32}$`)
	catalogSourcePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
)

func InstallID(publisherFingerprint, flowID string) string {
	digest := sha256.Sum256([]byte("OpenDeskFlowInstallID/v1\x00" + publisherFingerprint + "\x00" + flowID))
	return "flow-" + hex.EncodeToString(digest[:16])
}

type Catalog struct{ Roots Roots }

func (catalog Catalog) Load(installID string) (Record, error) {
	if !installIDPattern.MatchString(installID) {
		return Record{}, newError(CodeNotFound, "Flow installId is invalid", nil)
	}
	data, err := readBoundedRegular(catalog.recordPath(installID), 256<<10)
	if os.IsNotExist(err) {
		return Record{}, newError(CodeNotFound, "Flow is not installed", err)
	}
	if err != nil {
		return Record{}, newError(CodeTransactionFailed, "cannot read Flow catalog record", err)
	}
	record, err := decodeRecord(data)
	if err != nil || record.InstallID != installID {
		return Record{}, newError(CodeTransactionFailed, "Flow catalog record is invalid", err)
	}
	return record, nil
}

func (catalog Catalog) List() ([]Record, error) {
	entries, err := os.ReadDir(catalog.Roots.recordsRoot())
	if err != nil {
		return nil, newError(CodeTransactionFailed, "cannot read Flow catalog", err)
	}
	records := make([]Record, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		installID := strings.TrimSuffix(entry.Name(), ".json")
		if !installIDPattern.MatchString(installID) {
			continue
		}
		record, loadErr := catalog.Load(installID)
		if loadErr != nil {
			return nil, loadErr
		}
		if info, statErr := os.Lstat(filepath.Join(catalog.Roots.FlowRoot, installID)); statErr != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			continue
		}
		records = append(records, record)
	}
	sort.Slice(records, func(i, j int) bool {
		if records[i].Name == records[j].Name {
			return records[i].InstallID < records[j].InstallID
		}
		return records[i].Name < records[j].Name
	})
	return records, nil
}

func (catalog Catalog) write(record Record) error {
	if err := validateRecord(record); err != nil {
		return err
	}
	data, err := json.Marshal(record)
	if err != nil {
		return err
	}
	return writeAtomic(catalog.recordPath(record.InstallID), append(data, '\n'), 0o600)
}

func (catalog Catalog) remove(installID string) error {
	if !installIDPattern.MatchString(installID) {
		return newError(CodeNotFound, "Flow installId is invalid", nil)
	}
	err := os.Remove(catalog.recordPath(installID))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (catalog Catalog) recordPath(installID string) string {
	return filepath.Join(catalog.Roots.recordsRoot(), installID+".json")
}

func validateRecord(record Record) error {
	if record.SchemaVersion != 1 || !installIDPattern.MatchString(record.InstallID) || record.FlowID == "" || record.Name == "" || record.Entry == "" {
		return fmt.Errorf("invalid Flow catalog record")
	}
	if record.State != StateReady && record.State != StateNeedsActivation && record.State != StateBlocked {
		return fmt.Errorf("invalid Flow catalog state")
	}
	switch record.Origin {
	case "js", "odflow":
		if record.MarketplaceID != "" || record.ReleaseID != "" || record.UpdateChannel != "" || record.MarketplaceMetadataRevision != 0 {
			return fmt.Errorf("non-Marketplace Flow catalog record contains Marketplace provenance")
		}
	case "marketplace":
		if !catalogSourcePattern.MatchString(record.MarketplaceID) || !catalogSourcePattern.MatchString(record.ReleaseID) || record.MarketplaceMetadataRevision < 0 || record.MarketplaceMetadataRevision > 1_000_000_000 {
			return fmt.Errorf("Marketplace Flow catalog provenance is invalid")
		}
		if record.UpdateChannel != "" && !catalogSourcePattern.MatchString(record.UpdateChannel) {
			return fmt.Errorf("Marketplace Flow update channel is invalid")
		}
	default:
		return fmt.Errorf("invalid Flow catalog origin")
	}
	return nil
}

func decodeRecord(data []byte) (Record, error) {
	var record Record
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&record); err != nil {
		return record, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return record, fmt.Errorf("trailing Flow catalog data")
	}
	return record, validateRecord(record)
}
