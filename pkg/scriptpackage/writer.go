package scriptpackage

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
)

type BuildResult struct {
	Bytes         []byte
	Manifest      Manifest
	PackageDigest string
}

// Build creates one in-memory .odpkg v1. The content key is caller-owned and is
// never inserted into the manifest or package bytes.
func Build(source []byte, manifest Manifest, contentKey []byte, privateKey ed25519.PrivateKey) (*BuildResult, error) {
	if len(source) == 0 {
		return nil, newError(CodePayloadInvalid, "JavaScript source is empty", nil)
	}
	if int64(len(source)) > MaxPayloadSize-64 {
		return nil, newError(CodePackageTooLarge, "JavaScript source exceeds protected payload limit", nil)
	}
	if len(contentKey) != ContentKeySize {
		return nil, newError(CodeInvalidPackage, "content key must be 32 bytes", nil)
	}
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, newError(CodeInvalidPackage, "publisher Ed25519 private key is invalid", nil)
	}

	nonce, err := GenerateNonce()
	if err != nil {
		return nil, err
	}
	manifest.Format = FormatName
	manifest.FormatVersion = FormatVersion
	manifest.Entrypoint = EntrypointMainJS
	manifest.PayloadType = PayloadJavaScript
	manifest.Encryption.Algorithm = EncryptionAES256GCM
	manifest.Encryption.Nonce = base64.StdEncoding.EncodeToString(nonce)
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	rawManifest, err := json.Marshal(manifest)
	if err != nil {
		return nil, newError(CodeInvalidManifest, "cannot encode manifest.json", nil)
	}
	if int64(len(rawManifest)) > MaxManifestSize {
		return nil, newError(CodePackageTooLarge, "manifest.json exceeds maximum size", nil)
	}

	payload, err := Encrypt(source, contentKey, nonce, rawManifest)
	if err != nil {
		return nil, err
	}
	if int64(len(payload)) > MaxPayloadSize {
		return nil, newError(CodePackageTooLarge, "payload.bin exceeds maximum size", nil)
	}
	signature, err := Sign(rawManifest, payload, privateKey)
	if err != nil {
		return nil, err
	}

	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	for _, entry := range []struct {
		name string
		data []byte
	}{
		{name: ManifestEntryName, data: rawManifest},
		{name: PayloadEntryName, data: payload},
		{name: SignatureEntryName, data: signature},
	} {
		header := &zip.FileHeader{Name: entry.name, Method: zip.Store}
		header.SetMode(0o600)
		file, err := writer.CreateHeader(header)
		if err != nil {
			_ = writer.Close()
			return nil, newError(CodeInvalidPackage, "cannot create protected package entry", nil)
		}
		if _, err := file.Write(entry.data); err != nil {
			_ = writer.Close()
			return nil, newError(CodeInvalidPackage, "cannot write protected package entry", nil)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, newError(CodeInvalidPackage, "cannot finalize protected package", nil)
	}
	if int64(output.Len()) > MaxPackageSize {
		return nil, newError(CodePackageTooLarge, "protected package exceeds maximum size", nil)
	}
	packageBytes := append([]byte(nil), output.Bytes()...)
	digest := sha256.Sum256(packageBytes)
	return &BuildResult{
		Bytes:         packageBytes,
		Manifest:      manifest,
		PackageDigest: hex.EncodeToString(digest[:]),
	}, nil
}

func WriteFile(filePath string, result *BuildResult) error {
	if result == nil || len(result.Bytes) == 0 {
		return fmt.Errorf("protected package build result is empty")
	}
	if err := os.WriteFile(filePath, result.Bytes, 0o644); err != nil {
		return fmt.Errorf("write protected package: %w", err)
	}
	return nil
}
