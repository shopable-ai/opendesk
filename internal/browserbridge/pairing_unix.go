//go:build darwin || linux

package browserbridge

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// PairingService uses a separate private replay ledger, never the Node-owned install.
// A URL, ID or nonce is not a trust proof. Only a native confirmation permits Setup.
type PairingService struct{ mu sync.Mutex }

func consumePairingNonce(intent PairingIntent, now time.Time) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	parent := filepath.Join(home, ".opendesk-browser")
	if err = ensureDir(parent); err != nil {
		return err
	}
	root := filepath.Join(parent, "pairing-r2")
	if err = ensureDir(root); err != nil {
		return err
	}
	lockPath := filepath.Join(root, "ledger.lock")
	fd, err := syscall.Open(lockPath, syscall.O_CREAT|syscall.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return errors.New("E_PAIRING_LEDGER")
	}
	lock := os.NewFile(uintptr(fd), lockPath)
	defer lock.Close()
	if _, err = requireRegular(lockPath, 0600); err != nil {
		return err
	}
	if err = syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		return errors.New("E_PAIRING_BUSY")
	}
	defer syscall.Flock(fd, syscall.LOCK_UN)
	file := filepath.Join(root, "consumed.json")
	ledger := map[string]int64{}
	if _, err = os.Lstat(file); err == nil {
		info, checkErr := requireRegular(file, 0600)
		if checkErr != nil {
			return checkErr
		}
		if info.Size() > 65536 {
			return errors.New("E_PAIRING_LEDGER")
		}
		data, readErr := os.ReadFile(file)
		if readErr != nil {
			return readErr
		}
		if json.Unmarshal(data, &ledger) != nil || ledger == nil {
			return errors.New("E_PAIRING_LEDGER")
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if _, exists := ledger[intent.Nonce]; exists {
		return errors.New("E_PAIRING_REPLAY")
	}
	for nonce, expiry := range ledger {
		if expiry <= now.UnixMilli() {
			delete(ledger, nonce)
		}
	}
	if len(ledger) >= 256 {
		return errors.New("E_PAIRING_LIMIT")
	}
	ledger[intent.Nonce] = intent.IssuedAt.Add(PairingLifetime).UnixMilli()
	data, err := json.Marshal(ledger)
	if err != nil {
		return err
	}
	return writeAtomic(file, data, 0600)
}

func (s *PairingService) Handle(ctx context.Context, raw string, confirm func(context.Context, PairingIntent) (bool, error)) (map[string]any, error) {
	if confirm == nil {
		return nil, errors.New("E_PAIRING_APPROVAL_REQUIRED")
	}
	if !s.mu.TryLock() {
		return nil, errors.New("E_PAIRING_BUSY")
	}
	defer s.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	intent, err := ParsePairingURL(raw, time.Now())
	if err != nil {
		return nil, err
	}
	if err = consumePairingNonce(intent, time.Now()); err != nil {
		return nil, err
	}
	approved, err := confirm(ctx, intent)
	if err != nil {
		return nil, err
	}
	if !approved {
		return map[string]any{"paired": false, "cancelled": true}, nil
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	if !time.Now().Before(intent.IssuedAt.Add(PairingLifetime)) {
		return nil, errors.New("E_PAIRING_EXPIRED")
	}
	// Development intent cannot change browser, profile, executable or append origins.
	installCtx, cancel := context.WithDeadline(ctx, intent.IssuedAt.Add(PairingLifetime))
	defer cancel()
	// A pairing confirmation identifies an extension, not an executable upgrade.
	// Preserve an existing trusted Host rather than moving grants to this process.
	if previous, loadErr := Load(); loadErr == nil {
		if previous.ExtensionID != intent.ExtensionID {
			return nil, errors.New("E_EXTENSION_ID_CONFLICT")
		}
		if previous.Browser != "chrome" || previous.UserDataDir != "" {
			return nil, errors.New("E_PROFILE_CONFLICT")
		}
		return map[string]any{"paired": true, "alreadyPaired": true, "channel": "development", "extensionId": intent.ExtensionID}, nil
	} else if !os.IsNotExist(loadErr) {
		return nil, loadErr
	}
	result, err := SetupContext(installCtx, intent.ExtensionID, "chrome", "", "")
	if err != nil {
		return nil, err
	}
	result["paired"] = true
	result["channel"] = "development"
	return result, nil
}
