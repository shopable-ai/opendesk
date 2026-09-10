package protectedcli

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptloader"
	"opendesk/pkg/scriptpackage"
)

type testPublisherProvider struct{ key ed25519.PublicKey }

func (provider testPublisherProvider) ResolvePublisherKey(context.Context, scriptpackage.Manifest) (ed25519.PublicKey, error) {
	return provider.key, nil
}

type testLicenseProvider struct{ err error }

func (provider testLicenseProvider) Verify(context.Context, scriptpackage.Manifest) (*licensing.Entitlement, error) {
	if provider.err != nil {
		return nil, provider.err
	}
	return &licensing.Entitlement{LicenseID: "test-license", ProductID: "protected-product", SubjectID: "test-subject"}, nil
}

type testContentKeyProvider struct {
	key []byte
	err error
}

func (provider testContentKeyProvider) Resolve(context.Context, scriptpackage.Manifest, *licensing.Entitlement) ([]byte, error) {
	if provider.err != nil {
		return nil, provider.err
	}
	return provider.key, nil
}

func protectedFixture(t *testing.T, source []byte) (string, []byte, ed25519.PublicKey, string) {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	contentKey, err := scriptpackage.GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	manifest := scriptpackage.Manifest{
		PackageID: "protected-package",
		ProductID: "protected-product",
		PublisherID: "protected-publisher",
		PublisherKeyID: "protected-publisher-key",
		MinimumRuntimeVersion: "0.0.0",
		Encryption: scriptpackage.EncryptionManifest{KeyID: "protected-content-key"},
		License: scriptpackage.LicenseManifest{Required: true, ProductID: "protected-product"},
	}
	result, err := scriptpackage.Build(source, manifest, contentKey, privateKey)
	if err != nil {
		t.Fatal(err)
	}
	filePath := filepath.Join(t.TempDir(), "recipe.odpkg")
	if err := os.WriteFile(filePath, result.Bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	return filePath, contentKey, publicKey, result.PackageDigest
}

func loaderFor(publicKey ed25519.PublicKey, contentKey []byte, licenseErr, keyErr error) scriptloader.ProtectedPackageLoader {
	return scriptloader.ProtectedPackageLoader{
		PublisherKeys: testPublisherProvider{key: publicKey},
		LicenseVerifier: testLicenseProvider{err: licenseErr},
		ContentKeys: testContentKeyProvider{key: contentKey, err: keyErr},
	}
}

func TestAuthorizationFailuresCauseZeroExecution(t *testing.T) {
	filePath, contentKey, publicKey, _ := protectedFixture(t, []byte("globalThis.__mustNotExecute = true;"))
	tests := []struct {
		name string
		loader scriptloader.Loader
		wantCode string
	}{
		{
			name: "license denied",
			loader: loaderFor(publicKey, contentKey, licensing.NewError(licensing.CodeLicenseDenied, "denied", nil), nil),
			wantCode: string(licensing.CodeLicenseDenied),
		},
		{
			name: "content key unavailable",
			loader: loaderFor(publicKey, contentKey, nil, licensing.NewError(licensing.CodeContentKeyUnavailable, "unavailable", nil)),
			wantCode: string(licensing.CodeContentKeyUnavailable),
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			executeCalls := 0
			_, _, _, err := RunProtectedFile(context.Background(), test.loader, filePath, RunOptions{}, func(request pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
				executeCalls++
				return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, nil
			})
			if ErrorCodeOf(err) != test.wantCode {
				t.Fatalf("error code = %q, want %q, err=%v", ErrorCodeOf(err), test.wantCode, err)
			}
			if executeCalls != 0 {
				t.Fatalf("execution called %d times after %s", executeCalls, test.name)
			}
		})
	}
}

func TestInvalidSignatureCausesZeroExecution(t *testing.T) {
	filePath, contentKey, _, _ := protectedFixture(t, []byte("globalThis.__mustNotExecuteSignature = true;"))
	wrongPublicKey, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	executeCalls := 0
	_, _, _, runErr := RunProtectedFile(context.Background(), loaderFor(wrongPublicKey, contentKey, nil, nil), filePath, RunOptions{}, func(request pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		executeCalls++
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, nil
	})
	if ErrorCodeOf(runErr) != string(scriptpackage.CodeInvalidSignature) {
		t.Fatalf("error code = %q, err=%v", ErrorCodeOf(runErr), runErr)
	}
	if executeCalls != 0 {
		t.Fatalf("execution called %d times after invalid signature", executeCalls)
	}
}

func TestProtectedRequestUsesPackageDigestAndDisablesSnapshot(t *testing.T) {
	source := []byte("const secretSource = 'request-policy-marker'; void secretSource;")
	filePath, contentKey, publicKey, packageDigest := protectedFixture(t, source)
	var captured pkgExecution.Request
	_, _, protection, err := RunProtectedFile(context.Background(), loaderFor(publicKey, contentKey, nil, nil), filePath, RunOptions{LogDir: t.TempDir(), WorkDir: t.TempDir()}, func(request pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		captured = request
		return pkgExecution.ExecutionResult{ExecutionID: request.ExecutionID, ScriptHash: request.ScriptHash, Artifacts: request.Artifacts}, pkgExecution.AgentSummary{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if captured.ScriptHash != packageDigest || captured.ScriptHash == pkgExecution.ComputeScriptHash(source) {
		t.Fatalf("protected script hash = %q, package=%q plaintext=%q", captured.ScriptHash, packageDigest, pkgExecution.ComputeScriptHash(source))
	}
	if captured.Artifacts.ScriptSnapshotPath != "" {
		t.Fatalf("protected snapshot path = %q", captured.Artifacts.ScriptSnapshotPath)
	}
	if captured.ScriptPath != "" {
		t.Fatalf("protected execution exposed package path as JavaScript scriptPath: %q", captured.ScriptPath)
	}
	if protection.Mode != scriptloader.ProtectionProtected || protection.PackageDigest != packageDigest {
		t.Fatalf("unexpected protection metadata: %#v", protection)
	}
}

func TestSaveLastScriptIsDeniedBeforeLoadOrExecution(t *testing.T) {
	loadCalls := 0
	executeCalls := 0
	loader := loaderFunc(func(context.Context, string) (*scriptloader.ScriptSource, error) {
		loadCalls++
		return nil, nil
	})
	_, _, _, err := RunProtectedFile(context.Background(), loader, "recipe.odpkg", RunOptions{SaveLastScript: "source.js"}, func(pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		executeCalls++
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, nil
	})
	if ErrorCodeOf(err) != "protected_source_export_denied" {
		t.Fatalf("error code = %q, err=%v", ErrorCodeOf(err), err)
	}
	if loadCalls != 0 || executeCalls != 0 {
		t.Fatalf("save-last-script denial happened too late: load=%d execute=%d", loadCalls, executeCalls)
	}
}

func TestProtectedExecutionDoesNotPersistPlaintextSentinel(t *testing.T) {
	const sentinel = "OPENDESK_PROTECTED_SOURCE_SENTINEL_P0_7F8A"
	source := []byte("const hidden = '" + sentinel + "'; void hidden;")
	filePath, contentKey, publicKey, packageDigest := protectedFixture(t, source)
	artifactDir := t.TempDir()
	workDir := t.TempDir()
	result, summary, _, err := RunProtectedFile(context.Background(), loaderFor(publicKey, contentKey, nil, nil), filePath, RunOptions{
		LogDir: artifactDir,
		WorkDir: workDir,
		TimeoutMinutes: 1,
	}, pkgExecution.Run)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != pkgExecution.ExecutionStatusSucceeded {
		t.Fatalf("protected execution status = %s", result.Status)
	}
	if result.ScriptHash != packageDigest || summary.ScriptHash != packageDigest {
		t.Fatalf("public execution identity is not package digest: result=%q summary=%q package=%q", result.ScriptHash, summary.ScriptHash, packageDigest)
	}
	if result.Artifacts.ScriptSnapshotPath != "" || summary.Artifacts.ScriptSnapshotPath != "" {
		t.Fatalf("protected execution exposed snapshot path: result=%q summary=%q", result.Artifacts.ScriptSnapshotPath, summary.Artifacts.ScriptSnapshotPath)
	}
	plaintextHash := pkgExecution.ComputeScriptHash(source)
	walkErr := filepath.WalkDir(artifactDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if strings.HasPrefix(entry.Name(), "script_snapshot") {
			t.Fatalf("protected execution created forbidden snapshot: %s", path)
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if bytes.Contains(data, []byte(sentinel)) {
			t.Fatalf("plaintext sentinel leaked into %s", path)
		}
		if bytes.Contains(data, []byte(plaintextHash)) {
			t.Fatalf("plaintext source hash leaked into %s", path)
		}
		return nil
	})
	if walkErr != nil {
		t.Fatal(walkErr)
	}
}

type loaderFunc func(context.Context, string) (*scriptloader.ScriptSource, error)

func (function loaderFunc) Load(ctx context.Context, path string) (*scriptloader.ScriptSource, error) {
	return function(ctx, path)
}
