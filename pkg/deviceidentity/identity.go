// Package deviceidentity owns the OpenDesk installation key pair and its
// stable public identifier. Private key bytes never leave this package except
// as a crypto/ecdh key object used by the host-side license key provider.
package deviceidentity

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"opendesk/pkg/securestore"
)

const (
	FormatName          = "opendesk-device-identity"
	FormatVersion       = 1
	KeyAlgorithmP256    = "P-256"
	privateKeyStoreName = "device-p256-v1"
	secureNamespace     = "ai.shopable.opendesk.deviceidentity"
	maxIdentitySize     = 16 * 1024
)

var deviceIDDomain = []byte("OpenDeskDeviceIdentity/v1\x00")

type ErrorCode string

const (
	CodeInvalidIdentity       ErrorCode = "invalid_device_identity"
	CodeDeviceKeyUnavailable  ErrorCode = "device_key_unavailable"
	CodeDeviceIdentityMissing ErrorCode = "device_identity_missing"
)

type Error struct {
	Code    ErrorCode
	Message string
	Err     error
}

func (err *Error) Error() string {
	if err == nil {
		return ""
	}
	if err.Message != "" {
		return fmt.Sprintf("%s: %s", err.Code, err.Message)
	}
	return string(err.Code)
}

func (err *Error) Unwrap() error { return err.Err }

func CodeOf(err error) ErrorCode {
	var identityErr *Error
	if errors.As(err, &identityErr) {
		return identityErr.Code
	}
	return ""
}

// PublicIdentity is safe to export and send to a license issuer.
type PublicIdentity struct {
	Format        string `json:"format"`
	FormatVersion int    `json:"formatVersion"`
	DeviceID      string `json:"deviceId"`
	KeyAlgorithm  string `json:"keyAlgorithm"`
	PublicKey     string `json:"publicKey"`
}

func (identity PublicIdentity) Validate() error {
	if identity.Format != FormatName || identity.FormatVersion != FormatVersion {
		return &Error{Code: CodeInvalidIdentity, Message: "device identity format or version is not supported"}
	}
	if identity.KeyAlgorithm != KeyAlgorithmP256 {
		return &Error{Code: CodeInvalidIdentity, Message: "device key algorithm must be P-256"}
	}
	publicBytes, err := decodeCanonicalBase64(identity.PublicKey)
	if err != nil {
		return &Error{Code: CodeInvalidIdentity, Message: "device public key is not canonical base64", Err: err}
	}
	publicKey, err := ecdh.P256().NewPublicKey(publicBytes)
	if err != nil {
		return &Error{Code: CodeInvalidIdentity, Message: "device public key is invalid", Err: err}
	}
	if identity.DeviceID != deriveDeviceID(identity.KeyAlgorithm, publicKey.Bytes()) {
		return &Error{Code: CodeInvalidIdentity, Message: "deviceId does not match the public key"}
	}
	return nil
}

func (identity PublicIdentity) ECDHPublicKey() (*ecdh.PublicKey, error) {
	if err := identity.Validate(); err != nil {
		return nil, err
	}
	publicBytes, _ := base64.StdEncoding.DecodeString(identity.PublicKey)
	return ecdh.P256().NewPublicKey(publicBytes)
}

type Manager struct {
	store  securestore.Store
	random io.Reader
}

func NewManager(store securestore.Store) *Manager {
	return &Manager{store: store, random: rand.Reader}
}

func NewPlatformManager() (*Manager, error) {
	store, err := securestore.NewPlatformStore(secureNamespace)
	if err != nil {
		return nil, &Error{Code: CodeDeviceKeyUnavailable, Message: "OS secure storage is unavailable", Err: err}
	}
	return NewManager(store), nil
}

// Ensure creates a random P-256 installation key only when none exists.
// Concurrent creators reload the winner instead of replacing it.
func (manager *Manager) Ensure(ctx context.Context) (PublicIdentity, error) {
	privateKey, err := manager.loadPrivateKey(ctx)
	if err == nil {
		return publicIdentity(privateKey), nil
	}
	if !errors.Is(err, securestore.ErrNotFound) {
		return PublicIdentity{}, err
	}
	if manager == nil || manager.store == nil {
		return PublicIdentity{}, &Error{Code: CodeDeviceKeyUnavailable, Message: "device secure store is not configured"}
	}
	randomSource := manager.random
	if randomSource == nil {
		randomSource = rand.Reader
	}
	privateKey, err = ecdh.P256().GenerateKey(randomSource)
	if err != nil {
		return PublicIdentity{}, &Error{Code: CodeDeviceKeyUnavailable, Message: "generate device key", Err: err}
	}
	privateBytes := privateKey.Bytes()
	defer zero(privateBytes)
	if err := manager.store.Create(ctx, privateKeyStoreName, privateBytes); err != nil {
		if errors.Is(err, securestore.ErrAlreadyExists) {
			winner, loadErr := manager.loadPrivateKey(ctx)
			if loadErr != nil {
				return PublicIdentity{}, loadErr
			}
			return publicIdentity(winner), nil
		}
		return PublicIdentity{}, &Error{Code: CodeDeviceKeyUnavailable, Message: "persist device key in OS secure storage", Err: err}
	}
	return publicIdentity(privateKey), nil
}

// PrivateKey returns the secure-store key only after verifying its public
// identity matches the license-bound device ID.
func (manager *Manager) PrivateKey(ctx context.Context, expectedDeviceID string) (*ecdh.PrivateKey, error) {
	privateKey, err := manager.loadPrivateKey(ctx)
	if err != nil {
		return nil, err
	}
	if deriveDeviceID(KeyAlgorithmP256, privateKey.PublicKey().Bytes()) != expectedDeviceID {
		return nil, &Error{Code: CodeInvalidIdentity, Message: "stored device key does not match the licensed device"}
	}
	return privateKey, nil
}

func (manager *Manager) loadPrivateKey(ctx context.Context) (*ecdh.PrivateKey, error) {
	if manager == nil || manager.store == nil {
		return nil, &Error{Code: CodeDeviceKeyUnavailable, Message: "device secure store is not configured"}
	}
	privateBytes, err := manager.store.Load(ctx, privateKeyStoreName)
	if errors.Is(err, securestore.ErrNotFound) {
		return nil, securestore.ErrNotFound
	}
	if err != nil {
		return nil, &Error{Code: CodeDeviceKeyUnavailable, Message: "load device key from OS secure storage", Err: err}
	}
	defer zero(privateBytes)
	privateKey, err := ecdh.P256().NewPrivateKey(privateBytes)
	if err != nil {
		return nil, &Error{Code: CodeInvalidIdentity, Message: "stored device key is corrupt", Err: err}
	}
	return privateKey, nil
}

func publicIdentity(privateKey *ecdh.PrivateKey) PublicIdentity {
	publicBytes := privateKey.PublicKey().Bytes()
	return PublicIdentity{
		Format:        FormatName,
		FormatVersion: FormatVersion,
		DeviceID:      deriveDeviceID(KeyAlgorithmP256, publicBytes),
		KeyAlgorithm:  KeyAlgorithmP256,
		PublicKey:     base64.StdEncoding.EncodeToString(publicBytes),
	}
}

func deriveDeviceID(algorithm string, publicKey []byte) string {
	hash := sha256.New()
	_, _ = hash.Write(deviceIDDomain)
	_, _ = hash.Write([]byte(algorithm))
	_, _ = hash.Write([]byte{0})
	_, _ = hash.Write(publicKey)
	return "device_" + hex.EncodeToString(hash.Sum(nil))
}

func ParsePublicIdentity(data []byte) (PublicIdentity, error) {
	if len(data) == 0 || len(data) > maxIdentitySize {
		return PublicIdentity{}, &Error{Code: CodeInvalidIdentity, Message: "device identity file size is invalid"}
	}
	if err := rejectDuplicateObjectKeys(data); err != nil {
		return PublicIdentity{}, &Error{Code: CodeInvalidIdentity, Message: err.Error()}
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var identity PublicIdentity
	if err := decoder.Decode(&identity); err != nil {
		return PublicIdentity{}, &Error{Code: CodeInvalidIdentity, Message: "decode device identity", Err: err}
	}
	if err := requireJSONEOF(decoder); err != nil {
		return PublicIdentity{}, &Error{Code: CodeInvalidIdentity, Message: err.Error()}
	}
	if err := identity.Validate(); err != nil {
		return PublicIdentity{}, err
	}
	return identity, nil
}

func rejectDuplicateObjectKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	token, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("decode device identity: %w", err)
	}
	if delimiter, ok := token.(json.Delim); !ok || delimiter != '{' {
		return fmt.Errorf("device identity must be a JSON object")
	}
	seen := map[string]struct{}{}
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return fmt.Errorf("decode device identity: %w", err)
		}
		key, ok := keyToken.(string)
		if !ok {
			return fmt.Errorf("device identity contains an invalid key")
		}
		if _, exists := seen[key]; exists {
			return fmt.Errorf("device identity contains duplicate key %q", key)
		}
		seen[key] = struct{}{}
		var value any
		if err := decoder.Decode(&value); err != nil {
			return fmt.Errorf("decode device identity: %w", err)
		}
	}
	_, err = decoder.Token()
	return err
}

func requireJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("device identity must contain one JSON value")
		}
		return err
	}
	return nil
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

func zero(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
