package scriptpackage

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestManifestRejectsDuplicateJSONKeys(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 10;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	duplicate := bytes.Replace(
		protectedPackage.RawManifest,
		[]byte(`"packageId":"pkg-test"`),
		[]byte(`"packageId":"pkg-test","packageId":"pkg-shadow"`),
		1,
	)
	packageBytes := rewritePackage(t, duplicate, protectedPackage.Payload, protectedPackage.Signature, nil)
	if _, err := Read(packageBytes); CodeOf(err) != CodeInvalidManifest {
		t.Fatalf("duplicate manifest key error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestDuplicateKeyScannerRejectsNestedDuplicates(t *testing.T) {
	if err := rejectDuplicateObjectKeys([]byte(`{"license":{"required":true,"required":false}}`)); err == nil {
		t.Fatal("nested duplicate key was accepted")
	}
}

func TestManifestRejectsMissingRequiredFields(t *testing.T) {
	result, _, _, _ := buildTestPackage(t, []byte("void 11;"))
	protectedPackage, err := Read(result.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(protectedPackage.RawManifest, &manifest); err != nil {
		t.Fatal(err)
	}
	license := manifest["license"].(map[string]any)
	delete(license, "required")
	rawManifest, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	packageBytes := rewritePackage(t, rawManifest, protectedPackage.Payload, protectedPackage.Signature, nil)
	if _, err := Read(packageBytes); CodeOf(err) != CodeInvalidManifest {
		t.Fatalf("missing required manifest field error code = %q, err=%v", CodeOf(err), err)
	}
}

func TestMinimumRuntimeVersionUsesStrictSemanticVersionSyntax(t *testing.T) {
	manifest := testManifest()
	manifest.Format = FormatName
	manifest.FormatVersion = FormatVersion
	manifest.Entrypoint = EntrypointMainJS
	manifest.PayloadType = PayloadJavaScript
	manifest.Encryption.Algorithm = EncryptionAES256GCM
	manifest.Encryption.Nonce = "AAAAAAAAAAAAAAAA"
	for _, invalid := range []string{" 1.2.3", "01.2.3", "1.2", "1.2.3+", "1.2.3-01"} {
		manifest.MinimumRuntimeVersion = invalid
		if err := manifest.Validate(); CodeOf(err) != CodeInvalidManifest {
			t.Fatalf("minimumRuntimeVersion %q error code = %q, err=%v", invalid, CodeOf(err), err)
		}
	}
	manifest.MinimumRuntimeVersion = "1.2.3-alpha.1+build.5"
	if err := manifest.Validate(); err != nil {
		t.Fatalf("valid minimumRuntimeVersion rejected: %v", err)
	}
}
