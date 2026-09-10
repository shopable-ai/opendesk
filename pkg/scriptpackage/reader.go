package scriptpackage

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
	"path"
	"strings"
)

const (
	ManifestEntryName  = "manifest.json"
	PayloadEntryName   = "payload.bin"
	SignatureEntryName = "signature.ed25519"

	MaxPackageSize   int64 = 20 << 20
	MaxEntryCount          = 3
	MaxManifestSize  int64 = 64 << 10
	MaxPayloadSize   int64 = 16 << 20
	MaxSignatureSize int64 = 128
)

type Package struct {
	Manifest      Manifest
	RawManifest   []byte
	Payload       []byte
	Signature     []byte
	PackageDigest string
}

func ReadFile(filePath string) (*Package, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot open protected package", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot stat protected package", err)
	}
	if info.IsDir() {
		return nil, newError(CodeInvalidPackage, "protected package path is a directory", nil)
	}
	if !info.Mode().IsRegular() {
		return nil, newError(CodeInvalidPackage, "protected package path must be a regular file", nil)
	}
	if info.Size() > MaxPackageSize {
		return nil, newError(CodePackageTooLarge, "protected package exceeds maximum size", nil)
	}
	data, err := io.ReadAll(io.LimitReader(file, MaxPackageSize+1))
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot read protected package", err)
	}
	if int64(len(data)) > MaxPackageSize {
		return nil, newError(CodePackageTooLarge, "protected package exceeds maximum size", nil)
	}
	return Read(data)
}

func Read(data []byte) (*Package, error) {
	if len(data) == 0 {
		return nil, newError(CodeInvalidPackage, "protected package is empty", nil)
	}
	if int64(len(data)) > MaxPackageSize {
		return nil, newError(CodePackageTooLarge, "protected package exceeds maximum size", nil)
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, newError(CodeInvalidPackage, "protected package is not a valid ZIP container", nil)
	}
	if len(reader.File) != MaxEntryCount {
		return nil, newError(CodeInvalidPackage, "protected package must contain exactly three entries", nil)
	}

	entries := make(map[string][]byte, MaxEntryCount)
	for _, file := range reader.File {
		if err := validateEntryName(file.Name); err != nil {
			return nil, err
		}
		if _, exists := entries[file.Name]; exists {
			return nil, newError(CodeInvalidPackage, "protected package contains duplicate entries", nil)
		}
		limit, ok := entryLimit(file.Name)
		if !ok {
			return nil, newError(CodeInvalidPackage, "protected package contains an unexpected entry", nil)
		}
		if file.FileInfo().IsDir() || file.UncompressedSize64 > uint64(limit) {
			return nil, newError(CodePackageTooLarge, fmt.Sprintf("%s exceeds its size limit", file.Name), nil)
		}
		content, err := readZipEntry(file, limit)
		if err != nil {
			return nil, err
		}
		entries[file.Name] = content
	}

	rawManifest, manifestOK := entries[ManifestEntryName]
	payload, payloadOK := entries[PayloadEntryName]
	signature, signatureOK := entries[SignatureEntryName]
	if !manifestOK || !payloadOK || !signatureOK {
		return nil, newError(CodeInvalidPackage, "protected package is missing a required entry", nil)
	}
	if len(signature) != ed25519.SignatureSize {
		return nil, newError(CodeInvalidSignature, "signature.ed25519 must contain exactly one Ed25519 signature", nil)
	}
	if len(payload) == 0 {
		return nil, newError(CodePayloadInvalid, "payload.bin is empty", nil)
	}

	var manifest Manifest
	decoder := json.NewDecoder(bytes.NewReader(rawManifest))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return nil, newError(CodeInvalidManifest, "manifest.json is invalid", nil)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return nil, err
	}
	if err := manifest.Validate(); err != nil {
		return nil, err
	}

	digest := sha256.Sum256(data)
	return &Package{
		Manifest:      manifest,
		RawManifest:   append([]byte(nil), rawManifest...),
		Payload:       append([]byte(nil), payload...),
		Signature:     append([]byte(nil), signature...),
		PackageDigest: hex.EncodeToString(digest[:]),
	}, nil
}

func validateEntryName(name string) error {
	if name == "" || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") || path.Clean(name) != name || strings.Contains(name, "/") {
		return newError(CodeInvalidPackage, "protected package entry path is invalid", nil)
	}
	return nil
}

func entryLimit(name string) (int64, bool) {
	switch name {
	case ManifestEntryName:
		return MaxManifestSize, true
	case PayloadEntryName:
		return MaxPayloadSize, true
	case SignatureEntryName:
		return MaxSignatureSize, true
	default:
		return 0, false
	}
}

func readZipEntry(file *zip.File, limit int64) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot open protected package entry", nil)
	}
	defer reader.Close()
	content, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot read protected package entry", nil)
	}
	if int64(len(content)) > limit {
		return nil, newError(CodePackageTooLarge, fmt.Sprintf("%s exceeds its size limit", file.Name), nil)
	}
	return content, nil
}

func requireJSONEOF(decoder *json.Decoder) error {
	var trailing any
	if err := decoder.Decode(&trailing); err == io.EOF {
		return nil
	} else if err != nil {
		return newError(CodeInvalidManifest, "manifest.json has invalid trailing data", nil)
	}
	return newError(CodeInvalidManifest, "manifest.json contains multiple JSON values", nil)
}
