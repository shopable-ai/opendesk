package flowpackage

import (
	"crypto/ed25519"
	"encoding/hex"
	"testing"
)

func TestSignatureFixedVector(t *testing.T) {
	seed := make([]byte, ed25519.SeedSize)
	for index := range seed {
		seed[index] = byte(index)
	}
	privateKey := ed25519.NewKeyFromSeed(seed)
	rawManifest := []byte(`{"schemaVersion":1}`)
	signature, err := Sign(rawManifest, privateKey)
	if err != nil {
		t.Fatal(err)
	}
	publicKey := privateKey.Public().(ed25519.PublicKey)
	if got := hex.EncodeToString(publicKey); got != "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8" {
		t.Fatalf("public key vector changed: %s", got)
	}
	const expectedSignature = "6b5cea1b372ad8503237831a51500d35285843ce4ecb62802d13bd82a36f1ba1fc98bfe0f73232e4a5bdbe43c7db9d2587094466d477cd63d65c310a23699301"
	if got := hex.EncodeToString(signature); got != expectedSignature {
		t.Fatalf("signature vector changed: %s", got)
	}
	if err := VerifySignature(rawManifest, signature, publicKey); err != nil {
		t.Fatal(err)
	}
	tampered := append([]byte(nil), rawManifest...)
	tampered[len(tampered)-2] ^= 1
	if err := VerifySignature(tampered, signature, publicKey); err == nil {
		t.Fatal("tampered raw manifest unexpectedly verified")
	}
}
