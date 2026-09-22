package flowinstall

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"opendesk/internal/processlock"
	"opendesk/pkg/runtimeconfig"
)

const localFlowFormat = "opendesk-local-flow"

type localFlowManifest struct {
	Format        string          `json:"format"`
	SchemaVersion int             `json:"schemaVersion"`
	FlowID        string          `json:"flowId"`
	Name          string          `json:"name"`
	Version       string          `json:"version"`
	Entry         string          `json:"entry"`
	SourceSHA256  string          `json:"sourceSha256"`
	Files         []localFlowFile `json:"files"`
}

type localFlowFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

// InstallScript imports a plain .js/.mjs as a local Flow. Local imports have
// no publisher signature or publisher-wide trust; the local manifest is only
// an integrity record and is never treated as a signed .odflow manifest.
func (service *Service) InstallScript(ctx context.Context, sourcePath string) (InstallResult, error) {
	if service == nil {
		return InstallResult{}, newError(CodeTransactionFailed, "Flow install service is unavailable", nil)
	}
	if err := service.Roots.Ensure(); err != nil {
		return InstallResult{}, err
	}
	select {
	case <-ctx.Done():
		return InstallResult{}, ctx.Err()
	default:
	}
	absolute, err := filepath.Abs(strings.TrimSpace(sourcePath))
	if err != nil || strings.TrimSpace(sourcePath) == "" {
		return InstallResult{}, newError(CodeNotFound, "local Flow source path is invalid", err)
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return InstallResult{}, newError(CodeNotFound, "local Flow source cannot be read", err)
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return InstallResult{}, newError(CodeInvalidRoot, "local Flow source must be a regular file", nil)
	}
	ext := strings.ToLower(filepath.Ext(absolute))
	if ext != ".js" && ext != ".mjs" {
		return InstallResult{}, newError(CodeIncompatiblePlatform, "local Flow import accepts only .js or .mjs", nil)
	}
	if info.Size() < 1 || info.Size() > 32<<20 {
		return InstallResult{}, newError(CodeTransactionFailed, "local Flow source size is outside the allowed range", nil)
	}
	content, err := readLocalSource(absolute, info.Size())
	if err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot read local Flow source", err)
	}
	digest := sha256.Sum256(content)
	digestHex := hex.EncodeToString(digest[:])
	flowID := "local-" + digestHex[:32]
	installID := "local-" + digestHex[:32]
	entry := "payload/main" + ext
	configEntry := "payload/" + runtimeconfig.FileName
	name := strings.TrimSuffix(filepath.Base(absolute), filepath.Ext(absolute))
	if name == "" {
		name = "Local Flow"
	}
	files := []localFlowFile{{Path: entry, SHA256: digestHex, Size: int64(len(content))}}
	config, hasConfig, err := readAdjacentLocalRuntimeConfig(filepath.Dir(absolute))
	if err != nil {
		return InstallResult{}, err
	}
	if hasConfig {
		configDigest := sha256.Sum256(config)
		files = append(files, localFlowFile{
			Path: configEntry, SHA256: hex.EncodeToString(configDigest[:]), Size: int64(len(config)),
		})
	}
	manifest := localFlowManifest{
		Format: localFlowFormat, SchemaVersion: 1, FlowID: flowID, Name: name,
		Version: "0.0.0", Entry: entry, SourceSHA256: digestHex,
		Files: files,
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot encode local Flow manifest", err)
	}
	manifestDigest := sha256.Sum256(manifestBytes)

	lease, err := processlock.Acquire(ctx, filepath.Join(service.Roots.locksRoot(), installID+".lock"), 25*time.Millisecond)
	if err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot acquire local Flow install lock", err)
	}
	defer lease.Close()
	if err := service.recoverLocked(installID); err != nil {
		return InstallResult{}, err
	}
	current, currentErr := service.Catalog.Load(installID)
	if currentErr == nil {
		if current.ArchiveDigest == digestHex && current.ManifestDigest == hex.EncodeToString(manifestDigest[:]) {
			return InstallResult{Record: current, Idempotent: true}, nil
		}
		return InstallResult{}, newError(CodeVersionConflict, "same local Flow identity has different content", nil)
	}
	if CodeOf(currentErr) != CodeNotFound {
		return InstallResult{}, currentErr
	}

	staging, err := os.MkdirTemp(service.Roots.FlowRoot, ".staging-"+installID+"-")
	if err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot create same-filesystem local Flow staging directory", err)
	}
	cleanupStaging := true
	defer func() {
		if cleanupStaging {
			_ = removePackageTree(staging)
		}
	}()
	if err := os.MkdirAll(filepath.Join(staging, "payload"), 0o700); err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot create local Flow staging directory", err)
	}
	if err := os.WriteFile(filepath.Join(staging, filepath.FromSlash(entry)), content, 0o600); err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot write local Flow entry", err)
	}
	if hasConfig {
		if err := os.WriteFile(filepath.Join(staging, filepath.FromSlash(configEntry)), config, 0o600); err != nil {
			return InstallResult{}, newError(CodeTransactionFailed, "cannot write local Flow runtime configuration", err)
		}
	}
	if err := os.WriteFile(filepath.Join(staging, "flow.json"), append(manifestBytes, '\n'), 0o600); err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot write local Flow manifest", err)
	}
	if err := sealPackageTree(staging); err != nil {
		return InstallResult{}, err
	}
	if err := os.Chmod(staging, 0o700); err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot prepare local Flow staging root for commit", err)
	}
	record := Record{
		SchemaVersion: 1, InstallID: installID, FlowID: flowID, Name: name, Version: "0.0.0",
		PublisherID: "local", PublisherKeyID: "local", PublisherFingerprint: "",
		Entry: entry, ArchiveDigest: digestHex, ManifestDigest: hex.EncodeToString(manifestDigest[:]),
		State: StateReady, InstalledAt: time.Now().UTC(), Origin: "js",
	}
	journal := transactionJournal{
		SchemaVersion: 1, InstallID: installID, Stage: filepath.Base(staging),
		Backup: ".rollback-" + installID + "-" + fmt.Sprint(time.Now().UnixNano()),
		Phase:  transactionStaged, NewRecord: record,
	}
	if err := service.writeJournal(journal); err != nil {
		return InstallResult{}, err
	}
	target := filepath.Join(service.Roots.FlowRoot, installID)
	if err := os.Rename(staging, target); err != nil {
		return InstallResult{}, service.rollback(journal, false, err)
	}
	cleanupStaging = false
	journal.Phase = transactionNewCommitted
	if err := os.Chmod(target, 0o500); err != nil {
		return InstallResult{}, service.rollback(journal, false, err)
	}
	if err := service.writeJournal(journal); err != nil {
		return InstallResult{}, service.rollback(journal, false, err)
	}
	if err := service.Catalog.write(record); err != nil {
		return InstallResult{}, service.rollback(journal, false, err)
	}
	journal.Phase = transactionRecordCommitted
	if err := service.writeJournal(journal); err != nil {
		return InstallResult{}, service.rollback(journal, false, err)
	}
	if err := os.Remove(service.journalPath(installID)); err != nil && !os.IsNotExist(err) {
		return InstallResult{}, newError(CodeTransactionFailed, "local Flow installed but transaction cleanup failed", err)
	}
	_ = syncDirectory(service.Roots.FlowRoot)
	_ = syncDirectory(service.Roots.recordsRoot())
	return InstallResult{Record: record}, nil
}

func readLocalSource(path string, expectedSize int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, expectedSize+1))
	if err != nil || int64(len(data)) != expectedSize {
		return nil, fmt.Errorf("local Flow source changed during read")
	}
	return data, nil
}

// A local Flow remains a one-file import, except for the strict runtime
// configuration that authorizes its own OpenDesk UI. Keep that configuration
// adjacent to the imported entry and record it in the local integrity manifest;
// arbitrary sibling resources are deliberately not imported.
func readAdjacentLocalRuntimeConfig(sourceDir string) ([]byte, bool, error) {
	for _, name := range []string{runtimeconfig.FileName, runtimeconfig.LegacyFileName} {
		path := filepath.Join(sourceDir, name)
		info, err := os.Lstat(path)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, false, newError(CodeTransactionFailed, "cannot inspect local Flow runtime configuration", err)
		}
		if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() < 1 || info.Size() > 64<<10 {
			return nil, false, newError(CodeTransactionFailed, "local Flow runtime configuration must be a bounded regular file", nil)
		}
		if _, err := runtimeconfig.Load(path); err != nil {
			return nil, false, newError(CodeTransactionFailed, "local Flow runtime configuration is invalid", err)
		}
		content, err := readLocalSource(path, info.Size())
		if err != nil {
			return nil, false, newError(CodeTransactionFailed, "cannot read local Flow runtime configuration", err)
		}
		return content, true, nil
	}
	return nil, false, nil
}

func verifyLocalDirectory(root string, record Record) error {
	if !pathIsRealDirectory(root) {
		return newError(CodeTransactionFailed, "local Flow root is unavailable", nil)
	}
	manifestPath := filepath.Join(root, "flow.json")
	manifestBytes, err := readBoundedRegular(manifestPath, 256<<10)
	if err != nil {
		return newError(CodeTransactionFailed, "local Flow manifest is unavailable", err)
	}
	var manifest localFlowManifest
	decoder := json.NewDecoder(bytes.NewReader(manifestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil || manifest.Format != localFlowFormat || manifest.SchemaVersion != 1 || manifest.Entry != record.Entry || manifest.SourceSHA256 == "" {
		return newError(CodeTransactionFailed, "local Flow manifest is invalid", err)
	}
	if len(manifest.Files) < 1 || len(manifest.Files) > 2 {
		return newError(CodeTransactionFailed, "local Flow file inventory is invalid", nil)
	}
	expectedPaths := map[string]bool{record.Entry: true, filepath.ToSlash(filepath.Join("payload", runtimeconfig.FileName)): true, filepath.ToSlash(filepath.Join("payload", runtimeconfig.LegacyFileName)): true}
	seen := make(map[string]bool, len(manifest.Files))
	for _, file := range manifest.Files {
		if !expectedPaths[file.Path] || seen[file.Path] || file.Size < 1 || len(file.SHA256) != 64 {
			return newError(CodeTransactionFailed, "local Flow file inventory is invalid", nil)
		}
		seen[file.Path] = true
		path := filepath.Join(root, filepath.FromSlash(file.Path))
		info, statErr := os.Lstat(path)
		if statErr != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() != file.Size {
			return newError(CodeTransactionFailed, "local Flow file is unavailable", statErr)
		}
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return newError(CodeTransactionFailed, "local Flow file cannot be read", readErr)
		}
		digest := sha256.Sum256(content)
		if !strings.EqualFold(hex.EncodeToString(digest[:]), file.SHA256) {
			return newError(CodeTransactionFailed, "local Flow file digest does not match its catalog", nil)
		}
	}
	if !seen[record.Entry] {
		return newError(CodeTransactionFailed, "local Flow entry is missing from its inventory", nil)
	}
	entryFile := nextLocalFile(manifest.Files, record.Entry)
	if entryFile.SHA256 != record.ArchiveDigest || entryFile.SHA256 != manifest.SourceSHA256 {
		return newError(CodeTransactionFailed, "local Flow entry digest does not match its catalog", nil)
	}
	return nil
}

func nextLocalFile(files []localFlowFile, path string) localFlowFile {
	for _, file := range files {
		if file.Path == path {
			return file
		}
	}
	return localFlowFile{}
}
