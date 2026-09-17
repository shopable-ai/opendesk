package main

import (
	"path/filepath"
	"runtime"
	"strings"

	"opendesk/pkg/appdata"
)

const appDataRootEnv = appdata.RootEnvironment

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
	return appdata.Root(packageID, environment)
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
