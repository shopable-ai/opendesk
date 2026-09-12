package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const appDataRootEnv = "OPENDESK_APP_DATA_DIR"

// appRecorderWorkDir keeps explicit development -app executions compatible
// with their historical package-root workspace, while released/bundled App
// Mode packages use persistent writable user data instead of modifying the
// signed/staged application package.
func appRecorderWorkDir(packageRoot, packageID string, environment map[string]string) (string, error) {
	return appRecorderWorkDirForPackage(packageRoot, bundledAppModePath(), packageID, environment)
}

func appRecorderWorkDirForPackage(packageRoot, bundledRoot, packageID string, environment map[string]string) (string, error) {
	bundled := bundledRoot
	if bundled == "" || !samePath(packageRoot, bundled) {
		return packageRoot, nil
	}
	return appModeDataRoot(packageID, environment)
}

// appModeRuntimeArtifactsRoot keeps App Mode execution artifacts with the
// package workspace in development and with the writable App data root once a
// package is released inside a desktop bundle. An explicit -log-dir remains
// the caller's override.
func appModeRuntimeArtifactsRoot(packageRoot, packageID, configuredLogDir string, environment map[string]string) (root string, configured bool, err error) {
	return appModeRuntimeArtifactsRootForPackage(packageRoot, bundledAppModePath(), packageID, configuredLogDir, environment)
}

func appModeRuntimeArtifactsRootForPackage(packageRoot, bundledRoot, packageID, configuredLogDir string, environment map[string]string) (root string, configured bool, err error) {
	if configuredLogDir = strings.TrimSpace(configuredLogDir); configuredLogDir != "" {
		return filepath.Clean(configuredLogDir), true, nil
	}
	workDir, err := appRecorderWorkDirForPackage(packageRoot, bundledRoot, packageID, environment)
	if err != nil {
		return "", false, err
	}
	return filepath.Join(workDir, ".runtime", "runs"), false, nil
}

func appModeDataRoot(packageID string, environment map[string]string) (string, error) {
	packageID = strings.TrimSpace(packageID)
	if packageID == "" {
		return "", fmt.Errorf("App Mode package id is required for user data root")
	}

	if configured := strings.TrimSpace(environment[appDataRootEnv]); configured != "" {
		root, err := filepath.Abs(configured)
		if err != nil {
			return "", fmt.Errorf("resolve %s: %w", appDataRootEnv, err)
		}
		if err := os.MkdirAll(root, 0o700); err != nil {
			return "", fmt.Errorf("create %s: %w", appDataRootEnv, err)
		}
		return filepath.Clean(root), nil
	}
	home := strings.TrimSpace(environment["HOME"])
	if home == "" {
		home = strings.TrimSpace(environment["USERPROFILE"])
	}
	if home == "" {
		var err error
		home, err = os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve OpenDesk user data home: %w", err)
		}
	}
	root := filepath.Join(home, ".opendesk", "apps", packageID)
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", fmt.Errorf("create OpenDesk App Mode data root: %w", err)
	}
	return filepath.Clean(root), nil
}

func samePath(left, right string) bool {
	leftAbs, leftErr := filepath.Abs(left)
	rightAbs, rightErr := filepath.Abs(right)
	if leftErr != nil || rightErr != nil {
		return false
	}
	leftAbs = filepath.Clean(leftAbs)
	rightAbs = filepath.Clean(rightAbs)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(leftAbs, rightAbs)
	}
	return leftAbs == rightAbs
}
