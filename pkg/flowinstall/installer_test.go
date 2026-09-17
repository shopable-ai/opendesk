package flowinstall

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"opendesk/pkg/flowpackage"
)

type flowFixture struct {
	publicKey  ed25519.PublicKey
	privateKey ed25519.PrivateKey
	publisher  string
	keyID      string
}

func newFlowFixture(t *testing.T, publisher, keyID string) flowFixture {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return flowFixture{publicKey: publicKey, privateKey: privateKey, publisher: publisher, keyID: keyID}
}

func TestInstallRequiresExplicitTrustAndDoesNotExecute(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	marker := filepath.Join(t.TempDir(), "must-not-exist")
	packagePath, built := fixture.build(t, "flow-a", "Visible Flow Name", "1.0.0", []byte("require('fs').writeFileSync("+quoteJS(marker)+", 'executed')"))

	if _, err := service.Install(context.Background(), packagePath, InstallOptions{}); CodeOf(err) != CodeTrustRequired {
		t.Fatalf("Install() without approval code = %q, error = %v", CodeOf(err), err)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("installation executed business JavaScript; marker stat error = %v", err)
	}
	result, err := service.Install(context.Background(), packagePath, InstallOptions{
		Approver: func(context.Context, TrustCandidate) (TrustDecision, error) { return DecisionFlow, nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Record.Name != "Visible Flow Name" || result.Record.State != StateReady {
		t.Fatalf("record = %#v", result.Record)
	}
	if result.Record.ArchiveDigest != built.ArchiveDigest {
		t.Fatal("catalog did not retain verified archive digest")
	}
	installedRoot := filepath.Join(service.Roots.FlowRoot, result.Record.InstallID)
	if _, err := os.Stat(filepath.Join(installedRoot, flowpackage.ManifestName)); err != nil {
		t.Fatalf("installed manifest: %v", err)
	}
	if _, err := os.Stat(filepath.Join(installedRoot, result.Record.Version)); !os.IsNotExist(err) {
		t.Fatalf("installer created a forbidden version directory: %v", err)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("installation executed business JavaScript; marker stat error = %v", err)
	}
	listed, err := service.Catalog.List()
	if err != nil || len(listed) != 1 || listed[0].Name != "Visible Flow Name" {
		t.Fatalf("catalog list = %#v, error = %v", listed, err)
	}
}

func TestTrustScopesAndSameNameDifferentKey(t *testing.T) {
	roots := RootsFromAppData(t.TempDir())
	if err := roots.Ensure(); err != nil {
		t.Fatal(err)
	}
	store := TrustStore{Root: roots.TrustRoot}
	first := newFlowFixture(t, "publisher-a", "key-a")
	otherKey := newFlowFixture(t, "publisher-a", "key-b")
	manifestA := trustManifest(first, "flow-a")
	manifestB := trustManifest(first, "flow-b")
	impersonator := trustManifest(otherKey, "flow-a")

	if err := store.Approve(manifestA, TrustScopeFlow, TrustTest); err != nil {
		t.Fatal(err)
	}
	assertTrust(t, store, manifestA, true)
	assertTrust(t, store, manifestB, false)
	assertTrust(t, store, impersonator, false)
	if err := store.Approve(manifestA, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	assertTrust(t, store, manifestB, true)
	assertTrust(t, store, impersonator, false)
}

func TestPublisherKeyRotationRetiresOldKeyAndHonorsRevocation(t *testing.T) {
	roots := RootsFromAppData(t.TempDir())
	if err := roots.Ensure(); err != nil {
		t.Fatal(err)
	}
	store := TrustStore{Root: roots.TrustRoot}
	oldKey := newFlowFixture(t, "publisher-a", "key-old")
	newKey := newFlowFixture(t, "publisher-a", "key-new")
	oldManifest := trustManifest(oldKey, "flow-a")
	newManifest := trustManifest(newKey, "flow-a")
	if err := store.Approve(oldManifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	statement := RotationStatement{
		SchemaVersion: 1, PublisherID: "publisher-a", Usage: TrustUsageFlowSign,
		OldKeyID: oldKey.keyID, OldFingerprint: oldManifest.PublisherFingerprint,
		NewKeyID: newKey.keyID, NewFingerprint: newManifest.PublisherFingerprint, Sequence: 2,
	}
	message := statement.message()
	statement.OldSignature = hex.EncodeToString(ed25519.Sign(oldKey.privateKey, message))
	statement.NewProof = hex.EncodeToString(ed25519.Sign(newKey.privateKey, message))
	if err := store.ApplyRotation(context.Background(), statement, oldKey.publicKey, newKey.publicKey); err != nil {
		t.Fatal(err)
	}
	assertTrust(t, store, oldManifest, false)
	assertTrust(t, store, newManifest, true)
	if err := store.Revoke("publisher-a", newKey.keyID, newManifest.PublisherFingerprint, TrustTest, 3); err != nil {
		t.Fatal(err)
	}
	trusted, err := store.Evaluate(newManifest)
	if trusted || CodeOf(err) != CodePublisherRevoked {
		t.Fatalf("revoked key trusted = %v, code = %q, error = %v", trusted, CodeOf(err), err)
	}
}

func TestOfficialProofRequiresConfiguredPurposeSpecificRoot(t *testing.T) {
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	packagePath, built := fixture.build(t, "flow-official", "Official Test Flow", "1.0.0", []byte("ok"))
	rootPublic, rootPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	proof := AuthorityProof{
		SchemaVersion: 1, Source: TrustOfficial, RootKeyID: "official-test-root", Usage: authorityProofUsage,
		PublisherID: built.Manifest.PublisherID, PublisherKeyID: built.Manifest.PublisherKeyID,
		PublisherFingerprint: built.Manifest.PublisherFingerprint, FlowID: built.Manifest.FlowID,
		Version: built.Manifest.Version, ManifestDigest: built.ManifestDigest, ArchiveDigest: built.ArchiveDigest,
		ExpiresAt: now.Add(time.Hour).Format(time.RFC3339),
	}
	proof.Signature = hex.EncodeToString(ed25519.Sign(rootPrivate, authorityProofMessage(proof)))

	productionDefault := newTestService(t)
	if _, err := productionDefault.Install(context.Background(), packagePath, InstallOptions{AuthorityProof: &proof}); CodeOf(err) != CodeTrustRequired {
		t.Fatalf("unconfigured official root code = %q, error = %v", CodeOf(err), err)
	}

	configured := newTestService(t)
	configured.Authorities = AuthorityVerifier{
		OfficialRoots: map[string]ed25519.PublicKey{"official-test-root": rootPublic},
		Now:           func() time.Time { return now },
	}
	result, err := configured.Install(context.Background(), packagePath, InstallOptions{AuthorityProof: &proof})
	if err != nil || result.Record.State != StateReady {
		t.Fatalf("verified authority install = %#v, error = %v", result, err)
	}
	otherPath, _ := fixture.build(t, "flow-other", "Other Flow", "1.0.0", []byte("other"))
	if _, err := configured.Install(context.Background(), otherPath, InstallOptions{}); CodeOf(err) != CodeTrustRequired {
		t.Fatalf("package-specific official proof leaked trust to another Flow: code = %q, error = %v", CodeOf(err), err)
	}

	selfClaimed := newTestService(t)
	if _, err := selfClaimed.Install(context.Background(), packagePath, InstallOptions{
		Approver:    func(context.Context, TrustCandidate) (TrustDecision, error) { return DecisionFlow, nil },
		TrustSource: TrustOfficial,
	}); CodeOf(err) != CodeTransactionFailed {
		t.Fatalf("self-claimed official source code = %q, error = %v", CodeOf(err), err)
	}
	records, err := selfClaimed.Catalog.List()
	if err != nil || len(records) != 0 {
		t.Fatalf("self-claimed official package survived rollback: records=%#v error=%v", records, err)
	}
}

func TestInstallVersionConflictUpdateAndDataPreservation(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	v1Path, v1 := fixture.build(t, "flow-a", "Versioned Flow", "1.0.0", []byte("v1"))
	if err := service.Trust.Approve(v1.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), v1Path, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	dataFile := filepath.Join(service.Roots.DataRoot, installed.Record.InstallID, "state.json")
	if err := os.MkdirAll(filepath.Dir(dataFile), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dataFile, []byte("persistent"), 0o600); err != nil {
		t.Fatal(err)
	}
	conflictPath, _ := fixture.build(t, "flow-a", "Versioned Flow", "1.0.0", []byte("different"))
	if _, err := service.Install(context.Background(), conflictPath, InstallOptions{}); CodeOf(err) != CodeVersionConflict {
		t.Fatalf("same-version conflict code = %q, error = %v", CodeOf(err), err)
	}
	v2Path, _ := fixture.build(t, "flow-a", "Versioned Flow", "2.0.0", []byte("v2"))
	updated, err := service.Install(context.Background(), v2Path, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !updated.Updated || updated.Record.Version != "2.0.0" {
		t.Fatalf("update result = %#v", updated)
	}
	content, err := os.ReadFile(filepath.Join(service.Roots.FlowRoot, updated.Record.InstallID, "payload", "main.js"))
	if err != nil || string(content) != "v2" {
		t.Fatalf("installed source = %q, error = %v", content, err)
	}
	data, err := os.ReadFile(dataFile)
	if err != nil || string(data) != "persistent" {
		t.Fatalf("business data = %q, error = %v", data, err)
	}
	if _, err := service.Install(context.Background(), v1Path, InstallOptions{}); CodeOf(err) != CodeDowngradeDenied {
		t.Fatalf("downgrade code = %q, error = %v", CodeOf(err), err)
	}
}

func TestConcurrentInstallProducesOneCompleteReadyRecord(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	packagePath, built := fixture.build(t, "flow-a", "Concurrent Flow", "1.0.0", []byte("complete"))
	if err := service.Trust.Approve(built.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	var wait sync.WaitGroup
	results := make(chan InstallResult, 2)
	errors := make(chan error, 2)
	for index := 0; index < 2; index++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			result, err := service.Install(context.Background(), packagePath, InstallOptions{})
			results <- result
			errors <- err
		}()
	}
	wait.Wait()
	close(results)
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent Install() error = %v", err)
		}
	}
	idempotent := 0
	for result := range results {
		if result.Idempotent {
			idempotent++
		}
	}
	if idempotent != 1 {
		t.Fatalf("idempotent result count = %d, want 1", idempotent)
	}
	records, err := service.Catalog.List()
	if err != nil || len(records) != 1 || records[0].State != StateReady {
		t.Fatalf("records = %#v, error = %v", records, err)
	}
	entries, err := os.ReadDir(service.Roots.FlowRoot)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() != records[0].InstallID {
			t.Fatalf("leftover transaction entry %q", entry.Name())
		}
	}
}

func TestRunLeasePinsInstalledSnapshotDuringUpdate(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	v1Path, v1 := fixture.build(t, "flow-a", "Pinned Flow", "1.0.0", []byte("v1"))
	if err := service.Trust.Approve(v1.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), v1Path, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	run, err := service.AcquireRun(context.Background(), installed.Record.InstallID)
	if err != nil {
		t.Fatal(err)
	}
	v2Path, _ := fixture.build(t, "flow-a", "Pinned Flow", "2.0.0", []byte("v2"))
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	if _, err := service.Install(ctx, v2Path, InstallOptions{}); CodeOf(err) != CodeTransactionFailed {
		t.Fatalf("update while running code = %q, error = %v", CodeOf(err), err)
	}
	content, err := os.ReadFile(run.Entry)
	if err != nil || string(content) != "v1" {
		t.Fatalf("pinned entry = %q, error = %v", content, err)
	}
	if err := run.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Install(context.Background(), v2Path, InstallOptions{}); err != nil {
		t.Fatal(err)
	}
}

func TestRecoverRollsBackUnrecordedCommit(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	v1Path, v1 := fixture.build(t, "flow-a", "Recovered Flow", "1.0.0", []byte("v1"))
	if err := service.Trust.Approve(v1.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), v1Path, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	v2Path, v2 := fixture.build(t, "flow-a", "Recovered Flow", "2.0.0", []byte("v2"))
	v2Package, err := flowpackage.ReadFile(v2Path)
	if err != nil {
		t.Fatal(err)
	}
	stageName := ".staging-recovery"
	stage := filepath.Join(service.Roots.FlowRoot, stageName)
	if err := os.Mkdir(stage, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := extractPackage(stage, v2Package); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(service.Roots.FlowRoot, installed.Record.InstallID)
	backupName := ".rollback-recovery"
	backup := filepath.Join(service.Roots.FlowRoot, backupName)
	if err := os.Chmod(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(target, backup); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(backup, 0o500); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(stage, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(stage, target); err != nil {
		t.Fatal(err)
	}
	newRecord := installed.Record
	newRecord.Version = "2.0.0"
	newRecord.ArchiveDigest = v2.ArchiveDigest
	newRecord.ManifestDigest = v2.ManifestDigest
	oldRecord := installed.Record
	journal := transactionJournal{
		SchemaVersion: 1, InstallID: installed.Record.InstallID, Stage: stageName, Backup: backupName,
		Phase: transactionNewCommitted, NewRecord: newRecord, PreviousRecord: &oldRecord,
	}
	if err := service.writeJournal(journal); err != nil {
		t.Fatal(err)
	}
	if err := service.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	recovered, err := service.Catalog.Load(installed.Record.InstallID)
	if err != nil || recovered.Version != "1.0.0" {
		t.Fatalf("recovered record = %#v, error = %v", recovered, err)
	}
	content, err := os.ReadFile(filepath.Join(target, "payload", "main.js"))
	if err != nil || string(content) != "v1" {
		t.Fatalf("recovered source = %q, error = %v", content, err)
	}
}

func TestRecoverResealsPreviousTargetAfterPreRenameCrash(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	v1Path, v1 := fixture.build(t, "flow-a", "Reseal Flow", "1.0.0", []byte("v1"))
	if err := service.Trust.Approve(v1.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), v1Path, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}

	stage := filepath.Join(service.Roots.FlowRoot, ".staging-before-rename")
	if err := os.Mkdir(stage, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := extractPackage(stage, mustReadFlowPackage(t, v1Path)); err != nil {
		t.Fatal(err)
	}
	if err := sealPackageTree(stage); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(service.Roots.FlowRoot, installed.Record.InstallID)
	if err := os.Chmod(target, 0o700); err != nil {
		t.Fatal(err)
	}
	journal := transactionJournal{
		SchemaVersion: 1, InstallID: installed.Record.InstallID, Stage: filepath.Base(stage),
		Backup: ".rollback-before-rename", Phase: transactionStaged,
		NewRecord: installed.Record, PreviousRecord: &installed.Record,
	}
	if err := service.writeJournal(journal); err != nil {
		t.Fatal(err)
	}
	if err := service.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o500 {
		t.Fatalf("recovered target permissions = %o, want 500", info.Mode().Perm())
	}
	if _, err := os.Stat(stage); !os.IsNotExist(err) {
		t.Fatalf("staging directory survived recovery: %v", err)
	}
}

func TestRecoverRestoresAndCleansReadOnlyOldMovedPhase(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	v1Path, v1 := fixture.build(t, "flow-a", "Restore Flow", "1.0.0", []byte("v1"))
	if err := service.Trust.Approve(v1.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), v1Path, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	v2Path, v2 := fixture.build(t, "flow-a", "Restore Flow", "2.0.0", []byte("v2"))
	stage := filepath.Join(service.Roots.FlowRoot, ".staging-old-moved")
	if err := os.Mkdir(stage, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := extractPackage(stage, mustReadFlowPackage(t, v2Path)); err != nil {
		t.Fatal(err)
	}
	if err := sealPackageTree(stage); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(service.Roots.FlowRoot, installed.Record.InstallID)
	backup := filepath.Join(service.Roots.FlowRoot, ".rollback-old-moved")
	if err := os.Chmod(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(target, backup); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(backup, 0o500); err != nil {
		t.Fatal(err)
	}
	journal := transactionJournal{
		SchemaVersion: 1, InstallID: installed.Record.InstallID, Stage: filepath.Base(stage),
		Backup: filepath.Base(backup), Phase: transactionOldMoved,
		NewRecord:      Record{SchemaVersion: 1, InstallID: installed.Record.InstallID, FlowID: v2.Manifest.FlowID, Name: v2.Manifest.Name, Version: v2.Manifest.Version, Entry: v2.Manifest.Entry, ArchiveDigest: v2.ArchiveDigest, ManifestDigest: v2.ManifestDigest, State: StateReady, Origin: "odflow"},
		PreviousRecord: &installed.Record,
	}
	if err := service.writeJournal(journal); err != nil {
		t.Fatal(err)
	}
	if err := service.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	recovered, err := service.Catalog.Load(installed.Record.InstallID)
	if err != nil || recovered.Version != "1.0.0" {
		t.Fatalf("recovered record = %#v, error = %v", recovered, err)
	}
	content, err := os.ReadFile(filepath.Join(target, "payload", "main.js"))
	if err != nil || string(content) != "v1" {
		t.Fatalf("recovered source = %q, error = %v", content, err)
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatalf("rollback directory survived recovery: %v", err)
	}
}

func TestRecoverCleansReadOnlyBackupAfterRecordCommit(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	v1Path, v1 := fixture.build(t, "flow-a", "Commit Cleanup Flow", "1.0.0", []byte("v1"))
	if err := service.Trust.Approve(v1.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), v1Path, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	v2Path, v2 := fixture.build(t, "flow-a", "Commit Cleanup Flow", "2.0.0", []byte("v2"))
	stage := filepath.Join(service.Roots.FlowRoot, ".staging-record-committed")
	if err := os.Mkdir(stage, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := extractPackage(stage, mustReadFlowPackage(t, v2Path)); err != nil {
		t.Fatal(err)
	}
	if err := sealPackageTree(stage); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(service.Roots.FlowRoot, installed.Record.InstallID)
	backup := filepath.Join(service.Roots.FlowRoot, ".rollback-record-committed")
	if err := os.Chmod(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(target, backup); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(backup, 0o500); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(stage, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(stage, target); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(target, 0o500); err != nil {
		t.Fatal(err)
	}
	newRecord := installed.Record
	newRecord.Version = v2.Manifest.Version
	newRecord.ArchiveDigest = v2.ArchiveDigest
	newRecord.ManifestDigest = v2.ManifestDigest
	if err := service.Catalog.write(newRecord); err != nil {
		t.Fatal(err)
	}
	journal := transactionJournal{
		SchemaVersion: 1, InstallID: installed.Record.InstallID, Stage: filepath.Base(stage),
		Backup: filepath.Base(backup), Phase: transactionRecordCommitted,
		NewRecord: newRecord, PreviousRecord: &installed.Record,
	}
	if err := service.writeJournal(journal); err != nil {
		t.Fatal(err)
	}
	if err := service.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatalf("committed backup survived recovery: %v", err)
	}
	recovered, err := service.Catalog.Load(installed.Record.InstallID)
	if err != nil || recovered.Version != "2.0.0" {
		t.Fatalf("committed record = %#v, error = %v", recovered, err)
	}
}

func mustReadFlowPackage(t *testing.T, path string) *flowpackage.Package {
	t.Helper()
	result, err := flowpackage.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestCompareSemverUsesSemanticPrereleaseOrdering(t *testing.T) {
	ordered := []string{"1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"}
	for index := 0; index < len(ordered)-1; index++ {
		if compareSemver(ordered[index], ordered[index+1]) >= 0 {
			t.Fatalf("compareSemver(%q, %q) is not less", ordered[index], ordered[index+1])
		}
	}
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	service, err := NewService(RootsFromAppData(t.TempDir()))
	if err != nil {
		t.Fatal(err)
	}
	cleanupInstalledTestFlows(t, service)
	return service
}

func cleanupInstalledTestFlows(t *testing.T, service *Service) {
	t.Helper()
	t.Cleanup(func() {
		entries, err := os.ReadDir(service.Roots.FlowRoot)
		if err != nil {
			return
		}
		for _, entry := range entries {
			_ = removePackageTree(filepath.Join(service.Roots.FlowRoot, entry.Name()))
		}
	})
}

func (fixture flowFixture) build(t *testing.T, flowID, name, version string, source []byte) (string, *flowpackage.BuildResult) {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "payload"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "payload", "main.js"), source, 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := flowpackage.Build(flowpackage.BuildOptions{
		SourceRoot: root, FlowID: flowID, Name: name, Version: version,
		PublisherID: fixture.publisher, PublisherKeyID: fixture.keyID, Entry: "payload/main.js",
		MinimumRuntimeVersion: "0.0.0", Platforms: []string{runtime.GOOS},
		Files: []string{"payload/main.js"},
		PublisherPublicKey: fixture.publicKey, PublisherPrivateKey: fixture.privateKey,
	})
	if err != nil {
		t.Fatal(err)
	}
	packagePath := filepath.Join(t.TempDir(), flowID+"-"+version+".odflow")
	if err := flowpackage.WriteFileExclusive(packagePath, result); err != nil {
		t.Fatal(err)
	}
	return packagePath, result
}

func trustManifest(fixture flowFixture, flowID string) flowpackage.Manifest {
	return flowpackage.Manifest{
		FlowID: flowID, PublisherID: fixture.publisher, PublisherKeyID: fixture.keyID,
		PublisherFingerprint: flowpackage.PublicKeyFingerprint(fixture.publicKey),
	}
}

func assertTrust(t *testing.T, store TrustStore, manifest flowpackage.Manifest, want bool) {
	t.Helper()
	got, err := store.Evaluate(manifest)
	if err != nil || got != want {
		t.Fatalf("Evaluate(%s/%s) = %v, error = %v, want %v", manifest.PublisherID, manifest.FlowID, got, err, want)
	}
}

func quoteJS(value string) string {
	quoted := "'"
	for _, character := range value {
		switch character {
		case '\\':
			quoted += `\\`
		case '\'':
			quoted += `\'`
		default:
			quoted += string(character)
		}
	}
	return quoted + "'"
}
