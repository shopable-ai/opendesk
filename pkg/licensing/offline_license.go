package licensing

import (
	"bytes"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"time"
)

const (
	OfflineLicenseFormat        = "opendesk-device-license"
	OfflineLicenseFormatVersion = 1
	OfflineLicenseExtension     = ".odlicense"
	MaxOfflineLicenseSize       = 64 * 1024
	DeviceKeyAlgorithmP256      = "P-256"
	EnvelopeAlgorithmP256       = "P-256-HKDF-SHA256-AES-256-GCM"
)

var (
	licenseSignatureDomain = []byte("OpenDeskDeviceLicense/v1\x00")
	licenseIdentifier      = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	deviceIdentifier       = regexp.MustCompile(`^device_[a-f0-9]{64}$`)
)

type KeyEnvelope struct {
	Algorithm          string `json:"algorithm"`
	EphemeralPublicKey string `json:"ephemeralPublicKey"`
	Nonce              string `json:"nonce"`
	WrappedContentKey  string `json:"wrappedContentKey"`
}

// LicenseClaims is the exact signed object embedded in an OfflineLicense.
// Times are strings so validation can enforce one unambiguous UTC encoding.
type LicenseClaims struct {
	Format             string      `json:"format"`
	FormatVersion      int         `json:"formatVersion"`
	LicenseID          string      `json:"licenseId"`
	PublisherID        string      `json:"publisherId"`
	PublisherKeyID     string      `json:"publisherKeyId"`
	SubjectID          string      `json:"subjectId"`
	DeviceID           string      `json:"deviceId"`
	DeviceKeyAlgorithm string      `json:"deviceKeyAlgorithm"`
	ProductID          string      `json:"productId"`
	PackageID          string      `json:"packageId"`
	ContentKeyID       string      `json:"contentKeyId"`
	IssuedAt           string      `json:"issuedAt"`
	ExpiresAt          string      `json:"expiresAt"`
	KeyEnvelope        KeyEnvelope `json:"keyEnvelope"`
}

type offlineLicenseJSON struct {
	License   json.RawMessage `json:"license"`
	Signature string          `json:"signature"`
}

type OfflineLicense struct {
	RawClaims []byte
	Claims    LicenseClaims
	Signature []byte
}

func (claims LicenseClaims) Validate() error {
	if claims.Format != OfflineLicenseFormat || claims.FormatVersion != OfflineLicenseFormatVersion {
		return NewError(CodeInvalidLicense, "offline license format or version is not supported", nil)
	}
	for name, value := range map[string]string{
		"licenseId":      claims.LicenseID,
		"publisherId":    claims.PublisherID,
		"publisherKeyId": claims.PublisherKeyID,
		"subjectId":      claims.SubjectID,
		"productId":      claims.ProductID,
		"packageId":      claims.PackageID,
		"contentKeyId":   claims.ContentKeyID,
	} {
		if !licenseIdentifier.MatchString(value) {
			return NewError(CodeInvalidLicense, name+" is invalid", nil)
		}
	}
	if !deviceIdentifier.MatchString(claims.DeviceID) {
		return NewError(CodeInvalidLicense, "deviceId is invalid", nil)
	}
	if claims.DeviceKeyAlgorithm != DeviceKeyAlgorithmP256 {
		return NewError(CodeInvalidLicense, "deviceKeyAlgorithm must be P-256", nil)
	}
	issuedAt, err := parseLicenseTime(claims.IssuedAt)
	if err != nil {
		return NewError(CodeInvalidLicense, "issuedAt must be canonical UTC RFC3339", err)
	}
	expiresAt, err := parseLicenseTime(claims.ExpiresAt)
	if err != nil {
		return NewError(CodeInvalidLicense, "expiresAt must be canonical UTC RFC3339", err)
	}
	if !expiresAt.After(issuedAt) {
		return NewError(CodeInvalidLicense, "expiresAt must be after issuedAt", nil)
	}
	if err := claims.KeyEnvelope.validate(); err != nil {
		return err
	}
	return nil
}

func (claims LicenseClaims) IssuedTime() time.Time {
	value, _ := parseLicenseTime(claims.IssuedAt)
	return value
}

func (claims LicenseClaims) ExpiryTime() time.Time {
	value, _ := parseLicenseTime(claims.ExpiresAt)
	return value
}

func (envelope KeyEnvelope) validate() error {
	if envelope.Algorithm != EnvelopeAlgorithmP256 {
		return NewError(CodeInvalidLicense, "keyEnvelope algorithm is not supported", nil)
	}
	publicKey, err := decodeCanonicalBase64(envelope.EphemeralPublicKey)
	if err != nil || len(publicKey) != 65 {
		return NewError(CodeInvalidLicense, "keyEnvelope ephemeralPublicKey is invalid", err)
	}
	if _, err := ecdh.P256().NewPublicKey(publicKey); err != nil {
		return NewError(CodeInvalidLicense, "keyEnvelope ephemeralPublicKey is invalid", err)
	}
	nonce, err := decodeCanonicalBase64(envelope.Nonce)
	if err != nil || len(nonce) != 12 {
		return NewError(CodeInvalidLicense, "keyEnvelope nonce is invalid", err)
	}
	wrapped, err := decodeCanonicalBase64(envelope.WrappedContentKey)
	if err != nil || len(wrapped) != 48 {
		return NewError(CodeInvalidLicense, "keyEnvelope wrappedContentKey is invalid", err)
	}
	return nil
}

func ParseOfflineLicense(data []byte) (*OfflineLicense, error) {
	if len(data) == 0 || len(data) > MaxOfflineLicenseSize {
		return nil, NewError(CodeInvalidLicense, "offline license file size is invalid", nil)
	}
	if err := rejectDuplicateJSONKeys(data); err != nil {
		return nil, NewError(CodeInvalidLicense, err.Error(), nil)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var outer offlineLicenseJSON
	if err := decoder.Decode(&outer); err != nil {
		return nil, NewError(CodeInvalidLicense, "decode offline license", err)
	}
	if err := requireEOF(decoder); err != nil {
		return nil, NewError(CodeInvalidLicense, "offline license must contain one JSON value", err)
	}
	if len(outer.License) == 0 || string(outer.License) == "null" {
		return nil, NewError(CodeInvalidLicense, "offline license claims are missing", nil)
	}
	claimsDecoder := json.NewDecoder(bytes.NewReader(outer.License))
	claimsDecoder.DisallowUnknownFields()
	var claims LicenseClaims
	if err := claimsDecoder.Decode(&claims); err != nil {
		return nil, NewError(CodeInvalidLicense, "decode offline license claims", err)
	}
	if err := requireEOF(claimsDecoder); err != nil {
		return nil, NewError(CodeInvalidLicense, "offline license claims must contain one JSON value", err)
	}
	if err := claims.Validate(); err != nil {
		return nil, err
	}
	signature, err := decodeCanonicalBase64(outer.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize {
		return nil, NewError(CodeInvalidLicense, "offline license signature is invalid", err)
	}
	return &OfflineLicense{
		RawClaims: append([]byte(nil), outer.License...),
		Claims:    claims,
		Signature: append([]byte(nil), signature...),
	}, nil
}

func ReadOfflineLicense(filePath string) (*OfflineLicense, error) {
	info, err := os.Lstat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, NewError(CodeLicenseRequired, "no installed license authorizes this package", err)
		}
		return nil, NewError(CodeInvalidLicense, "stat offline license", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > MaxOfflineLicenseSize {
		return nil, NewError(CodeInvalidLicense, "offline license must be a bounded regular file", nil)
	}
	file, err := os.Open(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, NewError(CodeLicenseRequired, "no installed license authorizes this package", err)
		}
		return nil, NewError(CodeInvalidLicense, "open offline license", err)
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || openedInfo.Size() != info.Size() {
		return nil, NewError(CodeInvalidLicense, "offline license changed during secure read", err)
	}
	data, err := io.ReadAll(io.LimitReader(file, MaxOfflineLicenseSize+1))
	if err != nil {
		return nil, NewError(CodeInvalidLicense, "read offline license", err)
	}
	return ParseOfflineLicense(data)
}

func BuildOfflineLicense(claims LicenseClaims, privateKey ed25519.PrivateKey) ([]byte, error) {
	if err := claims.Validate(); err != nil {
		return nil, err
	}
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, NewError(CodeInvalidLicense, "license signing key must be Ed25519", nil)
	}
	rawClaims, err := json.Marshal(claims)
	if err != nil {
		return nil, NewError(CodeInvalidLicense, "encode offline license claims", err)
	}
	signature := ed25519.Sign(privateKey, offlineLicenseSignatureMessage(rawClaims))
	return json.Marshal(offlineLicenseJSON{
		License:   rawClaims,
		Signature: base64.StdEncoding.EncodeToString(signature),
	})
}

func VerifyOfflineLicense(license *OfflineLicense, publicKey ed25519.PublicKey) error {
	if license == nil || len(license.RawClaims) == 0 || len(license.Signature) != ed25519.SignatureSize {
		return NewError(CodeInvalidLicense, "offline license is incomplete", nil)
	}
	if len(publicKey) != ed25519.PublicKeySize || !ed25519.Verify(publicKey, offlineLicenseSignatureMessage(license.RawClaims), license.Signature) {
		return NewError(CodeInvalidLicenseSign, "offline license signature verification failed", nil)
	}
	return nil
}

func offlineLicenseSignatureMessage(rawClaims []byte) []byte {
	digest := sha256.Sum256(rawClaims)
	message := make([]byte, 0, len(licenseSignatureDomain)+len(digest))
	message = append(message, licenseSignatureDomain...)
	message = append(message, digest[:]...)
	return message
}

func parseLicenseTime(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, err
	}
	if parsed.Location() != time.UTC || parsed.Format(time.RFC3339) != value {
		return time.Time{}, fmt.Errorf("time is not canonical UTC RFC3339")
	}
	return parsed, nil
}

func FormatLicenseTime(value time.Time) string {
	return value.UTC().Truncate(time.Second).Format(time.RFC3339)
}

func decodeCanonicalBase64(value string) ([]byte, error) {
	if strings.TrimSpace(value) != value {
		return nil, fmt.Errorf("base64 contains surrounding whitespace")
	}
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil || base64.StdEncoding.EncodeToString(decoded) != value {
		return nil, fmt.Errorf("base64 is not canonical")
	}
	return decoded, nil
}

func rejectDuplicateJSONKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := scanJSONValue(decoder); err != nil {
		return fmt.Errorf("decode offline license: %w", err)
	}
	if err := requireEOF(decoder); err != nil {
		return fmt.Errorf("offline license must contain one JSON value")
	}
	return nil
}

func scanJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delimiter {
	case '{':
		seen := map[string]struct{}{}
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return fmt.Errorf("object key is not a string")
			}
			if _, exists := seen[key]; exists {
				return fmt.Errorf("duplicate JSON key %q", key)
			}
			seen[key] = struct{}{}
			if err := scanJSONValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim('}') {
			return fmt.Errorf("object is not closed")
		}
	case '[':
		for decoder.More() {
			if err := scanJSONValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim(']') {
			return fmt.Errorf("array is not closed")
		}
	default:
		return fmt.Errorf("unexpected JSON delimiter")
	}
	return nil
}

func requireEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("unexpected extra JSON value")
		}
		return err
	}
	return nil
}
