package flowinstall

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/licensing"
)

func TestNeedsActivationUpdateDoesNotReplaceReadyVersion(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	readyPath, readyBuild := fixture.build(t, "flow-a", "Ready Flow", "0.5.0", []byte("ready-version"))
	if err := service.Trust.Approve(readyBuild.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	ready, err := service.Install(context.Background(), readyPath, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}

	service.ProtectedLoad = fixedProtectedFailure{err: licensing.NewError(licensing.CodeLicenseRequired, "activation required", nil)}
	candidate := buildUnlicensedProtectedFlow(t, fixture, "flow-a", []byte("protected candidate must not execute"))
	if _, err := service.Install(context.Background(), candidate, InstallOptions{AllowNeedsActivation: true}); CodeOf(err) != CodeActivationRequired {
		t.Fatalf("needs-activation update code = %q, error = %v", CodeOf(err), err)
	}

	current, err := service.Catalog.Load(ready.Record.InstallID)
	if err != nil {
		t.Fatal(err)
	}
	if current.Version != "0.5.0" || current.State != StateReady || current.ArchiveDigest != ready.Record.ArchiveDigest {
		t.Fatalf("ready record changed after blocked update: %#v", current)
	}
	content, err := os.ReadFile(filepath.Join(service.Roots.FlowRoot, current.InstallID, "payload", "main.js"))
	if err != nil || string(content) != "ready-version" {
		t.Fatalf("ready content changed after blocked update: %q, error=%v", content, err)
	}
}

func TestRecoverInterruptedUninstallRestoresCatalogContentAndData(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	packagePath, built := fixture.build(t, "flow-a", "Recover Uninstall", "1.0.0", []byte("v1"))
	if err := service.Trust.Approve(built.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), packagePath, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	dataRoot := filepath.Join(service.Roots.DataRoot, installed.Record.InstallID)
	if err := os.MkdirAll(dataRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataRoot, "state.txt"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}

	journal := transactionJournal{
		SchemaVersion: 1,
		Kind:          transactionUninstall,
		InstallID:     installed.Record.InstallID,
		Backup:        ".rollback-uninstall-test",
		DataBackup:    ".rollback-data-test",
		RemoveData:    true,
		Phase:         transactionStaged,
		PreviousRecord: &installed.Record,
	}
	if err := service.writeJournal(journal); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(service.Roots.FlowRoot, installed.Record.InstallID)
	backup := filepath.Join(service.Roots.FlowRoot, journal.Backup)
	if err := os.Chmod(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(target, backup); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(backup, 0o500); err != nil {
		t.Fatal(err)
	}
	dataBackup := filepath.Join(service.Roots.DataRoot, journal.DataBackup)
	if err := os.Rename(dataRoot, dataBackup); err != nil {
		t.Fatal(err)
	}
	journal.Phase = transactionDataMoved
	if err := service.writeJournal(journal); err != nil {
		t.Fatal(err)
	}

	if err := service.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	recovered, err := service.Catalog.Load(installed.Record.InstallID)
	if err != nil || recovered.ArchiveDigest != installed.Record.ArchiveDigest {
		t.Fatalf("recovered record = %#v, error=%v", recovered, err)
	}
	content, err := os.ReadFile(filepath.Join(target, "payload", "main.js"))
	if err != nil || string(content) != "v1" {
		t.Fatalf("recovered content = %q, error=%v", content, err)
	}
	data, err := os.ReadFile(filepath.Join(dataRoot, "state.txt"))
	if err != nil || string(data) != "keep" {
		t.Fatalf("recovered data = %q, error=%v", data, err)
	}
	if _, err := os.Stat(service.journalPath(installed.Record.InstallID)); !os.IsNotExist(err) {
		t.Fatalf("uninstall journal survived rollback recovery: %v", err)
	}
}

func TestRecoverUninstallAfterCatalogRemovalFinishesCommit(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	packagePath, built := fixture.build(t, "flow-a", "Commit Uninstall", "1.0.0", []byte("v1"))
	if err := service.Trust.Approve(built.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), packagePath, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	dataRoot := filepath.Join(service.Roots.DataRoot, installed.Record.InstallID)
	if err := os.MkdirAll(dataRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataRoot, "state.txt"), []byte("delete"), 0o600); err != nil {
		t.Fatal(err)
	}

	journal := transactionJournal{
		SchemaVersion: 1,
		Kind:          transactionUninstall,
		InstallID:     installed.Record.InstallID,
		Backup:        ".rollback-uninstall-commit-test",
		DataBackup:    ".rollback-data-commit-test",
		RemoveData:    true,
		Phase:         transactionDataMoved,
		PreviousRecord: &installed.Record,
	}
	target := filepath.Join(service.Roots.FlowRoot, installed.Record.InstallID)
	backup := filepath.Join(service.Roots.FlowRoot, journal.Backup)
	if err := os.Chmod(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(target, backup); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(backup, 0o500); err != nil {
		t.Fatal(err)
	}
	dataBackup := filepath.Join(service.Roots.DataRoot, journal.DataBackup)
	if err := os.Rename(dataRoot, dataBackup); err != nil {
		t.Fatal(err)
	}
	if err := service.writeJournal(journal); err != nil {
		t.Fatal(err)
	}
	// Simulate the hardest crash window: the catalog remove reached disk but
	// the committed phase update did not.
	if err := service.Catalog.remove(installed.Record.InstallID); err != nil {
		t.Fatal(err)
	}

	if err := service.Recover(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Catalog.Load(installed.Record.InstallID); CodeOf(err) != CodeNotFound {
		t.Fatalf("catalog was resurrected after committed uninstall: code=%q err=%v", CodeOf(err), err)
	}
	for _, path := range []string{target, backup, dataRoot, dataBackup, service.journalPath(installed.Record.InstallID)} {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Fatalf("committed uninstall residue %q: %v", path, err)
		}
	}
}

func TestUninstallPreservesDataByDefaultAndSharedPublisherTrust(t *testing.T) {
	service := newTestService(t)
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	firstPath, firstBuild := fixture.build(t, "flow-a", "First", "1.0.0", []byte("a"))
	secondPath, _ := fixture.build(t, "flow-b", "Second", "1.0.0", []byte("b"))
	if err := service.Trust.Approve(firstBuild.Manifest, TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	first, err := service.Install(context.Background(), firstPath, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Install(context.Background(), secondPath, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	dataRoot := filepath.Join(service.Roots.DataRoot, first.Record.InstallID)
	if err := os.MkdirAll(dataRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataRoot, "state.txt"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := service.Uninstall(context.Background(), first.Record.InstallID, false); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Catalog.Load(first.Record.InstallID); CodeOf(err) != CodeNotFound {
		t.Fatalf("uninstalled record still exists: code=%q err=%v", CodeOf(err), err)
	}
	if _, err := os.Stat(filepath.Join(dataRoot, "state.txt")); err != nil {
		t.Fatalf("default uninstall removed user data: %v", err)
	}
	if _, err := service.AcquireRun(context.Background(), second.Record.InstallID); err != nil {
		t.Fatalf("uninstall damaged sibling Flow or shared publisher trust: %v", err)
	}
}
