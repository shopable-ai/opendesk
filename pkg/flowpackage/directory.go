package flowpackage

import (
	"archive/zip"
	"bytes"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// VerifyDirectory applies the same manifest, signature, identity and complete
// file-list verification to an installed Flow directory before execution.
func VerifyDirectory(root string) (*Package, error) {
	absolute, err := filepath.Abs(strings.TrimSpace(root))
	if err != nil {
		return nil, newError(CodeInvalidContainer, "cannot resolve installed Flow root", err)
	}
	rootInfo, err := os.Lstat(absolute)
	if err != nil || !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return nil, newError(CodeInvalidContainer, "installed Flow root must be a real directory", err)
	}
	entries := map[string][]byte{}
	err = filepath.WalkDir(absolute, func(filePath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if filePath == absolute {
			return nil
		}
		relative, relErr := filepath.Rel(absolute, filePath)
		if relErr != nil {
			return relErr
		}
		relative = filepath.ToSlash(relative)
		if entry.Type()&os.ModeSymlink != 0 {
			return newError(CodeInvalidContainer, "installed Flow contains a symbolic link", nil)
		}
		if entry.IsDir() {
			_, pathErr := normalizeEntryPath(relative+"/", true)
			return pathErr
		}
		info, infoErr := entry.Info()
		if infoErr != nil || !info.Mode().IsRegular() || info.Size() > MaxEntrySize {
			return newError(CodeInvalidContainer, "installed Flow contains a special or oversized file", infoErr)
		}
		content, readErr := os.ReadFile(filePath)
		if readErr != nil {
			return readErr
		}
		entries[relative] = content
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(entries) < 3 || len(entries) > MaxEntryCount {
		return nil, newError(CodeInvalidContainer, "installed Flow entry count is outside the allowed range", nil)
	}
	names := make([]string, 0, len(entries))
	for name := range entries {
		names = append(names, name)
	}
	sort.Strings(names)
	var container bytes.Buffer
	writer := zip.NewWriter(&container)
	epoch := time.Unix(0, 0).UTC()
	for _, name := range names {
		header := &zip.FileHeader{Name: name, Method: zip.Store, Modified: epoch}
		header.SetMode(0o600)
		entryWriter, createErr := writer.CreateHeader(header)
		if createErr != nil {
			_ = writer.Close()
			return nil, newError(CodeInvalidContainer, "cannot verify installed Flow entry", createErr)
		}
		if _, writeErr := entryWriter.Write(entries[name]); writeErr != nil {
			_ = writer.Close()
			return nil, newError(CodeInvalidContainer, "cannot verify installed Flow entry", writeErr)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, newError(CodeInvalidContainer, "cannot verify installed Flow directory", err)
	}
	return Read(container.Bytes())
}
