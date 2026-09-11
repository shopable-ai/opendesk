// Package licensecli implements the publisher/customer license command surface.
// It emits structured JSON and never prints credentials, private keys, wrapped
// key envelopes, or plaintext content keys.
package licensecli

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/entitlement"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
)

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type envelope struct {
	OK      bool       `json:"ok"`
	Command string     `json:"command"`
	Result  any        `json:"result,omitempty"`
	Error   *errorBody `json:"error,omitempty"`
}

type Dependencies struct {
	NewDevice        func() (licensing.DeviceIdentityProvider, error)
	NewOnlineClient  func(service string, additionalRoots []byte) (entitlement.Client, error)
	NewReplayGuard   func() (licensing.OnlineReplayGuard, error)
	InstallationRoot func() (string, error)
	Now              func() time.Time
}

func defaultDependencies() Dependencies {
	return Dependencies{
		NewDevice: func() (licensing.DeviceIdentityProvider, error) {
			return deviceidentity.NewPlatformManager()
		},
		NewOnlineClient: func(service string, additionalRoots []byte) (entitlement.Client, error) {
			return entitlement.NewHTTPClient(service, additionalRoots)
		},
		NewReplayGuard:   licensing.NewPlatformOnlineReplayGuard,
		InstallationRoot: licensing.DefaultInstallationRoot,
		Now:              time.Now,
	}
}

func IsCommand(args []string) bool {
	return len(args) > 0 && args[0] == "license"
}

func Execute(args []string, stdout, stderr io.Writer) int {
	return ExecuteWithDependencies(args, stdout, stderr, defaultDependencies())
}

func ExecuteWithDependencies(args []string, stdout, stderr io.Writer, dependencies Dependencies) int {
	_ = stderr
	if len(args) < 2 || args[0] != "license" {
		return writeError(stdout, "license", "invalid_command", "license requires activate, status, refresh, deactivate, device, issue, install, inspect, or verify", 2)
	}
	switch args[1] {
	case "activate":
		return activate(args[2:], stdout, dependencies)
	case "status":
		return onlineStatus(args[2:], stdout, dependencies)
	case "refresh":
		return refresh(args[2:], stdout, dependencies)
	case "deactivate":
		return deactivate(args[2:], stdout, dependencies)
	case "device":
		return device(args[2:], stdout, dependencies)
	case "issue":
		return issue(args[2:], stdout, dependencies)
	case "install":
		return install(args[2:], stdout, dependencies)
	case "inspect":
		return inspect(args[2:], stdout)
	case "verify":
		return verify(args[2:], stdout, dependencies)
	default:
		return writeError(stdout, "license", "invalid_command", "unknown license command", 2)
	}
}

func device(args []string, stdout io.Writer, dependencies Dependencies) int {
	fs := flag.NewFlagSet("license device", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	outputPath := fs.String("o", "", "")
	if err := fs.Parse(args); err != nil || fs.NArg() != 0 {
		return writeError(stdout, "license.device", "invalid_argument", "invalid license device arguments", 2)
	}
	manager, err := newDevice(dependencies)
	if err != nil {
		return writeCommandError(stdout, "license.device", err)
	}
	identity, err := manager.Ensure(context.Background())
	if err != nil {
		return writeCommandError(stdout, "license.device", err)
	}
	if strings.TrimSpace(*outputPath) != "" {
		data, err := json.MarshalIndent(identity, "", "  ")
		if err != nil {
			return writeError(stdout, "license.device", "internal_error", "encode public device identity", 1)
		}
		data = append(data, '\n')
		if err := writeExclusive(*outputPath, data, 0o644); err != nil {
			return writeError(stdout, "license.device", "invalid_argument", err.Error(), 2)
		}
	}
	return writeSuccess(stdout, "license.device", map[string]any{
		"identity": identity,
		"output":   *outputPath,
	})
}

func issue(args []string, stdout io.Writer, dependencies Dependencies) int {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, "license.issue", "invalid_argument", "issue requires one recipe.odpkg path", 2)
	}
	packagePath := args[0]
	fs := flag.NewFlagSet("license issue", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	devicePath := fs.String("device", "", "")
	contentKeyPath := fs.String("content-key", "", "")
	signingKeyPath := fs.String("signing-key", "", "")
	licenseID := fs.String("license-id", "", "")
	subjectID := fs.String("subject-id", "", "")
	issuerKeyID := fs.String("issuer-key-id", "", "")
	issuedAtRaw := fs.String("issued-at", "", "")
	expiresAtRaw := fs.String("expires-at", "", "")
	outputPath := fs.String("o", "", "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, "license.issue", "invalid_argument", "invalid license issue arguments", 2)
	}
	for name, value := range map[string]string{
		"--device":        *devicePath,
		"--content-key":   *contentKeyPath,
		"--signing-key":   *signingKeyPath,
		"--license-id":    *licenseID,
		"--subject-id":    *subjectID,
		"--issuer-key-id": *issuerKeyID,
		"--expires-at":    *expiresAtRaw,
		"-o":              *outputPath,
	} {
		if strings.TrimSpace(value) == "" {
			return writeError(stdout, "license.issue", "invalid_argument", name+" is required", 2)
		}
	}
	protectedPackage, err := scriptpackage.ReadFile(packagePath)
	if err != nil {
		return writeCommandError(stdout, "license.issue", err)
	}
	if !protectedPackage.Manifest.License.Required {
		return writeError(stdout, "license.issue", "invalid_argument", "protected package does not require a license", 2)
	}
	identityData, err := readBoundedRegularFile(*devicePath, 16*1024)
	if err != nil {
		return writeError(stdout, "license.issue", "invalid_argument", "cannot read public device identity", 2)
	}
	identity, err := deviceidentity.ParsePublicIdentity(identityData)
	if err != nil {
		return writeCommandError(stdout, "license.issue", err)
	}
	contentKeyData, err := readBoundedRegularFile(*contentKeyPath, 16*1024)
	if err != nil {
		return writeError(stdout, "license.issue", "invalid_argument", "cannot read content key file", 2)
	}
	defer zero(contentKeyData)
	contentKey, err := scriptpackage.ParseContentKey(contentKeyData)
	if err != nil {
		return writeError(stdout, "license.issue", "invalid_argument", err.Error(), 2)
	}
	defer zero(contentKey)
	if err := validatePackageContentKey(protectedPackage, contentKey); err != nil {
		return writeCommandError(stdout, "license.issue", err)
	}
	publicKey, err := identity.ECDHPublicKey()
	if err != nil {
		return writeCommandError(stdout, "license.issue", err)
	}
	binding := licensing.EnvelopeBinding{
		FormatVersion:      licensing.OfflineLicenseFormatVersion,
		ProductID:          protectedPackage.Manifest.ProductID,
		PackageID:          protectedPackage.Manifest.PackageID,
		ContentKeyID:       protectedPackage.Manifest.Encryption.KeyID,
		DeviceID:           identity.DeviceID,
		DeviceKeyAlgorithm: identity.KeyAlgorithm,
	}
	keyEnvelope, err := licensing.WrapContentKey(contentKey, publicKey, binding)
	if err != nil {
		return writeCommandError(stdout, "license.issue", err)
	}
	issuedAt := now(dependencies)
	if strings.TrimSpace(*issuedAtRaw) != "" {
		issuedAt, err = time.Parse(time.RFC3339, *issuedAtRaw)
		if err != nil || licensing.FormatLicenseTime(issuedAt) != *issuedAtRaw {
			return writeError(stdout, "license.issue", "invalid_argument", "--issued-at must be canonical UTC RFC3339", 2)
		}
	}
	expiresAt, err := time.Parse(time.RFC3339, *expiresAtRaw)
	if err != nil || licensing.FormatLicenseTime(expiresAt) != *expiresAtRaw {
		return writeError(stdout, "license.issue", "invalid_argument", "--expires-at must be canonical UTC RFC3339", 2)
	}
	privateKeyData, err := readBoundedRegularFile(*signingKeyPath, 16*1024)
	if err != nil {
		return writeError(stdout, "license.issue", "invalid_argument", "cannot read license signing key file", 2)
	}
	defer zero(privateKeyData)
	privateKey, err := scriptpackage.ParseEd25519PrivateKey(privateKeyData)
	if err != nil {
		return writeCommandError(stdout, "license.issue", err)
	}
	defer zero(privateKey)
	claims := licensing.LicenseClaims{
		Format:             licensing.OfflineLicenseFormat,
		FormatVersion:      licensing.OfflineLicenseFormatVersion,
		LicenseID:          *licenseID,
		PublisherID:        protectedPackage.Manifest.PublisherID,
		PublisherKeyID:     *issuerKeyID,
		SubjectID:          *subjectID,
		DeviceID:           identity.DeviceID,
		DeviceKeyAlgorithm: identity.KeyAlgorithm,
		ProductID:          protectedPackage.Manifest.ProductID,
		PackageID:          protectedPackage.Manifest.PackageID,
		ContentKeyID:       protectedPackage.Manifest.Encryption.KeyID,
		IssuedAt:           licensing.FormatLicenseTime(issuedAt),
		ExpiresAt:          licensing.FormatLicenseTime(expiresAt),
		KeyEnvelope:        keyEnvelope,
	}
	licenseData, err := licensing.BuildOfflineLicense(claims, ed25519.PrivateKey(privateKey))
	if err != nil {
		return writeCommandError(stdout, "license.issue", err)
	}
	if err := writeExclusive(*outputPath, append(licenseData, '\n'), 0o600); err != nil {
		return writeError(stdout, "license.issue", "invalid_argument", err.Error(), 2)
	}
	return writeSuccess(stdout, "license.issue", safeLicenseResult(claims, map[string]any{"output": *outputPath}))
}

func inspect(args []string, stdout io.Writer) int {
	if len(args) != 1 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, "license.inspect", "invalid_argument", "inspect requires exactly one recipe.odlicense path", 2)
	}
	license, err := licensing.ReadOfflineLicense(args[0])
	if err != nil {
		return writeCommandError(stdout, "license.inspect", err)
	}
	return writeSuccess(stdout, "license.inspect", safeLicenseResult(license.Claims, nil))
}

func verify(args []string, stdout io.Writer, dependencies Dependencies) int {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, "license.verify", "invalid_argument", "verify requires one recipe.odlicense path", 2)
	}
	licensePath := args[0]
	fs := flag.NewFlagSet("license verify", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	issuerKeyPath := fs.String("issuer-key", "", "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 || strings.TrimSpace(*issuerKeyPath) == "" {
		return writeError(stdout, "license.verify", "invalid_argument", "verify requires --issuer-key", 2)
	}
	license, err := licensing.ReadOfflineLicense(licensePath)
	if err != nil {
		return writeCommandError(stdout, "license.verify", err)
	}
	issuerKey, err := readPublicKey(*issuerKeyPath)
	if err != nil {
		return writeCommandError(stdout, "license.verify", err)
	}
	manager, err := newDevice(dependencies)
	if err != nil {
		return writeCommandError(stdout, "license.verify", err)
	}
	contentKey, err := validateLicenseForDevice(context.Background(), license, issuerKey, manager, now(dependencies))
	zero(contentKey)
	if err != nil {
		return writeCommandError(stdout, "license.verify", err)
	}
	return writeSuccess(stdout, "license.verify", safeLicenseResult(license.Claims, map[string]any{
		"signatureVerified":     true,
		"deviceBindingVerified": true,
		"contentKeyAccessible":  true,
	}))
}

func install(args []string, stdout io.Writer, dependencies Dependencies) int {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, "license.install", "invalid_argument", "install requires one recipe.odlicense path", 2)
	}
	licensePath := args[0]
	fs := flag.NewFlagSet("license install", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	packagePath := fs.String("package", "", "")
	packageKeyPath := fs.String("package-publisher-key", "", "")
	issuerKeyPath := fs.String("issuer-key", "", "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, "license.install", "invalid_argument", "invalid license install arguments", 2)
	}
	for name, value := range map[string]string{
		"--package":               *packagePath,
		"--package-publisher-key": *packageKeyPath,
		"--issuer-key":            *issuerKeyPath,
	} {
		if strings.TrimSpace(value) == "" {
			return writeError(stdout, "license.install", "invalid_argument", name+" is required", 2)
		}
	}
	protectedPackage, err := scriptpackage.ReadFile(*packagePath)
	if err != nil {
		return writeCommandError(stdout, "license.install", err)
	}
	packageKey, err := readPublicKey(*packageKeyPath)
	if err != nil {
		return writeCommandError(stdout, "license.install", err)
	}
	if err := scriptpackage.VerifySignature(protectedPackage.RawManifest, protectedPackage.Payload, protectedPackage.Signature, packageKey); err != nil {
		return writeCommandError(stdout, "license.install", err)
	}
	licenseData, err := readBoundedRegularFile(licensePath, licensing.MaxOfflineLicenseSize)
	if err != nil {
		return writeError(stdout, "license.install", "invalid_argument", "cannot read offline license", 2)
	}
	license, err := licensing.ParseOfflineLicense(licenseData)
	if err != nil {
		return writeCommandError(stdout, "license.install", err)
	}
	issuerKey, err := readPublicKey(*issuerKeyPath)
	if err != nil {
		return writeCommandError(stdout, "license.install", err)
	}
	if license.Claims.PublisherID != protectedPackage.Manifest.PublisherID ||
		license.Claims.ProductID != protectedPackage.Manifest.ProductID ||
		license.Claims.PackageID != protectedPackage.Manifest.PackageID ||
		license.Claims.ContentKeyID != protectedPackage.Manifest.Encryption.KeyID {
		return writeError(stdout, "license.install", string(licensing.CodeLicenseDenied), "license does not match the protected package", 1)
	}
	manager, err := newDevice(dependencies)
	if err != nil {
		return writeCommandError(stdout, "license.install", err)
	}
	contentKey, err := validateLicenseForDevice(context.Background(), license, issuerKey, manager, now(dependencies))
	if err != nil {
		zero(contentKey)
		return writeCommandError(stdout, "license.install", err)
	}
	defer zero(contentKey)
	if err := validatePackageContentKey(protectedPackage, contentKey); err != nil {
		return writeCommandError(stdout, "license.install", err)
	}
	root, err := installationRoot(dependencies)
	if err != nil {
		return writeError(stdout, "license.install", "internal_error", err.Error(), 1)
	}
	store := licensing.FileInstallationStore{Root: root}
	if err := store.Install(protectedPackage.Manifest, licenseData, packageKey, issuerKey); err != nil {
		return writeCommandError(stdout, "license.install", err)
	}
	return writeSuccess(stdout, "license.install", safeLicenseResult(license.Claims, map[string]any{
		"installed":         true,
		"signatureVerified": true,
		"packageVerified":   true,
	}))
}

func validateLicenseForDevice(ctx context.Context, license *licensing.OfflineLicense, issuerKey ed25519.PublicKey, device licensing.DeviceIdentityProvider, current time.Time) ([]byte, error) {
	if err := licensing.VerifyOfflineLicense(license, issuerKey); err != nil {
		return nil, err
	}
	if current.UTC().Before(license.Claims.IssuedTime()) {
		return nil, licensing.NewError(licensing.CodeLicenseNotYetValid, "license is not yet valid", nil)
	}
	if !current.UTC().Before(license.Claims.ExpiryTime()) {
		return nil, licensing.NewError(licensing.CodeLicenseExpired, "license has expired", nil)
	}
	identity, err := device.Ensure(ctx)
	if err != nil {
		return nil, err
	}
	if identity.DeviceID != license.Claims.DeviceID || identity.KeyAlgorithm != license.Claims.DeviceKeyAlgorithm {
		return nil, licensing.NewError(licensing.CodeWrongDevice, "license is bound to another device", nil)
	}
	privateKey, err := device.PrivateKey(ctx, license.Claims.DeviceID)
	if err != nil {
		return nil, err
	}
	return licensing.UnwrapContentKey(license.Claims.KeyEnvelope, privateKey, licensing.EnvelopeBinding{
		FormatVersion:      license.Claims.FormatVersion,
		ProductID:          license.Claims.ProductID,
		PackageID:          license.Claims.PackageID,
		ContentKeyID:       license.Claims.ContentKeyID,
		DeviceID:           license.Claims.DeviceID,
		DeviceKeyAlgorithm: license.Claims.DeviceKeyAlgorithm,
	})
}

func validatePackageContentKey(protectedPackage *scriptpackage.Package, contentKey []byte) error {
	if protectedPackage == nil {
		return licensing.NewError(licensing.CodeInvalidLicense, "protected package is missing", nil)
	}
	nonce, err := protectedPackage.Manifest.DecodeNonce()
	if err != nil {
		return err
	}
	plaintext, err := scriptpackage.Decrypt(protectedPackage.Payload, contentKey, nonce, protectedPackage.RawManifest)
	if err != nil {
		return licensing.NewError(licensing.CodeContentKeyUnavailable, "content key does not decrypt the protected package", nil)
	}
	defer zero(plaintext)
	if len(plaintext) == 0 || !utf8.Valid(plaintext) {
		return licensing.NewError(licensing.CodeContentKeyUnavailable, "content key decrypts an invalid JavaScript payload", nil)
	}
	return nil
}

func safeLicenseResult(claims licensing.LicenseClaims, extra map[string]any) map[string]any {
	result := map[string]any{
		"format":               claims.Format,
		"formatVersion":        claims.FormatVersion,
		"licenseId":            claims.LicenseID,
		"publisherId":          claims.PublisherID,
		"publisherKeyId":       claims.PublisherKeyID,
		"subjectId":            claims.SubjectID,
		"deviceId":             claims.DeviceID,
		"deviceKeyAlgorithm":   claims.DeviceKeyAlgorithm,
		"productId":            claims.ProductID,
		"packageId":            claims.PackageID,
		"contentKeyId":         claims.ContentKeyID,
		"issuedAt":             claims.IssuedAt,
		"expiresAt":            claims.ExpiresAt,
		"keyEnvelopeAlgorithm": claims.KeyEnvelope.Algorithm,
	}
	for key, value := range extra {
		result[key] = value
	}
	return result
}

func readPublicKey(path string) (ed25519.PublicKey, error) {
	data, err := readBoundedRegularFile(path, 16*1024)
	if err != nil {
		return nil, licensing.NewError(licensing.CodeInvalidLicenseSign, "cannot read public key file", err)
	}
	key, err := scriptpackage.ParseEd25519PublicKey(data)
	if err != nil {
		return nil, licensing.NewError(licensing.CodeInvalidLicenseSign, "public key file is invalid", err)
	}
	return key, nil
}

func readBoundedRegularFile(path string, limit int64) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > limit {
		return nil, fmt.Errorf("input must be a bounded regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || openedInfo.Size() != info.Size() {
		return nil, fmt.Errorf("input file changed during secure read")
	}
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("input file exceeds its size limit")
	}
	return data, nil
}

func newDevice(dependencies Dependencies) (licensing.DeviceIdentityProvider, error) {
	if dependencies.NewDevice == nil {
		return nil, licensing.NewError(licensing.CodeDeviceKeyUnavailable, "device identity provider is not configured", nil)
	}
	return dependencies.NewDevice()
}

func installationRoot(dependencies Dependencies) (string, error) {
	if dependencies.InstallationRoot == nil {
		return "", fmt.Errorf("license installation root provider is not configured")
	}
	return dependencies.InstallationRoot()
}

func now(dependencies Dependencies) time.Time {
	if dependencies.Now != nil {
		return dependencies.Now().UTC().Truncate(time.Second)
	}
	return time.Now().UTC().Truncate(time.Second)
}

func writeExclusive(path string, data []byte, mode os.FileMode) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("output path is empty")
	}
	if directory := filepath.Dir(path); directory != "." {
		if err := os.MkdirAll(directory, 0o755); err != nil {
			return fmt.Errorf("create output directory: %w", err)
		}
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("create output file: %w", err)
	}
	remove := true
	defer func() {
		_ = file.Close()
		if remove {
			_ = os.Remove(path)
		}
	}()
	if _, err := file.Write(data); err != nil {
		return fmt.Errorf("write output file: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync output file: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close output file: %w", err)
	}
	remove = false
	return nil
}

func writeSuccess(stdout io.Writer, command string, result any) int {
	_ = json.NewEncoder(stdout).Encode(envelope{OK: true, Command: command, Result: result})
	return 0
}

func writeCommandError(stdout io.Writer, command string, err error) int {
	code := string(licensing.CodeOf(err))
	if code == "" {
		code = string(deviceidentity.CodeOf(err))
	}
	if code == "" {
		code = string(scriptpackage.CodeOf(err))
	}
	if code == "" {
		code = "invalid_argument"
	}
	return writeError(stdout, command, code, err.Error(), 1)
}

func writeError(stdout io.Writer, command, code, message string, exitCode int) int {
	_ = json.NewEncoder(stdout).Encode(envelope{OK: false, Command: command, Error: &errorBody{Code: code, Message: message}})
	return exitCode
}

func zero(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
