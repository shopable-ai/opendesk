// Package flowcli owns the local Flow distribution/install command surface.
// Native product entry points call pkg/flowinstall directly; this CLI is the
// scriptable product path used by developers and Runtime qualification.
package flowcli

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/flowinstall"
	"opendesk/pkg/flowpackage"
	"opendesk/pkg/runtimeenv"
	"opendesk/pkg/scriptloader"
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

func IsCommand(args []string) bool { return len(args) > 0 && args[0] == "flow" }

func Execute(args []string, stdout, stderr io.Writer) int {
	if len(args) < 2 || args[0] != "flow" {
		return writeError(stdout, "flow", "invalid_command", "flow requires pack, inspect, verify, install, list, run, or uninstall", 2)
	}
	switch args[1] {
	case "pack":
		return pack(args[2:], stdout)
	case "inspect":
		return inspect(args[2:], stdout, "flow.inspect")
	case "verify":
		return verify(args[2:], stdout)
	case "install":
		return install(args[2:], stdout)
	case "list":
		return list(args[2:], stdout)
	case "run":
		return run(args[2:], stdout, stderr)
	case "uninstall":
		return uninstall(args[2:], stdout)
	default:
		return writeError(stdout, "flow", "invalid_command", "unknown flow command", 2)
	}
}

func pack(args []string, stdout io.Writer) int {
	const command = "flow.pack"
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "pack requires one source directory", 2)
	}
	sourceRoot := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	output := fs.String("o", "", "")
	flowID := fs.String("flow-id", "", "")
	name := fs.String("name", "", "")
	version := fs.String("version", "", "")
	publisherID := fs.String("publisher-id", "", "")
	publisherKeyID := fs.String("publisher-key-id", "", "")
	entry := fs.String("entry", "", "")
	minimumRuntime := fs.String("minimum-runtime-version", "0.0.0", "")
	platforms := fs.String("platforms", "darwin,windows,linux", "")
	publicKeyPath := fs.String("public-key", "", "")
	privateKeyPath := fs.String("signing-key", "", "")
	licenseIssuerKeyID := fs.String("license-issuer-key-id", "", "")
	var files stringListFlag
	fs.Var(&files, "file", "explicit Flow payload file relative to source directory")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, command, "invalid_argument", "invalid flow pack arguments", 2)
	}
	for option, value := range map[string]string{
		"-o": *output, "--flow-id": *flowID, "--name": *name, "--version": *version,
		"--publisher-id": *publisherID, "--publisher-key-id": *publisherKeyID,
		"--entry": *entry, "--public-key": *publicKeyPath, "--signing-key": *privateKeyPath,
	} {
		if strings.TrimSpace(value) == "" {
			return writeError(stdout, command, "invalid_argument", option+" is required", 2)
		}
	}
	if strings.ToLower(filepath.Ext(*output)) != ".odflow" {
		return writeError(stdout, command, "invalid_argument", "-o must name a .odflow file", 2)
	}
	if err := rejectPackPathInsideSource(sourceRoot, *output); err != nil {
		return writeError(stdout, command, "invalid_argument", err.Error(), 2)
	}
	if err := rejectPackPathInsideSource(sourceRoot, *privateKeyPath); err != nil {
		return writeError(stdout, command, "invalid_argument", "signing key must be outside the Flow source directory", 2)
	}
	if len(files) == 0 {
		return writeError(stdout, command, "invalid_argument", "at least one --file is required", 2)
	}
	publicData, err := readBounded(*publicKeyPath, 64<<10)
	if err != nil {
		return writeError(stdout, command, "invalid_argument", "cannot read publisher public key", 2)
	}
	publicKey, err := scriptpackage.ParseEd25519PublicKey(publicData)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	privateData, err := readBounded(*privateKeyPath, 64<<10)
	if err != nil {
		return writeError(stdout, command, "invalid_argument", "cannot read publisher signing key", 2)
	}
	defer zero(privateData)
	privateKey, err := scriptpackage.ParseEd25519PrivateKey(privateData)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	defer zero(privateKey)
	platformValues := splitComma(*platforms)
	result, err := flowpackage.Build(flowpackage.BuildOptions{
		SourceRoot: sourceRoot, FlowID: *flowID, Name: *name, Version: *version,
		PublisherID: *publisherID, PublisherKeyID: *publisherKeyID, Entry: filepath.ToSlash(*entry),
		MinimumRuntimeVersion: *minimumRuntime, Platforms: platformValues,
		Files:              files,
		PublisherPublicKey: ed25519.PublicKey(publicKey), PublisherPrivateKey: ed25519.PrivateKey(privateKey),
		LicenseIssuerKeyID: *licenseIssuerKeyID,
	})
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	if err := flowpackage.WriteFileExclusive(*output, result); err != nil {
		return writeCommandError(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{
		"output": *output, "manifest": result.Manifest,
		"archiveDigest": result.ArchiveDigest, "manifestDigest": result.ManifestDigest,
	})
}

func inspect(args []string, stdout io.Writer, command string) int {
	if len(args) != 1 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "command requires exactly one .odflow path", 2)
	}
	pkg, err := flowpackage.ReadFile(args[0])
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{
		"manifest": pkg.Manifest, "archiveDigest": pkg.ArchiveDigest,
		"manifestDigest": pkg.ManifestDigest, "signatureVerified": true,
	})
}

func verify(args []string, stdout io.Writer) int {
	const command = "flow.verify"
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "verify requires one .odflow path", 2)
	}
	packagePath := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	publicKeyPath := fs.String("public-key", "", "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 || strings.TrimSpace(*publicKeyPath) == "" {
		return writeError(stdout, command, "invalid_argument", "verify requires --public-key", 2)
	}
	pkg, err := flowpackage.ReadFile(packagePath)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	publicData, err := readBounded(*publicKeyPath, 64<<10)
	if err != nil {
		return writeError(stdout, command, "invalid_argument", "cannot read candidate publisher public key", 2)
	}
	candidate, err := scriptpackage.ParseEd25519PublicKey(publicData)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	if !ed25519.PublicKey(candidate).Equal(pkg.PublisherKey) || flowpackage.PublicKeyFingerprint(candidate) != pkg.Manifest.PublisherFingerprint {
		return writeError(stdout, command, string(flowpackage.CodeIdentityMismatch), "candidate publisher public key does not match the package publisher key", 1)
	}
	if err := flowpackage.VerifySignature(pkg.RawManifest, pkg.Signature, candidate); err != nil {
		return writeCommandError(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{
		"manifest": pkg.Manifest, "archiveDigest": pkg.ArchiveDigest,
		"manifestDigest": pkg.ManifestDigest, "signatureVerified": true,
		"candidateKeyVerified": true,
	})
}

func install(args []string, stdout io.Writer) int {
	const command = "flow.install"
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "install requires one .odflow path", 2)
	}
	packagePath := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	trustFlow := fs.Bool("trust-flow", false, "")
	trustPublisher := fs.Bool("trust-publisher", false, "")
	allowPending := fs.Bool("install-pending", false, "")
	allowDowngrade := fs.Bool("allow-downgrade", false, "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 || (*trustFlow && *trustPublisher) {
		return writeError(stdout, command, "invalid_argument", "invalid flow install arguments", 2)
	}
	service, err := productService()
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	ext := strings.ToLower(filepath.Ext(packagePath))
	if ext == ".js" || ext == ".mjs" {
		if *trustFlow || *trustPublisher || *allowPending || *allowDowngrade {
			return writeError(stdout, command, "invalid_argument", "local JavaScript Flow imports do not accept trust, activation, or downgrade flags", 2)
		}
		result, installErr := service.InstallScript(context.Background(), packagePath)
		if installErr != nil {
			return writeCommandError(stdout, command, installErr)
		}
		return writeSuccess(stdout, command, result)
	}
	if ext == ".odpkg" {
		return writeError(stdout, command, string(flowinstall.CodeTrustRequired), "bare .odpkg requires trusted package material; install a signed .odflow container or run it through the protected package entrypoint", 1)
	}
	options := flowinstall.InstallOptions{AllowDowngrade: *allowDowngrade, AllowNeedsActivation: *allowPending}
	if *trustFlow || *trustPublisher {
		decision := flowinstall.DecisionFlow
		if *trustPublisher {
			decision = flowinstall.DecisionPublisher
		}
		options.Approver = func(context.Context, flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
			return decision, nil
		}
	}
	result, err := service.Install(context.Background(), packagePath, options)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	return writeSuccess(stdout, command, result)
}

func list(args []string, stdout io.Writer) int {
	const command = "flow.list"
	if len(args) != 0 {
		return writeError(stdout, command, "invalid_argument", "list accepts no arguments", 2)
	}
	service, err := productService()
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	if err := service.Recover(context.Background()); err != nil {
		return writeCommandError(stdout, command, err)
	}
	records, err := service.Catalog.List()
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{"flows": records})
}

func run(args []string, stdout, _ io.Writer) int {
	const command = "flow.run"
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "run requires one installId", 2)
	}
	installID := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	logDir := fs.String("log-dir", "", "")
	timeout := fs.Duration("timeout", 30*time.Minute, "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 || *timeout < 0 {
		return writeError(stdout, command, "invalid_argument", "invalid flow run arguments", 2)
	}
	service, err := productService()
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	ctx := context.Background()
	lease, err := service.AcquireRun(ctx, installID)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	defer lease.Close()
	source, err := scriptloader.NewProductionFileLoader().Load(ctx, lease.Entry)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	protected := source.Protection.Mode == scriptloader.ProtectionProtected
	if protected {
		defer zero(source.Content)
	}
	workDir, err := os.Getwd()
	if err != nil {
		return writeError(stdout, command, "execution_failed", "cannot resolve execution working directory", 1)
	}
	environment, err := runtimeenv.Resolve(runtimeenv.Options{WorkingDirectory: workDir, Inherited: os.Environ()})
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	executionID := pkgExecution.NewExecutionID("flow")
	artifacts, err := pkgExecution.PrepareArtifacts(*logDir, executionID, source.Ext)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	scriptHash := pkgExecution.ComputeScriptHash(source.Content)
	meta := map[string]any{"flow": lease.Record}
	if protected {
		artifacts.ScriptSnapshotPath = ""
		scriptHash = source.Protection.PackageDigest
		meta["protection"] = source.Protection
	} else if err := os.WriteFile(artifacts.ScriptSnapshotPath, source.Content, 0o600); err != nil {
		return writeCommandError(stdout, command, err)
	}
	result, summary, runErr := pkgExecution.Run(pkgExecution.Request{
		Context: ctx, ExecutionID: executionID, SourceLabel: "installed-flow:" + installID,
		ScriptPath: lease.Entry, Ext: source.Ext, ScriptHash: scriptHash, ScriptContent: source.Content,
		WorkDir: workDir, Environment: environment.Values, Timeout: *timeout,
		Flow:                   &pkgExecution.FlowContext{Root: lease.Root, DataDir: lease.DataDir},
		EnableNativeExtensions: true, EnableCommand: true, EnableDownload: true, EnableWebhook: true,
		EnableAccessibility: true, EnableSQLite: true, Meta: meta, Artifacts: artifacts,
		Selection: pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}, ColorMode: "never"},
	})
	if runErr != nil {
		return writeError(stdout, command, "execution_failed", runErr.Error(), 1)
	}
	return writeSuccess(stdout, command, map[string]any{"record": lease.Record, "execution": result, "summary": summary})
}

func uninstall(args []string, stdout io.Writer) int {
	const command = "flow.uninstall"
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "uninstall requires one installId", 2)
	}
	installID := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	removeData := fs.Bool("remove-data", false, "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, command, "invalid_argument", "invalid flow uninstall arguments", 2)
	}
	service, err := productService()
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	if err := service.Uninstall(context.Background(), installID, *removeData); err != nil {
		return writeCommandError(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{"installId": installID, "dataRemoved": *removeData})
}

func productService() (*flowinstall.Service, error) {
	environment := map[string]string{}
	for _, name := range []string{"OPENDESK_APP_DATA_DIR", "HOME", "USERPROFILE"} {
		if value, ok := os.LookupEnv(name); ok {
			environment[name] = value
		}
	}
	return flowinstall.NewProductService(environment)
}

func splitComma(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

type stringListFlag []string

func (values *stringListFlag) String() string { return strings.Join(*values, ",") }

func (values *stringListFlag) Set(value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("value must not be empty")
	}
	*values = append(*values, value)
	return nil
}

func readBounded(path string, limit int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > limit {
		return nil, fmt.Errorf("file is not a bounded regular file")
	}
	return io.ReadAll(io.LimitReader(file, limit+1))
}

func rejectPackPathInsideSource(sourceRoot, candidate string) error {
	root, err := filepath.Abs(strings.TrimSpace(sourceRoot))
	if err != nil {
		return fmt.Errorf("cannot resolve Flow source directory")
	}
	target, err := filepath.Abs(strings.TrimSpace(candidate))
	if err != nil {
		return fmt.Errorf("cannot resolve Flow path")
	}
	root, _ = filepath.EvalSymlinks(root)
	if resolved, resolveErr := filepath.EvalSymlinks(target); resolveErr == nil {
		target = resolved
	}
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))) {
		return fmt.Errorf("Flow output and signing key must be outside the source directory")
	}
	return nil
}

func writeSuccess(writer io.Writer, command string, result any) int {
	_ = json.NewEncoder(writer).Encode(envelope{OK: true, Command: command, Result: result})
	return 0
}

func writeError(writer io.Writer, command, code, message string, exitCode int) int {
	_ = json.NewEncoder(writer).Encode(envelope{OK: false, Command: command, Error: &errorBody{Code: code, Message: message}})
	return exitCode
}

func writeCommandError(writer io.Writer, command string, err error) int {
	code := string(flowinstall.CodeOf(err))
	if code == "" {
		code = string(flowpackage.CodeOf(err))
	}
	if code == "" {
		code = scriptloader.ErrorCodeOf(err)
	}
	if code == "" {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			code = "canceled"
		} else {
			code = "internal_error"
		}
	}
	return writeError(writer, command, code, err.Error(), 1)
}

func zero(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
