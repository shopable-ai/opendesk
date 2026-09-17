package flowinstall

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"opendesk/internal/processlock"
	"opendesk/pkg/flowpackage"
	"opendesk/pkg/licensing"
	"opendesk/pkg/runtimeversion"
	"opendesk/pkg/scriptloader"
)

type TrustDecision string

const (
	DecisionCancel    TrustDecision = "cancel"
	DecisionFlow      TrustDecision = "flow"
	DecisionPublisher TrustDecision = "publisher"
)

type TrustCandidate struct {
	FlowID               string `json:"flowId"`
	Name                 string `json:"name"`
	PublisherID          string `json:"publisherId"`
	PublisherKeyID       string `json:"publisherKeyId"`
	PublisherFingerprint string `json:"publisherFingerprint"`
	SignatureVerified    bool   `json:"signatureVerified"`
}

type TrustApprover func(context.Context, TrustCandidate) (TrustDecision, error)

type InstallOptions struct {
	AllowDowngrade       bool
	AllowNeedsActivation bool
	AuthorizePackage     bool
	Approver             TrustApprover
	TrustSource          TrustSource
	AuthorityProof       *AuthorityProof
}

type InstallResult struct {
	Record     Record `json:"record"`
	Idempotent bool   `json:"idempotent"`
	Updated    bool   `json:"updated"`
}

type Service struct {
	Roots          Roots
	Trust          TrustStore
	Catalog        Catalog
	RuntimeVersion string
	ProtectedLoad  scriptloader.Loader
	Authorizer     PackageAuthorizer
	Authorities    AuthorityVerifier
}

func NewService(roots Roots) (*Service, error) {
	if err := roots.Ensure(); err != nil {
		return nil, err
	}
	service := &Service{
		Roots: roots, Trust: TrustStore{Root: roots.TrustRoot}, Catalog: Catalog{Roots: roots},
		RuntimeVersion: runtimeversion.Current, ProtectedLoad: scriptloader.NewProductionProtectedPackageLoader(),
	}
	return service, nil
}

func (service *Service) Install(ctx context.Context, packagePath string, options InstallOptions) (InstallResult, error) {
	if service == nil {
		return InstallResult{}, newError(CodeTransactionFailed, "Flow install service is unavailable", nil)
	}
	if err := service.Roots.Ensure(); err != nil {
		return InstallResult{}, err
	}
	flowPackage, err := flowpackage.ReadFile(packagePath)
	if err != nil {
		return InstallResult{}, err
	}
	manifest := flowPackage.Manifest
	if !flowpackage.SupportsCurrentPlatform(manifest.Platforms) {
		return InstallResult{}, newError(CodeIncompatiblePlatform, "Flow does not support "+runtime.GOOS, nil)
	}
	if compareSemver(service.RuntimeVersion, manifest.MinimumRuntimeVersion) < 0 {
		return InstallResult{}, newError(CodeIncompatibleRuntime, "Flow requires a newer OpenDesk Runtime", nil)
	}
	trusted, err := service.Trust.Evaluate(manifest)
	if err != nil {
		return InstallResult{}, err
	}
	decision := DecisionFlow
	authoritySource := TrustSource("")
	if !trusted && options.AuthorityProof != nil {
		authoritySource, err = service.Authorities.Verify(ctx, *options.AuthorityProof, manifest, flowPackage.ManifestDigest, flowPackage.ArchiveDigest)
		if err != nil {
			return InstallResult{}, err
		}
		trusted = true
	}
	needsApproval := !trusted
	if needsApproval {
		if options.Approver == nil {
			return InstallResult{}, newError(CodeTrustRequired, "unknown publisher requires an explicit trust decision", nil)
		}
		decision, err = options.Approver(ctx, TrustCandidate{
			FlowID: manifest.FlowID, Name: manifest.Name, PublisherID: manifest.PublisherID,
			PublisherKeyID: manifest.PublisherKeyID, PublisherFingerprint: manifest.PublisherFingerprint,
			SignatureVerified: true,
		})
		if err != nil {
			return InstallResult{}, err
		}
		if decision == DecisionCancel {
			return InstallResult{}, newError(CodeTrustCanceled, "Flow installation was canceled", nil)
		}
		if decision != DecisionFlow && decision != DecisionPublisher {
			return InstallResult{}, newError(CodeTrustConflict, "trust approver returned an invalid decision", nil)
		}
	}
	installID := InstallID(manifest.PublisherFingerprint, manifest.FlowID)
	lease, err := processlock.Acquire(ctx, filepath.Join(service.Roots.locksRoot(), installID+".lock"), 25*time.Millisecond)
	if err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot acquire Flow install lock", err)
	}
	defer lease.Close()
	if err := service.recoverLocked(installID); err != nil {
		return InstallResult{}, err
	}

	current, currentErr := service.Catalog.Load(installID)
	currentExists := currentErr == nil
	if currentErr != nil && CodeOf(currentErr) != CodeNotFound {
		return InstallResult{}, currentErr
	}
	if currentExists {
		if current.Version == manifest.Version && current.ArchiveDigest == flowPackage.ArchiveDigest {
			return InstallResult{Record: current, Idempotent: true}, nil
		}
		if current.Version == manifest.Version {
			return InstallResult{}, newError(CodeVersionConflict, "same Flow version has different content", nil)
		}
		if compareSemver(manifest.Version, current.Version) < 0 && !options.AllowDowngrade {
			return InstallResult{}, newError(CodeDowngradeDenied, "Flow downgrade requires explicit approval", nil)
		}
	}

	staging, err := os.MkdirTemp(service.Roots.FlowRoot, ".staging-"+installID+"-")
	if err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot create same-filesystem Flow staging directory", err)
	}
	stagingBase := filepath.Base(staging)
	cleanupStaging := true
	defer func() {
		if cleanupStaging {
			_ = removePackageTree(staging)
		}
	}()
	if err := extractPackage(staging, flowPackage); err != nil {
		return InstallResult{}, err
	}
	state, reason, err := service.preflightProtected(ctx, staging, manifest)
	if err != nil {
		return InstallResult{}, err
	}
	if state == StateNeedsActivation && options.AuthorizePackage {
		if service.Authorizer == nil {
			return InstallResult{}, newError(CodeActivationRequired, "no trusted product authorization provider is configured", nil)
		}
		request := PackageAuthorizationRequest{
			OperationID: operationID(flowPackage.ArchiveDigest, manifest),
			InstallID:   InstallID(manifest.PublisherFingerprint, manifest.FlowID),
			FlowID:      manifest.FlowID, FlowVersion: manifest.Version,
			PublisherID: manifest.PublisherID, PublisherKeyID: manifest.PublisherKeyID,
			PublisherFingerprint: manifest.PublisherFingerprint,
			ProductID:            manifest.Protected.ProductID, PackageID: manifest.Protected.PackageID,
			ContentKeyID: manifest.Protected.ContentKeyID, LicenseIssuerKeyID: manifest.Protected.LicenseIssuerKeyID,
			VerifiedPackagePath: filepath.Join(staging, filepath.FromSlash(manifest.Entry)),
		}
		if err := service.Authorizer.AuthorizePackage(ctx, request); err != nil {
			return InstallResult{}, newError(CodeActivationRequired, "trusted product authorization did not authorize this package", err)
		}
		state, reason, err = service.preflightProtected(ctx, staging, manifest)
		if err != nil {
			return InstallResult{}, err
		}
	}
	if state == StateNeedsActivation && !options.AllowNeedsActivation {
		return InstallResult{}, newError(CodeActivationRequired, "protected Flow requires activation before installation", nil)
	}
	if state == StateBlocked {
		return InstallResult{}, newError(CodeAuthorizationDenied, "protected Flow authorization is blocked: "+reason, nil)
	}
	// A first install may deliberately be registered as needs-activation, but an
	// update must never replace an already runnable version with one that cannot
	// run yet. B2 may later add a durable pending-candidate promotion protocol;
	// until then, fail closed and leave the current ready version untouched.
	if currentExists && current.State == StateReady && state == StateNeedsActivation {
		return InstallResult{}, newError(CodeActivationRequired, "Flow update requires activation before it can replace the current ready version", nil)
	}
	if err := sealPackageTree(staging); err != nil {
		return InstallResult{}, err
	}
	// macOS directory rename requires write permission on the moved directory.
	// Keep the private staging root writable until commit; all payload files and
	// descendants are already sealed, and the installed root is sealed again
	// immediately after rename.
	if err := os.Chmod(staging, 0o700); err != nil {
		return InstallResult{}, newError(CodeTransactionFailed, "cannot prepare Flow staging root for commit", err)
	}
	record := Record{
		SchemaVersion: 1, InstallID: installID, FlowID: manifest.FlowID, Name: manifest.Name,
		Version: manifest.Version, PublisherID: manifest.PublisherID, PublisherKeyID: manifest.PublisherKeyID,
		PublisherFingerprint: manifest.PublisherFingerprint, Entry: manifest.Entry,
		ArchiveDigest: flowPackage.ArchiveDigest, ManifestDigest: flowPackage.ManifestDigest,
		State: state, StateReason: reason, InstalledAt: time.Now().UTC(), Origin: "odflow",
	}
	journal := transactionJournal{
		SchemaVersion: 1, Kind: transactionInstall, InstallID: installID, Stage: stagingBase,
		Backup: ".rollback-" + installID + "-" + strconv.FormatInt(time.Now().UnixNano(), 36),
		Phase:  transactionStaged, NewRecord: record,
	}
	if currentExists {
		previous := current
		journal.PreviousRecord = &previous
	}
	if err := service.writeJournal(journal); err != nil {
		return InstallResult{}, err
	}
	target := filepath.Join(service.Roots.FlowRoot, installID)
	backup := filepath.Join(service.Roots.FlowRoot, journal.Backup)
	if currentExists {
		if err := os.Chmod(target, 0o700); err != nil {
			return InstallResult{}, service.rollback(journal, currentExists, err)
		}
		if err := os.Rename(target, backup); err != nil {
			_ = os.Chmod(target, 0o500)
			return InstallResult{}, service.rollback(journal, currentExists, err)
		}
		if err := os.Chmod(backup, 0o500); err != nil {
			return InstallResult{}, service.rollback(journal, currentExists, err)
		}
		journal.Phase = transactionOldMoved
		if err := service.writeJournal(journal); err != nil {
			return InstallResult{}, service.rollback(journal, currentExists, err)
		}
	}
	if err := os.Rename(staging, target); err != nil {
		return InstallResult{}, service.rollback(journal, currentExists, err)
	}
	cleanupStaging = false
	journal.Phase = transactionNewCommitted
	if err := os.Chmod(target, 0o500); err != nil {
		return InstallResult{}, service.rollback(journal, currentExists, err)
	}
	if err := service.writeJournal(journal); err != nil {
		return InstallResult{}, service.rollback(journal, currentExists, err)
	}
	if needsApproval {
		scope := TrustScopeFlow
		if decision == DecisionPublisher {
			scope = TrustScopePublisher
		}
		source := options.TrustSource
		if source == "" {
			source = TrustUser
		}
		if err := service.Trust.Approve(manifest, scope, source); err != nil {
			return InstallResult{}, service.rollback(journal, currentExists, err)
		}
	} else if authoritySource != "" {
		if err := service.Trust.approveAuthority(manifest, TrustScopeFlow, authoritySource); err != nil {
			return InstallResult{}, service.rollback(journal, currentExists, err)
		}
	}
	if err := service.Catalog.write(record); err != nil {
		return InstallResult{}, service.rollback(journal, currentExists, err)
	}
	journal.Phase = transactionRecordCommitted
	if err := service.writeJournal(journal); err != nil {
		return InstallResult{}, service.rollback(journal, currentExists, err)
	}
	if currentExists {
		if err := removePackageTree(backup); err != nil {
			return InstallResult{}, newError(CodeTransactionFailed, "Flow installed but rollback cleanup failed", err)
		}
	}
	_ = os.Remove(service.journalPath(installID))
	_ = syncDirectory(service.Roots.FlowRoot)
	_ = syncDirectory(service.Roots.recordsRoot())
	return InstallResult{Record: record, Updated: currentExists}, nil
}

func (service *Service) preflightProtected(ctx context.Context, root string, manifest flowpackage.Manifest) (State, string, error) {
	if manifest.Protected == nil {
		return StateReady, "", nil
	}
	if service.ProtectedLoad == nil {
		return StateNeedsActivation, "protected loader unavailable", nil
	}
	source, err := service.ProtectedLoad.Load(ctx, filepath.Join(root, filepath.FromSlash(manifest.Entry)))
	if source != nil {
		for index := range source.Content {
			source.Content[index] = 0
		}
	}
	if err == nil {
		return StateReady, "", nil
	}
	code := scriptloader.ErrorCodeOf(err)
	switch code {
	case string(licensing.CodeUnknownPublisher), string(licensing.CodeLicenseRequired), string(licensing.CodeContentKeyUnavailable), string(licensing.CodeDeviceKeyUnavailable):
		return StateNeedsActivation, code, nil
	case string(licensing.CodeLicenseExpired), string(licensing.CodeLicenseNotYetValid), string(licensing.CodeLicenseRevoked), string(licensing.CodeWrongDevice), string(licensing.CodeLicenseDenied), string(licensing.CodeOnlineReplay):
		return StateBlocked, code, nil
	default:
		return StateBlocked, code, newError(CodeTransactionFailed, "protected Flow preflight failed", err)
	}
}

func extractPackage(staging string, flowPackage *flowpackage.Package) error {
	root, err := os.OpenRoot(staging)
	if err != nil {
		return newError(CodeTransactionFailed, "cannot open Flow staging root", err)
	}
	defer root.Close()
	names := make([]string, 0, len(flowPackage.Entries))
	for name := range flowPackage.Entries {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		parent := filepath.Dir(filepath.FromSlash(name))
		if parent != "." {
			if err := root.MkdirAll(parent, 0o700); err != nil {
				return newError(CodeTransactionFailed, "cannot create Flow staging directory", err)
			}
		}
		file, err := root.OpenFile(filepath.FromSlash(name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return newError(CodeTransactionFailed, "cannot create Flow staging file", err)
		}
		if _, err := file.Write(flowPackage.Entries[name]); err != nil {
			_ = file.Close()
			return newError(CodeTransactionFailed, "cannot write Flow staging file", err)
		}
		if err := file.Sync(); err != nil {
			_ = file.Close()
			return newError(CodeTransactionFailed, "cannot sync Flow staging file", err)
		}
		if err := file.Close(); err != nil {
			return newError(CodeTransactionFailed, "cannot close Flow staging file", err)
		}
	}
	if directory, err := root.Open("."); err == nil {
		defer directory.Close()
		if err := directory.Sync(); err != nil {
			return newError(CodeTransactionFailed, "cannot sync Flow staging directory", err)
		}
	}
	return nil
}

func sealPackageTree(root string) error {
	var directories []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		info, err := entry.Info()
		if err != nil || info.Mode()&os.ModeSymlink != 0 {
			return newError(CodeTransactionFailed, "cannot seal an invalid Flow staging entry", err)
		}
		if entry.IsDir() {
			directories = append(directories, path)
			return nil
		}
		if !info.Mode().IsRegular() {
			return newError(CodeTransactionFailed, "cannot seal a special Flow staging entry", nil)
		}
		if err := os.Chmod(path, 0o400); err != nil {
			return newError(CodeTransactionFailed, "cannot make installed Flow resource read-only", err)
		}
		return nil
	})
	if err != nil {
		return err
	}
	for index := len(directories) - 1; index >= 0; index-- {
		if err := os.Chmod(directories[index], 0o500); err != nil {
			return newError(CodeTransactionFailed, "cannot make installed Flow directory read-only", err)
		}
	}
	return nil
}

func removePackageTree(root string) error {
	info, err := os.Lstat(root)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return os.Remove(root)
	}
	if err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if entry.IsDir() {
			return os.Chmod(path, 0o700)
		}
		return os.Chmod(path, 0o600)
	}); err != nil {
		return err
	}
	return os.RemoveAll(root)
}

type transactionKind string

type transactionPhase string

const (
	transactionInstall   transactionKind = "install"
	transactionUninstall transactionKind = "uninstall"

	transactionStaged          transactionPhase = "staged"
	transactionOldMoved        transactionPhase = "old-moved"
	transactionDataMoved       transactionPhase = "data-moved"
	transactionNewCommitted    transactionPhase = "new-committed"
	transactionRecordCommitted transactionPhase = "record-committed"
)

type transactionJournal struct {
	SchemaVersion  int              `json:"schemaVersion"`
	Kind           transactionKind  `json:"kind,omitempty"`
	InstallID      string           `json:"installId"`
	Stage          string           `json:"stage,omitempty"`
	Backup         string           `json:"backup"`
	DataBackup     string           `json:"dataBackup,omitempty"`
	RemoveData     bool             `json:"removeData,omitempty"`
	Phase          transactionPhase `json:"phase"`
	NewRecord      Record           `json:"newRecord"`
	PreviousRecord *Record          `json:"previousRecord,omitempty"`
}

func journalKind(journal transactionJournal) transactionKind {
	if journal.Kind == "" {
		return transactionInstall
	}
	return journal.Kind
}

func (service *Service) Recover(ctx context.Context) error {
	if err := service.Roots.Ensure(); err != nil {
		return err
	}
	entries, err := os.ReadDir(service.Roots.transactionsRoot())
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		installID := strings.TrimSuffix(entry.Name(), ".json")
		if !installIDPattern.MatchString(installID) {
			continue
		}
		lease, err := processlock.Acquire(ctx, filepath.Join(service.Roots.locksRoot(), installID+".lock"), 25*time.Millisecond)
		if err != nil {
			return err
		}
		recoverErr := service.recoverLocked(installID)
		_ = lease.Close()
		if recoverErr != nil {
			return recoverErr
		}
	}
	return nil
}

func (service *Service) recoverLocked(installID string) error {
	data, err := readBoundedRegular(service.journalPath(installID), 512<<10)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return newError(CodeTransactionFailed, "cannot read Flow transaction journal", err)
	}
	journal, err := decodeJournal(data)
	if err != nil || journal.InstallID != installID {
		return newError(CodeTransactionFailed, "Flow transaction journal is invalid", err)
	}
	if journalKind(journal) == transactionUninstall {
		return service.recoverUninstall(journal)
	}
	target := filepath.Join(service.Roots.FlowRoot, installID)
	stage := filepath.Join(service.Roots.FlowRoot, journal.Stage)
	backup := filepath.Join(service.Roots.FlowRoot, journal.Backup)
	record, recordErr := service.Catalog.Load(installID)
	committed := recordErr == nil && record.ArchiveDigest == journal.NewRecord.ArchiveDigest && pathIsRealDirectory(target)
	if committed {
		if err := os.Chmod(target, 0o500); err != nil {
			return newError(CodeTransactionFailed, "cannot reseal committed Flow version", err)
		}
		if err := removePackageTree(stage); err != nil {
			return newError(CodeTransactionFailed, "cannot clean committed Flow staging directory", err)
		}
		if err := removePackageTree(backup); err != nil {
			return newError(CodeTransactionFailed, "cannot clean committed Flow rollback directory", err)
		}
		if err := os.Remove(service.journalPath(installID)); err != nil && !os.IsNotExist(err) {
			return newError(CodeTransactionFailed, "cannot remove committed Flow transaction journal", err)
		}
		return nil
	}
	if journal.Phase == transactionStaged && pathIsRealDirectory(target) {
		// A crash can happen after chmod(target, 0700) but before the old
		// directory is renamed to backup. The old installation must remain
		// sealed even though the journal still says only "staged".
		if err := os.Chmod(target, 0o500); err != nil {
			return newError(CodeTransactionFailed, "cannot reseal previous Flow version", err)
		}
	}
	if pathIsRealDirectory(target) && (journal.Phase == transactionNewCommitted || journal.Phase == transactionRecordCommitted) {
		if err := removePackageTree(target); err != nil {
			return newError(CodeTransactionFailed, "cannot remove incomplete Flow commit", err)
		}
	}
	if pathIsRealDirectory(backup) {
		if err := os.Chmod(backup, 0o700); err != nil {
			return newError(CodeTransactionFailed, "cannot prepare previous Flow version for restore", err)
		}
		if err := os.Rename(backup, target); err != nil {
			return newError(CodeTransactionFailed, "cannot restore previous Flow version", err)
		}
		if err := os.Chmod(target, 0o500); err != nil {
			return newError(CodeTransactionFailed, "cannot reseal restored Flow version", err)
		}
	}
	if err := service.restorePreviousRecord(journal); err != nil {
		return newError(CodeTransactionFailed, "cannot restore previous Flow catalog record", err)
	}
	if err := removePackageTree(stage); err != nil {
		return newError(CodeTransactionFailed, "cannot clean recovered Flow staging directory", err)
	}
	if err := os.Remove(service.journalPath(installID)); err != nil && !os.IsNotExist(err) {
		return newError(CodeTransactionFailed, "cannot remove recovered Flow transaction journal", err)
	}
	return nil
}

func (service *Service) rollback(journal transactionJournal, previous bool, cause error) error {
	target := filepath.Join(service.Roots.FlowRoot, journal.InstallID)
	stage := filepath.Join(service.Roots.FlowRoot, journal.Stage)
	backup := filepath.Join(service.Roots.FlowRoot, journal.Backup)
	var cleanupErr error
	if journal.Phase == transactionNewCommitted || journal.Phase == transactionRecordCommitted {
		cleanupErr = removePackageTree(target)
	}
	if cleanupErr == nil && previous && pathIsRealDirectory(backup) {
		if err := os.Chmod(backup, 0o700); err != nil {
			cleanupErr = err
		} else if err := os.Rename(backup, target); err != nil {
			cleanupErr = err
		} else if err := os.Chmod(target, 0o500); err != nil {
			cleanupErr = err
		}
	}
	if cleanupErr == nil {
		cleanupErr = service.restorePreviousRecord(journal)
	}
	if cleanupErr == nil {
		cleanupErr = removePackageTree(stage)
	}
	if cleanupErr == nil {
		if err := os.Remove(service.journalPath(journal.InstallID)); err != nil && !os.IsNotExist(err) {
			cleanupErr = err
		}
	}
	if cleanupErr != nil {
		return newError(CodeTransactionFailed, "Flow install transaction rollback requires recovery", fmt.Errorf("cause: %v; cleanup: %w", cause, cleanupErr))
	}
	return newError(CodeTransactionFailed, "Flow install transaction rolled back", cause)
}

func (service *Service) writeJournal(journal transactionJournal) error {
	kind := journalKind(journal)
	valid := journal.SchemaVersion == 1 && installIDPattern.MatchString(journal.InstallID) && filepath.Base(journal.Backup) == journal.Backup
	if kind == transactionInstall {
		valid = valid && journal.Stage != "" && filepath.Base(journal.Stage) == journal.Stage
	} else if kind == transactionUninstall {
		valid = valid && journal.PreviousRecord != nil && journal.PreviousRecord.InstallID == journal.InstallID
		if journal.DataBackup != "" {
			valid = valid && filepath.Base(journal.DataBackup) == journal.DataBackup
		}
	} else {
		valid = false
	}
	if !valid {
		return newError(CodeTransactionFailed, "refusing to write an invalid Flow transaction journal", nil)
	}
	data, err := json.Marshal(journal)
	if err != nil {
		return err
	}
	if err := writeAtomic(service.journalPath(journal.InstallID), append(data, '\n'), 0o600); err != nil {
		return newError(CodeTransactionFailed, "cannot persist Flow transaction journal", err)
	}
	return nil
}

func (service *Service) restorePreviousRecord(journal transactionJournal) error {
	if journal.PreviousRecord == nil {
		return service.Catalog.remove(journal.InstallID)
	}
	if journal.PreviousRecord.InstallID != journal.InstallID {
		return newError(CodeTransactionFailed, "previous Flow catalog record does not match transaction", nil)
	}
	return service.Catalog.write(*journal.PreviousRecord)
}

func (service *Service) journalPath(installID string) string {
	return filepath.Join(service.Roots.transactionsRoot(), installID+".json")
}

func decodeJournal(data []byte) (transactionJournal, error) {
	var journal transactionJournal
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&journal); err != nil {
		return journal, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return journal, fmt.Errorf("trailing transaction journal data")
	}
	return journal, nil
}

func pathIsRealDirectory(path string) bool {
	info, err := os.Lstat(path)
	return err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0
}

func compareSemver(left, right string) int {
	parse := func(value string) ([3]int, string) {
		var numeric [3]int
		withoutBuild := strings.SplitN(value, "+", 2)[0]
		parts := strings.SplitN(withoutBuild, "-", 2)
		for index, item := range strings.Split(parts[0], ".") {
			if index < 3 {
				numeric[index], _ = strconv.Atoi(item)
			}
		}
		pre := ""
		if len(parts) == 2 {
			pre = parts[1]
		}
		return numeric, pre
	}
	leftNumber, leftPre := parse(left)
	rightNumber, rightPre := parse(right)
	for index := range leftNumber {
		if leftNumber[index] < rightNumber[index] {
			return -1
		}
		if leftNumber[index] > rightNumber[index] {
			return 1
		}
	}
	if leftPre == rightPre {
		return 0
	}
	if leftPre == "" {
		return 1
	}
	if rightPre == "" {
		return -1
	}
	leftIdentifiers := strings.Split(leftPre, ".")
	rightIdentifiers := strings.Split(rightPre, ".")
	for index := 0; index < len(leftIdentifiers) && index < len(rightIdentifiers); index++ {
		leftItem, rightItem := leftIdentifiers[index], rightIdentifiers[index]
		leftNumber, leftErr := strconv.ParseUint(leftItem, 10, 64)
		rightNumber, rightErr := strconv.ParseUint(rightItem, 10, 64)
		switch {
		case leftErr == nil && rightErr == nil && leftNumber < rightNumber:
			return -1
		case leftErr == nil && rightErr == nil && leftNumber > rightNumber:
			return 1
		case leftErr == nil && rightErr != nil:
			return -1
		case leftErr != nil && rightErr == nil:
			return 1
		case leftItem < rightItem:
			return -1
		case leftItem > rightItem:
			return 1
		}
	}
	return len(leftIdentifiers) - len(rightIdentifiers)
}

type RunLease struct {
	Record  Record
	Root    string
	Entry   string
	DataDir string
	lease   *processlock.Lease
}

func (service *Service) AcquireRun(ctx context.Context, installID string) (*RunLease, error) {
	if !installIDPattern.MatchString(installID) {
		return nil, newError(CodeNotFound, "Flow installId is invalid", nil)
	}
	lease, err := processlock.Acquire(ctx, filepath.Join(service.Roots.locksRoot(), installID+".lock"), 25*time.Millisecond)
	if err != nil {
		return nil, err
	}
	fail := func(operationErr error) (*RunLease, error) {
		_ = lease.Close()
		return nil, operationErr
	}
	if err := service.recoverLocked(installID); err != nil {
		return fail(err)
	}
	record, err := service.Catalog.Load(installID)
	if err != nil {
		return fail(err)
	}
	if record.State != StateReady {
		return fail(newError(CodeNotReady, "Flow is not ready: "+string(record.State), nil))
	}
	root := filepath.Join(service.Roots.FlowRoot, installID)
	if record.Origin == "js" {
		if err := verifyLocalDirectory(root, record); err != nil {
			return fail(err)
		}
	} else {
		verified, verifyErr := flowpackage.VerifyDirectory(root)
		if verifyErr != nil {
			return fail(verifyErr)
		}
		if verified.ManifestDigest != record.ManifestDigest || verified.Manifest.FlowID != record.FlowID || verified.Manifest.Version != record.Version {
			return fail(newError(CodeTransactionFailed, "installed Flow no longer matches its catalog record", nil))
		}
		trusted, trustErr := service.Trust.Evaluate(verified.Manifest)
		if trustErr != nil || !trusted {
			if trustErr == nil {
				trustErr = newError(CodeTrustRequired, "installed Flow publisher is no longer trusted", nil)
			}
			return fail(trustErr)
		}
	}
	dataDir := filepath.Join(service.Roots.DataRoot, installID)
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return fail(newError(CodeTransactionFailed, "cannot create Flow data directory", err))
	}
	return &RunLease{
		Record: record, Root: root, Entry: filepath.Join(root, filepath.FromSlash(record.Entry)),
		DataDir: dataDir, lease: lease,
	}, nil
}

func (lease *RunLease) Close() error {
	if lease == nil || lease.lease == nil {
		return nil
	}
	err := lease.lease.Close()
	lease.lease = nil
	return err
}

func (service *Service) recoverUninstall(journal transactionJournal) error {
	target := filepath.Join(service.Roots.FlowRoot, journal.InstallID)
	backup := filepath.Join(service.Roots.FlowRoot, journal.Backup)
	dataTarget := filepath.Join(service.Roots.DataRoot, journal.InstallID)
	dataBackup := ""
	if journal.DataBackup != "" {
		dataBackup = filepath.Join(service.Roots.DataRoot, journal.DataBackup)
	}
	_, recordErr := service.Catalog.Load(journal.InstallID)
	catalogGone := CodeOf(recordErr) == CodeNotFound
	if catalogGone && !pathIsRealDirectory(target) {
		if err := removePackageTree(backup); err != nil {
			return newError(CodeTransactionFailed, "cannot finish committed Flow uninstall content cleanup", err)
		}
		if journal.RemoveData && dataBackup != "" {
			if err := os.RemoveAll(dataBackup); err != nil {
				return newError(CodeTransactionFailed, "cannot finish committed Flow uninstall data cleanup", err)
			}
		}
		if err := os.Remove(service.journalPath(journal.InstallID)); err != nil && !os.IsNotExist(err) {
			return newError(CodeTransactionFailed, "cannot remove committed Flow uninstall journal", err)
		}
		return nil
	}

	if pathIsRealDirectory(backup) {
		if pathIsRealDirectory(target) {
			return newError(CodeTransactionFailed, "Flow uninstall recovery found both active and rollback content", nil)
		}
		if err := os.Chmod(backup, 0o700); err != nil {
			return newError(CodeTransactionFailed, "cannot prepare Flow uninstall rollback content", err)
		}
		if err := os.Rename(backup, target); err != nil {
			return newError(CodeTransactionFailed, "cannot restore Flow content after interrupted uninstall", err)
		}
		if err := os.Chmod(target, 0o500); err != nil {
			return newError(CodeTransactionFailed, "cannot reseal restored Flow after interrupted uninstall", err)
		}
	}
	if journal.RemoveData && dataBackup != "" {
		if info, err := os.Lstat(dataBackup); err == nil {
			if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
				return newError(CodeTransactionFailed, "Flow uninstall data rollback is not a real directory", nil)
			}
			if _, err := os.Lstat(dataTarget); err == nil {
				return newError(CodeTransactionFailed, "Flow uninstall recovery found both active and rollback data", nil)
			} else if !os.IsNotExist(err) {
				return newError(CodeTransactionFailed, "cannot inspect Flow uninstall data target", err)
			}
			if err := os.Rename(dataBackup, dataTarget); err != nil {
				return newError(CodeTransactionFailed, "cannot restore Flow data after interrupted uninstall", err)
			}
		} else if !os.IsNotExist(err) {
			return newError(CodeTransactionFailed, "cannot inspect Flow uninstall data rollback", err)
		}
	}
	if err := service.restorePreviousRecord(journal); err != nil {
		return newError(CodeTransactionFailed, "cannot restore Flow catalog after interrupted uninstall", err)
	}
	if err := os.Remove(service.journalPath(journal.InstallID)); err != nil && !os.IsNotExist(err) {
		return newError(CodeTransactionFailed, "cannot remove recovered Flow uninstall journal", err)
	}
	return nil
}

func (service *Service) uninstallFail(journal transactionJournal, cause error) error {
	if err := service.recoverUninstall(journal); err != nil {
		return newError(CodeTransactionFailed, "Flow uninstall failed and recovery also failed", fmt.Errorf("cause: %v; recovery: %w", cause, err))
	}
	return newError(CodeTransactionFailed, "Flow uninstall transaction rolled back", cause)
}

func (service *Service) Uninstall(ctx context.Context, installID string, removeData bool) error {
	lease, err := processlock.Acquire(ctx, filepath.Join(service.Roots.locksRoot(), installID+".lock"), 25*time.Millisecond)
	if err != nil {
		return err
	}
	defer lease.Close()
	if err := service.recoverLocked(installID); err != nil {
		return err
	}
	current, err := service.Catalog.Load(installID)
	if err != nil {
		return err
	}
	nonce := strconv.FormatInt(time.Now().UnixNano(), 36)
	journal := transactionJournal{
		SchemaVersion: 1, Kind: transactionUninstall, InstallID: installID,
		Backup: ".rollback-uninstall-" + installID + "-" + nonce,
		Phase: transactionStaged, PreviousRecord: &current, RemoveData: removeData,
	}
	if removeData {
		journal.DataBackup = ".rollback-data-" + installID + "-" + nonce
	}
	if err := service.writeJournal(journal); err != nil {
		return err
	}

	target := filepath.Join(service.Roots.FlowRoot, installID)
	backup := filepath.Join(service.Roots.FlowRoot, journal.Backup)
	if !pathIsRealDirectory(target) {
		return service.uninstallFail(journal, newError(CodeTransactionFailed, "installed Flow content is missing or unsafe", nil))
	}
	if err := os.Chmod(target, 0o700); err != nil {
		return service.uninstallFail(journal, err)
	}
	if err := os.Rename(target, backup); err != nil {
		_ = os.Chmod(target, 0o500)
		return service.uninstallFail(journal, err)
	}
	if err := os.Chmod(backup, 0o500); err != nil {
		return service.uninstallFail(journal, err)
	}
	journal.Phase = transactionOldMoved
	if err := service.writeJournal(journal); err != nil {
		return service.uninstallFail(journal, err)
	}

	if removeData {
		dataTarget := filepath.Join(service.Roots.DataRoot, installID)
		dataBackup := filepath.Join(service.Roots.DataRoot, journal.DataBackup)
		if info, statErr := os.Lstat(dataTarget); statErr == nil {
			if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
				return service.uninstallFail(journal, newError(CodeTransactionFailed, "Flow data root is not a real directory", nil))
			}
			if err := os.Rename(dataTarget, dataBackup); err != nil {
				return service.uninstallFail(journal, err)
			}
		} else if !os.IsNotExist(statErr) {
			return service.uninstallFail(journal, statErr)
		}
		journal.Phase = transactionDataMoved
		if err := service.writeJournal(journal); err != nil {
			return service.uninstallFail(journal, err)
		}
	}

	if err := service.Catalog.remove(installID); err != nil {
		return service.uninstallFail(journal, err)
	}
	journal.Phase = transactionRecordCommitted
	if err := service.writeJournal(journal); err != nil {
		return service.uninstallFail(journal, err)
	}
	if err := service.recoverUninstall(journal); err != nil {
		return err
	}
	_ = syncDirectory(service.Roots.FlowRoot)
	_ = syncDirectory(service.Roots.recordsRoot())
	_ = syncDirectory(service.Roots.DataRoot)
	return nil
}
