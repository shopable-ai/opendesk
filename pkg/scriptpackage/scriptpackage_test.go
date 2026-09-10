package scriptpackage

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
)

func testManifest() Manifest {
	return Manifest{
		PackageID:             "pkg-test",
		ProductID:             "product-a",
		PublisherID:           "publisher-a",
		PublisherKeyID:        "publisher-key-a",
		MinimumRuntimeVersion: "0.0.0",
		Encryption:            EncryptionManifest{KeyID: "content-key-a"},
		License:               LicenseManifest{Required: true, ProductID: "product-a"},
	}
}

func buildTestPackage(t *testing.T, source []byte) (*BuildResult, []byte, ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	contentKey, err := GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	result, err := Build(source, testManifest(), contentKey, privateKey)
	if err != nil {
		t.Fatal(err)
	}
	return result, contentKey, publicKey, privateKey
}

func TestAESGCMAndPackageRoundTrip(t *testing.T) {
	source := []byte("globalThis.__protectedRoundTrip = 1;")
	result, contentKey, publicKey, _ := buildTestPackage(t, source)
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifySignature(protectedPackage.RawManifest, protectedPackage.Payload, protectedPackage.Signature, publicKey); err != nil {
		t.Fatal(err)
	}
	nonce, err := protectedPackage.Manifest.DecodeNonce()
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := Decrypt(protectedPackage.Payload, contentKey, nonce, protectedPackage.RawManifest)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(plaintext, source) {
		t.Fatalf("decrypted source mismatch: %q", plaintext)
	}
}

func TestGeneratedKeysAndNoncesAreFresh(t *testing.T) {
	keyA, err := GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	keyB, err := GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	nonceA, err := GenerateNonce()
	if err != nil {
		t.Fatal(err)
	}
	nonceB, err := GenerateNonce()
	if err != nil {
		t.Fatal(err)
	}
	if len(keyA) != ContentKeySize || len(keyB) != ContentKeySize || bytes.Equal(keyA, keyB) {
		t.Fatal("content keys are not independent random 256-bit values")
	}
	if len(nonceA) != NonceSize || len(nonceB) != NonceSize || bytes.Equal(nonceA, nonceB) {
		t.Fatal("AES-GCM nonces are not independent random values")
	}
}

func TestSignatureMessageUsesExactDomainAndDigests(t *testing.T) {
	if !bytes.Equal(signatureDomain, []byte("OpenDeskProtectedPackage/v1\x00")) {
		t.Fatalf("signature domain = %q", signatureDomain)
	}
	manifest := []byte("raw manifest bytes")
	payload := []byte("raw payload bytes")
	manifestDigest := sha256.Sum256(manifest)
	payloadDigest := sha256.Sum256(payload)
	want := append([]byte("OpenDeskProtectedPackage/v1\x00"), manifestDigest[:]...)
	want = append(want, payloadDigest[:]...)
	if got := SignatureMessage(manifest, payload); !bytes.Equal(got, want) {
		t.Fatalf("signature message mismatch: %x", got)
	}
}

func TestPayloadBitFlipFailsBeforeExecution(t *testing.T) {
	result, contentKey, publicKey, _ := buildTestPackage(t, []byte("void 1;"))
	original, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	payload := append([]byte(nil), original.Payload...)
	payload[len(payload)/2] ^= 0x01
	tamperedBytes := rewritePackage(t, original.RawManifest, payload, original.Signature, nil)
	tampered, err := Read(tamperedBytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifySignature(tampered.RawManifest, tampered.Payload, tampered.Signature, publicKey); CodeOf(err) != CodeInvalidSignature {
		t.Fatalf("signature error code = %q, err=%v", CodeOf(err), err)
	}
	nonce, _ := tampered.Manifest.DecodeNonce()
	if _, err := Decrypt(tampered.Payload, contentKey, nonce, tampered.RawManifest); CodeOf(err) != CodeDecryptionFailed {
		t.Fatalf("decrypt error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestManifestModificationFailsSignatureAndAAD(t *testing.T) {
	result, contentKey, publicKey, _ := buildTestPackage(t, []byte("void 2;"))
	original, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	modifiedManifest := bytes.ReplaceAll(original.RawManifest, []byte("product-a"), []byte("product-b"))
	modifiedBytes := rewritePackage(t, modifiedManifest, original.Payload, original.Signature, nil)
	modified, err := Read(modifiedBytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifySignature(modified.RawManifest, modified.Payload, modified.Signature, publicKey); CodeOf(err) != CodeInvalidSignature {
		t.Fatalf("signature error code = %q, err=%v", CodeOf(err), err)
	}
	nonce, _ := modified.Manifest.DecodeNonce()
	if _, err := Decrypt(modified.Payload, contentKey, nonce, modified.RawManifest); CodeOf(err) != CodeDecryptionFailed {
		t.Fatalf("decrypt error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestSignatureModificationFails(t *testing.T) {
	result, _, publicKey, _ := buildTestPackage(t, []byte("void 3;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	signature := append([]byte(nil), protectedPackage.Signature...)
	signature[0] ^= 0x01
	if err := VerifySignature(protectedPackage.RawManifest, protectedPackage.Payload, signature, publicKey); CodeOf(err) != CodeInvalidSignature {
		t.Fatalf("signature error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestWrongPublisherPublicKeyFails(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 4;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	wrongPublicKey, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifySignature(protectedPackage.RawManifest, protectedPackage.Payload, protectedPackage.Signature, wrongPublicKey); CodeOf(err) != CodeInvalidSignature {
		t.Fatalf("signature error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestWrongDEKFails(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 5;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	wrongKey, err := GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	nonce, _ := protectedPackage.Manifest.DecodeNonce()
	if _, err := Decrypt(protectedPackage.Payload, wrongKey, nonce, protectedPackage.RawManifest); CodeOf(err) != CodeDecryptionFailed {
		t.Fatalf("decrypt error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestMalformedNonceFailsClosed(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 6;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	manifest := protectedPackage.Manifest
	manifest.Encryption.Nonce = base64.StdEncoding.EncodeToString(make([]byte, NonceSize-1))
	rawManifest, _ := json.Marshal(manifest)
	tamperedBytes := rewritePackage(t, rawManifest, protectedPackage.Payload, protectedPackage.Signature, nil)
	if _, err := Read(tamperedBytes); CodeOf(err) != CodeInvalidManifest {
		t.Fatalf("nonce error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestNonCanonicalNonceEncodingFailsClosed(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 6;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	manifest := protectedPackage.Manifest
	manifest.Encryption.Nonce = manifest.Encryption.Nonce[:4] + "\n" + manifest.Encryption.Nonce[4:]
	rawManifest, _ := json.Marshal(manifest)
	packageBytes := rewritePackage(t, rawManifest, protectedPackage.Payload, protectedPackage.Signature, nil)
	if _, err := Read(packageBytes); CodeOf(err) != CodeInvalidManifest {
		t.Fatalf("non-canonical nonce error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestUnsupportedVersionFailsClosed(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 7;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	manifest := protectedPackage.Manifest
	manifest.FormatVersion = FormatVersion + 1
	rawManifest, _ := json.Marshal(manifest)
	tamperedBytes := rewritePackage(t, rawManifest, protectedPackage.Payload, protectedPackage.Signature, nil)
	if _, err := Read(tamperedBytes); CodeOf(err) != CodeUnsupportedFormat {
		t.Fatalf("version error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestUnexpectedAndTraversalZIPEntriesFailClosed(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 8;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	withExtra := rewritePackage(t, protectedPackage.RawManifest, protectedPackage.Payload, protectedPackage.Signature, map[string][]byte{"extra.txt": []byte("x")})
	if _, err := Read(withExtra); CodeOf(err) != CodeInvalidPackage {
		t.Fatalf("extra entry error code = %q, err=%v", CodeOf(err), err)
	}
	unexpected := writeEntries(t, []testEntry{
		{name: ManifestEntryName, data: protectedPackage.RawManifest},
		{name: PayloadEntryName, data: protectedPackage.Payload},
		{name: "unexpected.bin", data: protectedPackage.Signature},
	})
	if _, err := Read(unexpected); CodeOf(err) != CodeInvalidPackage {
		t.Fatalf("unexpected entry error code = %q, err=%v", CodeOf(err), err)
	}
	traversal := writeEntries(t, []testEntry{
		{name: ManifestEntryName, data: protectedPackage.RawManifest},
		{name: PayloadEntryName, data: protectedPackage.Payload},
		{name: "../signature.ed25519", data: protectedPackage.Signature},
	})
	if _, err := Read(traversal); CodeOf(err) != CodeInvalidPackage {
		t.Fatalf("traversal error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestOversizedPayloadEntryFailsClosed(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 9;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	oversized := bytes.Repeat([]byte{0x5a}, int(MaxPayloadSize)+1)
	packageBytes := rewritePackage(t, protectedPackage.RawManifest, oversized, protectedPackage.Signature, nil)
	if _, err := Read(packageBytes); CodeOf(err) != CodePackageTooLarge {
		t.Fatalf("oversize error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestReaderRejectsMalformedDuplicateAndDirectoryEntries(t *testing.T) {
	if _, err := Read([]byte("not a zip")); CodeOf(err) != CodeInvalidPackage {
		t.Fatalf("malformed ZIP error code = %q, err=%v", CodeOf(err), err)
	}
	result, _, _, _ := buildTestPackage(t, []byte("void 10;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	duplicate := writeEntries(t, []testEntry{
		{name: ManifestEntryName, data: protectedPackage.RawManifest},
		{name: PayloadEntryName, data: protectedPackage.Payload},
		{name: ManifestEntryName, data: protectedPackage.RawManifest},
	})
	if _, err := Read(duplicate); CodeOf(err) != CodeInvalidPackage {
		t.Fatalf("duplicate ZIP entry error code = %q, err=%v", CodeOf(err), err)
	}
	directory := writeEntries(t, []testEntry{
		{name: ManifestEntryName, data: protectedPackage.RawManifest},
		{name: PayloadEntryName, data: protectedPackage.Payload},
		{name: SignatureEntryName + "/", data: nil},
	})
	if _, err := Read(directory); CodeOf(err) != CodeInvalidPackage {
		t.Fatalf("directory ZIP entry error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestReaderRejectsUnknownFieldsAndTrailingJSON(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 11;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	unknown := append([]byte(nil), protectedPackage.RawManifest[:len(protectedPackage.RawManifest)-1]...)
	unknown = append(unknown, []byte(`,"unexpected":true}`)...)
	if _, err := Read(rewritePackage(t, unknown, protectedPackage.Payload, protectedPackage.Signature, nil)); CodeOf(err) != CodeInvalidManifest {
		t.Fatalf("unknown manifest field error code = %q, err=%v", CodeOf(err), err)
	}
	trailing := append(append([]byte(nil), protectedPackage.RawManifest...), []byte("\n{}")...)
	if _, err := Read(rewritePackage(t, trailing, protectedPackage.Payload, protectedPackage.Signature, nil)); CodeOf(err) != CodeInvalidManifest {
		t.Fatalf("trailing manifest JSON error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestReaderEnforcesPackageManifestAndSignatureLimits(t *testing.T) {
	if _, err := Read(make([]byte, MaxPackageSize+1)); CodeOf(err) != CodePackageTooLarge {
		t.Fatalf("total package size error code = %q, err=%v", CodeOf(err), err)
	}
	result, _, _, _ := buildTestPackage(t, []byte("void 12;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	oversizedManifest := bytes.Repeat([]byte{' '}, int(MaxManifestSize)+1)
	if _, err := Read(rewritePackage(t, oversizedManifest, protectedPackage.Payload, protectedPackage.Signature, nil)); CodeOf(err) != CodePackageTooLarge {
		t.Fatalf("manifest size error code = %q, err=%v", CodeOf(err), err)
	}
	oversizedSignature := bytes.Repeat([]byte{0x5a}, int(MaxSignatureSize)+1)
	if _, err := Read(rewritePackage(t, protectedPackage.RawManifest, protectedPackage.Payload, oversizedSignature, nil)); CodeOf(err) != CodePackageTooLarge {
		t.Fatalf("signature size error code = %q, err=%v", CodeOf(err), err)
	}
}

type testEntry struct {
	name string
	data []byte
}

func rewritePackage(t *testing.T, manifest, payload, signature []byte, extra map[string][]byte) []byte {
	t.Helper()
	entries := []testEntry{
		{name: ManifestEntryName, data: manifest},
		{name: PayloadEntryName, data: payload},
		{name: SignatureEntryName, data: signature},
	}
	for name, data := range extra {
		entries = append(entries, testEntry{name: name, data: data})
	}
	return writeEntries(t, entries)
}

func writeEntries(t *testing.T, entries []testEntry) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for _, entry := range entries {
		header := &zip.FileHeader{Name: entry.name, Method: zip.Store}
		file, err := writer.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write(entry.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}
