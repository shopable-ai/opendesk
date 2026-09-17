package flowpackage

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	FormatName       = "opendesk-flow"
	SchemaVersion    = 1
	ManifestName     = "flow.json"
	SignatureName    = "flow.sig"
	PublisherKeyName = "trust/publisher.pub"

	MaxArchiveSize      int64 = 64 << 20
	MaxManifestSize     int64 = 256 << 10
	MaxSignatureSize    int64 = 128
	MaxEntrySize        int64 = 32 << 20
	MaxTotalSize        int64 = 64 << 20
	MaxEntryCount             = 258 // 256 declared payload files plus flow.json/flow.sig
	MaxPathLength             = 240
	MaxPathDepth              = 32
	MaxCompressionRatio       = 200
)

var (
	identifierPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	versionPattern    = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)
)

type FileRecord struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type ProtectedIdentity struct {
	ProductID          string `json:"productId"`
	PackageID          string `json:"packageId"`
	ContentKeyID       string `json:"contentKeyId"`
	LicenseIssuerKeyID string `json:"licenseIssuerKeyId,omitempty"`
}

// Manifest is the canonical signed .odflow v1 manifest. Paths are portable
// slash-separated relative names; absolute host paths are never serialized.
type Manifest struct {
	Format                string             `json:"format"`
	SchemaVersion         int                `json:"schemaVersion"`
	FlowID                string             `json:"flowId"`
	Name                  string             `json:"name"`
	Version               string             `json:"version"`
	PublisherID           string             `json:"publisherId"`
	PublisherKeyID        string             `json:"publisherKeyId"`
	PublisherFingerprint  string             `json:"publisherFingerprint"`
	Entry                 string             `json:"entry"`
	MinimumRuntimeVersion string             `json:"minimumRuntimeVersion"`
	Platforms             []string           `json:"platforms"`
	Files                 []FileRecord       `json:"files"`
	Protected             *ProtectedIdentity `json:"protected,omitempty"`
}

func (m Manifest) Validate() error {
	if m.Format != FormatName || m.SchemaVersion != SchemaVersion {
		return newError(CodeUnsupportedFormat, "Flow format or schema version is not supported", nil)
	}
	for name, value := range map[string]string{
		"flowId": m.FlowID, "publisherId": m.PublisherID, "publisherKeyId": m.PublisherKeyID,
	} {
		if !identifierPattern.MatchString(value) {
			return newError(CodeInvalidManifest, fmt.Sprintf("%s is invalid", name), nil)
		}
	}
	if strings.TrimSpace(m.Name) != m.Name || m.Name == "" || utf8.RuneCountInString(m.Name) > 200 || strings.ContainsAny(m.Name, "\r\n\x00") {
		return newError(CodeInvalidManifest, "name must be a bounded single-line value", nil)
	}
	if !validSemanticVersion(m.Version) || !validSemanticVersion(m.MinimumRuntimeVersion) {
		return newError(CodeInvalidManifest, "version and minimumRuntimeVersion must be strict semantic versions", nil)
	}
	if len(m.PublisherFingerprint) != sha256.Size*2 {
		return newError(CodeInvalidManifest, "publisherFingerprint must be a SHA-256 hex digest", nil)
	}
	if decoded, err := hex.DecodeString(m.PublisherFingerprint); err != nil || len(decoded) != sha256.Size || strings.ToLower(m.PublisherFingerprint) != m.PublisherFingerprint {
		return newError(CodeInvalidManifest, "publisherFingerprint must be lowercase SHA-256 hex", nil)
	}
	entryKey, err := normalizeEntryPath(m.Entry, false)
	if err != nil {
		return newError(CodeInvalidManifest, "entry path is invalid", err)
	}
	ext := strings.ToLower(path.Ext(m.Entry))
	if ext != ".js" && ext != ".mjs" && ext != ".odpkg" {
		return newError(CodeInvalidManifest, "entry must be .js, .mjs, or .odpkg", nil)
	}
	if len(m.Platforms) == 0 {
		return newError(CodeInvalidManifest, "platforms must not be empty", nil)
	}
	platforms := map[string]struct{}{}
	previousPlatform := ""
	for _, platform := range m.Platforms {
		if platform != "darwin" && platform != "windows" && platform != "linux" {
			return newError(CodeInvalidManifest, "platforms contains an unsupported value", nil)
		}
		if _, exists := platforms[platform]; exists {
			return newError(CodeInvalidManifest, "platforms contains a duplicate value", nil)
		}
		if previousPlatform != "" && previousPlatform >= platform {
			return newError(CodeInvalidManifest, "platforms must be sorted", nil)
		}
		previousPlatform = platform
		platforms[platform] = struct{}{}
	}
	if len(m.Files) == 0 || len(m.Files) > MaxEntryCount-2 {
		return newError(CodeInvalidManifest, "files count is invalid", nil)
	}
	seen := map[string]struct{}{}
	entryPresent := false
	publisherKeyPresent := false
	previousPath := ""
	for _, file := range m.Files {
		key, pathErr := normalizeEntryPath(file.Path, false)
		if pathErr != nil || file.Path == ManifestName || file.Path == SignatureName {
			return newError(CodeInvalidManifest, "files contains an invalid path", pathErr)
		}
		if _, exists := seen[key]; exists {
			return newError(CodeInvalidManifest, "files contains duplicate cross-platform paths", nil)
		}
		seen[key] = struct{}{}
		if previousPath != "" && previousPath >= file.Path {
			return newError(CodeInvalidManifest, "files must be sorted by path", nil)
		}
		previousPath = file.Path
		if file.Size < 0 || file.Size > MaxEntrySize {
			return newError(CodeInvalidManifest, "files contains an invalid size", nil)
		}
		if len(file.SHA256) != sha256.Size*2 {
			return newError(CodeInvalidManifest, "files contains an invalid SHA-256 digest", nil)
		}
		if decoded, digestErr := hex.DecodeString(file.SHA256); digestErr != nil || len(decoded) != sha256.Size || strings.ToLower(file.SHA256) != file.SHA256 {
			return newError(CodeInvalidManifest, "files contains a non-canonical SHA-256 digest", nil)
		}
		entryPresent = entryPresent || key == entryKey
		publisherKeyPresent = publisherKeyPresent || file.Path == PublisherKeyName
	}
	if !entryPresent {
		return newError(CodeInvalidManifest, "entry is not declared in files", nil)
	}
	if !publisherKeyPresent {
		return newError(CodeInvalidManifest, "trust/publisher.pub is required", nil)
	}
	if ext == ".odpkg" {
		if m.Protected == nil {
			return newError(CodeInvalidManifest, "protected identity is required for an .odpkg entry", nil)
		}
		for name, value := range map[string]string{
			"protected.productId":    m.Protected.ProductID,
			"protected.packageId":    m.Protected.PackageID,
			"protected.contentKeyId": m.Protected.ContentKeyID,
		} {
			if !identifierPattern.MatchString(value) {
				return newError(CodeInvalidManifest, fmt.Sprintf("%s is invalid", name), nil)
			}
		}
		if m.Protected.LicenseIssuerKeyID != "" && !identifierPattern.MatchString(m.Protected.LicenseIssuerKeyID) {
			return newError(CodeInvalidManifest, "protected.licenseIssuerKeyId is invalid", nil)
		}
	} else if m.Protected != nil {
		return newError(CodeInvalidManifest, "protected identity is valid only for an .odpkg entry", nil)
	}
	return nil
}

func CanonicalManifestBytes(manifest Manifest) ([]byte, error) {
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	data, err := json.Marshal(manifest)
	if err != nil {
		return nil, newError(CodeInvalidManifest, "cannot encode canonical Flow manifest", err)
	}
	if int64(len(data)) > MaxManifestSize {
		return nil, newError(CodeFlowTooLarge, "flow.json exceeds its size limit", nil)
	}
	return data, nil
}

var signatureDomain = []byte("OpenDeskFlowManifest/v1\x00")

func SignatureMessage(rawManifest []byte) []byte {
	digest := sha256.Sum256(rawManifest)
	message := make([]byte, 0, len(signatureDomain)+len(digest))
	message = append(message, signatureDomain...)
	message = append(message, digest[:]...)
	return message
}

func Sign(rawManifest []byte, privateKey ed25519.PrivateKey) ([]byte, error) {
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, newError(CodeInvalidSignature, "Flow publisher Ed25519 private key is invalid", nil)
	}
	return ed25519.Sign(privateKey, SignatureMessage(rawManifest)), nil
}

func VerifySignature(rawManifest, signature []byte, publicKey ed25519.PublicKey) error {
	if len(signature) != ed25519.SignatureSize || len(publicKey) != ed25519.PublicKeySize || !ed25519.Verify(publicKey, SignatureMessage(rawManifest), signature) {
		return newError(CodeInvalidSignature, "Flow publisher signature verification failed", nil)
	}
	return nil
}

func PublicKeyFingerprint(publicKey ed25519.PublicKey) string {
	digest := sha256.Sum256(publicKey)
	return hex.EncodeToString(digest[:])
}

func SupportsCurrentPlatform(platforms []string) bool {
	for _, platform := range platforms {
		if platform == runtime.GOOS {
			return true
		}
	}
	return false
}

func validSemanticVersion(value string) bool {
	if strings.TrimSpace(value) != value || !versionPattern.MatchString(value) {
		return false
	}
	withoutBuild := strings.SplitN(value, "+", 2)[0]
	parts := strings.SplitN(withoutBuild, "-", 2)
	if len(parts) != 2 {
		return true
	}
	for _, identifier := range strings.Split(parts[1], ".") {
		numeric := true
		for _, character := range identifier {
			if character < '0' || character > '9' {
				numeric = false
				break
			}
		}
		if numeric && len(identifier) > 1 && identifier[0] == '0' {
			return false
		}
	}
	return true
}

func normalizeEntryPath(name string, directory bool) (string, error) {
	if !utf8.ValidString(name) || name == "" || len(name) > MaxPathLength || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") || strings.HasPrefix(name, "//") || filepath.VolumeName(name) != "" || strings.Contains(name, ":") {
		return "", fmt.Errorf("path is not a portable relative name")
	}
	trimmed := strings.TrimSuffix(name, "/")
	if trimmed == "" || path.Clean(trimmed) != trimmed || (!directory && trimmed != name) {
		return "", fmt.Errorf("path is not canonical")
	}
	components := strings.Split(trimmed, "/")
	if len(components) > MaxPathDepth {
		return "", fmt.Errorf("path depth exceeds limit")
	}
	for _, component := range components {
		if component == "" || component == "." || component == ".." || len(component) > 128 || strings.HasSuffix(component, ".") || strings.HasSuffix(component, " ") {
			return "", fmt.Errorf("path component is invalid")
		}
		for _, character := range component {
			if character < 0x20 || character == 0x7f {
				return "", fmt.Errorf("path contains a control character")
			}
		}
		base := strings.ToUpper(strings.SplitN(component, ".", 2)[0])
		if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" ||
			(len(base) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && base[3] >= '1' && base[3] <= '9') {
			return "", fmt.Errorf("path contains a Windows reserved name")
		}
	}
	return strings.ToLower(norm.NFC.String(trimmed)), nil
}

func rejectDuplicateObjectKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	var readValue func() error
	readValue = func() error {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delim, isDelim := token.(json.Delim)
		if !isDelim {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]struct{}{}
			for decoder.More() {
				keyToken, tokenErr := decoder.Token()
				if tokenErr != nil {
					return tokenErr
				}
				key, ok := keyToken.(string)
				if !ok {
					return fmt.Errorf("object key is not a string")
				}
				if _, exists := seen[key]; exists {
					return fmt.Errorf("duplicate key %q", key)
				}
				seen[key] = struct{}{}
				if err := readValue(); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		case '[':
			for decoder.More() {
				if err := readValue(); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		default:
			return fmt.Errorf("unexpected JSON delimiter")
		}
	}
	if err := readValue(); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("manifest contains trailing JSON data")
	}
	return nil
}

func decodeManifest(data []byte) (Manifest, error) {
	if err := rejectDuplicateObjectKeys(data); err != nil {
		return Manifest{}, newError(CodeInvalidManifest, "flow.json contains duplicate or malformed JSON", nil)
	}
	var manifest Manifest
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, newError(CodeInvalidManifest, "flow.json is invalid", nil)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return Manifest{}, newError(CodeInvalidManifest, "flow.json contains trailing JSON", nil)
	}
	if err := manifest.Validate(); err != nil {
		return Manifest{}, err
	}
	canonical, err := CanonicalManifestBytes(manifest)
	if err != nil {
		return Manifest{}, err
	}
	if !bytes.Equal(canonical, data) {
		return Manifest{}, newError(CodeInvalidManifest, "flow.json is not in canonical v1 encoding", nil)
	}
	return manifest, nil
}

func fileRecords(entries map[string][]byte) []FileRecord {
	records := make([]FileRecord, 0, len(entries))
	for name, data := range entries {
		digest := sha256.Sum256(data)
		records = append(records, FileRecord{Path: name, SHA256: hex.EncodeToString(digest[:]), Size: int64(len(data))})
	}
	sort.Slice(records, func(i, j int) bool { return records[i].Path < records[j].Path })
	return records
}
