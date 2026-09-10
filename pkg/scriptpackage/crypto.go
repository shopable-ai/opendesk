package scriptpackage

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
)

const (
	ContentKeySize = 32
	NonceSize      = 12
)

func GenerateContentKey() ([]byte, error) {
	key := make([]byte, ContentKeySize)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("generate content key: %w", err)
	}
	return key, nil
}

func GenerateNonce() ([]byte, error) {
	nonce := make([]byte, NonceSize)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}
	return nonce, nil
}

func newGCM(key []byte) (cipher.AEAD, error) {
	if len(key) != ContentKeySize {
		return nil, newError(CodeInvalidPackage, "content key must be 32 bytes", nil)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot initialize AES-256", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, newError(CodeInvalidPackage, "cannot initialize AES-GCM", err)
	}
	return gcm, nil
}

func Encrypt(plaintext, key, nonce, aad []byte) ([]byte, error) {
	gcm, err := newGCM(key)
	if err != nil {
		return nil, err
	}
	if len(nonce) != gcm.NonceSize() {
		return nil, newError(CodeInvalidManifest, "AES-GCM nonce must be 12 bytes", nil)
	}
	return gcm.Seal(nil, nonce, plaintext, aad), nil
}

func Decrypt(ciphertext, key, nonce, aad []byte) ([]byte, error) {
	gcm, err := newGCM(key)
	if err != nil {
		return nil, err
	}
	if len(nonce) != gcm.NonceSize() {
		return nil, newError(CodeInvalidManifest, "AES-GCM nonce must be 12 bytes", nil)
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return nil, newError(CodeDecryptionFailed, "payload authentication failed", nil)
	}
	return plaintext, nil
}

func clearBytes(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
