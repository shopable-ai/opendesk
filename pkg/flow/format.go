package flow

import (
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	SchemaVersion                   = 1
	ManifestEntryName               = "flow.json"
	SignatureEntryName              = "flow.sig"
	PublisherPublicKeyEntryName     = "trust/publisher.pub"
	LicenseIssuerPublicKeyEntryName = "trust/license-issuer.pub"
	EntrypointMainJS                = "main.js"
	EntrypointMainPackage           = "main.odpkg"

	MaxFileCount  = 256
	MaxPathLength = 240
)

var (
	identifierPattern  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	versionPattern     = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)
	digestPattern      = regexp.MustCompile(`^[a-f0-9]{64}$`)
	pathSegmentPattern = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9._@+-]{0,127}$`)
)

type FileEntry struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type CommercialManifest struct {
	ProductID          string   `json:"productId"`
	LicenseIssuerKeyID string   `json:"licenseIssuerKeyId"`
	Purposes           []string `json:"purposes"`
}

type Manifest struct {
	SchemaVersion         int                 `json:"schemaVersion"`
	FlowID                string              `json:"flowId"`
	Name                  string              `json:"name"`
	Version               string              `json:"version"`
	PublisherID           string              `json:"publisherId"`
	PublisherKeyID        string              `json:"publisherKeyId"`
	Entry                 string              `json:"entry"`
	MinimumRuntimeVersion string              `json:"minimumRuntimeVersion"`
	Platforms             []string            `json:"platforms"`
	Files                 []FileEntry         `json:"files"`
	Commercial            *CommercialManifest `json:"commercial,omitempty"`
}

func (m Manifest) Validate() error {
	if m.SchemaVersion != SchemaVersion {
		return newError(CodeUnsupportedFormat, "flow schemaVersion is not supported", nil)
	}
	for name, value := range map[string]string{
		"flowId": m.FlowID, "publisherId": m.PublisherID, "publisherKeyId": m.PublisherKeyID,
	} {
		if !identifierPattern.MatchString(value) {
			return newError(CodeInvalidManifest, fmt.Sprintf("%s is invalid", name), nil)
		}
	}
	if !utf8.ValidString(m.Name) || strings.TrimSpace(m.Name) != m.Name || m.Name == "" || len([]byte(m.Name)) > 128 {
		return newError(CodeInvalidManifest, "name must be 1-128 UTF-8 bytes without surrounding whitespace", nil)
	}
	if !validSemanticVersion(m.Version) {
		return newError(CodeInvalidManifest, "version must be a semantic version", nil)
	}
	if !validSemanticVersion(m.MinimumRuntimeVersion) {
		return newError(CodeInvalidManifest, "minimumRuntimeVersion must be a semantic version", nil)
	}
	if m.Entry != EntrypointMainJS && m.Entry != EntrypointMainPackage {
		return newError(CodeInvalidManifest, "v1 entry must be main.js or main.odpkg", nil)
	}
	if len(m.Platforms) == 0 || len(m.Platforms) > 3 {
		return newError(CodeInvalidManifest, "platforms must contain one or more supported platforms", nil)
	}
	allowedPlatforms := map[string]bool{"darwin": true, "linux": true, "windows": true}
	previousPlatform := ""
	for _, platformName := range m.Platforms {
		if !allowedPlatforms[platformName] {
			return newError(CodeInvalidManifest, "platforms contains an unsupported value", nil)
		}
		if previousPlatform != "" && platformName <= previousPlatform {
			return newError(CodeInvalidManifest, "platforms must be unique and sorted", nil)
		}
		previousPlatform = platformName
	}
	return m.validateFiles()
}

func (m Manifest) validateFiles() error {
	if len(m.Files) == 0 || len(m.Files) > MaxFileCount {
		return newError(CodeInvalidManifest, "files must contain 1-256 entries", nil)
	}
	seenFolded := map[string]struct{}{}
	previousPath := ""
	hasEntry, hasPublisherKey, hasIssuerKey := false, false, false
	for _, file := range m.Files {
		if err := ValidateContentPath(file.Path); err != nil {
			return err
		}
		if previousPath != "" && file.Path <= previousPath {
			return newError(CodeInvalidManifest, "files must be unique and sorted by path", nil)
		}
		previousPath = file.Path
		folded := strings.ToLower(file.Path)
		if _, exists := seenFolded[folded]; exists {
			return newError(CodeInvalidPath, "file paths must be unique ignoring ASCII case", nil)
		}
		seenFolded[folded] = struct{}{}
		if !digestPattern.MatchString(file.SHA256) {
			return newError(CodeInvalidManifest, "files.sha256 must be lowercase SHA-256 hex", nil)
		}
		if file.Size < 0 {
			return newError(CodeInvalidManifest, "files.size must not be negative", nil)
		}
		hasEntry = hasEntry || file.Path == m.Entry
		hasPublisherKey = hasPublisherKey || file.Path == PublisherPublicKeyEntryName
		hasIssuerKey = hasIssuerKey || file.Path == LicenseIssuerPublicKeyEntryName
	}
	if !hasEntry {
		return newError(CodeInvalidManifest, "files must include entry", nil)
	}
	if !hasPublisherKey {
		return newError(CodeInvalidManifest, "files must include trust/publisher.pub", nil)
	}
	if m.Commercial == nil {
		if m.Entry == EntrypointMainPackage {
			return newError(CodeInvalidManifest, "protected entry requires commercial metadata", nil)
		}
		if hasIssuerKey {
			return newError(CodeInvalidManifest, "trust/license-issuer.pub requires commercial metadata", nil)
		}
		return nil
	}
	if !identifierPattern.MatchString(m.Commercial.ProductID) {
		return newError(CodeInvalidManifest, "commercial.productId is invalid", nil)
	}
	if !identifierPattern.MatchString(m.Commercial.LicenseIssuerKeyID) {
		return newError(CodeInvalidManifest, "commercial.licenseIssuerKeyId is invalid", nil)
	}
	if len(m.Commercial.Purposes) != 1 || m.Commercial.Purposes[0] != "run" {
		return newError(CodeInvalidManifest, "commercial.purposes must be exactly [\"run\"] in v1", nil)
	}
	if !hasIssuerKey {
		return newError(CodeInvalidManifest, "commercial metadata requires trust/license-issuer.pub", nil)
	}
	return nil
}

func ValidateContentPath(value string) error {
	if value == "" || len(value) > MaxPathLength || strings.Contains(value, "\\") || strings.HasPrefix(value, "/") || path.Clean(value) != value {
		return newError(CodeInvalidPath, "flow file path is invalid", nil)
	}
	if value == ManifestEntryName || value == SignatureEntryName {
		return newError(CodeInvalidPath, "flow inventory must not contain flow.json or flow.sig", nil)
	}
	for _, segment := range strings.Split(value, "/") {
		if segment == "." || segment == ".." || !pathSegmentPattern.MatchString(segment) {
			return newError(CodeInvalidPath, "flow file path uses a non-portable segment", nil)
		}
	}
	return nil
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

func normalizedPlatforms(values []string) []string {
	result := append([]string(nil), values...)
	sort.Strings(result)
	return result
}
