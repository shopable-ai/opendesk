package flowcli

import (
	"flag"
	"io"
	"os"
	"path/filepath"
	"strings"

	"opendesk/pkg/flow"
	"opendesk/pkg/scriptpackage"
)

type stringList []string

func (values *stringList) String() string         { return strings.Join(*values, ",") }
func (values *stringList) Set(value string) error { *values = append(*values, value); return nil }

func runPack(args []string, stdout io.Writer) int {
	command := "flow pack"
	if len(args) == 0 {
		return writeError(stdout, command, "invalid_argument", "usage: opendesk flow pack <root> -o <output.odflow> ...")
	}
	root := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	var output, flowID, name, version, publisherID, publisherKeyID, entry, minimumRuntimeVersion, signingKey string
	var productID, licenseIssuerKeyID string
	var platforms, files, purposes stringList
	fs.StringVar(&output, "o", "", "output .odflow path")
	fs.StringVar(&flowID, "flow-id", "", "flow identifier")
	fs.StringVar(&name, "name", "", "display name")
	fs.StringVar(&version, "version", "", "semantic version")
	fs.StringVar(&publisherID, "publisher-id", "", "publisher identifier")
	fs.StringVar(&publisherKeyID, "publisher-key-id", "", "publisher signing key identifier")
	fs.StringVar(&entry, "entry", "", "main.js or main.odpkg")
	fs.StringVar(&minimumRuntimeVersion, "minimum-runtime-version", "", "minimum OpenDesk runtime semantic version")
	fs.StringVar(&signingKey, "signing-key", "", "publisher Ed25519 private key path")
	fs.Var(&platforms, "platform", "supported platform; repeat for multiple values")
	fs.Var(&files, "file", "explicit package-relative file path; repeat for multiple values")
	fs.StringVar(&productID, "product-id", "", "commercial product identifier")
	fs.StringVar(&licenseIssuerKeyID, "license-issuer-key-id", "", "commercial license issuer key identifier")
	fs.Var(&purposes, "purpose", "commercial allowed purpose; v1 supports run")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, command, "invalid_argument", "invalid flow pack arguments")
	}
	required := map[string]string{"-o": output, "--flow-id": flowID, "--name": name, "--version": version, "--publisher-id": publisherID, "--publisher-key-id": publisherKeyID, "--entry": entry, "--minimum-runtime-version": minimumRuntimeVersion, "--signing-key": signingKey}
	for flagName, value := range required {
		if strings.TrimSpace(value) == "" {
			return writeError(stdout, command, "invalid_argument", flagName+" is required")
		}
	}
	if len(platforms) == 0 || len(files) == 0 {
		return writeError(stdout, command, "invalid_argument", "at least one --platform and --file are required")
	}
	rootPath, err := resolveDirectory(root)
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	signingKeyPath, err := filepath.Abs(signingKey)
	if err != nil {
		return writeError(stdout, command, "invalid_argument", "cannot resolve signing key path")
	}
	if evaluated, evalErr := filepath.EvalSymlinks(signingKeyPath); evalErr == nil {
		signingKeyPath = evaluated
	}
	if pathWithin(rootPath, signingKeyPath) {
		return writeError(stdout, command, "invalid_argument", "signing key must be outside the flow input root")
	}
	privateBytes, err := os.ReadFile(signingKeyPath)
	if err != nil {
		return writeError(stdout, command, "invalid_argument", "cannot read signing key")
	}
	privateKey, err := scriptpackage.ParseEd25519PrivateKey(privateBytes)
	clear(privateBytes)
	if err != nil {
		return writeError(stdout, command, "invalid_argument", "signing key is not a valid Ed25519 private key")
	}
	defer clear(privateKey)
	inputs := make([]flow.InputFile, 0, len(files))
	for _, relative := range files {
		if err := flow.ValidateContentPath(relative); err != nil {
			return writeFailure(stdout, command, err)
		}
		data, err := readInputFile(rootPath, relative)
		if err != nil {
			return writeFailure(stdout, command, err)
		}
		inputs = append(inputs, flow.InputFile{Path: relative, Data: data})
	}
	var commercial *flow.CommercialManifest
	hasCommercial := productID != "" || licenseIssuerKeyID != "" || len(purposes) > 0
	if hasCommercial {
		if productID == "" || licenseIssuerKeyID == "" || len(purposes) == 0 {
			return writeError(stdout, command, "invalid_argument", "--product-id, --license-issuer-key-id and --purpose must be supplied together")
		}
		commercial = &flow.CommercialManifest{ProductID: productID, LicenseIssuerKeyID: licenseIssuerKeyID, Purposes: append([]string(nil), purposes...)}
	}
	result, err := flow.Build(flow.Manifest{SchemaVersion: flow.SchemaVersion, FlowID: flowID, Name: name, Version: version, PublisherID: publisherID, PublisherKeyID: publisherKeyID, Entry: entry, MinimumRuntimeVersion: minimumRuntimeVersion, Platforms: append([]string(nil), platforms...), Commercial: commercial}, inputs, privateKey)
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	if strings.ToLower(filepath.Ext(output)) != ".odflow" {
		return writeError(stdout, command, "invalid_argument", "output path must use .odflow extension")
	}
	if err := flow.WriteFile(output, result); err != nil {
		return writeFailure(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{"output": output, "packageDigest": result.PackageDigest, "manifest": result.Manifest})
}
