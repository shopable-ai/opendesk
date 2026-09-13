// Package inspectorwebpayload stages the source-owned Inspector frontend into
// desktop distributions with one platform-independent, fail-closed contract.
package inspectorwebpayload

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var RuntimeFiles = []string{
	"index.html",
	"assets/app.css",
	"assets/app.js",
	"assets/model.js",
}

func Stage(sourceRoot, destinationRoot string) ([]string, error) {
	source, err := realDirectory(sourceRoot, "Inspector frontend source")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(destinationRoot) == "" {
		return nil, errors.New("Inspector frontend destination is required")
	}
	destination, err := filepath.Abs(destinationRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve Inspector frontend destination: %w", err)
	}
	destination = filepath.Clean(destination)
	if destination == filepath.VolumeName(destination)+string(filepath.Separator) {
		return nil, fmt.Errorf("refusing Inspector frontend destination at filesystem root: %s", destination)
	}
	if destination == source {
		return nil, errors.New("Inspector frontend destination must differ from source")
	}
	if rel, relErr := filepath.Rel(source, destination); relErr == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return nil, errors.New("Inspector frontend destination must not be inside source")
	}
	if rel, relErr := filepath.Rel(destination, source); relErr == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return nil, errors.New("Inspector frontend destination must not contain source")
	}

	type sourceFile struct {
		relative string
		path     string
		mode     os.FileMode
		data     []byte
	}
	files := make([]sourceFile, 0, len(RuntimeFiles))
	for _, relative := range RuntimeFiles {
		path := filepath.Join(source, filepath.FromSlash(relative))
		info, statErr := os.Lstat(path)
		if statErr != nil {
			return nil, fmt.Errorf("Inspector frontend asset is missing %s: %w", relative, statErr)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return nil, fmt.Errorf("Inspector frontend asset must be a regular file: %s", relative)
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil, fmt.Errorf("read Inspector frontend asset %s: %w", relative, readErr)
		}
		if len(data) == 0 {
			return nil, fmt.Errorf("Inspector frontend asset is empty: %s", relative)
		}
		files = append(files, sourceFile{relative: relative, path: path, mode: info.Mode().Perm(), data: data})
	}

	if err := os.RemoveAll(destination); err != nil {
		return nil, fmt.Errorf("clear Inspector frontend destination: %w", err)
	}
	if err := os.MkdirAll(destination, 0o755); err != nil {
		return nil, fmt.Errorf("create Inspector frontend destination: %w", err)
	}
	result := make([]string, 0, len(files))
	for _, file := range files {
		target := filepath.Join(destination, filepath.FromSlash(file.relative))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return nil, fmt.Errorf("create Inspector frontend directory for %s: %w", file.relative, err)
		}
		if err := os.WriteFile(target, file.data, file.mode); err != nil {
			return nil, fmt.Errorf("write Inspector frontend asset %s: %w", file.relative, err)
		}
		result = append(result, file.relative)
	}
	return result, nil
}

func realDirectory(root, label string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", label, err)
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return "", fmt.Errorf("stat %s: %w", label, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return "", fmt.Errorf("%s must be a real directory, not a symlink: %s", label, absolute)
	}
	return filepath.Clean(absolute), nil
}
