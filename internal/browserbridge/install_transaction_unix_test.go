//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func transactionFixture(t *testing.T) (Installation, []installMutation) {
	t.Helper()
	home := isolatedInstanceHome(t)
	unsetNativeInstance(t)
	binary := fakeExecutable(t, home)
	if _, err := Setup(testExtensionID, "chrome", "", binary); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Mkdir(filepath.Join(home, "updated"), 0700); err != nil {
		t.Fatal(err)
	}
	cfg.Executable = fakeExecutableAt(t, filepath.Join(home, "updated", "opendesk"))
	wrapper, _, err := expectedWrapper(cfg.Executable)
	if err != nil {
		t.Fatal(err)
	}
	config, _ := json.MarshalIndent(cfg, "", "  ")
	manifest, _ := ManifestFor(cfg.Browser, cfg.UserDataDir)
	m, _ := json.MarshalIndent(expectedManifest(cfg), "", "  ")
	files := []installMutation{{Path: filepath.Join(cfg.InstallRoot, "native-host"), Data: []byte(wrapper), Mode: 0700}, {Path: configPath(), Data: append(config, '\n'), Mode: 0600}, {Path: manifest, Data: append(m, '\n'), Mode: 0600}}
	for i := range files {
		f := &files[i]
		f.Before, err = os.ReadFile(f.Path)
		if err != nil {
			t.Fatal(err)
		}
		f.BeforeMode = f.Mode
		f.Existed = true
	}
	return cfg, files
}
func assertPreimages(t *testing.T, files []installMutation) {
	t.Helper()
	for _, f := range files {
		if !installationState(f, true) {
			t.Fatalf("preimage changed: %s", f.Path)
		}
	}
}

type cancelAfterMutation struct {
	context.Context
	file installMutation
}

func (c cancelAfterMutation) Err() error {
	if installationState(c.file, false) {
		return context.Canceled
	}
	return nil
}
func TestInstallCancellationRollsBackWholeUpdate(t *testing.T) {
	cfg, files := transactionFixture(t)
	_, err := withInstallationLock(context.Background(), func() (map[string]any, error) {
		return nil, commitInstallation(cancelAfterMutation{context.Background(), files[0]}, cfg, files)
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want cancellation: %v", err)
	}
	assertPreimages(t, files)
	dir, _ := installTransactionDir()
	if _, err = os.Lstat(filepath.Join(dir, "journal.json")); !os.IsNotExist(err) {
		t.Fatal("completed rollback retained journal")
	}
}
func simulateInterruptedInstall(t *testing.T, cfg Installation, files []installMutation) string {
	t.Helper()
	dir, _ := installTransactionDir()
	data, _ := json.Marshal(installationJournal{Format: "opendesk.native-install-transaction.v1", Config: cfg, Files: files})
	if err := writeAtomic(filepath.Join(dir, "journal.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	for _, f := range files[:2] {
		if err := writeAtomic(f.Path, f.Data, f.Mode); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}
func TestInstallRecoveryRejectsMixedLoadAndRestoresBytes(t *testing.T) {
	cfg, files := transactionFixture(t)
	simulateInterruptedInstall(t, cfg, files)
	if _, err := Load(); err == nil || err.Error() != "E_INSTALL_RECOVERY_REQUIRED" {
		t.Fatalf("mixed load: %v", err)
	}
	_, err := withInstallationLock(context.Background(), func() (map[string]any, error) { assertPreimages(t, files); return nil, nil })
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Load(); err != nil {
		t.Fatal(err)
	}
}
func TestInstallRecoveryPreservesUnrelatedBytes(t *testing.T) {
	cfg, files := transactionFixture(t)
	dir := simulateInterruptedInstall(t, cfg, files)
	foreign := []byte("#!/bin/sh\n# independent modification\n")
	if err := os.WriteFile(files[0].Path, foreign, 0700); err != nil {
		t.Fatal(err)
	}
	_, err := withInstallationLock(context.Background(), func() (map[string]any, error) { t.Fatal("must not enter setup"); return nil, nil })
	if err == nil || err.Error() != "E_INSTALL_RECOVERY_CONFLICT" {
		t.Fatalf("want recovery conflict: %v", err)
	}
	got, _ := os.ReadFile(files[0].Path)
	if !bytes.Equal(got, foreign) {
		t.Fatal("foreign bytes replaced")
	}
	if !installationState(files[1], false) {
		t.Fatal("partial recovery modified config before full preflight")
	}
	if _, err = os.Lstat(filepath.Join(dir, "journal.json")); err != nil {
		t.Fatal("lost recovery evidence")
	}
}
func TestConcurrentInstallFailsBeforeWriting(t *testing.T) {
	_, files := transactionFixture(t)
	_, err := withInstallationLock(context.Background(), func() (map[string]any, error) {
		_, err := Setup(testExtensionID, "chrome", "", "")
		if err == nil || err.Error() != "E_INSTALL_BUSY" {
			t.Fatalf("want lock contention: %v", err)
		}
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	assertPreimages(t, files)
}

func TestLoadSharesInstallationReadBarrier(t *testing.T) {
	_, files := transactionFixture(t)
	_, err := withInstallationLock(context.Background(), func() (map[string]any, error) {
		if _, err := Load(); err == nil || err.Error() != "E_INSTALL_BUSY" {
			t.Fatalf("reader entered exclusive transaction: %v", err)
		}
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	assertPreimages(t, files)
}
func TestRecoveryRejectsSemanticallyForgedPreimage(t *testing.T) {
	cfg, files := transactionFixture(t)
	simulateInterruptedInstall(t, cfg, files)
	files[0].Before = []byte("#!/bin/sh\nexec /tmp/foreign-host\n")
	dir, _ := installTransactionDir()
	data, _ := json.Marshal(installationJournal{Format: "opendesk.native-install-transaction.v1", Config: cfg, Files: files})
	if err := writeAtomic(filepath.Join(dir, "journal.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	_, err := withInstallationLock(context.Background(), func() (map[string]any, error) { t.Fatal("entered corrupted recovery"); return nil, nil })
	if err == nil || err.Error() != "E_INSTALL_JOURNAL" {
		t.Fatalf("accepted corrupt preimage: %v", err)
	}
	for _, f := range files[:2] {
		if !installationState(f, false) {
			t.Fatal("modified live state before semantic preflight")
		}
	}
}
func TestDefaultAndNamedDefaultHaveSeparateJournalAndSharedLock(t *testing.T) {
	home := isolatedInstanceHome(t)
	unsetNativeInstance(t)
	first, _ := installTransactionDir()
	binary := fakeExecutable(t, home)
	profile := cftProfile(t, home, "shared")
	_, err := withInstallationLock(context.Background(), func() (map[string]any, error) {
		t.Setenv("OPENDESK_NATIVE_INSTANCE", "default")
		second, _ := installTransactionDir()
		if first == second {
			t.Fatal("journal namespace collision")
		}
		if _, err := Setup(testExtensionID, "cft", profile, binary); err == nil || err.Error() != "E_INSTALL_BUSY" {
			t.Fatalf("instances bypass shared resource lock: %v", err)
		}
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
func TestInstallWriteFailureRollsBackAndPreservesUnknownStagingFile(t *testing.T) {
	cfg, files := transactionFixture(t)
	unknown := files[2].Path + ".new"
	if err := os.WriteFile(unknown, []byte("other writer"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := withInstallationLock(context.Background(), func() (map[string]any, error) { return nil, commitInstallation(context.Background(), cfg, files) })
	if err == nil || err.Error() != "E_INSTALL_CONFLICT" {
		t.Fatalf("want staging conflict: %v", err)
	}
	assertPreimages(t, files)
	got, _ := os.ReadFile(unknown)
	if string(got) != "other writer" {
		t.Fatal("foreign staging removed")
	}
	for _, f := range files {
		matches, _ := filepath.Glob(filepath.Join(filepath.Dir(f.Path), "."+filepath.Base(f.Path)+".r2-*"))
		if len(matches) > 0 {
			t.Fatalf("temporary files retained: %v", matches)
		}
	}
}
