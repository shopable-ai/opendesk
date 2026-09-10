package licensing

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"

	"opendesk/pkg/scriptpackage"
)

var (
	envelopeAADDomain  = []byte("OpenDeskDeviceLicenseEnvelopeAAD/v1\x00")
	envelopeKDFDomain  = []byte("OpenDeskDeviceLicenseEnvelopeKDF/v1\x00")
	envelopeSaltDomain = []byte("OpenDeskDeviceLicenseEnvelopeSalt/v1\x00")
)

type EnvelopeBinding struct {
	FormatVersion      int
	ProductID          string
	PackageID          string
	ContentKeyID       string
	DeviceID           string
	DeviceKeyAlgorithm string
}

func WrapContentKey(contentKey []byte, devicePublicKey *ecdh.PublicKey, binding EnvelopeBinding) (KeyEnvelope, error) {
	return wrapContentKey(contentKey, devicePublicKey, binding, rand.Reader)
}

func wrapContentKey(contentKey []byte, devicePublicKey *ecdh.PublicKey, binding EnvelopeBinding, random io.Reader) (KeyEnvelope, error) {
	if len(contentKey) != scriptpackage.ContentKeySize {
		return KeyEnvelope{}, NewError(CodeContentKeyUnavailable, "content key must contain 32 bytes", nil)
	}
	if devicePublicKey == nil || binding.DeviceKeyAlgorithm != DeviceKeyAlgorithmP256 || binding.FormatVersion != OfflineLicenseFormatVersion {
		return KeyEnvelope{}, NewError(CodeInvalidLicense, "key envelope binding is invalid", nil)
	}
	ephemeralPrivate, err := ecdh.P256().GenerateKey(random)
	if err != nil {
		return KeyEnvelope{}, NewError(CodeContentKeyUnavailable, "generate ephemeral envelope key", err)
	}
	sharedSecret, err := ephemeralPrivate.ECDH(devicePublicKey)
	if err != nil {
		return KeyEnvelope{}, NewError(CodeContentKeyUnavailable, "derive device envelope secret", err)
	}
	defer zeroBytes(sharedSecret)
	wrappingKey, aad, err := deriveEnvelopeMaterial(sharedSecret, binding)
	if err != nil {
		return KeyEnvelope{}, err
	}
	defer zeroBytes(wrappingKey)
	block, err := aes.NewCipher(wrappingKey)
	if err != nil {
		return KeyEnvelope{}, NewError(CodeContentKeyUnavailable, "initialize envelope cipher", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return KeyEnvelope{}, NewError(CodeContentKeyUnavailable, "initialize envelope AEAD", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(random, nonce); err != nil {
		return KeyEnvelope{}, NewError(CodeContentKeyUnavailable, "generate envelope nonce", err)
	}
	wrapped := gcm.Seal(nil, nonce, contentKey, aad)
	return KeyEnvelope{
		Algorithm:          EnvelopeAlgorithmP256,
		EphemeralPublicKey: base64.StdEncoding.EncodeToString(ephemeralPrivate.PublicKey().Bytes()),
		Nonce:              base64.StdEncoding.EncodeToString(nonce),
		WrappedContentKey:  base64.StdEncoding.EncodeToString(wrapped),
	}, nil
}

func UnwrapContentKey(envelope KeyEnvelope, devicePrivateKey *ecdh.PrivateKey, binding EnvelopeBinding) ([]byte, error) {
	if err := envelope.validate(); err != nil {
		return nil, err
	}
	if devicePrivateKey == nil || binding.DeviceKeyAlgorithm != DeviceKeyAlgorithmP256 || binding.FormatVersion != OfflineLicenseFormatVersion {
		return nil, NewError(CodeWrongDevice, "device private key or envelope binding is invalid", nil)
	}
	ephemeralBytes, _ := decodeCanonicalBase64(envelope.EphemeralPublicKey)
	ephemeralPublic, err := ecdh.P256().NewPublicKey(ephemeralBytes)
	if err != nil {
		return nil, NewError(CodeInvalidLicense, "key envelope ephemeral public key is invalid", err)
	}
	sharedSecret, err := devicePrivateKey.ECDH(ephemeralPublic)
	if err != nil {
		return nil, NewError(CodeWrongDevice, "device cannot derive the license envelope key", err)
	}
	defer zeroBytes(sharedSecret)
	wrappingKey, aad, err := deriveEnvelopeMaterial(sharedSecret, binding)
	if err != nil {
		return nil, err
	}
	defer zeroBytes(wrappingKey)
	block, err := aes.NewCipher(wrappingKey)
	if err != nil {
		return nil, NewError(CodeContentKeyUnavailable, "initialize envelope cipher", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, NewError(CodeContentKeyUnavailable, "initialize envelope AEAD", err)
	}
	nonce, _ := decodeCanonicalBase64(envelope.Nonce)
	wrapped, _ := decodeCanonicalBase64(envelope.WrappedContentKey)
	plaintext, err := gcm.Open(nil, nonce, wrapped, aad)
	if err != nil {
		return nil, NewError(CodeWrongDevice, "device cannot unwrap the licensed content key", nil)
	}
	if len(plaintext) != scriptpackage.ContentKeySize {
		zeroBytes(plaintext)
		return nil, NewError(CodeContentKeyUnavailable, "unwrapped content key has an invalid length", nil)
	}
	return plaintext, nil
}

func deriveEnvelopeMaterial(sharedSecret []byte, binding EnvelopeBinding) ([]byte, []byte, error) {
	contextBytes, err := envelopeContext(binding)
	if err != nil {
		return nil, nil, err
	}
	saltHash := sha256.New()
	_, _ = saltHash.Write(envelopeSaltDomain)
	_, _ = saltHash.Write(contextBytes)
	key, err := hkdf.Key(sha256.New, sharedSecret, saltHash.Sum(nil), string(append(append([]byte(nil), envelopeKDFDomain...), contextBytes...)), scriptpackage.ContentKeySize)
	if err != nil {
		return nil, nil, NewError(CodeContentKeyUnavailable, "derive envelope wrapping key", err)
	}
	aad := append(append([]byte(nil), envelopeAADDomain...), contextBytes...)
	return key, aad, nil
}

func envelopeContext(binding EnvelopeBinding) ([]byte, error) {
	if binding.FormatVersion != OfflineLicenseFormatVersion ||
		binding.DeviceKeyAlgorithm != DeviceKeyAlgorithmP256 ||
		!licenseIdentifier.MatchString(binding.ProductID) ||
		!licenseIdentifier.MatchString(binding.PackageID) ||
		!licenseIdentifier.MatchString(binding.ContentKeyID) ||
		!deviceIdentifier.MatchString(binding.DeviceID) {
		return nil, NewError(CodeInvalidLicense, "key envelope metadata binding is invalid", nil)
	}
	buffer := &bytes.Buffer{}
	for _, value := range []string{
		fmt.Sprint(binding.FormatVersion),
		binding.ProductID,
		binding.PackageID,
		binding.ContentKeyID,
		binding.DeviceID,
		binding.DeviceKeyAlgorithm,
	} {
		if err := binary.Write(buffer, binary.BigEndian, uint32(len(value))); err != nil {
			return nil, NewError(CodeInvalidLicense, "encode key envelope metadata", err)
		}
		_, _ = buffer.WriteString(value)
	}
	return buffer.Bytes(), nil
}

func zeroBytes(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
