package flow

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"opendesk/pkg/scriptpackage"
)

func Build(manifest Manifest, inputs []InputFile, privateKey ed25519.PrivateKey) (*BuildResult, error) {
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, newError(CodeInvalidSignature, "publisher Ed25519 private key is invalid", nil)
	}
	if len(inputs) == 0 || len(inputs) > MaxFileCount {
		return nil, newError(CodeInvalidManifest, "flow input file count is invalid", nil)
	}
	files := make([]FileEntry, 0, len(inputs))
	dataByPath := make(map[string][]byte, len(inputs))
	folded := map[string]struct{}{}
	var total int64
	for _, input := range inputs {
		if err := ValidateContentPath(input.Path); err != nil {
			return nil, err
		}
		lower := strings.ToLower(input.Path)
		if _, ok := folded[lower]; ok {
			return nil, newError(CodeInvalidPath, "flow input paths must be unique ignoring ASCII case", nil)
		}
		folded[lower] = struct{}{}
		if int64(len(input.Data)) > MaxFileSize {
			return nil, newError(CodePackageTooLarge, fmt.Sprintf("%s exceeds maximum file size", input.Path), nil)
		}
		total += int64(len(input.Data))
		if total > MaxUncompressedSize {
			return nil, newError(CodePackageTooLarge, "flow files exceed maximum uncompressed size", nil)
		}
		digest := sha256.Sum256(input.Data)
		files = append(files, FileEntry{Path: input.Path, SHA256: hex.EncodeToString(digest[:]), Size: int64(len(input.Data))})
		dataByPath[input.Path] = append([]byte(nil), input.Data...)
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	manifest.Files = files
	manifest.Platforms = normalizedPlatforms(manifest.Platforms)
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	publisherKey, err := scriptpackage.ParseEd25519PublicKey(dataByPath[PublisherPublicKeyEntryName])
	if err != nil {
		return nil, newError(CodeInvalidManifest, "trust/publisher.pub is not a valid Ed25519 public key", nil)
	}
	signerKey, ok := privateKey.Public().(ed25519.PublicKey)
	if !ok || !bytes.Equal(publisherKey, signerKey) {
		return nil, newError(CodeInvalidSignature, "trust/publisher.pub does not match the signing key", nil)
	}
	if manifest.Commercial != nil {
		if _, err := scriptpackage.ParseEd25519PublicKey(dataByPath[LicenseIssuerPublicKeyEntryName]); err != nil {
			return nil, newError(CodeInvalidManifest, "trust/license-issuer.pub is not a valid Ed25519 public key", nil)
		}
	}
	if manifest.Entry == EntrypointMainPackage {
		if err := validateProtectedEntry(manifest, dataByPath[manifest.Entry], publisherKey); err != nil {
			return nil, err
		}
	}
	rawManifest, err := json.Marshal(manifest)
	if err != nil {
		return nil, newError(CodeInvalidManifest, "cannot encode flow manifest", err)
	}
	if int64(len(rawManifest)) > MaxManifestSize {
		return nil, newError(CodePackageTooLarge, "flow.json exceeds maximum size", nil)
	}
	signature, err := Sign(rawManifest, privateKey)
	if err != nil {
		return nil, err
	}
	data, err := encodeArchive(rawManifest, signature, files, dataByPath)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > MaxPackageSize {
		return nil, newError(CodePackageTooLarge, "flow package exceeds maximum size", nil)
	}
	digest := sha256.Sum256(data)
	return &BuildResult{Data: data, Manifest: manifest, RawManifest: append([]byte(nil), rawManifest...), Signature: append([]byte(nil), signature...), PackageDigest: hex.EncodeToString(digest[:])}, nil
}

func encodeArchive(rawManifest, signature []byte, files []FileEntry, dataByPath map[string][]byte) ([]byte, error) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	add := func(name string, data []byte) error {
		header := &zip.FileHeader{Name: name, Method: zip.Store}
		header.SetMode(0o644)
		header.SetModTime(time.Date(1980, 1, 1, 0, 0, 0, 0, time.UTC))
		entry, err := writer.CreateHeader(header)
		if err != nil {
			return err
		}
		_, err = entry.Write(data)
		return err
	}
	if err := add(ManifestEntryName, rawManifest); err != nil {
		writer.Close()
		return nil, newError(CodeInvalidPackage, "cannot write flow.json", err)
	}
	if err := add(SignatureEntryName, signature); err != nil {
		writer.Close()
		return nil, newError(CodeInvalidPackage, "cannot write flow.sig", err)
	}
	for _, file := range files {
		if err := add(file.Path, dataByPath[file.Path]); err != nil {
			writer.Close()
			return nil, newError(CodeInvalidPackage, "cannot write flow file", err)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, newError(CodeInvalidPackage, "cannot finalize flow package", err)
	}
	return buffer.Bytes(), nil
}

func WriteFile(filePath string, result *BuildResult) error {
	if result == nil || len(result.Data) == 0 {
		return newError(CodeInvalidPackage, "flow build result is empty", nil)
	}
	file, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return newError(CodeOutputExists, "flow output already exists", nil)
		}
		return newError(CodeInvalidPackage, "cannot create flow output", err)
	}
	ok := false
	defer func() {
		file.Close()
		if !ok {
			_ = os.Remove(filePath)
		}
	}()
	if _, err := file.Write(result.Data); err != nil {
		return newError(CodeInvalidPackage, "cannot write flow output", err)
	}
	if err := file.Sync(); err != nil {
		return newError(CodeInvalidPackage, "cannot flush flow output", err)
	}
	if err := file.Close(); err != nil {
		return newError(CodeInvalidPackage, "cannot close flow output", err)
	}
	ok = true
	return nil
}
