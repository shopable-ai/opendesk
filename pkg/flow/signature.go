package flow

import "crypto/ed25519"

var signatureDomain = []byte("OpenDeskFlowPackage/v1\x00")

func SignatureMessage(rawManifest []byte) []byte {
	message := make([]byte, 0, len(signatureDomain)+len(rawManifest))
	message = append(message, signatureDomain...)
	message = append(message, rawManifest...)
	return message
}

func Sign(rawManifest []byte, privateKey ed25519.PrivateKey) ([]byte, error) {
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, newError(CodeInvalidSignature, "publisher Ed25519 private key is invalid", nil)
	}
	return ed25519.Sign(privateKey, SignatureMessage(rawManifest)), nil
}

func VerifySignature(rawManifest, signature []byte, publicKey ed25519.PublicKey) error {
	if len(publicKey) != ed25519.PublicKeySize || len(signature) != ed25519.SignatureSize {
		return newError(CodeInvalidSignature, "publisher signature is invalid", nil)
	}
	if !ed25519.Verify(publicKey, SignatureMessage(rawManifest), signature) {
		return newError(CodeInvalidSignature, "publisher signature verification failed", nil)
	}
	return nil
}
