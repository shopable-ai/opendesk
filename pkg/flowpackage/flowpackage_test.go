package flowpackage

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"opendesk/pkg/scriptpackage"
)

type testZipEntry struct {
	name   string
	data   []byte
	method uint16
	mode   os.FileMode
}

func TestBuildReadPlainFlow(t *testing.T) {
	result, _, _ := buildPlainFlow(t, "1.0.0", []byte("console.log('plain flow')"))
	flow, err := Read(result.Bytes)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if flow.Manifest.Name != "Plain Test Flow" || flow.Manifest.Entry != "payload/main.js" {
		t.Fatalf("unexpected manifest: %#v", flow.Manifest)
	}
	if got := string(flow.Entries["payload/main.js"]); got != "console.log('plain flow')" {
		t.Fatalf("payload = %q", got)
	}
	if flow.ArchiveDigest != result.ArchiveDigest || flow.ManifestDigest != result.ManifestDigest {
		t.Fatal("verified digests differ from build result")
	}
}

func TestReadRejectsIllegalArchiveEntries(t *testing.T) {
	tests := []struct {
		name  string
		entry testZipEntry
	}{
		{name: "parent traversal", entry: testZipEntry{name: "../escape.js", data: []byte("x")}},
		{name: "absolute", entry: testZipEntry{name: "/escape.js", data: []byte("x")}},
		{name: "drive absolute", entry: testZipEntry{name: "C:/escape.js", data: []byte("x")}},
		{name: "backslash", entry: testZipEntry{name: `payload\escape.js`, data: []byte("x")}},
		{name: "symlink", entry: testZipEntry{name: "payload/link", data: []byte("outside"), mode: os.ModeSymlink | 0o777}},
		{name: "special", entry: testZipEntry{name: "payload/socket", data: []byte("x"), mode: os.ModeSocket | 0o600}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			archive := writeTestZip(t, []testZipEntry{
				test.entry,
				{name: ManifestName, data: []byte("{}")},
				{name: SignatureName, data: make([]byte, ed25519.SignatureSize)},
			})
			if _, err := Read(archive); CodeOf(err) != CodeInvalidContainer {
				t.Fatalf("Read() code = %q, error = %v", CodeOf(err), err)
			}
		})
	}
}

func TestReadRejectsCrossPlatformDuplicateEntries(t *testing.T) {
	for _, names := range [][]string{
		{"payload/Main.js", "payload/main.js"},
		{"payload/café.js", "payload/café.js"},
	} {
		entries := []testZipEntry{
			{name: names[0], data: []byte("a")},
			{name: names[1], data: []byte("b")},
			{name: ManifestName, data: []byte("{}")},
			{name: SignatureName, data: make([]byte, ed25519.SignatureSize)},
		}
		if _, err := Read(writeTestZip(t, entries)); CodeOf(err) != CodeInvalidContainer {
			t.Fatalf("duplicate %q code = %q, error = %v", names, CodeOf(err), err)
		}
	}
}

func TestReadRejectsDuplicateManifestAndEntryCountLimit(t *testing.T) {
	result, _, _ := buildPlainFlow(t, "1.0.0", []byte("ok"))
	entries := readTestZip(t, result.Bytes)
	entries = append(entries, testZipEntry{name: ManifestName, data: result.Bytes[:1]})
	if _, err := Read(writeTestZip(t, entries)); CodeOf(err) != CodeInvalidContainer {
		t.Fatalf("duplicate manifest code = %q, error = %v", CodeOf(err), err)
	}

	entries = make([]testZipEntry, 0, MaxEntryCount+1)
	for index := 0; index < MaxEntryCount+1; index++ {
		entries = append(entries, testZipEntry{name: fmt.Sprintf("payload/file-%04d", index), data: nil})
	}
	if _, err := Read(writeTestZip(t, entries)); CodeOf(err) != CodeInvalidContainer {
		t.Fatalf("entry count code = %q, error = %v", CodeOf(err), err)
	}
}

func TestReadRejectsCompressionAbuse(t *testing.T) {
	archive := writeTestZip(t, []testZipEntry{
		{name: "payload/bomb.bin", data: bytes.Repeat([]byte{0}, 2<<20), method: zip.Deflate},
		{name: ManifestName, data: []byte("{}")},
		{name: SignatureName, data: make([]byte, ed25519.SignatureSize)},
	})
	if _, err := Read(archive); CodeOf(err) != CodeFlowTooLarge {
		t.Fatalf("compression abuse code = %q, error = %v", CodeOf(err), err)
	}
}

func TestReadRejectsManifestPayloadAndSignatureTampering(t *testing.T) {
	result, _, _ := buildPlainFlow(t, "1.0.0", []byte("original"))
	tests := []struct {
		name string
		code ErrorCode
		edit func([]testZipEntry) []testZipEntry
	}{
		{
			name: "digest mismatch", code: CodePayloadMismatch,
			edit: func(entries []testZipEntry) []testZipEntry {
				return replaceEntry(entries, "payload/main.js", []byte("tampered"))
			},
		},
		{
			name: "signature mismatch", code: CodeInvalidSignature,
			edit: func(entries []testZipEntry) []testZipEntry {
				for index := range entries {
					if entries[index].name == SignatureName {
						entries[index].data[0] ^= 0xff
					}
				}
				return entries
			},
		},
		{
			name: "undeclared payload", code: CodePayloadMismatch,
			edit: func(entries []testZipEntry) []testZipEntry {
				return append(entries, testZipEntry{name: "payload/undeclared.txt", data: []byte("no")})
			},
		},
		{
			name: "missing declared payload", code: CodePayloadMismatch,
			edit: func(entries []testZipEntry) []testZipEntry {
				return removeEntry(entries, "payload/main.js")
			},
		},
		{
			name: "non canonical manifest", code: CodeInvalidManifest,
			edit: func(entries []testZipEntry) []testZipEntry {
				for index := range entries {
					if entries[index].name == ManifestName {
						entries[index].data = append(entries[index].data, '\n')
					}
				}
				return entries
			},
		},
		{
			name: "duplicate json key", code: CodeInvalidManifest,
			edit: func(entries []testZipEntry) []testZipEntry {
				for index := range entries {
					if entries[index].name == ManifestName {
						entries[index].data = bytes.Replace(entries[index].data, []byte(`{"format":`), []byte(`{"format":"opendesk-flow","format":`), 1)
					}
				}
				return entries
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			entries := test.edit(readTestZip(t, result.Bytes))
			if _, err := Read(writeTestZip(t, entries)); CodeOf(err) != test.code {
				t.Fatalf("Read() code = %q, want %q; error = %v", CodeOf(err), test.code, err)
			}
		})
	}
}

func TestReadRejectsPublisherIdentityMismatch(t *testing.T) {
	result, _, _ := buildPlainFlow(t, "1.0.0", []byte("ok"))
	otherPublic, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	entries := replaceEntry(readTestZip(t, result.Bytes), PublisherKeyName, otherPublic)
	if _, err := Read(writeTestZip(t, entries)); CodeOf(err) != CodeIdentityMismatch {
		t.Fatalf("Read() code = %q, error = %v", CodeOf(err), err)
	}
}

func TestManifestCannotDeclareLicenseEndpointOrOfficialStatus(t *testing.T) {
	result, _, privateKey := buildPlainFlow(t, "1.0.0", []byte("ok"))
	for _, injected := range []string{
		`,"licenseEndpoint":"https://attacker.example/get-license"}`,
		`,"official":true}`,
	} {
		entries := readTestZip(t, result.Bytes)
		for index := range entries {
			if entries[index].name != ManifestName {
				continue
			}
			raw := bytes.TrimSuffix(entries[index].data, []byte("}"))
			entries[index].data = append(raw, []byte(injected)...)
			signature, err := Sign(entries[index].data, privateKey)
			if err != nil {
				t.Fatal(err)
			}
			entries = replaceEntry(entries, SignatureName, signature)
			break
		}
		if _, err := Read(writeTestZip(t, entries)); CodeOf(err) != CodeInvalidManifest {
			t.Fatalf("unknown authority/endpoint field code = %q, error = %v", CodeOf(err), err)
		}
	}
}

func TestBuildRejectsProtectedPackageIdentityMismatch(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	protected, err := scriptpackage.Build([]byte("console.log('protected')"), scriptpackage.Manifest{
		PackageID: "package-a", ProductID: "product-a", PublisherID: "publisher-other", PublisherKeyID: "key-a",
		MinimumRuntimeVersion: "0.0.0", Encryption: scriptpackage.EncryptionManifest{KeyID: "content-a"},
		License: scriptpackage.LicenseManifest{Required: true, ProductID: "product-a"},
	}, bytes.Repeat([]byte{0x42}, scriptpackage.ContentKeySize), privateKey)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "payload"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "payload", "protected.odpkg"), protected.Bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = Build(BuildOptions{
		SourceRoot: root, FlowID: "flow-a", Name: "Protected Flow", Version: "1.0.0",
		PublisherID: "publisher-a", PublisherKeyID: "key-a", Entry: "payload/protected.odpkg",
		MinimumRuntimeVersion: "0.0.0", Platforms: []string{runtime.GOOS},
		Files: []string{"payload/protected.odpkg"},
		PublisherPublicKey: publicKey, PublisherPrivateKey: privateKey,
	})
	if CodeOf(err) != CodeIdentityMismatch {
		t.Fatalf("Build() code = %q, error = %v", CodeOf(err), err)
	}
}

func TestBuildRejectsSourceSymlink(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "payload"), 0o700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside.js")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "payload", "main.js")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	publicKey, privateKey, _ := ed25519.GenerateKey(rand.Reader)
	_, err := Build(BuildOptions{
		SourceRoot: root, FlowID: "flow-a", Name: "Symlink Flow", Version: "1.0.0",
		PublisherID: "publisher-a", PublisherKeyID: "key-a", Entry: "payload/main.js",
		MinimumRuntimeVersion: "0.0.0", Platforms: []string{runtime.GOOS},
		Files: []string{"payload/main.js"},
		PublisherPublicKey: publicKey, PublisherPrivateKey: privateKey,
	})
	if CodeOf(err) != CodeInvalidContainer {
		t.Fatalf("Build() code = %q, error = %v", CodeOf(err), err)
	}
}

func buildPlainFlow(t *testing.T, version string, source []byte) (*BuildResult, ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "payload"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "payload", "main.js"), source, 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := Build(BuildOptions{
		SourceRoot: root, FlowID: "plain-flow", Name: "Plain Test Flow", Version: version,
		PublisherID: "publisher-a", PublisherKeyID: "key-a", Entry: "payload/main.js",
		MinimumRuntimeVersion: "0.0.0", Platforms: []string{runtime.GOOS},
		Files: []string{"payload/main.js"},
		PublisherPublicKey: publicKey, PublisherPrivateKey: privateKey,
	})
	if err != nil {
		t.Fatal(err)
	}
	return result, publicKey, privateKey
}

func readTestZip(t *testing.T, archive []byte) []testZipEntry {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	entries := make([]testZipEntry, 0, len(reader.File))
	for _, file := range reader.File {
		stream, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		var content bytes.Buffer
		if _, err := content.ReadFrom(stream); err != nil {
			_ = stream.Close()
			t.Fatal(err)
		}
		_ = stream.Close()
		entries = append(entries, testZipEntry{name: file.Name, data: content.Bytes(), method: file.Method, mode: file.Mode()})
	}
	return entries
}

func writeTestZip(t *testing.T, entries []testZipEntry) []byte {
	t.Helper()
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	for _, entry := range entries {
		method := entry.method
		if method == 0 {
			method = zip.Store
		}
		header := &zip.FileHeader{Name: entry.name, Method: method}
		mode := entry.mode
		if mode == 0 {
			mode = 0o600
		}
		header.SetMode(mode)
		stream, err := writer.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := stream.Write(entry.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func replaceEntry(entries []testZipEntry, name string, content []byte) []testZipEntry {
	for index := range entries {
		entries[index].data = append([]byte(nil), entries[index].data...)
		if entries[index].name == name {
			entries[index].data = append([]byte(nil), content...)
		}
	}
	return entries
}

func removeEntry(entries []testZipEntry, name string) []testZipEntry {
	filtered := entries[:0]
	for _, entry := range entries {
		if entry.name != name {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}
