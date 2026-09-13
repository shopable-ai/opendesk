package officialconfig

import (
	"fmt"
	"os"
	"path/filepath"
)

func writeConfigFileAtomically(outputPath string, data []byte, replace func(string, string) error) (returnErr error) {
	parent := filepath.Dir(outputPath)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return fmt.Errorf("create config output directory %q: %w", parent, err)
	}

	mode := os.FileMode(0o644)
	if info, err := os.Lstat(outputPath); err == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return fmt.Errorf("config output must be a regular file and not a symbolic link: %q", outputPath)
		}
		mode = info.Mode().Perm()
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("inspect config output %q: %w", outputPath, err)
	}

	temporary, err := os.CreateTemp(parent, ".opendesk-config-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary config output beside %q: %w", outputPath, err)
	}
	temporaryPath := temporary.Name()
	closed := false
	defer func() {
		if !closed {
			_ = temporary.Close()
		}
		if temporaryPath != "" {
			_ = os.Remove(temporaryPath)
		}
	}()

	if err := temporary.Chmod(mode); err != nil {
		return fmt.Errorf("set temporary config output permissions: %w", err)
	}
	remaining := data
	for len(remaining) > 0 {
		count, writeErr := temporary.Write(remaining)
		if count > 0 {
			remaining = remaining[count:]
		}
		if writeErr != nil {
			return fmt.Errorf("write temporary config output: %w", writeErr)
		}
		if count == 0 {
			return fmt.Errorf("write temporary config output made no progress")
		}
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync temporary config output: %w", err)
	}
	if err := temporary.Close(); err != nil {
		closed = true
		return fmt.Errorf("close temporary config output: %w", err)
	}
	closed = true
	if err := replace(temporaryPath, outputPath); err != nil {
		return fmt.Errorf("publish config output %q atomically: %w", outputPath, err)
	}
	temporaryPath = ""
	return nil
}
