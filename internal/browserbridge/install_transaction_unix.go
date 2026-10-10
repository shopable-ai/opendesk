//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

type installMutation struct {
	Path       string
	Data       []byte
	Mode       os.FileMode
	Before     []byte
	BeforeMode os.FileMode
	Existed    bool
}
type installationJournal struct {
	Format string
	Config Installation
	Files  []installMutation
}

func installTransactionDir() (string, error) {
	base, err := browserBaseDir()
	if err != nil {
		return "", err
	}
	instance, _, err := nativeInstance()
	if err != nil {
		return "", err
	}
	if instance == "" {
		instance = "default"
	} else {
		instance = "instance-" + instance
	}
	return filepath.Join(base, "install-transactions-r2", instance), nil
}
func syncDirectory(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}

// Persist every newly created directory entry before publishing a journal or
// installation target. Syncing only the leaf cannot survive loss of its parent.
func mkdirDurable(path string, mode os.FileMode) error {
	for p := path; ; p = filepath.Dir(p) {
		if _, err := os.Lstat(p); err == nil {
			break
		} else if !os.IsNotExist(err) {
			return err
		}
		if parent := filepath.Dir(p); parent == p {
			return errors.New("E_INSTALL_PATH")
		}
	}
	if err := os.MkdirAll(path, mode); err != nil {
		return err
	}
	// A failed previous attempt can leave existing directory entries that were
	// never persisted. Fence those entries again before publishing a journal.
	for p := path; ; p = filepath.Dir(p) {
		if err := syncDirectory(p); err != nil {
			return err
		}
		info, err := os.Stat(p)
		if err != nil {
			return err
		}
		if !userOwned(info) || filepath.Dir(p) == p {
			break
		}
	}
	return nil
}

// Every install/update/recovery shares one process-independent lock. The
// transaction lives outside the legacy installation, which remains untouched.
func withInstallationLock(ctx context.Context, fn func() (map[string]any, error)) (map[string]any, error) {
	return withInstallLock(ctx, true, fn)
}
func withInstallLock(ctx context.Context, exclusive bool, fn func() (map[string]any, error)) (map[string]any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if _, err := ensureBrowserBaseDir(); err != nil {
		return nil, err
	}
	dir, err := installTransactionDir()
	if err != nil {
		return nil, err
	}
	for _, p := range []string{filepath.Dir(dir), dir} {
		if err = ensureDir(p); err != nil {
			return nil, err
		}
	}
	// Manifests are shared by Profile across named instances as well.
	file := filepath.Join(filepath.Dir(dir), "installation.lock")
	fd, err := syscall.Open(file, syscall.O_CREAT|syscall.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), file)
	defer f.Close()
	if _, err = requireRegular(file, 0600); err != nil {
		return nil, err
	}
	operation := syscall.LOCK_SH
	if exclusive {
		operation = syscall.LOCK_EX
	}
	if err = syscall.Flock(fd, operation|syscall.LOCK_NB); err != nil {
		return nil, errors.New("E_INSTALL_BUSY")
	}
	defer syscall.Flock(fd, syscall.LOCK_UN)
	if exclusive {
		if err = recoverInstallation(dir); err != nil {
			return nil, err
		}
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	return fn()
}

func installationState(file installMutation, before bool) bool {
	data, mode, exists := file.Data, file.Mode, true
	if before {
		data, mode, exists = file.Before, file.BeforeMode, file.Existed
	}
	info, err := os.Lstat(file.Path)
	if !exists {
		return os.IsNotExist(err)
	}
	if err != nil {
		return false
	}
	if _, err = requireRegular(file.Path, mode); err != nil || info.Size() != int64(len(data)) {
		return false
	}
	current, err := os.ReadFile(file.Path)
	return err == nil && bytes.Equal(current, data)
}

// A corrupt journal cannot introduce paths. Check every preimage before any
// rollback, and never replace bytes changed by an unrelated writer.
func validateJournal(j installationJournal) error {
	root, err := installRootChecked()
	if err != nil {
		return err
	}
	c := j.Config
	if j.Format != "opendesk.native-install-transaction.v1" || c.Name != HostName || c.SocketPath != filepath.Join(root, "agent.sock") || !filepath.IsAbs(c.Executable) || c.InstallRoot != root || c.Provider != "opendesk" || !ExtensionIDValid(c.ExtensionID) || !CredentialValid(c.ClientCredential) {
		return errors.New("E_INSTALL_JOURNAL")
	}
	manifest, err := ManifestFor(c.Browser, c.UserDataDir)
	if err != nil {
		return err
	}
	wrapper, _, err := expectedWrapper(c.Executable)
	if err != nil {
		return err
	}
	expected := []string{filepath.Join(root, "native-host"), filepath.Join(root, "install.json"), manifest}
	if len(j.Files) != 3 {
		return errors.New("E_INSTALL_JOURNAL")
	}
	for i, f := range j.Files {
		if len(f.Before) > 65536 || len(f.Data) > 65536 {
			return errors.New("E_INSTALL_JOURNAL")
		}
		mode := os.FileMode(0600)
		if i == 0 {
			mode = 0700
		}
		if f.Path != expected[i] || f.Mode != mode || (f.Existed && f.BeforeMode != mode) {
			return errors.New("E_INSTALL_JOURNAL")
		}
		if !installationState(f, true) && !installationState(f, false) {
			return errors.New("E_INSTALL_RECOVERY_CONFLICT")
		}
	}
	if !bytes.Equal(j.Files[0].Data, []byte(wrapper)) {
		return errors.New("E_INSTALL_JOURNAL")
	}
	var saved Installation
	if json.Unmarshal(j.Files[1].Data, &saved) != nil || saved != c {
		return errors.New("E_INSTALL_JOURNAL")
	}
	want, _ := json.MarshalIndent(expectedManifest(c), "", "  ")
	if !bytes.Equal(j.Files[2].Data, append(want, '\n')) {
		return errors.New("E_INSTALL_JOURNAL")
	}
	// Validate both generations; a corrupt journal may not restore foreign bytes.
	existed := 0
	for _, f := range j.Files {
		if f.Existed {
			existed++
		} else if len(f.Before) > 0 || f.BeforeMode != 0 {
			return errors.New("E_INSTALL_JOURNAL")
		}
	}
	if existed != 0 && existed != 3 {
		return errors.New("E_INSTALL_JOURNAL")
	}
	if existed == 3 {
		var prior Installation
		if json.Unmarshal(j.Files[1].Before, &prior) != nil || prior.Name != HostName || prior.Provider != c.Provider || prior.InstallRoot != c.InstallRoot || prior.SocketPath != c.SocketPath || prior.ExtensionID != c.ExtensionID || prior.Browser != c.Browser || prior.UserDataDir != c.UserDataDir || prior.ClientCredential != c.ClientCredential || !filepath.IsAbs(prior.Executable) {
			return errors.New("E_INSTALL_JOURNAL")
		}
		oldWrapper, legacy, err := expectedWrapper(prior.Executable)
		if err != nil {
			return err
		}
		if string(j.Files[0].Before) != oldWrapper && (legacy == "" || string(j.Files[0].Before) != legacy) {
			return errors.New("E_INSTALL_JOURNAL")
		}
		if err = validateManifestBytes(j.Files[2].Before, prior); err != nil {
			return errors.New("E_INSTALL_JOURNAL")
		}
	}
	return nil
}
func rollbackInstallation(j installationJournal) error {
	if err := validateJournal(j); err != nil {
		return err
	}
	for i := len(j.Files) - 1; i >= 0; i-- {
		f := j.Files[i]
		if installationState(f, true) {
			continue
		}
		var err error
		if f.Existed {
			err = writeAtomic(f.Path, f.Before, f.BeforeMode)
		} else {
			err = os.Remove(f.Path)
			if err == nil {
				err = syncDirectory(filepath.Dir(f.Path))
			}
		}
		if err != nil {
			return err
		}
	}
	return nil
}
func recoverInstallation(dir string) error {
	path := filepath.Join(dir, "journal.json")
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err = requireRegular(path, 0600); err != nil {
		return err
	}
	if info.Size() > 1024*1024 {
		return errors.New("E_INSTALL_JOURNAL")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var j installationJournal
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if !json.Valid(data) || decoder.Decode(&j) != nil {
		return errors.New("E_INSTALL_JOURNAL")
	}
	if err = rollbackInstallation(j); err != nil {
		return err
	}
	if err = os.Remove(path); err != nil {
		return err
	}
	return syncDirectory(dir)
}
func commitInstallation(ctx context.Context, cfg Installation, files []installMutation) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	for i := range files {
		f := &files[i]
		info, err := os.Lstat(f.Path)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		if _, err = requireRegular(f.Path, f.Mode); err != nil {
			return err
		}
		if info.Size() > 65536 {
			return errors.New("E_INSTALL_CONFLICT")
		}
		f.Before, err = os.ReadFile(f.Path)
		if err != nil {
			return err
		}
		f.BeforeMode = info.Mode().Perm()
		f.Existed = true
	}
	j := installationJournal{Format: "opendesk.native-install-transaction.v1", Config: cfg, Files: files}
	if err := validateJournal(j); err != nil {
		return err
	}
	dir, err := installTransactionDir()
	if err != nil {
		return err
	}
	path := filepath.Join(dir, "journal.json")
	data, err := json.Marshal(j)
	if err != nil {
		return err
	}
	if err = writeAtomic(path, data, 0600); err != nil {
		return err
	}
	for _, f := range files {
		if err = ctx.Err(); err != nil {
			break
		}
		if !installationState(f, true) {
			err = errors.New("E_INSTALL_CONFLICT")
			break
		}
		if err = writeAtomic(f.Path, f.Data, f.Mode); err != nil {
			break
		}
	}
	if err == nil {
		err = ctx.Err()
	}
	if err != nil {
		if rollbackErr := rollbackInstallation(j); rollbackErr != nil {
			return fmt.Errorf("%w: %v", &CallError{Code: "E_INSTALL_COMMIT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}, errors.Join(err, rollbackErr))
		}
	}
	if removeErr := os.Remove(path); removeErr != nil {
		return fmt.Errorf("%w: %v", &CallError{Code: "E_INSTALL_COMMIT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}, errors.Join(err, removeErr))
	}
	if syncErr := syncDirectory(dir); syncErr != nil {
		return fmt.Errorf("%w: %v", &CallError{Code: "E_INSTALL_COMMIT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}, errors.Join(err, syncErr))
	}
	return err
}
