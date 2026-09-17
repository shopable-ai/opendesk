package flowcli

import (
	"flag"
	"io"
	"strings"

	"opendesk/pkg/appdata"
	"opendesk/pkg/flow"
)

func productInstaller() (*flow.Installer, error) {
	root, err := appdata.Resolve(appdata.DesktopPackageID, nil)
	if err != nil {
		return nil, err
	}
	return flow.NewInstaller(root)
}

func runInstall(args []string, stdout io.Writer) int {
	command := "flow install"
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "usage: opendesk flow install <file.odflow> [--trust flow|publisher]")
	}
	packagePath := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	trust := fs.String("trust", "", "publisher trust approval scope")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, command, "invalid_argument", "invalid flow install arguments")
	}
	approval := flow.TrustApprovalNone
	switch strings.TrimSpace(*trust) {
	case "":
	case "flow":
		approval = flow.TrustApprovalFlow
	case "publisher":
		approval = flow.TrustApprovalPublisher
	default:
		return writeError(stdout, command, "invalid_argument", "--trust must be flow or publisher")
	}
	installer, err := productInstaller()
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	result, err := installer.InstallFile(packagePath, flow.InstallOptions{Approval: approval})
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	authorization := "not_required"
	if result.Entry.State == flow.InstallStateNeedsActivation {
		authorization = "needs_activation"
	}
	publisherTrust := "trusted_flow"
	if result.Entry.TrustScope == flow.TrustScopePublisher {
		publisherTrust = "trusted_publisher"
	}
	return writeSuccess(stdout, command, map[string]any{
		"entry":         result.Entry,
		"idempotent":    result.Idempotent,
		"pendingUpdate": result.PendingUpdate,
		"verification": verificationState{Signature: result.SignatureStatus, PublisherTrust: publisherTrust, Authorization: authorization},
	})
}

func runList(args []string, stdout io.Writer) int {
	command := "flow list"
	if len(args) != 0 {
		return writeError(stdout, command, "invalid_argument", "usage: opendesk flow list")
	}
	installer, err := productInstaller()
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	entries, err := installer.List()
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{"flows": entries})
}

func runUninstall(args []string, stdout io.Writer) int {
	command := "flow uninstall"
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "usage: opendesk flow uninstall <install-id> [--purge-data]")
	}
	installID := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	purgeData := fs.Bool("purge-data", false, "remove this Flow's user data")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, command, "invalid_argument", "invalid flow uninstall arguments")
	}
	installer, err := productInstaller()
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	if err := installer.Uninstall(installID, flow.UninstallOptions{PurgeData: *purgeData}); err != nil {
		return writeFailure(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{"installId": installID, "purgedData": *purgeData})
}

func runTrust(args []string, stdout io.Writer) int {
	command := "flow trust"
	if len(args) < 2 {
		return writeError(stdout, command, "invalid_argument", "usage: opendesk flow trust <approve|reject> <file.odflow> --scope flow|publisher")
	}
	action := args[0]
	packagePath := args[1]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	scopeValue := fs.String("scope", "", "trust scope")
	if err := fs.Parse(args[2:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, command, "invalid_argument", "invalid flow trust arguments")
	}
	var status flow.TrustStatus
	switch action {
	case "approve":
		status = flow.TrustStatusTrusted
	case "reject":
		status = flow.TrustStatusRejected
	default:
		return writeError(stdout, command, "invalid_argument", "flow trust action must be approve or reject")
	}
	var scope flow.TrustScope
	switch strings.TrimSpace(*scopeValue) {
	case "flow":
		scope = flow.TrustScopeFlow
	case "publisher":
		scope = flow.TrustScopePublisher
	default:
		return writeError(stdout, command, "invalid_argument", "--scope must be flow or publisher")
	}
	installer, err := productInstaller()
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	record, err := installer.DecidePublisher(packagePath, scope, status, nil)
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{
		"publisherId": record.PublisherID, "publisherKeyId": record.PublisherKeyID,
		"publisherFingerprint": record.PublisherFingerprint, "scope": record.Scope,
		"flowId": record.FlowID, "status": record.Status, "authorization": "not_evaluated",
	})
}
