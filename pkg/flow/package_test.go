package flow

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"encoding/json"
	"os"
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

func TestValidateContentPathRejectsWindowsReservedNames(t *testing.T) {
	for _, value := range []string{"CON", "con.txt", "folder/NUL", "aux.js", "COM1", "com9.log", "LPT1", "lpt9.dat", "main."} {
		if err := ValidateContentPath(value); err == nil || CodeOf(err) != CodeInvalidPath {
			t.Fatalf("reserved/non-portable path %q was accepted: %v", value, err)
		}
	}
	for _, value := range []string{"console.js", "COM10.txt", "LPT10.txt", "assets/main.js"} {
		if err := ValidateContentPath(value); err != nil {
			t.Fatalf("portable path %q was rejected: %v", value, err)
		}
	}
}

func TestReadRejectsNonRegularZipEntries(t *testing.T) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	add := func(name string, mode os.FileMode, data []byte) {
		t.Helper()
		header := &zip.FileHeader{Name: name, Method: zip.Store}
		header.SetMode(mode)
		entry, err := writer.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	add(ManifestEntryName, 0o644, []byte(`{}`))
	add(SignatureEntryName, 0o644, make([]byte, ed25519.SignatureSize))
	add(EntrypointMainJS, os.ModeNamedPipe|0o644, []byte("not a regular entry"))
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	_, err := Read(buffer.Bytes())
	if err == nil || CodeOf(err) != CodeInvalidPackage {
		t.Fatalf("non-regular ZIP entry was accepted: %v", err)
	}
}
