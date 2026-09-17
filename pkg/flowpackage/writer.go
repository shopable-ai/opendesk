package flowpackage

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"opendesk/pkg/scriptpackage"
)

type BuildOptions struct {
	SourceRoot            string
	FlowID                string
	Name                  string
	Version               string
	PublisherID           string
	PublisherKeyID        string
	Entry                 string
	MinimumRuntimeVersion string
	Platforms             []string
	Files                 []string
	PublisherPublicKey    ed25519.PublicKey
	PublisherPrivateKey   ed25519.PrivateKey
	LicenseIssuerKeyID    string
}

type BuildResult struct {
	Bytes          []byte
	Manifest       Manifest
	ArchiveDigest  string
	ManifestDigest string
}

func Build(options BuildOptions) (*BuildResult, error) {
	root, err := filepath.Abs(strings.TrimSpace(options.SourceRoot))
	if err != nil {
		return nil, newError(CodeInvalidContainer, "cannot resolve Flow source root", err)
	}
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, newError(CodeInvalidContainer, "Flow source root must be a real directory", err)
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, newError(CodeInvalidContainer, "cannot resolve Flow source root", err)
	}
	if len(options.PublisherPublicKey) != ed25519.PublicKeySize || len(options.PublisherPrivateKey) != ed25519.PrivateKeySize {
		return nil, newError(CodeInvalidSignature, "Flow publisher key pair is invalid", nil)
	}
	if !options.PublisherPrivateKey.Public().(ed25519.PublicKey).Equal(options.PublisherPublicKey) {
		return nil, newError(CodeIdentityMismatch, "Flow publisher private and public keys do not match", nil)
	}
	if len(options.Files) == 0 {
		return nil, newError(CodeInvalidManifest, "Flow package requires an explicit file list", nil)
	}
	entries := map[string][]byte{}
	seenSourcePaths := map[string]struct{}{}
	for _, rawPath := range options.Files {
		relative := filepath.ToSlash(strings.TrimSpace(rawPath))
		canonical, pathErr := normalizeEntryPath(relative, false)
		if pathErr != nil {
			return nil, newError(CodeInvalidContainer, "Flow source contains an invalid path", pathErr)
		}
		if relative == ManifestName || relative == SignatureName || relative == PublisherKeyName {
			return nil, newError(CodeInvalidContainer, "Flow source contains a reserved package path", nil)
		}
		if _, exists := seenSourcePaths[canonical]; exists {
			return nil, newError(CodeInvalidContainer, "Flow source contains duplicate paths", nil)
		}
		seenSourcePaths[canonical] = struct{}{}
		filePath := filepath.Join(root, filepath.FromSlash(relative))
		entryInfo, infoErr := os.Lstat(filePath)
		if infoErr != nil || !entryInfo.Mode().IsRegular() || entryInfo.Mode()&os.ModeSymlink != 0 {
			return nil, newError(CodeInvalidContainer, "Flow source file must be a real regular file", infoErr)
		}
		resolved, resolveErr := filepath.EvalSymlinks(filePath)
		expected := filepath.Join(realRoot, filepath.FromSlash(relative))
		if resolveErr != nil || filepath.Clean(resolved) != filepath.Clean(expected) {
			return nil, newError(CodeInvalidContainer, "Flow source path must not traverse a symbolic link", resolveErr)
		}
		if entryInfo.Size() > MaxEntrySize {
			return nil, newError(CodeFlowTooLarge, "Flow source file exceeds its size limit", nil)
		}
		content, readErr := os.ReadFile(filePath)
		if readErr != nil {
			return nil, readErr
		}
		entries[relative] = content
	}
	entries[PublisherKeyName] = append([]byte(nil), options.PublisherPublicKey...)
	entryData, entryOK := entries[options.Entry]
	if !entryOK {
		return nil, newError(CodeInvalidManifest, "Flow entry is not present in the source root", nil)
	}
	platforms := append([]string(nil), options.Platforms...)
	sort.Strings(platforms)
	manifest := Manifest{
		Format: FormatName, SchemaVersion: SchemaVersion, FlowID: options.FlowID, Name: options.Name,
		Version: options.Version, PublisherID: options.PublisherID, PublisherKeyID: options.PublisherKeyID,
		PublisherFingerprint: PublicKeyFingerprint(options.PublisherPublicKey), Entry: options.Entry,
		MinimumRuntimeVersion: options.MinimumRuntimeVersion, Platforms: platforms,
		Files: fileRecords(entries),
	}
	if strings.EqualFold(filepath.Ext(options.Entry), ".odpkg") {
		protected, protectedErr := scriptpackage.Read(entryData)
		if protectedErr != nil {
			return nil, newError(CodePayloadMismatch, "Flow protected entry is invalid", protectedErr)
		}
		manifest.Protected = &ProtectedIdentity{
			ProductID: protected.Manifest.ProductID, PackageID: protected.Manifest.PackageID,
			ContentKeyID: protected.Manifest.Encryption.KeyID, LicenseIssuerKeyID: options.LicenseIssuerKeyID,
		}
	}
	rawManifest, err := CanonicalManifestBytes(manifest)
	if err != nil {
		return nil, err
	}
	signature, err := Sign(rawManifest, options.PublisherPrivateKey)
	if err != nil {
		return nil, err
	}
	allEntries := make(map[string][]byte, len(entries)+2)
	for name, content := range entries {
		allEntries[name] = content
	}
	allEntries[ManifestName] = rawManifest
	allEntries[SignatureName] = signature
	names := make([]string, 0, len(allEntries))
	for name := range allEntries {
		names = append(names, name)
	}
	sort.Strings(names)
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	epoch := time.Unix(0, 0).UTC()
	for _, name := range names {
		// v1 favors a bounded, inspection-friendly container over archive size.
		// Stored entries cannot turn publisher-controlled data into a decompression
		// bomb; the reader still accepts bounded Deflate entries from compatible
		// writers and enforces an actual-read plus ratio limit.
		header := &zip.FileHeader{Name: name, Method: zip.Store}
		header.SetMode(0o600)
		header.Modified = epoch
		entryWriter, createErr := writer.CreateHeader(header)
		if createErr != nil {
			_ = writer.Close()
			return nil, newError(CodeInvalidContainer, "cannot create Flow archive entry", createErr)
		}
		if _, writeErr := entryWriter.Write(allEntries[name]); writeErr != nil {
			_ = writer.Close()
			return nil, newError(CodeInvalidContainer, "cannot write Flow archive entry", writeErr)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, newError(CodeInvalidContainer, "cannot finalize Flow package", err)
	}
	if int64(output.Len()) > MaxArchiveSize {
		return nil, newError(CodeFlowTooLarge, "Flow package exceeds the archive size limit", nil)
	}
	archive := append([]byte(nil), output.Bytes()...)
	verified, err := Read(archive)
	if err != nil {
		return nil, err
	}
	return &BuildResult{
		Bytes: archive, Manifest: manifest,
		ArchiveDigest: verified.ArchiveDigest, ManifestDigest: verified.ManifestDigest,
	}, nil
}

func WriteFileExclusive(filePath string, result *BuildResult) error {
	if result == nil || len(result.Bytes) == 0 {
		return fmt.Errorf("Flow build result is empty")
	}
	file, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return newError(CodeOutputExists, "Flow output already exists", err)
		}
		return fmt.Errorf("create Flow package: %w", err)
	}
	cleanup := true
	defer func() {
		_ = file.Close()
		if cleanup {
			_ = os.Remove(filePath)
		}
	}()
	if _, err := file.Write(result.Bytes); err != nil {
		return fmt.Errorf("write Flow package: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync Flow package: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close Flow package: %w", err)
	}
	cleanup = false
	return nil
}
