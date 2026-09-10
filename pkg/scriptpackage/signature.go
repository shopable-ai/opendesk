package scriptpackage

import (
	"crypto/ed25519"
	"crypto/sha256"
)

var signatureDomain = []byte("OpenDeskProtectedPackage/v1\x00")

// SignatureMessage is stable across JSON implementations because it authenticates
// the exact raw manifest bytes and ciphertext bytes stored in the package.
func SignatureMessage(rawManifest, payload []byte) []byte {
	manifestDigest := sha256.Sum256(rawManifest)
	payloadDigest := sha256.Sum256(payload)
	message := make([]byte, 0, len(signatureDomain)+len(manifestDigest)+len(payloadDigest))
	message = append(message, signatureDomain...)
	message = append(message, manifestDigest[:]...)
	message = append(message, payloadDigest[:]...)
	return message
}

func Sign(rawManifest, payload []byte, privateKey ed25519.PrivateKey) ([]byte, error) {
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, newError(CodeInvalidPackage, "publisher Ed25519 private key is invalid", nil)
	}
	return ed25519.Sign(privateKey, SignatureMessage(rawManifest, payload)), nil
}

func VerifySignature(rawManifest, payload, signature []byte, publicKey ed25519.PublicKey) error {
	if len(publicKey) != ed25519.PublicKeySize || len(signature) != ed25519.SignatureSize {
		return newError(CodeInvalidSignature, "publisher signature is invalid", nil)
	}
	if !ed25519.Verify(publicKey, SignatureMessage(rawManifest, payload), signature) {
		return newError(CodeInvalidSignature, "publisher signature verification failed", nil)
	}
	return nil
}
