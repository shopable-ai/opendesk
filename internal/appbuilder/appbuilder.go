// Package appbuilder assembles a user App Mode package with an installed,
// precompiled OpenDesk desktop payload. It deliberately never compiles source
// code or starts an App Mode execution.
package appbuilder

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"opendesk/internal/appmodepayload"
	"opendesk/pkg/appshell"
)

const (
	TargetMacOS   = "macos"
	TargetWindows = "windows"

	templateSchemaVersion = 1
	templateKind          = "opendesk-app-builder-template"

	macOSTemplateRelativePath = "Contents/Resources/OpenDeskAppBuilder/template.json"
	windowsTemplateFilename   = "app-builder-template.json"
)

// Error is a stable, machine-readable app-builder failure. Package validation
// errors intentionally remain appshell.PackageError values so the Runtime is
// still the authority for manifest semantics.
type Error struct {
	Code     string
	Message  string
	Field    string
	Expected string
	Actual   string
	Hint     string
	Err      error
}

func (err *Error) Error() string {
	if err == nil {
		return ""
	}
	if err.Message != "" {
		return err.Message
	}
	if err.Err != nil {
		return err.Err.Error()
	}
	return err.Code
}

func (err *Error) Unwrap() error { return err.Err }

// Options describes one non-executing build operation. RuntimeExecutable is
// normally empty so Build discovers the installed executable itself; tests and
// SDK integrations can explicitly provide an already-installed Runtime path.
type Options struct {
	PackageDir        string
	Target            string
	Output            string
	RuntimeExecutable string
	Now               func() time.Time
}

type Result struct {
	Target     string        `json:"target"`
	Output     string        `json:"output"`
	Package    PackageResult `json:"package"`
	Runtime    RuntimeResult `json:"runtime"`
	Signing    SigningResult `json:"signing"`
	Provenance string        `json:"provenance"`
	BuiltAt    time.Time     `json:"builtAt"`
}

type PackageResult struct {
	ID            string         `json:"id"`
	Version       string         `json:"version,omitempty"`
	Name          string         `json:"name"`
	PolicyApplied bool           `json:"policyApplied"`
	Files         []FileChecksum `json:"files"`
	SHA256        string         `json:"sha256"`
}

type RuntimeResult struct {
	Version          string `json:"version"`
	Source           string `json:"source"`
	Executable       string `json:"executable"`
	ExecutableSHA256 string `json:"executableSHA256"`
	Template         string `json:"template"`
	TemplateSHA256   string `json:"templateSHA256"`
}

type SigningResult struct {
	Status       string `json:"status"`
	Notarization string `json:"notarization,omitempty"`
	Detail       string `json:"detail"`
}

type FileChecksum struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type builderTemplate struct {
	SchemaVersion int    `json:"schemaVersion"`
	Kind          string `json:"kind"`
	Target        string `json:"target"`
}

type runtimeTemplate struct {
	target         string
	sourceRoot     string
	executablePath string
	templatePath   string
}

// Build creates an atomic desktop artifact from the installed same-platform
// Runtime template and a validated App Mode package. It never invokes Go,
// shell tools, package scripts, or JavaScript.
func Build(options Options) (Result, error) {
	if options.Now == nil {
		options.Now = time.Now
	}
	target := strings.ToLower(strings.TrimSpace(options.Target))
	if target != TargetMacOS && target != TargetWindows {
		return Result{}, buildError("APP_BUILD_TARGET_INVALID", "target", "macos or windows", options.Target, "Use --target macos or --target windows.", "unsupported App Builder target")
	}

	validation, err := appshell.ValidatePackage(options.PackageDir)
	if err != nil {
		return Result{}, err
	}
	output, err := normalizedOutput(options.Output, target, validation.Package.Root)
	if err != nil {
		return Result{}, err
	}
	runtime, err := locateRuntimeTemplate(target, options.RuntimeExecutable)
	if err != nil {
		return Result{}, err
	}

	parent := filepath.Dir(output)
	if canonicalParent, err := filepath.EvalSymlinks(parent); err == nil {
		parent = canonicalParent
	}
	temporaryRoot, err := os.MkdirTemp(parent, "."+filepath.Base(output)+".opendesk-build-")
	if err != nil {
		return Result{}, buildError("APP_BUILD_OUTPUT_INVALID", "output", "a writable output parent directory", parent, "Choose an output path in a writable directory.", fmt.Errorf("create temporary build directory: %w", err).Error())
	}
	defer os.RemoveAll(temporaryRoot)
	stagedOutput := filepath.Join(temporaryRoot, filepath.Base(output))

	var packageDestination, stagedProvenancePath string
	switch target {
	case TargetMacOS:
		if err := copyTree(runtime.sourceRoot, stagedOutput, skipMacOSTemplateFile); err != nil {
			return Result{}, stageError(err)
		}
		if err := rewriteMacOSInfoPlist(filepath.Join(stagedOutput, "Contents", "Info.plist"), validation.Package.Manifest.ID, displayName(validation.Package.Manifest), validation.Package.Manifest.Version); err != nil {
			return Result{}, stageError(err)
		}
		// The source template can be publisher signed. Staging a user package and
		// a new identity invalidates that signature, so remove the outer bundle
		// signature rather than leaving a misleading stale signature behind.
		if err := os.RemoveAll(filepath.Join(stagedOutput, "Contents", "_CodeSignature")); err != nil {
			return Result{}, stageError(fmt.Errorf("remove copied macOS code signature: %w", err))
		}
		packageDestination = filepath.Join(stagedOutput, "Contents", "Resources", "AppMode")
		stagedProvenancePath = filepath.Join(stagedOutput, "Contents", "Resources", "OpenDeskAppBuilder", "build-provenance.json")
	case TargetWindows:
		if err := copyTree(runtime.sourceRoot, stagedOutput, skipWindowsTemplateFile); err != nil {
			return Result{}, stageError(err)
		}
		packageDestination = filepath.Join(stagedOutput, "app-mode")
		stagedProvenancePath = filepath.Join(stagedOutput, "app-build-provenance.json")
	}

	stage, err := appmodepayload.Stage(validation.Package.Root, packageDestination)
	if err != nil {
		return Result{}, stageError(err)
	}
	// Staging may apply a repository-owned release policy, but it never owns
	// manifest semantics. Validate the exact payload that will be launched.
	if _, err := appshell.ValidatePackage(packageDestination); err != nil {
		return Result{}, stageError(fmt.Errorf("validate staged App Mode payload: %w", err))
	}

	packageFiles, packageDigest, err := checksums(packageDestination)
	if err != nil {
		return Result{}, stageError(err)
	}
	executableDigest, err := checksum(runtime.executablePath)
	if err != nil {
		return Result{}, stageError(fmt.Errorf("checksum Runtime executable: %w", err))
	}
	templateDigest, err := checksum(runtime.templatePath)
	if err != nil {
		return Result{}, stageError(fmt.Errorf("checksum Builder template: %w", err))
	}

	now := options.Now().UTC()
	result := Result{
		Target: target,
		Output: output,
		Package: PackageResult{
			ID:            validation.Package.Manifest.ID,
			Version:       validation.Package.Manifest.Version,
			Name:          displayName(validation.Package.Manifest),
			PolicyApplied: stage.PolicyApplied,
			Files:         packageFiles,
			SHA256:        packageDigest,
		},
		Runtime: RuntimeResult{
			Version:          validation.RuntimeVersion,
			Source:           runtime.sourceRoot,
			Executable:       runtime.executablePath,
			ExecutableSHA256: executableDigest,
			Template:         runtime.templatePath,
			TemplateSHA256:   templateDigest,
		},
		Signing: signingResult(target),
		BuiltAt: now,
	}
	result.Provenance = provenancePathFor(target, output)
	if err := writeJSONFile(stagedProvenancePath, result); err != nil {
		return Result{}, stageError(fmt.Errorf("write build provenance: %w", err))
	}
	if err := verifyOutput(target, stagedOutput, packageDestination, stagedProvenancePath); err != nil {
		return Result{}, stageError(err)
	}
	// A pre-existing destination is always an error. The second check avoids
	// silently replacing a path created while this build was staging.
	if _, err := os.Lstat(output); err == nil {
		return Result{}, outputExistsError(output)
	} else if !errors.Is(err, os.ErrNotExist) {
		return Result{}, buildError("APP_BUILD_OUTPUT_INVALID", "output", "a creatable output path", output, "Choose a readable parent directory and an unused output path.", fmt.Errorf("inspect output: %w", err).Error())
	}
	if err := os.Rename(stagedOutput, output); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return Result{}, outputExistsError(output)
		}
		return Result{}, buildError("APP_BUILD_OUTPUT_COMMIT_FAILED", "output", "an unused output path on the same filesystem", output, "Remove the incomplete output only after inspecting it, then retry.", fmt.Errorf("atomically publish output: %w", err).Error())
	}
	return result, nil
}

func normalizedOutput(raw, target, packageRoot string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		return "", buildError("APP_BUILD_OUTPUT_REQUIRED", "output", "an explicit artifact path", "", "Pass --output <path>; App Builder never chooses or clears a release directory.", "App Builder output is required")
	}
	output, err := filepath.Abs(raw)
	if err != nil {
		return "", buildError("APP_BUILD_OUTPUT_INVALID", "output", "a valid filesystem path", raw, "Pass a valid output path.", fmt.Errorf("resolve output: %w", err).Error())
	}
	output = filepath.Clean(output)
	if output == filepath.VolumeName(output)+string(filepath.Separator) {
		return "", buildError("APP_BUILD_OUTPUT_INVALID", "output", "a non-root artifact path", output, "Choose a specific artifact directory.", "refusing filesystem root as App Builder output")
	}
	if target == TargetMacOS && !strings.EqualFold(filepath.Ext(output), ".app") {
		return "", buildError("APP_BUILD_OUTPUT_INVALID", "output", "a .app bundle path for macos", output, "Use an output ending in .app for --target macos.", "macOS App Builder output must end in .app")
	}
	parent := filepath.Dir(output)
	canonicalOutput := output
	if canonicalParent, err := filepath.EvalSymlinks(parent); err == nil {
		// Canonicalize an existing parent before both containment checks and
		// temporary staging. macOS normally aliases /var to /private/var; without
		// this, an output nested in a package can bypass a string-only check.
		canonicalOutput = filepath.Join(canonicalParent, filepath.Base(output))
		parent = canonicalParent
	}
	if _, err := os.Lstat(output); err == nil {
		return "", outputExistsError(output)
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", buildError("APP_BUILD_OUTPUT_INVALID", "output", "an unused output path", output, "Choose a readable parent directory and an unused output path.", fmt.Errorf("inspect output: %w", err).Error())
	}
	if info, err := os.Stat(parent); err != nil || !info.IsDir() {
		return "", buildError("APP_BUILD_OUTPUT_INVALID", "output", "an existing output parent directory", parent, "Create the output parent directory first.", "App Builder output parent must exist")
	}
	if overlaps(packageRoot, canonicalOutput) {
		return "", buildError("APP_BUILD_OUTPUT_INVALID", "output", "a path outside the App Mode package", output, "Choose an output path outside the package directory.", "App Builder output must not overlap the package")
	}
	return output, nil
}

func locateRuntimeTemplate(target, explicitExecutable string) (runtimeTemplate, error) {
	executable := strings.TrimSpace(explicitExecutable)
	if executable == "" {
		var err error
		executable, err = os.Executable()
		if err != nil {
			return runtimeTemplate{}, buildError("APP_BUILD_RUNTIME_NOT_FOUND", "runtime", "an installed OpenDesk Runtime", "", "Install the official OpenDesk desktop Runtime/SDK for the requested target.", fmt.Errorf("resolve current Runtime executable: %w", err).Error())
		}
	}
	if resolved, err := filepath.EvalSymlinks(executable); err == nil {
		executable = resolved
	}
	executable, err := filepath.Abs(executable)
	if err != nil {
		return runtimeTemplate{}, buildError("APP_BUILD_RUNTIME_NOT_FOUND", "runtime", "an installed OpenDesk Runtime", explicitExecutable, "Use the executable from an official desktop Runtime/SDK.", fmt.Errorf("resolve Runtime executable: %w", err).Error())
	}

	var sourceRoot, templatePath string
	switch target {
	case TargetMacOS:
		macosDirectory := filepath.Dir(executable)
		contentsDirectory := filepath.Dir(macosDirectory)
		if filepath.Base(macosDirectory) != "MacOS" || filepath.Base(contentsDirectory) != "Contents" || !strings.HasSuffix(strings.ToLower(filepath.Base(filepath.Dir(contentsDirectory))), ".app") {
			return runtimeTemplate{}, targetUnavailable(target, executable)
		}
		sourceRoot = filepath.Dir(contentsDirectory)
		templatePath = filepath.Join(sourceRoot, filepath.FromSlash(macOSTemplateRelativePath))
		if err := requireRegular(filepath.Join(sourceRoot, "Contents", "MacOS", "opendesk")); err != nil {
			return runtimeTemplate{}, templateInvalid(target, err)
		}
		if err := requireRegular(filepath.Join(sourceRoot, "Contents", "Helpers", "opendesk-ui-host")); err != nil {
			return runtimeTemplate{}, templateInvalid(target, err)
		}
	case TargetWindows:
		sourceRoot = filepath.Dir(executable)
		templatePath = filepath.Join(sourceRoot, windowsTemplateFilename)
		if err := requireRegular(filepath.Join(sourceRoot, "opendesk.exe")); err != nil {
			return runtimeTemplate{}, templateInvalid(target, err)
		}
		if err := requireRegular(filepath.Join(sourceRoot, "ui-host", "opendesk-ui-host.exe")); err != nil {
			return runtimeTemplate{}, templateInvalid(target, err)
		}
	}
	if err := validateTemplate(templatePath, target); err != nil {
		return runtimeTemplate{}, err
	}
	return runtimeTemplate{target: target, sourceRoot: sourceRoot, executablePath: executable, templatePath: templatePath}, nil
}

func validateTemplate(filename, target string) error {
	data, err := os.ReadFile(filename)
	if err != nil {
		return templateInvalid(target, fmt.Errorf("read Builder Template: %w", err))
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	var template builderTemplate
	if err := decoder.Decode(&template); err != nil {
		return templateInvalid(target, fmt.Errorf("decode Builder Template: %w", err))
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return templateInvalid(target, errors.New("Builder Template must contain one JSON object"))
	}
	if template.SchemaVersion != templateSchemaVersion || template.Kind != templateKind || template.Target != target {
		return templateInvalid(target, fmt.Errorf("unsupported Builder Template (schemaVersion=%d kind=%q target=%q)", template.SchemaVersion, template.Kind, template.Target))
	}
	return nil
}

func copyTree(source, destination string, skip func(string) bool) error {
	info, err := os.Lstat(source)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("Runtime template source must be a real directory: %s", source)
	}
	return filepath.WalkDir(source, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, current)
		if err != nil {
			return err
		}
		if relative == "." {
			return os.MkdirAll(destination, 0o755)
		}
		portable := filepath.ToSlash(relative)
		if skip(portable) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("Runtime template contains unsupported symlink: %s", portable)
		}
		output := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(output, 0o755)
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("Runtime template contains unsupported file type: %s", portable)
		}
		fileInfo, err := entry.Info()
		if err != nil {
			return err
		}
		return copyRegularFile(current, output, fileInfo.Mode().Perm())
	})
}

func copyRegularFile(source, destination string, mode fs.FileMode) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	return os.WriteFile(destination, data, mode)
}

func skipMacOSTemplateFile(relative string) bool {
	return relative == "Contents/_CodeSignature" || strings.HasPrefix(relative, "Contents/_CodeSignature/") || relative == "Contents/Resources/AppMode" || strings.HasPrefix(relative, "Contents/Resources/AppMode/")
}

func skipWindowsTemplateFile(relative string) bool {
	return relative == "app-mode" || strings.HasPrefix(relative, "app-mode/") || relative == "distribution-provenance.json" || relative == "app-build-provenance.json"
}

var plistStringPattern = regexp.MustCompile(`(?s)(<key>%s</key>\s*<string>).*?(</string>)`)

func rewriteMacOSInfoPlist(filename, bundleID, name, version string) error {
	data, err := os.ReadFile(filename)
	if err != nil {
		return fmt.Errorf("read macOS Info.plist: %w", err)
	}
	updates := []struct{ key, value string }{
		{"CFBundleIdentifier", bundleID},
		{"CFBundleDisplayName", name},
		{"CFBundleName", name},
	}
	if strings.TrimSpace(version) != "" {
		updates = append(updates, struct{ key, value string }{"CFBundleShortVersionString", version})
	}
	for _, update := range updates {
		data, err = replacePlistString(data, update.key, xmlEscape(update.value))
		if err != nil {
			return err
		}
	}
	if err := os.WriteFile(filename, data, 0o644); err != nil {
		return fmt.Errorf("write macOS Info.plist: %w", err)
	}
	return nil
}

func replacePlistString(data []byte, key, value string) ([]byte, error) {
	pattern := regexp.MustCompile(fmt.Sprintf(plistStringPattern.String(), regexp.QuoteMeta(key)))
	indexes := pattern.FindSubmatchIndex(data)
	if indexes == nil {
		return nil, fmt.Errorf("macOS Info.plist is missing string key %s", key)
	}
	updated := make([]byte, 0, len(data)+len(value))
	updated = append(updated, data[:indexes[3]]...)
	updated = append(updated, value...)
	updated = append(updated, data[indexes[4]:]...)
	return updated, nil
}

func xmlEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&apos;")
	return replacer.Replace(value)
}

func checksums(root string) ([]FileChecksum, string, error) {
	var files []FileChecksum
	if err := filepath.WalkDir(root, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() {
			return fmt.Errorf("artifact payload contains unsupported file: %s", current)
		}
		digest, err := checksum(current)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, current)
		if err != nil {
			return err
		}
		files = append(files, FileChecksum{Path: filepath.ToSlash(relative), SHA256: digest})
		return nil
	}); err != nil {
		return nil, "", err
	}
	sort.Slice(files, func(left, right int) bool { return files[left].Path < files[right].Path })
	hash := sha256.New()
	for _, file := range files {
		_, _ = io.WriteString(hash, file.Path+"\x00"+file.SHA256+"\n")
	}
	return files, hex.EncodeToString(hash.Sum(nil)), nil
}

func checksum(filename string) (string, error) {
	file, err := os.Open(filename)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func writeJSONFile(filename string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if err := os.MkdirAll(filepath.Dir(filename), 0o755); err != nil {
		return err
	}
	return os.WriteFile(filename, data, 0o644)
}

func verifyOutput(target, output, packagePath, provenance string) error {
	if _, err := appshell.ValidatePackage(packagePath); err != nil {
		return fmt.Errorf("verify staged App Mode package: %w", err)
	}
	if _, err := os.Stat(provenance); err != nil {
		return fmt.Errorf("verify build provenance: %w", err)
	}
	if target == TargetMacOS {
		for _, relative := range []string{"Contents/MacOS/opendesk", "Contents/Helpers/opendesk-ui-host", "Contents/Info.plist", "Contents/Resources/AppMode/opendesk.app.json"} {
			if err := requireRegular(filepath.Join(output, filepath.FromSlash(relative))); err != nil {
				return fmt.Errorf("verify macOS app layout: %w", err)
			}
		}
	}
	if target == TargetWindows {
		for _, relative := range []string{"opendesk.exe", "ui-host/opendesk-ui-host.exe", "app-mode/opendesk.app.json"} {
			if err := requireRegular(filepath.Join(output, filepath.FromSlash(relative))); err != nil {
				return fmt.Errorf("verify Windows portable layout: %w", err)
			}
		}
	}
	return nil
}

func requireRegular(filename string) error {
	info, err := os.Lstat(filename)
	if err != nil {
		return fmt.Errorf("required regular file is missing: %s", filename)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return fmt.Errorf("required path is not a regular file: %s", filename)
	}
	return nil
}

func displayName(manifest appshell.Manifest) string {
	if strings.TrimSpace(manifest.Name) != "" {
		return manifest.Name
	}
	return manifest.ID
}

func signingResult(target string) SigningResult {
	if target == TargetMacOS {
		return SigningResult{Status: "unsigned", Notarization: "not-notarized", Detail: "App Builder stages a new package identity and intentionally removes the copied bundle signature. It does not perform publisher signing or notarization."}
	}
	return SigningResult{Status: "not-signed-by-builder", Detail: "App Builder creates a portable directory. It does not add publisher signing, MSI/MSIX, an installer, shortcuts, file associations, or auto-update."}
}

func provenancePathFor(target, output string) string {
	if target == TargetMacOS {
		return filepath.Join(output, "Contents", "Resources", "OpenDeskAppBuilder", "build-provenance.json")
	}
	return filepath.Join(output, "app-build-provenance.json")
}

func overlaps(first, second string) bool {
	for _, pair := range [][2]string{{first, second}, {second, first}} {
		relative, err := filepath.Rel(pair[0], pair[1])
		if err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
			return true
		}
	}
	return false
}

func buildError(code, field, expected, actual, hint, message string) *Error {
	return &Error{Code: code, Field: field, Expected: expected, Actual: actual, Hint: hint, Message: message}
}

func stageError(err error) *Error {
	return &Error{Code: "APP_BUILD_STAGING_FAILED", Field: "artifact", Expected: "a complete App Mode artifact", Actual: err.Error(), Hint: "Inspect the installed Runtime template and package resources, then retry with a new output path.", Message: err.Error(), Err: err}
}

func outputExistsError(output string) *Error {
	return buildError("APP_BUILD_OUTPUT_EXISTS", "output", "an unused output path", output, "Choose a new output path; App Builder never overwrites an artifact.", "App Builder output already exists")
}

func targetUnavailable(target, executable string) *Error {
	return buildError("APP_BUILD_TARGET_UNAVAILABLE", "target", "a same-platform installed Runtime template", target, "Run App Builder from the official OpenDesk Runtime/SDK for the requested target. Cross-platform compilation is not performed.", "requested target is unavailable from Runtime executable "+executable)
}

func templateInvalid(target string, err error) *Error {
	return &Error{Code: "APP_BUILD_RUNTIME_TEMPLATE_INVALID", Field: "runtime", Expected: "a complete official " + target + " App Builder Template", Actual: err.Error(), Hint: "Install a complete official OpenDesk desktop Runtime/SDK for the requested target.", Message: err.Error(), Err: err}
}
