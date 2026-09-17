package flow

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
	const expectedPublicKey = "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8"
	const expectedSignature = "96dd6de2d4a1d795a2384e4beb6b3324a9296dbbc08e65ad8098d3ad4d220d6c2946ed4236cb1a0c541573647e1822996c575eaf36857bf97f720ef10dbc3202"
	publicKey := privateKey.Public().(ed25519.PublicKey)
	if got := hex.EncodeToString(publicKey); got != expectedPublicKey {
		t.Fatalf("public key vector changed: %s", got)
	}
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
