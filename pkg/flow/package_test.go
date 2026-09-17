package flow

import (
	"crypto/ed25519"
	"encoding/json"
	"testing"
)

func TestBuildReadVerifyRoundTripAndStrictManifest(t *testing.T) {
	seed := make([]byte, ed25519.SeedSize)
	for index := range seed {
		seed[index] = byte(index + 1)
	}
	privateKey := ed25519.NewKeyFromSeed(seed)
	publicKey := privateKey.Public().(ed25519.PublicKey)
	result, err := Build(Manifest{
		SchemaVersion:         SchemaVersion,
		FlowID:                "com.opendesk.test.flow",
		Name:                  "Test Flow",
		Version:               "1.0.0",
		PublisherID:           "com.opendesk.tests",
		PublisherKeyID:        "publisher-test-v1",
		Entry:                 EntrypointMainJS,
		MinimumRuntimeVersion: "0.0.0",
		Platforms:             []string{"windows", "darwin"},
	}, []InputFile{
		{Path: EntrypointMainJS, Data: []byte("console.log('never executed');\n")},
		{Path: PublisherPublicKeyEntryName, Data: publicKey},
	}, privateKey)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := result.Manifest.Platforms, []string{"darwin", "windows"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("platform normalization mismatch: %v", got)
	}
	pkg, err := Read(result.Data)
	if err != nil {
		t.Fatal(err)
	}
	if err := Verify(pkg, publicKey); err != nil {
		t.Fatal(err)
	}
	if string(pkg.Files[EntrypointMainJS]) != "console.log('never executed');\n" {
		t.Fatal("entry bytes changed")
	}

	var manifest Manifest
	duplicate := []byte(`{"schemaVersion":1,"schemaVersion":1,"flowId":"x","name":"x","version":"1.0.0","publisherId":"x","publisherKeyId":"x","entry":"main.js","minimumRuntimeVersion":"0.0.0","platforms":["darwin"],"files":[]}`)
	if err := json.Unmarshal(duplicate, &manifest); err == nil {
		t.Fatal("duplicate manifest key was accepted")
	}
	unknown := []byte(`{"schemaVersion":1,"flowId":"x","name":"x","version":"1.0.0","publisherId":"x","publisherKeyId":"x","entry":"main.js","minimumRuntimeVersion":"0.0.0","platforms":["darwin"],"files":[],"unknown":true}`)
	if err := json.Unmarshal(unknown, &manifest); err == nil {
		t.Fatal("unknown manifest field was accepted")
	}
}
