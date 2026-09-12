// Package appcli implements static App Mode package developer tooling. It is
// deliberately separate from packagecli, which owns protected .odpkg files.
package appcli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"opendesk/internal/appbuilder"
	"opendesk/pkg/appshell"
)

const usage = "opendesk app <validate|doctor> <package-dir> [--json]\n       opendesk app build <package-dir> --target <macos|windows> --output <path> [--json]"

type errorBody struct {
	Code     string `json:"code"`
	Message  string `json:"message,omitempty"`
	Field    string `json:"field,omitempty"`
	Expected string `json:"expected,omitempty"`
	Actual   string `json:"actual,omitempty"`
	Hint     string `json:"hint,omitempty"`
}

type envelope struct {
	OK      bool       `json:"ok"`
	Command string     `json:"command"`
	Result  any        `json:"result,omitempty"`
	Error   *errorBody `json:"error,omitempty"`
}

type validationResult struct {
	SchemaVersion     int    `json:"schemaVersion"`
	ID                string `json:"id"`
	Version           string `json:"version,omitempty"`
	RuntimeVersion    string `json:"runtimeVersion"`
	RuntimeCompatible bool   `json:"runtimeCompatible"`
	Entry             string `json:"entry"`
}

type doctorResult struct {
	PackageRoot   string                  `json:"packageRoot,omitempty"`
	SchemaVersion *int                    `json:"schemaVersion,omitempty"`
	ID            string                  `json:"id,omitempty"`
	Version       string                  `json:"version,omitempty"`
	Runtime       string                  `json:"runtimeVersion"`
	Checks        []appshell.PackageCheck `json:"checks"`
}

// IsCommand reports whether argv selects the App Mode package CLI namespace.
func IsCommand(args []string) bool {
	return len(args) > 0 && args[0] == "app"
}

// Execute validates App Mode packages without executing their JavaScript.
// Exit status 0 means valid, 1 means package validation failed, and 2 means
// the CLI invocation was invalid.
func Execute(args []string, stdout, stderr io.Writer) int {
	jsonOutput := containsJSONFlag(args)
	if len(args) < 2 || args[0] != "app" {
		return writeUsage(stdout, stderr, "app", "app requires validate or doctor", jsonOutput)
	}

	command := "app." + args[1]
	switch args[1] {
	case "validate", "doctor":
		packageDir, useJSON, err := parsePackageArgs(args[2:])
		if err != nil {
			return writeUsage(stdout, stderr, command, err.Error(), jsonOutput)
		}
		if args[1] == "validate" {
			return validate(packageDir, useJSON, stdout, stderr)
		}
		return doctor(packageDir, useJSON, stdout, stderr)
	case "build":
		options, useJSON, err := parseBuildArgs(args[2:])
		if err != nil {
			return writeUsage(stdout, stderr, command, err.Error(), jsonOutput)
		}
		return build(options, useJSON, stdout, stderr)
	default:
		return writeUsage(stdout, stderr, command, "unknown app command", jsonOutput)
	}
}

func parseBuildArgs(args []string) (appbuilder.Options, bool, error) {
	var options appbuilder.Options
	jsonOutput := false
	for index := 0; index < len(args); index++ {
		argument := args[index]
		switch argument {
		case "--json":
			if jsonOutput {
				return options, true, errors.New("--json may be specified only once")
			}
			jsonOutput = true
		case "--target", "--output":
			if index+1 >= len(args) || strings.HasPrefix(args[index+1], "-") {
				return options, jsonOutput, fmt.Errorf("%s requires a value", argument)
			}
			index++
			if argument == "--target" {
				if options.Target != "" {
					return options, jsonOutput, errors.New("--target may be specified only once")
				}
				options.Target = args[index]
			} else {
				if options.Output != "" {
					return options, jsonOutput, errors.New("--output may be specified only once")
				}
				options.Output = args[index]
			}
		default:
			if strings.HasPrefix(argument, "--target=") {
				if options.Target != "" {
					return options, jsonOutput, errors.New("--target may be specified only once")
				}
				options.Target = strings.TrimPrefix(argument, "--target=")
				if options.Target == "" {
					return options, jsonOutput, errors.New("--target requires a value")
				}
				continue
			}
			if strings.HasPrefix(argument, "--output=") {
				if options.Output != "" {
					return options, jsonOutput, errors.New("--output may be specified only once")
				}
				options.Output = strings.TrimPrefix(argument, "--output=")
				if options.Output == "" {
					return options, jsonOutput, errors.New("--output requires a value")
				}
				continue
			}
			if strings.HasPrefix(argument, "-") {
				return options, jsonOutput, fmt.Errorf("unknown option %s", argument)
			}
			if options.PackageDir != "" {
				return options, jsonOutput, errors.New("exactly one package directory is required")
			}
			options.PackageDir = argument
		}
	}
	if strings.TrimSpace(options.PackageDir) == "" {
		return options, jsonOutput, errors.New("package directory is required")
	}
	if strings.TrimSpace(options.Target) == "" {
		return options, jsonOutput, errors.New("--target is required")
	}
	if strings.TrimSpace(options.Output) == "" {
		return options, jsonOutput, errors.New("--output is required")
	}
	return options, jsonOutput, nil
}

func parsePackageArgs(args []string) (string, bool, error) {
	var packageDir string
	jsonOutput := false
	for _, arg := range args {
		switch {
		case arg == "--json":
			if jsonOutput {
				return "", true, errors.New("--json may be specified only once")
			}
			jsonOutput = true
		case strings.HasPrefix(arg, "-"):
			return "", jsonOutput, fmt.Errorf("unknown option %s", arg)
		case packageDir == "":
			packageDir = arg
		default:
			return "", jsonOutput, errors.New("exactly one package directory is required")
		}
	}
	if strings.TrimSpace(packageDir) == "" {
		return "", jsonOutput, errors.New("package directory is required")
	}
	return packageDir, jsonOutput, nil
}

func validate(packageDir string, jsonOutput bool, stdout, stderr io.Writer) int {
	validation, err := appshell.ValidatePackage(packageDir)
	if err != nil {
		body := packageErrorBody(err)
		if jsonOutput {
			return writeJSON(stdout, envelope{OK: false, Command: "app.validate", Error: body}, 1)
		}
		writeHumanError(stderr, body)
		return 1
	}

	result := summarize(validation)
	if jsonOutput {
		return writeJSON(stdout, envelope{OK: true, Command: "app.validate", Result: result}, 0)
	}
	fmt.Fprintln(stdout, "App package is valid.")
	fmt.Fprintln(stdout)
	fmt.Fprintf(stdout, "Schema:       %d\n", result.SchemaVersion)
	fmt.Fprintf(stdout, "ID:           %s\n", result.ID)
	if result.Version == "" {
		fmt.Fprintln(stdout, "Version:      legacy v0 (not declared)")
	} else {
		fmt.Fprintf(stdout, "Version:      %s\n", result.Version)
	}
	fmt.Fprintf(stdout, "Runtime:      compatible (%s)\n", result.RuntimeVersion)
	fmt.Fprintf(stdout, "Entry:        %s\n", result.Entry)
	return 0
}

func doctor(packageDir string, jsonOutput bool, stdout, _ io.Writer) int {
	validation, err := appshell.ValidatePackage(packageDir)
	result := doctorSummary(validation)
	if jsonOutput {
		response := envelope{OK: err == nil, Command: "app.doctor", Result: result}
		if err != nil {
			response.Error = packageErrorBody(err)
		}
		exitCode := 0
		if err != nil {
			exitCode = 1
		}
		return writeJSON(stdout, response, exitCode)
	}

	fmt.Fprintln(stdout, "App Package Doctor")
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, "Checks")
	for index, check := range validation.Checks {
		branch := "├──"
		if index == len(validation.Checks)-1 {
			branch = "└──"
		}
		fmt.Fprintf(stdout, "%s %-28s %-11s %s\n", branch, checkLabel(check.ID), check.Status, check.Message)
	}
	if err == nil {
		fmt.Fprintln(stdout)
		fmt.Fprintln(stdout, "Overall: PASS")
		return 0
	}
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, "Overall: FAIL")
	writeHumanError(stdout, packageErrorBody(err))
	return 1
}

func build(options appbuilder.Options, jsonOutput bool, stdout, stderr io.Writer) int {
	result, err := appbuilder.Build(options)
	if err != nil {
		body := errorBodyFor(err)
		if jsonOutput {
			return writeJSON(stdout, envelope{OK: false, Command: "app.build", Error: body}, 1)
		}
		writeHumanError(stderr, body)
		return 1
	}
	if jsonOutput {
		return writeJSON(stdout, envelope{OK: true, Command: "app.build", Result: result}, 0)
	}
	fmt.Fprintln(stdout, "App artifact built.")
	fmt.Fprintln(stdout)
	fmt.Fprintf(stdout, "Target:       %s\n", result.Target)
	fmt.Fprintf(stdout, "Output:       %s\n", result.Output)
	fmt.Fprintf(stdout, "App ID:       %s\n", result.Package.ID)
	if result.Package.Version != "" {
		fmt.Fprintf(stdout, "App version:  %s\n", result.Package.Version)
	}
	fmt.Fprintf(stdout, "Payload SHA:  %s\n", result.Package.SHA256)
	fmt.Fprintf(stdout, "Runtime SHA:  %s\n", result.Runtime.ExecutableSHA256)
	fmt.Fprintf(stdout, "Signing:      %s\n", result.Signing.Status)
	if result.Signing.Notarization != "" {
		fmt.Fprintf(stdout, "Notarization: %s\n", result.Signing.Notarization)
	}
	fmt.Fprintf(stdout, "Provenance:   %s\n", result.Provenance)
	return 0
}

func summarize(validation *appshell.PackageValidation) validationResult {
	appPackage := validation.Package
	return validationResult{
		SchemaVersion:     appPackage.Manifest.SchemaVersion,
		ID:                appPackage.Manifest.ID,
		Version:           appPackage.Manifest.Version,
		RuntimeVersion:    validation.RuntimeVersion,
		RuntimeCompatible: true,
		Entry:             appPackage.Manifest.Entry,
	}
}

func doctorSummary(validation *appshell.PackageValidation) doctorResult {
	result := doctorResult{Runtime: validation.RuntimeVersion, Checks: validation.Checks}
	if validation.Package == nil {
		return result
	}
	schemaVersion := validation.Package.Manifest.SchemaVersion
	result.PackageRoot = validation.Package.Root
	result.SchemaVersion = &schemaVersion
	result.ID = validation.Package.Manifest.ID
	result.Version = validation.Package.Manifest.Version
	return result
}

func packageErrorBody(err error) *errorBody {
	return errorBodyFor(err)
}

func errorBodyFor(err error) *errorBody {
	var buildErr *appbuilder.Error
	if errors.As(err, &buildErr) {
		return &errorBody{
			Code:     buildErr.Code,
			Message:  buildErr.Error(),
			Field:    buildErr.Field,
			Expected: buildErr.Expected,
			Actual:   buildErr.Actual,
			Hint:     buildErr.Hint,
		}
	}
	body := &errorBody{Code: appshell.ErrManifestInvalid, Message: err.Error(), Hint: "Fix the App Package and run validation again."}
	var packageErr *appshell.PackageError
	if !errors.As(err, &packageErr) {
		return body
	}
	body.Code = packageErr.Code
	body.Message = packageErr.Error()
	body.Field = packageErr.Field
	body.Expected = packageErr.Expected
	body.Actual = packageErr.Actual
	body.Hint = sentence(packageErr.Fix)
	if packageErr.Code == appshell.ErrRuntimeTooOld {
		body.Hint = "Upgrade OpenDesk Runtime."
	}
	return body
}

func writeHumanError(writer io.Writer, body *errorBody) {
	fmt.Fprintln(writer, body.Code)
	if body.Message != "" {
		fmt.Fprintln(writer)
		fmt.Fprintf(writer, "Message:   %s\n", body.Message)
	}
	if body.Field != "" {
		fmt.Fprintf(writer, "Field:     %s\n", body.Field)
	}
	if body.Expected != "" {
		fmt.Fprintf(writer, "Expected:  %s\n", body.Expected)
	}
	if body.Actual != "" {
		fmt.Fprintf(writer, "Actual:    %s\n", body.Actual)
	}
	if body.Hint != "" {
		fmt.Fprintf(writer, "Fix:       %s\n", body.Hint)
	}
}

func writeUsage(stdout, stderr io.Writer, command, message string, jsonOutput bool) int {
	body := &errorBody{Code: "APP_CLI_USAGE", Message: message, Expected: usage, Hint: "Use one App Mode package directory and an optional --json flag."}
	if jsonOutput {
		return writeJSON(stdout, envelope{OK: false, Command: command, Error: body}, 2)
	}
	fmt.Fprintf(stderr, "%s\n\nUsage: %s\n", message, usage)
	return 2
}

func writeJSON(writer io.Writer, value envelope, successCode int) int {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return 1
	}
	return successCode
}

func containsJSONFlag(args []string) bool {
	for _, arg := range args {
		if arg == "--json" {
			return true
		}
	}
	return false
}

func sentence(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = strings.ToUpper(value[:1]) + value[1:]
	if !strings.HasSuffix(value, ".") {
		value += "."
	}
	return value
}

func checkLabel(id string) string {
	switch id {
	case appshell.CheckPackageRoot:
		return "package root"
	case appshell.CheckManifest:
		return "manifest"
	case appshell.CheckSchema:
		return "schemaVersion"
	case appshell.CheckIdentity:
		return "id"
	case appshell.CheckVersion:
		return "version"
	case appshell.CheckRuntimeCompatibility:
		return "runtime compatibility"
	case appshell.CheckEntry:
		return "entry"
	case appshell.CheckWindowsTrayResource:
		return "tray.icons.windows"
	case appshell.CheckMacOSTrayResource:
		return "tray.icons.macos"
	case appshell.CheckPathContainment:
		return "path containment"
	default:
		return id
	}
}
