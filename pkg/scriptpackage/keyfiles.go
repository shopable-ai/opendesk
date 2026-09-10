package scriptpackage

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/pem"
)

func ParseEd25519PrivateKey(data []byte) (ed25519.PrivateKey, error) {
	if len(data) == ed25519.PrivateKeySize {
		return append(ed25519.PrivateKey(nil), data...), nil
	}
	block, rest := pem.Decode(data)
	if block == nil || len(rest) != 0 {
		return nil, newError(CodeInvalidPackage, "signing key file must contain one Ed25519 PKCS#8 PEM key or 64 raw bytes", nil)
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, newError(CodeInvalidPackage, "signing key file is not valid PKCS#8", nil)
	}
	key, ok := parsed.(ed25519.PrivateKey)
	if !ok || len(key) != ed25519.PrivateKeySize {
		return nil, newError(CodeInvalidPackage, "signing key is not Ed25519", nil)
	}
	return append(ed25519.PrivateKey(nil), key...), nil
}

func ParseEd25519PublicKey(data []byte) (ed25519.PublicKey, error) {
	if len(data) == ed25519.PublicKeySize {
		return append(ed25519.PublicKey(nil), data...), nil
	}
	block, rest := pem.Decode(data)
	if block == nil || len(rest) != 0 {
		return nil, newError(CodeInvalidPackage, "publisher public key file must contain one Ed25519 PKIX PEM key or 32 raw bytes", nil)
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, newError(CodeInvalidPackage, "publisher public key file is not valid PKIX", nil)
	}
	key, ok := parsed.(ed25519.PublicKey)
	if !ok || len(key) != ed25519.PublicKeySize {
		return nil, newError(CodeInvalidPackage, "publisher public key is not Ed25519", nil)
	}
	return append(ed25519.PublicKey(nil), key...), nil
}
