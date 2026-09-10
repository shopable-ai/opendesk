package scriptpackage

import (
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"
)

const (
	FormatName          = "opendesk-protected-recipe"
	FormatVersion       = 1
	PayloadJavaScript   = "javascript"
	EntrypointMainJS    = "main.js"
	EncryptionAES256GCM = "AES-256-GCM"
)

var (
	identifierPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	versionPattern    = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)
)

type EncryptionManifest struct {
	Algorithm string `json:"algorithm"`
	KeyID     string `json:"keyId"`
	Nonce     string `json:"nonce"`
}

type LicenseManifest struct {
	Required  bool   `json:"required"`
	ProductID string `json:"productId"`
}

// Manifest is the public metadata authenticated by both the publisher signature
// and AES-GCM AAD. The raw manifest bytes, not a re-marshaled value, are used by
// the reader during verification and decryption.
type Manifest struct {
	Format                string             `json:"format"`
	FormatVersion         int                `json:"formatVersion"`
	PackageID             string             `json:"packageId"`
	ProductID             string             `json:"productId"`
	PublisherID           string             `json:"publisherId"`
	PublisherKeyID        string             `json:"publisherKeyId"`
	Entrypoint            string             `json:"entrypoint"`
	PayloadType           string             `json:"payloadType"`
	MinimumRuntimeVersion string             `json:"minimumRuntimeVersion"`
	Encryption            EncryptionManifest `json:"encryption"`
	License               LicenseManifest    `json:"license"`
}

func (m Manifest) Validate() error {
	if m.Format != FormatName || m.FormatVersion != FormatVersion {
		return newError(CodeUnsupportedFormat, "protected package format or version is not supported", nil)
	}
	for name, value := range map[string]string{
		"packageId":        m.PackageID,
		"productId":        m.ProductID,
		"publisherId":      m.PublisherID,
		"publisherKeyId":   m.PublisherKeyID,
		"encryption.keyId": m.Encryption.KeyID,
	} {
		if !identifierPattern.MatchString(value) {
			return newError(CodeInvalidManifest, fmt.Sprintf("%s is invalid", name), nil)
		}
	}
	if m.Entrypoint != EntrypointMainJS {
		return newError(CodeUnsupportedPayload, "v1 entrypoint must be main.js", nil)
	}
	if m.PayloadType != PayloadJavaScript {
		return newError(CodeUnsupportedPayload, "v1 payloadType must be javascript", nil)
	}
	if !validSemanticVersion(m.MinimumRuntimeVersion) {
		return newError(CodeInvalidManifest, "minimumRuntimeVersion must be a semantic version", nil)
	}
	if m.Encryption.Algorithm != EncryptionAES256GCM {
		return newError(CodeUnsupportedFormat, "v1 encryption algorithm must be AES-256-GCM", nil)
	}
	nonce, err := base64.StdEncoding.DecodeString(m.Encryption.Nonce)
	if err != nil || len(nonce) != NonceSize || base64.StdEncoding.EncodeToString(nonce) != m.Encryption.Nonce {
		return newError(CodeInvalidManifest, "encryption.nonce must be base64-encoded 12-byte data", nil)
	}
	if !identifierPattern.MatchString(m.License.ProductID) || m.License.ProductID != m.ProductID {
		return newError(CodeInvalidManifest, "license.productId must equal productId", nil)
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

// DecodeNonce returns a validated copy of the AES-GCM nonce.
func (m Manifest) DecodeNonce() ([]byte, error) {
	if err := m.Validate(); err != nil {
		return nil, err
	}
	nonce, _ := base64.StdEncoding.DecodeString(m.Encryption.Nonce)
	return append([]byte(nil), nonce...), nil
}
