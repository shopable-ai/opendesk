//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"syscall"
)

const filesImageMaxBytes = 8 * 1024 * 1024
const filesImageMaxPixels = 16 * 1024 * 1024

func filesImageFormat(relative string) string {
	switch strings.ToLower(path.Ext(relative)) {
	case ".png":
		return "png"
	case ".jpg", ".jpeg":
		return "jpeg"
	}
	return ""
}

// Config decoding is only the allocation guard. A successful full stdlib
// decode is required before any metadata or trusted absolute path is returned.
func decodeFilesImage(content []byte, format string) (image.Config, error) {
	var config image.Config
	if len(content) > filesImageMaxBytes {
		return config, filesFailure("E_FILES_LIMIT")
	}
	var err error
	switch format {
	case "png":
		config, err = png.DecodeConfig(bytes.NewReader(content))
	case "jpeg":
		config, err = jpeg.DecodeConfig(bytes.NewReader(content))
	default:
		return config, filesFailure("E_FILES_TYPE")
	}
	if err != nil {
		return config, filesFailure("E_FILES_TYPE")
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > filesImageMaxPixels/config.Height {
		return config, filesFailure("E_FILES_LIMIT")
	}
	var decoded image.Image
	if format == "png" {
		decoded, err = png.Decode(bytes.NewReader(content))
	} else {
		decoded, err = jpeg.Decode(bytes.NewReader(content))
	}
	if err != nil {
		return config, filesFailure("E_FILES_TYPE")
	}
	if decoded.Bounds().Dx() != config.Width || decoded.Bounds().Dy() != config.Height {
		return config, filesFailure("E_FILES_TYPE")
	}
	return config, nil
}

// Same descriptor-relative, no-follow and stable-snapshot checks as text reads,
// with a separate binary budget. It never relaxes the normal text API.
func readImageSnapshot(parent *os.Root, base string, device uint64) (fileSnapshot, error) {
	var out fileSnapshot
	before, err := parent.Lstat(base)
	if err != nil {
		return out, fileIOError(err)
	}
	if !validFilesInfo(before, device) {
		return out, filesFailure("E_FILES_ACCESS")
	}
	if before.Size() > filesImageMaxBytes {
		return out, filesFailure("E_FILES_LIMIT")
	}
	file, err := parent.OpenFile(base, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return out, fileIOError(err)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !validFilesInfo(opened, device) || !os.SameFile(before, opened) {
		return out, filesFailure("E_FILES_CONFLICT")
	}
	content, err := io.ReadAll(io.LimitReader(file, filesImageMaxBytes+1))
	if err != nil {
		return out, fileIOError(err)
	}
	if len(content) > filesImageMaxBytes {
		return out, filesFailure("E_FILES_LIMIT")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return out, fileIOError(err)
	}
	again, err := io.ReadAll(io.LimitReader(file, filesImageMaxBytes+1))
	after, statErr := file.Stat()
	current, pathErr := parent.Lstat(base)
	if err != nil || statErr != nil || pathErr != nil || !bytes.Equal(content, again) ||
		!os.SameFile(opened, current) || !validFilesInfo(after, device) || !validFilesInfo(current, device) ||
		opened.Size() != int64(len(content)) || opened.Size() != after.Size() || current.Size() != after.Size() ||
		!opened.ModTime().Equal(after.ModTime()) || !current.ModTime().Equal(after.ModTime()) {
		return out, filesFailure("E_FILES_CONFLICT")
	}
	digest := sha256.Sum256(content)
	return fileSnapshot{content: content, sha256: hex.EncodeToString(digest[:]), info: current}, nil
}

func inspectWorkspaceImage(root, parent *os.Root, parentInfo os.FileInfo, grant workspaceGrant, dir, base, relative string) (any, error) {
	snapshot, err := readImageSnapshot(parent, base, grant.Device)
	if err != nil {
		return nil, err
	}
	format := filesImageFormat(relative)
	config, err := decodeFilesImage(snapshot.content, format)
	if err != nil {
		return nil, err
	}
	// Recheck the grant and directory identity before exposing its trusted path.
	checkRoot, err := openWorkspaceRoot(grant)
	if err != nil {
		return nil, err
	}
	defer checkRoot.Close()
	currentParent, err := checkFilesDirectory(root, dir, grant.Device)
	if err != nil || !os.SameFile(parentInfo, currentParent) {
		return nil, filesFailure("E_FILES_CONFLICT")
	}
	return map[string]any{"workspaceId": grant.WorkspaceID, "path": relative,
		"absolutePath": filepath.Join(grant.Path, filepath.FromSlash(relative)), "format": format,
		"width": config.Width, "height": config.Height, "bytes": len(snapshot.content), "sha256": snapshot.sha256}, nil
}
