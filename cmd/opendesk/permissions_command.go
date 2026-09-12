package main

import (
	"encoding/json"
	"fmt"
	"io"
	"opendesk/automation"
	"os"
	"strings"
)

var permissionReportForCLI = automation.GetPermissionReport
var openPermissionSettingsForCLI = automation.OpenPermissionSettings

// permissions is a positional command, while the historical OpenDesk CLI is
// still flag based. Dispatch it before flag.Parse without teaching the legacy
// parser a second command grammar.
func init() {
	args := commandLineArgs()
	if permissionsCLIRequested(args) {
		os.Exit(executePermissionsCLI(args, os.Stdout, os.Stderr))
	}
}

func permissionsCLIRequested(args []string) bool {
	return len(args) > 0 && strings.EqualFold(strings.TrimSpace(args[0]), "permissions")
}

func executePermissionsCLI(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || !permissionsCLIRequested(args) {
		fmt.Fprintln(stderr, "permissions command is required")
		return 2
	}
	if len(args) == 1 {
		printPermissionsUsage(stderr)
		return 2
	}

	subcommand := strings.ToLower(strings.TrimSpace(args[1]))
	switch subcommand {
	case "status":
		feature, jsonOutput, err := parsePermissionStatusOptions(args[2:])
		if err != nil {
			fmt.Fprintf(stderr, "permissions status: %v\n", err)
			return 2
		}
		report := permissionReportForCLI(feature)
		if jsonOutput {
			encoder := json.NewEncoder(stdout)
			encoder.SetIndent("", "  ")
			if err := encoder.Encode(report); err != nil {
				fmt.Fprintf(stderr, "permissions status: encode JSON: %v\n", err)
				return 1
			}
			return 0
		}
		printPermissionStatus(stdout, report)
		return 0
	case "doctor":
		feature, _, err := parsePermissionStatusOptions(args[2:])
		if err != nil {
			fmt.Fprintf(stderr, "permissions doctor: %v\n", err)
			return 2
		}
		report := permissionReportForCLI(feature)
		printPermissionDoctor(stdout, report)
		if report.Overall == automation.PermissionBlocked || report.Overall == automation.PermissionUnknownOverall {
			return 1
		}
		return 0
	case "open":
		if len(args) != 3 || strings.TrimSpace(args[2]) == "" {
			fmt.Fprintln(stderr, "usage: opendesk permissions open <permission-id>")
			return 2
		}
		permissionID := strings.TrimSpace(args[2])
		if _, err := automation.CheckPermission(permissionID); err != nil {
			fmt.Fprintf(stderr, "permissions open: %v\n", err)
			return 2
		}
		if err := openPermissionSettingsForCLI(permissionID); err != nil {
			fmt.Fprintf(stderr, "permissions open %s: %v\n", permissionID, err)
			return 1
		}
		fmt.Fprintf(stdout, "Opened system permission settings for %s.\n", permissionID)
		return 0
	default:
		fmt.Fprintf(stderr, "unknown permissions subcommand %q\n", subcommand)
		printPermissionsUsage(stderr)
		return 2
	}
}

func parsePermissionStatusOptions(args []string) (string, bool, error) {
	feature := "desktop-automation"
	jsonOutput := false
	for index := 0; index < len(args); index++ {
		argument := strings.TrimSpace(args[index])
		switch {
		case argument == "--json":
			jsonOutput = true
		case argument == "--feature":
			index++
			if index >= len(args) || strings.TrimSpace(args[index]) == "" {
				return "", false, fmt.Errorf("--feature requires a value")
			}
			feature = strings.TrimSpace(args[index])
		case strings.HasPrefix(argument, "--feature="):
			feature = strings.TrimSpace(strings.TrimPrefix(argument, "--feature="))
			if feature == "" {
				return "", false, fmt.Errorf("--feature requires a value")
			}
		default:
			return "", false, fmt.Errorf("unknown option %q", argument)
		}
	}
	return feature, jsonOutput, nil
}

func printPermissionStatus(writer io.Writer, report automation.RuntimePermissionReport) {
	fmt.Fprintln(writer, "OpenDesk Permissions")
	fmt.Fprintln(writer)
	fmt.Fprintf(writer, "Process             %d (%s)\n", report.Identity.ProcessID, report.Identity.LaunchKind)
	fmt.Fprintf(writer, "Executable          %s\n", report.Identity.Executable)
	if report.Identity.BundlePath != "" {
		fmt.Fprintf(writer, "Bundle              %s\n", report.Identity.BundlePath)
	}
	fmt.Fprintf(writer, "Feature             %s\n", report.Feature)
	fmt.Fprintln(writer)
	for _, permission := range report.Permissions {
		fmt.Fprintf(writer, "%-20s %-16s %s\n", permission.DisplayName, permission.Status, permission.Requirement)
	}
	fmt.Fprintln(writer)
	fmt.Fprintf(writer, "Overall             %s\n", report.Overall)
}

func printPermissionDoctor(writer io.Writer, report automation.RuntimePermissionReport) {
	fmt.Fprintln(writer, "OpenDesk Permission Doctor")
	fmt.Fprintf(writer, "Current process: %s (%s)\n", report.Identity.Executable, report.Identity.LaunchKind)
	fmt.Fprintf(writer, "Feature: %s\nOverall: %s\n", report.Feature, report.Overall)

	issues := 0
	for _, permission := range report.Permissions {
		ready := permission.Status == automation.PermissionGranted || permission.Status == automation.PermissionNotRequired
		if permission.Requirement == automation.PermissionOnDemand || ready {
			continue
		}
		issues++
		fmt.Fprintf(writer, "\n%s: %s (%s)\n", permission.DisplayName, permission.Status, permission.Requirement)
		fmt.Fprintf(writer, "  Why: %s\n", permission.Description)
		if permission.Remediation != "" {
			fmt.Fprintf(writer, "  Fix: %s\n", permission.Remediation)
		}
		if permission.CanOpenSettings {
			fmt.Fprintf(writer, "  Command: opendesk permissions open %s\n", permission.ID)
		}
	}
	if issues == 0 {
		fmt.Fprintln(writer, "\nNo permission action is currently required for this feature.")
	}
	if report.Platform == "windows" {
		fmt.Fprintln(writer, "\nWindows note: a normal-integrity OpenDesk process cannot reliably automate a higher-integrity elevated target process.")
	}
}

func printPermissionsUsage(writer io.Writer) {
	fmt.Fprintln(writer, "usage:")
	fmt.Fprintln(writer, "  opendesk permissions status [--json] [--feature <name>]")
	fmt.Fprintln(writer, "  opendesk permissions doctor [--feature <name>]")
	fmt.Fprintln(writer, "  opendesk permissions open <permission-id>")
}
