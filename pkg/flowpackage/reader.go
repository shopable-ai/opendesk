package flowpackage

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path"
	"strings"

	"opendesk/pkg/scriptpackage"
)

type Package struct {
	Manifest       Manifest
	RawManifest    []byte
	Signature      []byte
	PublisherKey   ed25519.PublicKey
	Entries        map[string][]byte
	ArchiveDigest  string
	ManifestDigest string
}

func ReadFile(filePath string) (*Package, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, newError(CodeInvalidContainer, "cannot open Flow package", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return nil, newError(CodeInvalidContainer, "Flow package path must be a regular file", err)
	}
	if info.Size() < 1 || info.Size() > MaxArchiveSize {
		return nil, newError(CodeFlowTooLarge, "Flow package size is outside the allowed range", nil)
	}
	data, err := io.ReadAll(io.LimitReader(file, MaxArchiveSize+1))
	if err != nil {
		return nil, newError(CodeInvalidContainer, "cannot read Flow package", err)
	}
	if int64(len(data)) > MaxArchiveSize {
		return nil, newError(CodeFlowTooLarge, "Flow package exceeds the archive size limit", nil)
	}
	return Read(data)
}

func Read(data []byte) (*Package, error) {
	if len(data) == 0 || int64(len(data)) > MaxArchiveSize {
		return nil, newError(CodeFlowTooLarge, "Flow package size is outside the allowed range", nil)
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, newError(CodeInvalidContainer, "Flow package is not a valid ZIP container", nil)
	}
	if len(reader.File) < 3 || len(reader.File) > MaxEntryCount {
		return nil, newError(CodeInvalidContainer, "Flow package entry count is outside the allowed range", nil)
	}
	entries := make(map[string][]byte, len(reader.File))
	normalized := make(map[string]string, len(reader.File))
	directories := map[string]struct{}{}
	var total int64
	for _, file := range reader.File {
		mode := file.Mode()
		isDirectory := file.FileInfo().IsDir()
		key, pathErr := normalizeEntryPath(file.Name, isDirectory)
		if pathErr != nil {
			return nil, newError(CodeInvalidContainer, "Flow package contains an illegal path", nil)
		}
		if original, exists := normalized[key]; exists {
			return nil, newError(CodeInvalidContainer, fmt.Sprintf("Flow package contains duplicate cross-platform entries %q and %q", original, file.Name), nil)
		}
		normalized[key] = file.Name
		if mode&os.ModeType != 0 && !isDirectory {
			return nil, newError(CodeInvalidContainer, "Flow package contains a link or special file", nil)
		}
		trimmed := strings.TrimSuffix(file.Name, "/")
		for parent := path.Dir(trimmed); parent != "."; parent = path.Dir(parent) {
			parentKey, _ := normalizeEntryPath(parent, true)
			if existing, ok := normalized[parentKey]; ok && !strings.HasSuffix(existing, "/") {
				return nil, newError(CodeInvalidContainer, "Flow package contains a file/directory conflict", nil)
			}
		}
		if isDirectory {
			directories[key] = struct{}{}
			continue
		}
		if _, conflict := directories[key]; conflict {
			return nil, newError(CodeInvalidContainer, "Flow package contains a file/directory conflict", nil)
		}
		limit := MaxEntrySize
		if file.Name == ManifestName {
			limit = MaxManifestSize
		} else if file.Name == SignatureName {
			limit = MaxSignatureSize
		}
		if file.UncompressedSize64 > uint64(limit) {
			return nil, newError(CodeFlowTooLarge, "Flow package entry exceeds its size limit", nil)
		}
		if file.UncompressedSize64 > 1<<20 {
			if file.CompressedSize64 == 0 || file.UncompressedSize64/file.CompressedSize64 > MaxCompressionRatio {
				return nil, newError(CodeFlowTooLarge, "Flow package compression ratio exceeds its limit", nil)
			}
		}
		content, readErr := readEntry(file, limit)
		if readErr != nil {
			return nil, readErr
		}
		total += int64(len(content))
		if total > MaxTotalSize {
			return nil, newError(CodeFlowTooLarge, "Flow package total unpacked size exceeds its limit", nil)
		}
		entries[file.Name] = content
	}
	rawManifest, manifestOK := entries[ManifestName]
	signature, signatureOK := entries[SignatureName]
	if !manifestOK || !signatureOK || len(signature) != ed25519.SignatureSize {
		return nil, newError(CodeInvalidContainer, "Flow package is missing one canonical manifest or signature", nil)
	}
	manifest, err := decodeManifest(rawManifest)
	if err != nil {
		return nil, err
	}
	publisherData, publisherOK := entries[PublisherKeyName]
	if !publisherOK {
		return nil, newError(CodeInvalidManifest, "publisher public key is not present", nil)
	}
	publicKey, err := scriptpackage.ParseEd25519PublicKey(publisherData)
	if err != nil {
		return nil, newError(CodeIdentityMismatch, "publisher public key is invalid", nil)
	}
	if PublicKeyFingerprint(publicKey) != manifest.PublisherFingerprint {
		return nil, newError(CodeIdentityMismatch, "publisher public-key fingerprint does not match flow.json", nil)
	}
	if err := VerifySignature(rawManifest, signature, publicKey); err != nil {
		return nil, err
	}
	declared := make(map[string]FileRecord, len(manifest.Files))
	for _, record := range manifest.Files {
		declared[record.Path] = record
	}
	for name, content := range entries {
		if name == ManifestName || name == SignatureName {
			continue
		}
		record, ok := declared[name]
		if !ok {
			return nil, newError(CodePayloadMismatch, "Flow package contains an undeclared payload file", nil)
		}
		digest := sha256.Sum256(content)
		if record.Size != int64(len(content)) || record.SHA256 != hex.EncodeToString(digest[:]) {
			return nil, newError(CodePayloadMismatch, "Flow payload size or digest does not match flow.json", nil)
		}
		delete(declared, name)
	}
	if len(declared) != 0 {
		return nil, newError(CodePayloadMismatch, "Flow package is missing a declared payload file", nil)
	}
	if strings.EqualFold(path.Ext(manifest.Entry), ".odpkg") {
		protected, protectedErr := scriptpackage.Read(entries[manifest.Entry])
		if protectedErr != nil {
			return nil, newError(CodePayloadMismatch, "protected Flow entry is not a valid .odpkg", protectedErr)
		}
		identity := manifest.Protected
		if identity == nil || protected.Manifest.PublisherID != manifest.PublisherID ||
			protected.Manifest.PublisherKeyID != manifest.PublisherKeyID ||
			protected.Manifest.ProductID != identity.ProductID || protected.Manifest.PackageID != identity.PackageID ||
			protected.Manifest.Encryption.KeyID != identity.ContentKeyID {
			return nil, newError(CodeIdentityMismatch, "outer Flow and protected package identities do not match", nil)
		}
		if err := scriptpackage.VerifySignature(protected.RawManifest, protected.Payload, protected.Signature, publicKey); err != nil {
			return nil, newError(CodeIdentityMismatch, "protected package is not signed by the Flow publisher key", err)
		}
	}
	archiveDigest := sha256.Sum256(data)
	manifestDigest := sha256.Sum256(rawManifest)
	return &Package{
		Manifest: manifest, RawManifest: append([]byte(nil), rawManifest...), Signature: append([]byte(nil), signature...),
		PublisherKey: append(ed25519.PublicKey(nil), publicKey...), Entries: entries,
		ArchiveDigest: hex.EncodeToString(archiveDigest[:]), ManifestDigest: hex.EncodeToString(manifestDigest[:]),
	}, nil
}

func readEntry(file *zip.File, limit int64) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, newError(CodeInvalidContainer, "cannot open Flow package entry", nil)
	}
	defer reader.Close()
	content, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, newError(CodeInvalidContainer, "cannot read Flow package entry", nil)
	}
	if int64(len(content)) > limit {
		return nil, newError(CodeFlowTooLarge, "Flow package entry exceeds its actual-read limit", nil)
	}
	return content, nil
}
