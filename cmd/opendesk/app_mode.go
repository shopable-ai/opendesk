package main

import (
	"context"
	"errors"
	"fmt"
	"opendesk/automation"
	"opendesk/pkg/appshell"
	"opendesk/pkg/customui"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/runtimeenv"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
)

func validateAppModeConfig(config *Config) error {
	if config == nil || strings.TrimSpace(config.AppPath) == "" {
		return nil
	}
	conflicts := make([]string, 0, 6)
	if config.ScriptPath != "" || config.ScriptText != "" || config.ScriptStdin {
		conflicts = append(conflicts, "-script/-script-text/-script-stdin")
	}
	if config.HttpMode {
		conflicts = append(conflicts, "-http")
	}
	if config.VisionOCRImagePath != "" || config.VisionDetectImagePath != "" {
		conflicts = append(conflicts, "vision CLI")
	}
	if config.NativeExtension != "" {
		conflicts = append(conflicts, "-native-extension")
	}
	if config.MacPermissionHelper != "" {
		conflicts = append(conflicts, "-mac-permission-helper")
	}
	if config.CustomUIDisabled {
		conflicts = append(conflicts, "-no-ui")
	}
	if len(conflicts) != 0 {
		return fmt.Errorf("-app is mutually exclusive with %s", strings.Join(conflicts, ", "))
	}
	return nil
}

func validateAppModeHelperConflict(args []string) error {
	if !appModeRequested(args) {
		return nil
	}
	notificationHelper := false
	for _, arg := range args {
		if automation.MacOSNotificationHelperRequested([]string{arg}) {
			notificationHelper = true
			break
		}
	}
	if notificationHelper || automation.MacOSRegionSelectorHelperRequested(args) {
		return errors.New("-app is mutually exclusive with internal helper modes")
	}
	return nil
}

type appModeExecutionResult struct {
	result  pkgExecution.ExecutionResult
	summary pkgExecution.AgentSummary
	err     error
}

func executeAppMode(config *Config) error {
	recorderCaptureAllowed := appModeRecorderCaptureAllowed(config)
	appPackage, err := appshell.LoadPackage(config.AppPath)
	if err != nil { return err }
	appPackage.Manifest = appshell.EnsureRecorderMenu(appPackage.Manifest)
	content, err := os.ReadFile(appPackage.EntryPath)
	if err != nil { return fmt.Errorf("read App Mode entry: %w", err) }
	environment, err := runtimeenv.Resolve(runtimeenv.Options{WorkingDirectory: appPackage.Root, File: config.EnvironmentFile, Inherited: os.Environ()})
	if err != nil { return fmt.Errorf("resolve App Mode environment: %w", err) }
	nativeHost, err := appshell.NewNativeHost(appPackage)
	if err != nil { return err }
	shell, err := appshell.New(appPackage.Manifest, nativeHost)
	if err != nil { return err }
	sharedUIDriver := customui.NewProcessDriver(customui.ProcessDriverOptions{HostPath: config.CustomUIHostPath})
	defer sharedUIDriver.Close()

	signalContext, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	appContext, cancelApp := context.WithCancel(signalContext)
	defer cancelApp()
	shell.SetQuitHook(cancelApp)
	stopSignalHook := context.AfterFunc(signalContext, func() { _ = shell.RequestQuit() })
	defer stopSignalHook()

	lease, primary, err := appshell.AcquireSingleInstance(appContext, appPackage.Manifest, func() bool { return shell.Activate("second-instance") == nil })
	if err != nil { return err }
	if !primary { return nil }
	leaseClosed := false
	defer func() { if lease != nil && !leaseClosed { _ = lease.Close(); lease.Wait() } }()
	recorder := newAppRecorder(shell, appPackage, appRecorderConfig{LogDir: config.LogDir, StackMode: config.StackMode, AllowRecorderCapture: recorderCaptureAllowed, ExperimentalUnsafeNativeExtensionCall: config.ExperimentalUnsafeNativeExtensionCall, CustomUIHostPath: config.CustomUIHostPath}, environment, sharedUIDriver)
	if err := shell.BindRecorderAction(func(event appshell.ActionEvent) error { return recorder.Open(appContext, event.Source) }); err != nil { return err }
	defer recorder.Cancel()

	appScheduler, err := startAppScheduler(appContext, config, appPackage, environment)
	if err != nil { return fmt.Errorf("start App Scheduler: %w", err) }
	defer appScheduler.Close()
	environment.Values = append(environment.Values, "OPENDESK_APP_SCHEDULER_ENDPOINT="+appScheduler.Endpoint(), "OPENDESK_APP_SCHEDULER_TOKEN="+appScheduler.Token())

	if err := shell.Start(appContext); err != nil { return fmt.Errorf("start App Shell: %w", err) }
	executionID := pkgExecution.NewExecutionID("app")
	artifacts, err := pkgExecution.PrepareArtifacts(config.LogDir, executionID, ".js")
	if err != nil { return errors.Join(err, shell.Teardown()) }
	if err := persistExecutionSnapshots("", artifacts.ScriptSnapshotPath, content); err != nil { return errors.Join(err, shell.Teardown()) }
	selection := buildExecutionConsoleSelection(config)
	request := pkgExecution.Request{Context: appContext, ExecutionID: executionID, SourceLabel: "app:"+appPackage.Manifest.ID, ScriptPath: appPackage.EntryPath, Ext: ".js", StackMode: config.StackMode, ScriptContent: content, WorkDir: appPackage.Root, Environment: environment.Values, TimeoutMinutes: 0, EnableNativeExtensions: true, EnableUnsafeNativeExtensionCall: config.ExperimentalUnsafeNativeExtensionCall, EnableCommand: true, EnableDownload: true, EnableAccessibility: true, EnableSQLite: true, EnableRecorderCapture: recorderCaptureAllowed, SQLiteProtectedPaths: sqliteProtectedPaths(config), EnableCustomUI: true, CustomUIActivationSource: customui.ActivationCLI, CustomUIHostPath: config.CustomUIHostPath, CustomUIDriver: customui.NewSessionScopedDriverForSession(sharedUIDriver, executionID), CustomUIBaseDir: appPackage.Root, AppShell: shell, GracefulCancellation: func() bool { state := shell.State(); return shell.TerminalError()==nil && (state==appshell.StateQuitting || state==appshell.StateStopped) }, Artifacts: artifacts, Selection: pkgExecution.TerminalSelection{Mode: selection.Mode, Categories: copyConsoleCategories(selection.Categories), IncludeDebug: selection.IncludeDebug, ColorMode: selection.ColorMode}}
	runResult := make(chan appModeExecutionResult, 1)
	go func() { result, summary, runErr := pkgExecution.Run(request); runErr = errors.Join(runErr, shell.Teardown()); runResult <- appModeExecutionResult{result: result, summary: summary, err: runErr} }()
	mainErr := shell.RunMain(appContext)
	if mainErr != nil { _ = shell.RequestQuit() }
	outcome := <-runResult
	var leaseErr error
	if lease != nil { leaseErr = lease.Close(); lease.Wait(); leaseClosed = true }
	if shouldUseJSONOutput(config) { if err := printAgentSummaryJSON(outcome.summary); err != nil { return err } } else { printExecutionSummary(selection, outcome.result) }
	return errors.Join(mainErr, outcome.err, leaseErr)
}

func appModeRecorderCaptureAllowed(config *Config) bool {
	if config == nil { return false }
	if config.AllowRecorderCapture { return true }
	defaultPackage := bundledAppModePath()
	if defaultPackage == "" || strings.TrimSpace(config.AppPath) == "" { return false }
	requested, err := filepath.Abs(config.AppPath)
	if err != nil { return false }
	return filepath.Clean(requested) == filepath.Clean(defaultPackage)
}
