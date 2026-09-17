package appdata

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	RootEnvironment  = "OPENDESK_APP_DATA_DIR"
	DesktopPackageID = "com.opendesk.desktop"
)

// Resolve returns the writable per-product OpenDesk data root. The explicit
// OPENDESK_APP_DATA_DIR override is intentionally shared by App Mode and Flow
// installation so product code does not grow competing path owners.
func Resolve(packageID string, environment map[string]string) (string, error) {
	packageID = strings.TrimSpace(packageID)
	if packageID == "" {
		return "", fmt.Errorf("OpenDesk package id is required for user data root")
	}

	lookup := func(name string) string {
		if environment != nil {
			return strings.TrimSpace(environment[name])
		}
		return strings.TrimSpace(os.Getenv(name))
	}

	if configured := lookup(RootEnvironment); configured != "" {
		root, err := filepath.Abs(configured)
		if err != nil {
			return "", fmt.Errorf("resolve %s: %w", RootEnvironment, err)
		}
		if err := ensureDataRoot(root); err != nil {
			return "", fmt.Errorf("create %s: %w", RootEnvironment, err)
		}
		return filepath.Clean(root), nil
	}

	home := lookup("HOME")
	if home == "" {
		home = lookup("USERPROFILE")
	}
	if home == "" {
		var err error
		home, err = os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve OpenDesk user data home: %w", err)
		}
	}
	root := filepath.Join(home, ".opendesk", "apps", packageID)
	if err := ensureDataRoot(root); err != nil {
		return "", fmt.Errorf("create OpenDesk App Mode data root: %w", err)
	}
	return filepath.Clean(root), nil
}

// Root preserves the original App Mode owner name while delegating to the
// shared resolver used by both App Mode and Flow installation.
func Root(packageID string, environment map[string]string) (string, error) {
	return Resolve(packageID, environment)
}

func ensureDataRoot(root string) error {
	if err := os.MkdirAll(root, 0o700); err != nil {
		return err
	}
	info, err := os.Lstat(root)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("data root must be a real directory")
	}
	return nil
}
