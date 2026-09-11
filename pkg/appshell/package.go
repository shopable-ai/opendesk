package appshell

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const ManifestFileName = "opendesk.app.json"

// Package is the filesystem-validated form of an App package. ParseManifest
// intentionally remains filesystem-free so manifest structure can be tested in
// memory; ResolvePackage owns existence, symlink, and package-boundary checks.
type Package struct {
	Root      string
	Manifest  Manifest
	EntryPath string
	IconPath  string
	Identity  string
}

// ResolvePackage canonicalizes packageRoot, parses opendesk.app.json, and then
// validates every manifest resource against the canonical package boundary.
func ResolvePackage(packageRoot string) (Package, error) {
	root, err := canonicalPackageRoot(packageRoot)
	if err != nil {
		return Package{}, err
	}
	manifestPath := filepath.Join(root, ManifestFileName)
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return Package{}, fmt.Errorf("read %s: %w", ManifestFileName, err)
	}
	manifest, err := ParseManifest(data)
	if err != nil {
		return Package{}, err
	}
	entryPath, err := resolvePackageFile(root, manifest.Entry, "entry")
	if err != nil {
		return Package{}, err
	}
	iconPath := ""
	if strings.TrimSpace(manifest.Tray.Icon) != "" {
		iconPath, err = resolvePackageFile(root, manifest.Tray.Icon, "tray.icon")
		if err != nil {
			return Package{}, err
		}
	}
	identity := packageIdentityFromCanonicalRoot(root)
	return Package{Root: root, Manifest: manifest, EntryPath: entryPath, IconPath: iconPath, Identity: identity}, nil
}

// PackageIdentity returns the stable package identity without reading the
// manifest. Identity deliberately depends on the canonical package root, not
// manifest contents: editing an app does not make a running primary invisible
// to a newly launched secondary.
func PackageIdentity(packageRoot string) (string, error) {
	root, err := canonicalPackageRoot(packageRoot)
	if err != nil {
		return "", err
	}
	return packageIdentityFromCanonicalRoot(root), nil
}

func canonicalPackageRoot(packageRoot string) (string, error) {
	if strings.TrimSpace(packageRoot) == "" {
		return "", fmt.Errorf("app package root is required")
	}
	absolute, err := filepath.Abs(packageRoot)
	if err != nil {
		return "", fmt.Errorf("resolve app package root: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve app package root symlinks: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat app package root: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("app package root is not a directory")
	}
	return filepath.Clean(resolved), nil
}

func resolvePackageFile(root, relative, field string) (string, error) {
	candidate := filepath.Join(root, filepath.FromSlash(strings.ReplaceAll(relative, "\\", "/")))
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		return "", fmt.Errorf("%s resource is unavailable: %w", field, err)
	}
	resolved = filepath.Clean(resolved)
	if !pathWithinRoot(root, resolved) {
		return "", fmt.Errorf("%s escapes the app package through a symlink", field)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat %s resource: %w", field, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s must reference a regular file", field)
	}
	return resolved, nil
}

func pathWithinRoot(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}

func packageIdentityFromCanonicalRoot(root string) string {
	normalized := filepath.Clean(root)
	if runtime.GOOS == "windows" {
		normalized = strings.ToLower(normalized)
	}
	sum := sha256.Sum256([]byte("opendesk-app-package-v1\x00" + normalized))
	return hex.EncodeToString(sum[:16])
}
