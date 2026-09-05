package automation

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync/atomic"
)

var errFileJSONAtomicReplaceUnsupported = errors.New("atomic replacement is not supported on this platform")

type fileJSONReadResult struct {
	data    []byte
	missing bool
}

type fileJSONWriteResult struct {
	committed bool
}

// fileJSONWriteHooks is a private deterministic fault-injection seam. The
// production path leaves every field nil and uses os.File plus the platform
// replacement backend; tests can prove that short writes, close failures and
// replace failures preserve the original target without weakening production
// checks.
type fileJSONWriteHooks struct {
	write   func(*os.File, []byte) (int, error)
	close   func(*os.File) error
	replace func(string, string) error
}

func fileJSONReadFile(ctx context.Context, path string, maxBytes int) (fileJSONReadResult, error) {
	const operation = "File.readJSON"
	if err := fileJSONContextError(ctx, operation, false); err != nil {
		return fileJSONReadResult{}, err
	}
	info, err := os.Lstat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fileJSONReadResult{missing: true}, nil
		}
		return fileJSONReadResult{}, fileJSONHostError(operation, "could not inspect file", err, false)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return fileJSONReadResult{}, fileJSONOperationError(FileJSONUnsupportedFileType, operation, "path must reference a regular file", nil)
	}
	file, err := os.Open(path)
	if err != nil {
		return fileJSONReadResult{}, fileJSONHostError(operation, "could not open file", err, false)
	}
	actual, statErr := file.Stat()
	if statErr != nil {
		_ = file.Close()
		return fileJSONReadResult{}, fileJSONHostError(operation, "could not inspect opened file", statErr, false)
	}
	if !actual.Mode().IsRegular() {
		_ = file.Close()
		return fileJSONReadResult{}, fileJSONOperationError(FileJSONUnsupportedFileType, operation, "path must reference a regular file", nil)
	}
	data, readErr := io.ReadAll(io.LimitReader(file, int64(maxBytes)+1))
	closeErr := file.Close()
	if readErr != nil {
		return fileJSONReadResult{}, fileJSONHostError(operation, "could not read file", readErr, false)
	}
	if closeErr != nil {
		return fileJSONReadResult{}, fileJSONHostError(operation, "could not close file", closeErr, false)
	}
	if len(data) > maxBytes {
		return fileJSONReadResult{}, fileJSONOperationError(FileJSONTooLarge, operation, fmt.Sprintf("file exceeds maxBytes (%d)", maxBytes), nil)
	}
	if err := fileJSONContextError(ctx, operation, false); err != nil {
		return fileJSONReadResult{}, err
	}
	return fileJSONReadResult{data: data}, nil
}

func fileJSONWriteFile(ctx context.Context, path string, payload []byte, createDirs bool, commit *fileJSONCommitState, activeTemps *atomic.Int64) (fileJSONWriteResult, error) {
	return fileJSONWriteFileWithHooks(ctx, path, payload, createDirs, commit, activeTemps, fileJSONWriteHooks{})
}

func fileJSONWriteFileWithHooks(ctx context.Context, path string, payload []byte, createDirs bool, commit *fileJSONCommitState, activeTemps *atomic.Int64, hooks fileJSONWriteHooks) (fileJSONWriteResult, error) {
	const operation = "File.writeJSON"
	write := hooks.write
	if write == nil {
		write = func(file *os.File, payload []byte) (int, error) { return file.Write(payload) }
	}
	close := hooks.close
	if close == nil {
		close = func(file *os.File) error { return file.Close() }
	}
	replace := hooks.replace
	if replace == nil {
		replace = fileJSONAtomicReplace
	}
	if err := fileJSONContextError(ctx, operation, false); err != nil {
		return fileJSONWriteResult{}, err
	}
	parent := filepath.Dir(path)
	if createDirs {
		if err := os.MkdirAll(parent, 0750); err != nil {
			return fileJSONWriteResult{}, fileJSONHostError(operation, "could not create parent directory", err, false)
		}
	} else {
		info, err := os.Stat(parent)
		if err != nil {
			return fileJSONWriteResult{}, fileJSONHostError(operation, "parent directory does not exist", err, false)
		}
		if !info.IsDir() {
			return fileJSONWriteResult{}, fileJSONOperationError(FileJSONUnsupportedFileType, operation, "parent path must be a directory", nil)
		}
	}

	targetInfo, targetExists, err := fileJSONWriteTarget(path, operation)
	if err != nil {
		return fileJSONWriteResult{}, err
	}
	if err := fileJSONContextError(ctx, operation, false); err != nil {
		return fileJSONWriteResult{}, err
	}

	temporary, err := os.CreateTemp(parent, ".opendesk-json-*")
	if err != nil {
		return fileJSONWriteResult{}, fileJSONHostError(operation, "could not create temporary file", err, false)
	}
	if activeTemps != nil {
		activeTemps.Add(1)
	}
	temporaryPath := temporary.Name()
	closed := false
	defer func() {
		if !closed {
			_ = close(temporary)
		}
		if temporaryPath != "" {
			_ = os.Remove(temporaryPath)
		}
		if activeTemps != nil {
			activeTemps.Add(-1)
		}
	}()

	if targetExists {
		// CreateTemp uses 0600. Preserve the existing basic mode explicitly;
		// owner, ACL and xattr preservation are intentionally not promised.
		if err := temporary.Chmod(targetInfo.Mode().Perm()); err != nil {
			return fileJSONWriteResult{}, fileJSONHostError(operation, "could not preserve target permissions", err, false)
		}
	}
	remaining := payload
	for len(remaining) > 0 {
		if err := fileJSONContextError(ctx, operation, false); err != nil {
			return fileJSONWriteResult{}, err
		}
		count, writeErr := write(temporary, remaining)
		if count > 0 {
			remaining = remaining[count:]
		}
		if writeErr != nil {
			return fileJSONWriteResult{}, fileJSONHostError(operation, "could not write temporary file", writeErr, false)
		}
		if count == 0 {
			return fileJSONWriteResult{}, fileJSONOperationError(FileJSONIOFailed, operation, "temporary file write made no progress", nil)
		}
	}
	if err := close(temporary); err != nil {
		closed = true
		return fileJSONWriteResult{}, fileJSONHostError(operation, "could not close temporary file", err, false)
	}
	closed = true
	if err := fileJSONContextError(ctx, operation, false); err != nil {
		return fileJSONWriteResult{}, err
	}
	if _, _, err := fileJSONWriteTarget(path, operation); err != nil {
		return fileJSONWriteResult{}, err
	}
	committed, err := commit.replace(ctx, func() error { return replace(temporaryPath, path) })
	if err != nil {
		if errors.Is(err, errFileJSONAtomicReplaceUnsupported) {
			return fileJSONWriteResult{}, fileJSONOperationError(FileJSONAtomicReplaceUnsupported, operation, "atomic replacement is unsupported on this platform", err)
		}
		var canceled *FileJSONError
		if errors.As(err, &canceled) {
			return fileJSONWriteResult{}, err
		}
		return fileJSONWriteResult{}, fileJSONHostError(operation, "could not atomically replace target", err, false)
	}
	if !committed {
		return fileJSONWriteResult{}, fileJSONContextError(ctx, operation, false)
	}
	temporaryPath = ""
	result := fileJSONWriteResult{committed: true}
	if err := fileJSONContextError(ctx, operation, true); err != nil {
		return result, err
	}
	return result, nil
}

func fileJSONWriteTarget(path, operation string) (os.FileInfo, bool, error) {
	info, err := os.Lstat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, false, nil
		}
		return nil, false, fileJSONHostError(operation, "could not inspect target", err, false)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return nil, false, fileJSONOperationError(FileJSONUnsupportedFileType, operation, "target must be a regular file and not a symbolic link", nil)
	}
	return info, true, nil
}

func fileJSONContextError(ctx context.Context, operation string, committed bool) error {
	if ctx == nil || ctx.Err() == nil {
		return nil
	}
	return &FileJSONError{Code: FileJSONCanceled, Operation: operation, Message: "operation was canceled", Committed: committed, Cause: ctx.Err()}
}

func fileJSONHostError(operation, message string, err error, committed bool) error {
	if errors.Is(err, os.ErrPermission) {
		return &FileJSONError{Code: FileJSONPermissionDenied, Operation: operation, Message: message, Committed: committed, Cause: err}
	}
	if errors.Is(err, os.ErrNotExist) {
		return &FileJSONError{Code: FileJSONNotFound, Operation: operation, Message: message, Committed: committed, Cause: err}
	}
	return &FileJSONError{Code: FileJSONIOFailed, Operation: operation, Message: message, Committed: committed, Cause: err}
}
