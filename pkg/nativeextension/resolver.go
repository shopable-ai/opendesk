package nativeextension

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const defaultExecutableDirectory = "native-extensions"

// ResolveDefaultExecutable resolves an extension basename relative to the
// native-extensions directory beside the currently running OpenDesk
// executable. The returned path is absolute; Host.Call remains responsible for
// validating that it names an executable regular file.
func ResolveDefaultExecutable(name string) (string, error) {
	name = strings.TrimSpace(name)
	if !isSafeExecutableBasename(name) {
		return "", fmt.Errorf("extension must be a safe basename without path separators or traversal")
	}

	currentExecutable, err := resolveCurrentExecutable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(currentExecutable), defaultExecutableDirectory, name), nil
}

// Resolve executable symlinks before selecting either deployment layout.
func resolveCurrentExecutable() (string, error) {
	currentExecutable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve current OpenDesk executable: %w", err)
	}
	currentExecutable, err = filepath.Abs(currentExecutable)
	if err != nil {
		return "", fmt.Errorf("resolve absolute OpenDesk executable path: %w", err)
	}
	currentExecutable, err = filepath.EvalSymlinks(currentExecutable)
	if err != nil {
		return "", fmt.Errorf("resolve OpenDesk executable symlinks: %w", err)
	}

	return currentExecutable, nil
}

func isSafeExecutableBasename(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}
	if strings.ContainsAny(name, "/\\") || strings.ContainsRune(name, '\x00') {
		return false
	}
	return filepath.Base(name) == name
}
