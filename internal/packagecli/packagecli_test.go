package packagecli

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/scriptpackage"
)

func TestProtectInspectVerifyRoundTrip(t *testing.T) {
	tempDir := t.TempDir()
	sourcePath := filepath.Join(tempDir, "recipe.js")
	packagePath := filepath.Join(tempDir, "recipe.odpkg")
	privatePath := filepath.Join(tempDir, "publisher-private.pem")
	publicPath := filepath.Join(tempDir, "publisher-public.pem")
	contentKeyPath := filepath.Join(tempDir, "content.key")

	if err := os.WriteFile(sourcePath, []byte("const protectedMarker = 'PACKAGE_CLI_SOURCE_SENTINEL'; void protectedMarker;"), 0o600); err != nil {
		t.Fatal(err)
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	privateDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	publicDER, err := x509.MarshalPKIXPublicKey(publicKey)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(privatePath, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER}), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(publicPath, pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}), 0o600); err != nil {
		t.Fatal(err)
	}
	contentKey, err := scriptpackage.GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(contentKeyPath, contentKey, 0o600); err != nil {
		t.Fatal(err)
	}

	var protectOut bytes.Buffer
	code := Execute([]string{
		"package", "protect", sourcePath,
		"-o", packagePath,
		"--package-id", "pkg-cli-test",
		"--product-id", "product-cli-test",
		"--publisher-id", "publisher-cli-test",
		"--publisher-key-id", "publisher-key-cli-test",
		"--content-key-id", "content-key-cli-test",
		"--minimum-runtime-version", "0.0.0",
		"--signing-key", privatePath,
		"--content-key", contentKeyPath,
	}, &protectOut, &bytes.Buffer{})
	if code != 0 {
		t.Fatalf("protect exit=%d output=%s", code, protectOut.String())
	}
	if _, err := os.Stat(packagePath); err != nil {
		t.Fatalf("protected package missing: %v", err)
	}

	var inspectOut bytes.Buffer
	if code := Execute([]string{"package", "inspect", packagePath}, &inspectOut, &bytes.Buffer{}); code != 0 {
		t.Fatalf("inspect exit=%d output=%s", code, inspectOut.String())
	}
	if bytes.Contains(inspectOut.Bytes(), []byte("PACKAGE_CLI_SOURCE_SENTINEL")) {
		t.Fatalf("inspect leaked source: %s", inspectOut.String())
	}
	var inspectEnvelope map[string]any
	if err := json.Unmarshal(inspectOut.Bytes(), &inspectEnvelope); err != nil {
		t.Fatalf("inspect output is not JSON: %v", err)
	}
	if inspectEnvelope["ok"] != true {
		t.Fatalf("inspect failed: %#v", inspectEnvelope)
	}

	var verifyOut bytes.Buffer
	if code := Execute([]string{"package", "verify", packagePath, "--public-key", publicPath}, &verifyOut, &bytes.Buffer{}); code != 0 {
		t.Fatalf("verify exit=%d output=%s", code, verifyOut.String())
	}
	if !bytes.Contains(verifyOut.Bytes(), []byte(`"signatureVerified":true`)) {
		t.Fatalf("verify did not report signature verification: %s", verifyOut.String())
	}
}

func TestProtectGeneratedKeyRequiresExplicitKeyOutput(t *testing.T) {
	var stdout bytes.Buffer
	code := Execute([]string{
		"package", "protect", "recipe.js",
		"-o", "recipe.odpkg",
		"--package-id", "pkg-test",
		"--product-id", "product-test",
		"--publisher-id", "publisher-test",
		"--publisher-key-id", "publisher-key-test",
		"--content-key-id", "content-key-test",
		"--signing-key", "publisher.pem",
	}, &stdout, &bytes.Buffer{})
	if code != 2 || !bytes.Contains(stdout.Bytes(), []byte("--key-out")) {
		t.Fatalf("generated key without --key-out exit=%d output=%s", code, stdout.String())
	}
}
