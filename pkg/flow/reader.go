package flow

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"opendesk/pkg/scriptpackage"
)

func ReadFile(filePath string) (*Package, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot open flow package", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot stat flow package", err)
	}
	if !info.Mode().IsRegular() {
		return nil, newError(CodeInvalidPackage, "flow package path must be a regular file", nil)
	}
	if info.Size() > MaxPackageSize {
		return nil, newError(CodePackageTooLarge, "flow package exceeds maximum size", nil)
	}
	data, err := io.ReadAll(io.LimitReader(file, MaxPackageSize+1))
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot read flow package", err)
	}
	if int64(len(data)) > MaxPackageSize {
		return nil, newError(CodePackageTooLarge, "flow package exceeds maximum size", nil)
	}
	return Read(data)
}

func Read(data []byte) (*Package, error) {
	if len(data) == 0 {
		return nil, newError(CodeInvalidPackage, "flow package is empty", nil)
	}
	if int64(len(data)) > MaxPackageSize {
		return nil, newError(CodePackageTooLarge, "flow package exceeds maximum size", nil)
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, newError(CodeInvalidPackage, "flow package is not a valid ZIP container", nil)
	}
	if len(reader.File) < 3 || len(reader.File) > MaxArchiveEntryCount {
		return nil, newError(CodeInvalidPackage, "flow package entry count is invalid", nil)
	}
	entries := make(map[string][]byte, len(reader.File))
	folded := map[string]struct{}{}
	var total int64
	for _, file := range reader.File {
		if file.FileInfo().IsDir() || file.Mode()&os.ModeSymlink != 0 {
			return nil, newError(CodeInvalidPackage, "flow package entries must be regular files", nil)
		}
		name := file.Name
		if name != ManifestEntryName && name != SignatureEntryName {
			if err := ValidateContentPath(name); err != nil {
				return nil, err
			}
		}
		lower := strings.ToLower(name)
		if _, ok := folded[lower]; ok {
			return nil, newError(CodeInvalidPath, "flow package contains duplicate paths ignoring ASCII case", nil)
		}
		folded[lower] = struct{}{}
		limit := MaxFileSize
		if name == ManifestEntryName {
			limit = MaxManifestSize
		} else if name == SignatureEntryName {
			limit = MaxSignatureSize
		}
		if file.UncompressedSize64 > uint64(limit) {
			return nil, newError(CodePackageTooLarge, fmt.Sprintf("%s exceeds its size limit", name), nil)
		}
		content, err := readZipEntry(file, limit)
		if err != nil {
			return nil, err
		}
		total += int64(len(content))
		if total > MaxUncompressedSize+MaxManifestSize+MaxSignatureSize {
			return nil, newError(CodePackageTooLarge, "flow package exceeds maximum uncompressed size", nil)
		}
		entries[name] = content
	}
	rawManifest, ok := entries[ManifestEntryName]
	if !ok {
		return nil, newError(CodeInvalidPackage, "flow package is missing flow.json", nil)
	}
	signature, ok := entries[SignatureEntryName]
	if !ok {
		return nil, newError(CodeInvalidPackage, "flow package is missing flow.sig", nil)
	}
	if len(signature) != ed25519.SignatureSize {
		return nil, newError(CodeInvalidSignature, "flow.sig must contain exactly one Ed25519 signature", nil)
	}
	var manifest Manifest
	decoder := json.NewDecoder(bytes.NewReader(rawManifest))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return nil, newError(CodeInvalidManifest, "flow.json is invalid", nil)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return nil, newError(CodeInvalidManifest, "flow.json contains trailing data", nil)
	}
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	if len(entries) != len(manifest.Files)+2 {
		return nil, newError(CodeFileMismatch, "flow package file inventory does not match archive entries", nil)
	}
	files := make(map[string][]byte, len(manifest.Files))
	for _, expected := range manifest.Files {
		content, ok := entries[expected.Path]
		if !ok {
			return nil, newError(CodeFileMismatch, fmt.Sprintf("%s is missing", expected.Path), nil)
		}
		if int64(len(content)) != expected.Size {
			return nil, newError(CodeFileMismatch, fmt.Sprintf("%s size does not match flow.json", expected.Path), nil)
		}
		digest := sha256.Sum256(content)
		if hex.EncodeToString(digest[:]) != expected.SHA256 {
			return nil, newError(CodeFileMismatch, fmt.Sprintf("%s digest does not match flow.json", expected.Path), nil)
		}
		files[expected.Path] = append([]byte(nil), content...)
	}
	for name := range entries {
		if name == ManifestEntryName || name == SignatureEntryName {
			continue
		}
		if _, ok := files[name]; !ok {
			return nil, newError(CodeFileMismatch, "flow package contains an unlisted file", nil)
		}
	}
	publisherKey, err := scriptpackage.ParseEd25519PublicKey(files[PublisherPublicKeyEntryName])
	if err != nil {
		return nil, newError(CodeInvalidManifest, "trust/publisher.pub is not a valid Ed25519 public key", nil)
	}
	if manifest.Commercial != nil {
		if _, err := scriptpackage.ParseEd25519PublicKey(files[LicenseIssuerPublicKeyEntryName]); err != nil {
			return nil, newError(CodeInvalidManifest, "trust/license-issuer.pub is not a valid Ed25519 public key", nil)
		}
	}
	if manifest.Entry == EntrypointMainPackage {
		if err := validateProtectedEntry(manifest, files[manifest.Entry], publisherKey); err != nil {
			return nil, err
		}
	}
	digest := sha256.Sum256(data)
	return &Package{Manifest: manifest, RawManifest: append([]byte(nil), rawManifest...), Signature: append([]byte(nil), signature...), Files: files, PackageDigest: hex.EncodeToString(digest[:])}, nil
}

func readZipEntry(file *zip.File, limit int64) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot open flow package entry", nil)
	}
	defer reader.Close()
	content, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot read flow package entry", nil)
	}
	if int64(len(content)) > limit {
		return nil, newError(CodePackageTooLarge, fmt.Sprintf("%s exceeds its size limit", file.Name), nil)
	}
	return content, nil
}
