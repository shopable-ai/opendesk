package scriptpackage

import (
	"bytes"
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
