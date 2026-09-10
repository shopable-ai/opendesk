package packagecli

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
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
		"--key-out", contentKeyPath,
	}, &protectOut, &bytes.Buffer{})
	if code != 0 {
		t.Fatalf("protect exit=%d output=%s", code, protectOut.String())
	}
	if _, err := os.Stat(packagePath); err != nil {
		t.Fatalf("protected package missing: %v", err)
	}
	contentKey, err := os.ReadFile(contentKeyPath)
	if err != nil {
		t.Fatalf("generated content key missing: %v", err)
	}
	if len(contentKey) != scriptpackage.ContentKeySize {
		t.Fatalf("generated content key size = %d", len(contentKey))
	}
	keyInfo, err := os.Stat(contentKeyPath)
	if err != nil {
		t.Fatal(err)
	}
	if keyInfo.Mode().Perm() != 0o600 {
		t.Fatalf("generated content key mode = %o", keyInfo.Mode().Perm())
	}
	for _, secret := range []string{hex.EncodeToString(contentKey), base64.StdEncoding.EncodeToString(contentKey), string(privateKey)} {
		if bytes.Contains(protectOut.Bytes(), []byte(secret)) {
			t.Fatalf("protect output leaked secret material")
		}
	}

	var inspectOut bytes.Buffer
	if code := Execute([]string{"package", "inspect", packagePath}, &inspectOut, &bytes.Buffer{}); code != 0 {
		t.Fatalf("inspect exit=%d output=%s", code, inspectOut.String())
	}
	if bytes.Contains(inspectOut.Bytes(), []byte("PACKAGE_CLI_SOURCE_SENTINEL")) {
		t.Fatalf("inspect leaked source: %s", inspectOut.String())
	}
	if bytes.Contains(inspectOut.Bytes(), []byte(hex.EncodeToString(contentKey))) || bytes.Contains(inspectOut.Bytes(), []byte(base64.StdEncoding.EncodeToString(contentKey))) {
		t.Fatalf("inspect leaked content key: %s", inspectOut.String())
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
	if bytes.Contains(verifyOut.Bytes(), []byte(hex.EncodeToString(contentKey))) || bytes.Contains(verifyOut.Bytes(), []byte(base64.StdEncoding.EncodeToString(contentKey))) {
		t.Fatalf("verify leaked content key: %s", verifyOut.String())
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

func TestWriteSecretFileUsesExclusive0600Creation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret.key")
	secret := []byte("publisher-owned-secret")
	if err := writeSecretFile(path, secret); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("secret file mode = %o", info.Mode().Perm())
	}
	if err := writeSecretFile(path, []byte("replacement")); err == nil {
		t.Fatal("secret file was overwritten")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(data, secret) {
		t.Fatalf("secret file changed after overwrite attempt: %q", data)
	}
}
