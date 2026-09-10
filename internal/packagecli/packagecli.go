package packagecli

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

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

func IsCommand(args []string) bool {
	return len(args) > 0 && args[0] == "package"
}

func Execute(args []string, stdout, stderr io.Writer) int {
	if len(args) < 2 || args[0] != "package" {
		return writeError(stdout, "package", "invalid_command", "package requires protect, inspect, or verify", 2)
	}
	switch args[1] {
	case "protect":
		return protect(args[2:], stdout)
	case "inspect":
		return inspect(args[2:], stdout)
	case "verify":
		return verify(args[2:], stdout)
	default:
		return writeError(stdout, "package", "invalid_command", "unknown package command", 2)
	}
}

func protect(args []string, stdout io.Writer) int {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, "package.protect", "invalid_argument", "protect requires one recipe.js path", 2)
	}
	sourcePath := args[0]
	if !strings.EqualFold(filepath.Ext(sourcePath), ".js") {
		return writeError(stdout, "package.protect", "invalid_argument", "protect source must be a .js file", 2)
	}
	fs := flag.NewFlagSet("package protect", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	outputPath := fs.String("o", "", "")
	packageID := fs.String("package-id", "", "")
	productID := fs.String("product-id", "", "")
	publisherID := fs.String("publisher-id", "", "")
	publisherKeyID := fs.String("publisher-key-id", "", "")
	contentKeyID := fs.String("content-key-id", "", "")
	minimumRuntimeVersion := fs.String("minimum-runtime-version", "0.0.0", "")
	signingKeyPath := fs.String("signing-key", "", "")
	contentKeyPath := fs.String("content-key", "", "")
	keyOutputPath := fs.String("key-out", "", "")
	licenseRequired := fs.Bool("license-required", true, "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, "package.protect", "invalid_argument", "invalid package protect arguments", 2)
	}
	for name, value := range map[string]string{
		"-o": *outputPath,
		"--package-id": *packageID,
		"--product-id": *productID,
		"--publisher-id": *publisherID,
		"--publisher-key-id": *publisherKeyID,
		"--content-key-id": *contentKeyID,
		"--signing-key": *signingKeyPath,
	} {
		if strings.TrimSpace(value) == "" {
			return writeError(stdout, "package.protect", "invalid_argument", name+" is required", 2)
		}
	}
	if strings.TrimSpace(*contentKeyPath) == "" && strings.TrimSpace(*keyOutputPath) == "" {
		return writeError(stdout, "package.protect", "invalid_argument", "auto-generated DEK requires --key-out so the publisher can retain it", 2)
	}

	source, err := os.ReadFile(sourcePath)
	if err != nil {
		return writeError(stdout, "package.protect", "invalid_argument", "cannot read JavaScript source", 2)
	}
	privateKeyBytes, err := os.ReadFile(*signingKeyPath)
	if err != nil {
		return writeError(stdout, "package.protect", "invalid_argument", "cannot read signing key file", 2)
	}
	privateKey, err := scriptpackage.ParseEd25519PrivateKey(privateKeyBytes)
	if err != nil {
		return writePackageError(stdout, "package.protect", err)
	}
	defer zeroBytes(privateKey)

	var contentKey []byte
	generatedKey := false
	if strings.TrimSpace(*contentKeyPath) != "" {
		contentKey, err = readContentKey(*contentKeyPath)
		if err != nil {
			return writeError(stdout, "package.protect", "invalid_argument", err.Error(), 2)
		}
	} else {
		contentKey, err = scriptpackage.GenerateContentKey()
		if err != nil {
			return writeError(stdout, "package.protect", "internal_error", "cannot generate content key", 1)
		}
		generatedKey = true
	}
	defer zeroBytes(contentKey)

	manifest := scriptpackage.Manifest{
		PackageID:             *packageID,
		ProductID:             *productID,
		PublisherID:           *publisherID,
		PublisherKeyID:        *publisherKeyID,
		MinimumRuntimeVersion: *minimumRuntimeVersion,
		Encryption: scriptpackage.EncryptionManifest{
			KeyID: *contentKeyID,
		},
		License: scriptpackage.LicenseManifest{
			Required:  *licenseRequired,
			ProductID: *productID,
		},
	}
	result, err := scriptpackage.Build(source, manifest, contentKey, ed25519.PrivateKey(privateKey))
	if err != nil {
		return writePackageError(stdout, "package.protect", err)
	}
	if generatedKey {
		if err := writeSecretFile(*keyOutputPath, contentKey); err != nil {
			return writeError(stdout, "package.protect", "invalid_argument", err.Error(), 1)
		}
	}
	if err := scriptpackage.WriteFile(*outputPath, result); err != nil {
		if generatedKey {
			_ = os.Remove(*keyOutputPath)
		}
		return writeError(stdout, "package.protect", "invalid_argument", err.Error(), 1)
	}
	return writeSuccess(stdout, "package.protect", map[string]any{
		"output": *outputPath,
		"packageId": result.Manifest.PackageID,
		"productId": result.Manifest.ProductID,
		"publisherId": result.Manifest.PublisherID,
		"publisherKeyId": result.Manifest.PublisherKeyID,
		"packageDigest": result.PackageDigest,
		"generatedContentKeyFile": func() string {
			if generatedKey { return *keyOutputPath }
			return ""
		}(),
	})
}

func inspect(args []string, stdout io.Writer) int {
	if len(args) != 1 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, "package.inspect", "invalid_argument", "inspect requires exactly one recipe.odpkg path", 2)
	}
	protectedPackage, err := scriptpackage.ReadFile(args[0])
	if err != nil {
		return writePackageError(stdout, "package.inspect", err)
	}
	return writeSuccess(stdout, "package.inspect", map[string]any{
		"manifest": protectedPackage.Manifest,
		"packageDigest": protectedPackage.PackageDigest,
	})
}

func verify(args []string, stdout io.Writer) int {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, "package.verify", "invalid_argument", "verify requires one recipe.odpkg path", 2)
	}
	packagePath := args[0]
	fs := flag.NewFlagSet("package verify", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	publicKeyPath := fs.String("public-key", "", "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 || strings.TrimSpace(*publicKeyPath) == "" {
		return writeError(stdout, "package.verify", "invalid_argument", "verify requires --public-key", 2)
	}
	protectedPackage, err := scriptpackage.ReadFile(packagePath)
	if err != nil {
		return writePackageError(stdout, "package.verify", err)
	}
	publicKeyBytes, err := os.ReadFile(*publicKeyPath)
	if err != nil {
		return writeError(stdout, "package.verify", "invalid_argument", "cannot read publisher public key file", 2)
	}
	publicKey, err := scriptpackage.ParseEd25519PublicKey(publicKeyBytes)
	if err != nil {
		return writePackageError(stdout, "package.verify", err)
	}
	if err := scriptpackage.VerifySignature(protectedPackage.RawManifest, protectedPackage.Payload, protectedPackage.Signature, publicKey); err != nil {
		return writePackageError(stdout, "package.verify", err)
	}
	return writeSuccess(stdout, "package.verify", map[string]any{
		"signatureVerified": true,
		"packageId": protectedPackage.Manifest.PackageID,
		"publisherId": protectedPackage.Manifest.PublisherID,
		"publisherKeyId": protectedPackage.Manifest.PublisherKeyID,
		"packageDigest": protectedPackage.PackageDigest,
	})
}

func readContentKey(filePath string) ([]byte, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("cannot read content key file")
	}
	if len(data) == scriptpackage.ContentKeySize {
		return append([]byte(nil), data...), nil
	}
	trimmed := strings.TrimSpace(string(data))
	if decoded, err := hex.DecodeString(trimmed); err == nil && len(decoded) == scriptpackage.ContentKeySize {
		return decoded, nil
	}
	if decoded, err := base64.StdEncoding.DecodeString(trimmed); err == nil && len(decoded) == scriptpackage.ContentKeySize {
		return decoded, nil
	}
	return nil, fmt.Errorf("content key file must contain 32 raw bytes, 64 hex characters, or base64 for 32 bytes")
}

func writeSecretFile(filePath string, content []byte) error {
	if strings.TrimSpace(filePath) == "" {
		return fmt.Errorf("key output path is empty")
	}
	file, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create content key output: %w", err)
	}
	defer file.Close()
	if _, err := file.Write(content); err != nil {
		_ = os.Remove(filePath)
		return fmt.Errorf("write content key output: %w", err)
	}
	return nil
}

func writeSuccess(stdout io.Writer, command string, result any) int {
	_ = json.NewEncoder(stdout).Encode(envelope{OK: true, Command: command, Result: result})
	return 0
}

func writePackageError(stdout io.Writer, command string, err error) int {
	code := string(scriptpackage.CodeOf(err))
	if code == "" {
		code = "invalid_package"
	}
	return writeError(stdout, command, code, err.Error(), 1)
}

func writeError(stdout io.Writer, command, code, message string, exitCode int) int {
	_ = json.NewEncoder(stdout).Encode(envelope{OK: false, Command: command, Error: &errorBody{Code: code, Message: message}})
	return exitCode
}

func zeroBytes(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
