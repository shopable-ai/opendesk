package appshell

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"opendesk/pkg/runtimeversion"
)

// CheckStatus is the stable state of one App Package validation stage.
type CheckStatus string

const (
	CheckPass       CheckStatus = "PASS"
	CheckFail       CheckStatus = "FAIL"
	CheckSkip       CheckStatus = "SKIP"
	CheckNotChecked CheckStatus = "NOT CHECKED"
)

const (
	CheckPackageRoot          = "package.root"
	CheckManifest             = "manifest"
	CheckSchema               = "manifest.schema"
	CheckIdentity             = "package.identity"
	CheckVersion              = "package.version"
	CheckRuntimeCompatibility = "runtime.compatibility"
	CheckEntry                = "entry"
	CheckWindowsTrayResource  = "resource.tray.windows"
	CheckMacOSTrayResource    = "resource.tray.macos"
	CheckPathContainment      = "security.path-containment"
)

// PackageCheck is one machine-readable diagnostic emitted by the same
// package-validation pipeline used for Runtime startup.
type PackageCheck struct {
	ID       string      `json:"id"`
	Status   CheckStatus `json:"status"`
	Message  string      `json:"message"`
	Field    string      `json:"field,omitempty"`
	Expected string      `json:"expected,omitempty"`
	Actual   string      `json:"actual,omitempty"`
	Hint     string      `json:"hint,omitempty"`
}

// PackageValidation contains the normalized package, Runtime compatibility
// input, and ordered diagnostics. Package remains nil when validation stops
// before the startup-safe package can be produced.
type PackageValidation struct {
	Package        *Package       `json:"-"`
	RuntimeVersion string         `json:"runtimeVersion"`
	Checks         []PackageCheck `json:"checks"`
}

// ValidatePackage performs the authoritative static App Package validation.
// It reads package data and resources but never executes the entry JavaScript
// or starts App Shell/native UI.
func ValidatePackage(packageDir string) (*PackageValidation, error) {
	return validatePackageForRuntime(packageDir, runtimeversion.Current)
}

func validatePackageForRuntime(packageDir, currentRuntimeVersion string) (*PackageValidation, error) {
	result := newPackageValidation(currentRuntimeVersion)

	root, err := canonicalPackageRoot(packageDir)
	if err != nil {
		result.fail(CheckPackageRoot, err)
		return result, err
	}
	result.pass(CheckPackageRoot, fmt.Sprintf("Package root resolved to %s.", root))

	manifestPath := filepath.Join(root, ManifestFileName)
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		code := ErrManifestInvalid
		fix := "make sure the package contains a readable opendesk.app.json"
		if os.IsNotExist(err) {
			code = ErrManifestNotFound
			fix = "add opendesk.app.json at the package root"
		}
		err = newPackageError(code, ManifestFileName, "a readable manifest file", manifestPath, fix, fmt.Errorf("read %s: %w", manifestPath, err))
		result.fail(CheckManifest, err)
		return result, err
	}
	result.pass(CheckManifest, "opendesk.app.json is readable and contains one manifest.")

	manifest, err := ParseManifest(data)
	if err != nil {
		result.fail(parseFailureCheck(err), err)
		return result, err
	}
	result.pass(CheckSchema, fmt.Sprintf("Manifest schemaVersion %d is supported.", manifest.SchemaVersion))
	result.pass(CheckIdentity, fmt.Sprintf("Package identity %s is valid.", manifest.ID))
	if manifest.SchemaVersion == 0 {
		result.skip(CheckVersion, "Legacy schema v0 does not declare an App Package version.")
	} else {
		result.pass(CheckVersion, fmt.Sprintf("App Package version %s is valid SemVer.", manifest.Version))
	}

	if err := ValidateRuntimeCompatibility(manifest, currentRuntimeVersion); err != nil {
		result.fail(CheckRuntimeCompatibility, err)
		return result, err
	}
	if manifest.Runtime.MinVersion == "" {
		result.pass(CheckRuntimeCompatibility, fmt.Sprintf("Runtime %s is compatible; no minimum version is declared.", currentRuntimeVersion))
	} else {
		result.pass(CheckRuntimeCompatibility, fmt.Sprintf("Runtime %s satisfies >=%s.", currentRuntimeVersion, manifest.Runtime.MinVersion))
	}

	entryPath, err := resolvePackageFile(root, "entry", manifest.Entry)
	if err != nil {
		result.failResource(CheckEntry, err)
		return result, err
	}
	result.pass(CheckEntry, fmt.Sprintf("Entry %s is a package-local regular file.", manifest.Entry))

	appPackage := &Package{Root: root, ManifestPath: manifestPath, EntryPath: entryPath, Manifest: manifest}
	if !manifest.Tray.Enabled {
		result.skip(CheckWindowsTrayResource, "Tray is disabled; the Windows tray resource is not required.")
		result.skip(CheckMacOSTrayResource, "Tray is disabled; the macOS tray resource is not required.")
	} else {
		appPackage.WindowsIconPath, err = resolvePackageFile(root, "tray.icons.windows", manifest.Tray.Icons.Windows)
		if err != nil {
			result.failResource(CheckWindowsTrayResource, err)
			return result, err
		}
		if iconErr := validateWindowsTrayIcon(appPackage.WindowsIconPath); iconErr != nil {
			cause := fmt.Errorf("validate tray.icons.windows %s: %w", appPackage.WindowsIconPath, iconErr)
			err = newPackageError(ErrPackageResourceInvalid, "tray.icons.windows", "a valid Windows .ico file", appPackage.WindowsIconPath, "replace the invalid tray icon with a valid package-local .ico resource", cause)
			result.failResource(CheckWindowsTrayResource, err)
			return result, err
		}
		result.pass(CheckWindowsTrayResource, fmt.Sprintf("Windows tray resource %s is valid.", manifest.Tray.Icons.Windows))

		appPackage.MacOSIconPath, err = resolvePackageFile(root, "tray.icons.macos", manifest.Tray.Icons.MacOS)
		if err != nil {
			result.failResource(CheckMacOSTrayResource, err)
			return result, err
		}
		if iconErr := validateMacOSTemplateIcon(appPackage.MacOSIconPath); iconErr != nil {
			cause := fmt.Errorf("validate tray.icons.macos %s: %w", appPackage.MacOSIconPath, iconErr)
			err = newPackageError(ErrPackageResourceInvalid, "tray.icons.macos", "a valid macOS template PNG", appPackage.MacOSIconPath, "replace the invalid tray icon with a valid package-local template PNG", cause)
			result.failResource(CheckMacOSTrayResource, err)
			return result, err
		}
		result.pass(CheckMacOSTrayResource, fmt.Sprintf("macOS tray resource %s is valid.", manifest.Tray.Icons.MacOS))
	}

	result.pass(CheckPathContainment, "Entry and declared resources resolve inside the canonical package root.")
	result.Package = appPackage
	return result, nil
}

func newPackageValidation(runtimeVersion string) *PackageValidation {
	checks := []PackageCheck{
		{ID: CheckPackageRoot},
		{ID: CheckManifest},
		{ID: CheckSchema},
		{ID: CheckIdentity},
		{ID: CheckVersion},
		{ID: CheckRuntimeCompatibility},
		{ID: CheckEntry},
		{ID: CheckWindowsTrayResource},
		{ID: CheckMacOSTrayResource},
		{ID: CheckPathContainment},
	}
	for index := range checks {
		checks[index].Status = CheckNotChecked
		checks[index].Message = "Not checked because an earlier validation stage did not pass."
	}
	return &PackageValidation{RuntimeVersion: runtimeVersion, Checks: checks}
}

func (result *PackageValidation) pass(id, message string) {
	result.set(PackageCheck{ID: id, Status: CheckPass, Message: message})
}

func (result *PackageValidation) skip(id, message string) {
	result.set(PackageCheck{ID: id, Status: CheckSkip, Message: message})
}

func (result *PackageValidation) fail(id string, err error) {
	check := PackageCheck{ID: id, Status: CheckFail, Message: err.Error()}
	var packageErr *PackageError
	if errors.As(err, &packageErr) {
		check.Message = packageErrorCause(packageErr)
		check.Field = packageErr.Field
		check.Expected = packageErr.Expected
		check.Actual = packageErr.Actual
		check.Hint = packageErr.Fix
	}
	result.set(check)
}

func (result *PackageValidation) failResource(id string, err error) {
	result.fail(id, err)
	if IsPackageErrorCode(err, ErrPackageResourceEscape) {
		result.fail(CheckPathContainment, err)
	}
}

func (result *PackageValidation) set(check PackageCheck) {
	for index := range result.Checks {
		if result.Checks[index].ID == check.ID {
			result.Checks[index] = check
			return
		}
	}
}

func parseFailureCheck(err error) string {
	var packageErr *PackageError
	if !errors.As(err, &packageErr) {
		return CheckManifest
	}
	switch packageErr.Code {
	case ErrManifestSchemaUnsupported:
		return CheckSchema
	case ErrPackageIDInvalid:
		return CheckIdentity
	case ErrPackageVersionInvalid:
		return CheckVersion
	case ErrPackageEntryMissing:
		return CheckEntry
	case ErrPackageResourceEscape:
		return CheckPathContainment
	default:
		return CheckManifest
	}
}

func packageErrorCause(packageErr *PackageError) string {
	if packageErr != nil && packageErr.Err != nil {
		return packageErr.Err.Error()
	}
	if packageErr == nil {
		return "Package validation failed."
	}
	return packageErr.Code
}
