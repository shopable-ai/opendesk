package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"opendesk/automation"
	"opendesk/pkg/appshell"
	"opendesk/pkg/customui"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/measurement"
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
	if err != nil {
		return err
	}
	appPackage.Manifest = appshell.EnsureRecorderMenu(appPackage.Manifest)
	content, err := os.ReadFile(appPackage.EntryPath)
	if err != nil {
		return fmt.Errorf("read App Mode entry: %w", err)
	}
	environment, err := runtimeenv.Resolve(runtimeenv.Options{
		WorkingDirectory: appPackage.Root,
		File:             config.EnvironmentFile,
		Inherited:        os.Environ(),
	})
	if err != nil {
		return fmt.Errorf("resolve App Mode environment: %w", err)
	}
	nativeHost, err := appshell.NewNativeHost(appPackage)
	if err != nil {
		return err
	}
	shell, err := appshell.New(appPackage.Manifest, nativeHost)
	if err != nil {
		return err
	}
	sharedUIDriver := customui.NewProcessDriver(customui.ProcessDriverOptions{HostPath: config.CustomUIHostPath})
	defer sharedUIDriver.Close()
	artifactsRoot, artifactsConfigured, err := appModeRuntimeArtifactsRoot(
		appPackage.Root,
		appPackage.Manifest.ID,
		config.LogDir,
		environment.Values,
	)
	if err != nil {
		return fmt.Errorf("resolve App Mode runtime artifacts root: %w", err)
	}
	var measurementService *measurement.Service
	if appshell.IsOpenDeskProduct(appPackage.Manifest) {
		measurementService, err = measurement.NewService(measurement.ServiceOptions{
			Driver: sharedUIDriver, Capture: appMeasurementCapture{}, Clipboard: automation.NewClipboard(),
			BaseDir: filepath.Join(artifactsRoot, "measurement"), SaveDir: filepath.Join(artifactsRoot, "measurement", "results"),
		})
		if err != nil {
			return fmt.Errorf("initialize Desktop Measurement: %w", err)
		}
		if err := measurementService.EnableSnapshotCandidates(newAppMeasurementCandidateProviders(), 0); err != nil {
			return fmt.Errorf("initialize Desktop Measurement candidates: %w", err)
		}
		defer measurementService.Close(context.Background())
	}

	signalContext, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	appContext, cancelApp := context.WithCancel(signalContext)
	defer cancelApp()
	productActivity := newAppProductActivityCoordinator()
	if measurementService != nil {
		if err := shell.BindMeasurementAction(func(event appshell.ActionEvent) error {
			// AppKit invokes a tray-menu action while its menu tracking loop owns the
			// main thread. The barrier and capture therefore run after that callback
			// returns. OpenAndWait keeps Measurement marked active for the complete
			// native session, not only until its window first appears.
			source := event.Source
			go func() {
				log.Printf("Desktop Measurement entry %s requested", source)
				waitBeforeProductDesktopActivity(appContext, shell, productActivity, "measurement", source)
				finish := productActivity.begin("measurement")
				defer finish()
				if openErr := measurementService.OpenAndWait(appContext, source); openErr != nil {
					log.Printf("Desktop Measurement entry %s failed: %v", source, openErr)
					return
				}
				log.Printf("Desktop Measurement entry %s closed", source)
			}()
			return nil
		}); err != nil {
			return err
		}
	}
	shell.SetQuitHook(cancelApp)
	stopSignalHook := context.AfterFunc(signalContext, func() { _ = shell.RequestQuit() })
	defer stopSignalHook()

	lease, primary, err := appshell.AcquireSingleInstance(appContext, appPackage.Manifest, func() bool {
		return shell.Activate("second-instance") == nil
	})
	if err != nil {
		return err
	}
	if !primary {
		return nil
	}
	leaseClosed := false
	defer func() {
		if lease != nil && !leaseClosed {
			_ = lease.Close()
			lease.Wait()
		}
	}()
	if measurementService != nil {
		// Register only in the primary instance. A secondary launch must first
		// activate the running product instead of racing it for this optional
		// process-wide shortcut.
		measurementShortcut, shortcutErr := registerMeasurementGlobalShortcutWithActivity(measurementService, appContext, shell, productActivity)
		if shortcutErr != nil {
			warnMeasurementGlobalShortcutUnavailable(shortcutErr)
		} else if measurementShortcut != nil {
			defer func() {
				if err := measurementShortcut.Close(); err != nil {
					log.Printf("Desktop Measurement shortcut cleanup failed: %v", err)
				}
			}()
		}
	}
	var openMeasurement func(context.Context) error
	if measurementService != nil {
		openMeasurement = func(ctx context.Context) error {
			finish := productActivity.begin("measurement")
			defer finish()
			return measurementService.OpenAndWait(ctx, "recorder-toolbar")
		}
	}
	recorder := newAppRecorder(shell, appPackage, appRecorderConfig{
		LogDir:                                artifactsRoot,
		StackMode:                             config.StackMode,
		AllowRecorderCapture:                  recorderCaptureAllowed,
		ExperimentalUnsafeNativeExtensionCall: config.ExperimentalUnsafeNativeExtensionCall,
		CustomUIHostPath:                      config.CustomUIHostPath,
		MeasurementOpen:                       openMeasurement,
	}, environment, sharedUIDriver)
	if err := shell.BindRecorderAction(func(event appshell.ActionEvent) error {
		waitBeforeProductDesktopActivity(appContext, shell, productActivity, "recorder", event.Source)
		finish := productActivity.begin("recorder")
		if openErr := recorder.Open(appContext, event.Source); openErr != nil {
			finish()
			return openErr
		}
		// Open() intentionally returns after launching/re-showing the long-lived
		// Recorder execution. Follow that execution's existing done channel so the
		// product activity flag remains true until Recorder really closes.
		recorder.mu.Lock()
		done := recorder.done
		recorder.mu.Unlock()
		if done == nil {
			finish()
		} else {
			go func() { <-done; finish() }()
		}
		return nil
	}); err != nil {
		return err
	}
	defer recorder.Cancel()
	appScheduler, err := startAppSchedulerWithActivity(
		appContext,
		config,
		appPackage.Manifest.ID,
		appPackage.Root,
		environment.Values,
		productActivity,
		shell,
		sharedUIDriver,
	)
	if err != nil {
		return fmt.Errorf("start App Scheduler: %w", err)
	}
	defer appScheduler.Close()
	environment.Values = appScheduler.Environment(environment.Values)
	recipeRunner := newAppRecipeRunner(appRecipeRunnerConfig{
		StackMode:                             config.StackMode,
		ExperimentalUnsafeNativeExtensionCall: config.ExperimentalUnsafeNativeExtensionCall,
		CustomUIHostPath:                      config.CustomUIHostPath,
		SQLiteProtectedPaths:                  sqliteProtectedPaths(config),
	}, environment.Values, sharedUIDriver)
	recorder.ordinaryRunning = recipeRunner.Running
	// An open Recorder tray/window is an idle UI execution, not a capture
	// conflict. Block Recipes only while the native input capture is active.
	recipeRunner.recorderCaptureActive = recorder.CaptureActive
	defer recipeRunner.Close()
	if err := shell.Start(appContext); err != nil {
		return fmt.Errorf("start App Shell: %w", err)
	}

	executionID := pkgExecution.NewExecutionID("app")
	appLogDir := artifactsRoot
	if !artifactsConfigured {
		appLogDir = filepath.Join(artifactsRoot, executionID)
	}
	artifacts, err := pkgExecution.PrepareArtifacts(appLogDir, executionID, ".js")
	if err != nil {
		return errors.Join(err, shell.Teardown())
	}
	if err := persistExecutionSnapshots("", artifacts.ScriptSnapshotPath, content); err != nil {
		return errors.Join(err, shell.Teardown())
	}
	selection := buildExecutionConsoleSelection(config)
	request := pkgExecution.Request{
		Context:       appContext,
		ExecutionID:   executionID,
		SourceLabel:   "app:" + appPackage.Manifest.ID,
		ScriptPath:    appPackage.EntryPath,
		Ext:           ".js",
		StackMode:     config.StackMode,
		ScriptContent: content,
		WorkDir:       appPackage.Root,
		Environment:   environment.Values,
		// App Mode intentionally has no implicit 30-minute CLI deadline.
		TimeoutMinutes:                  0,
		EnableNativeExtensions:          true,
		EnableUnsafeNativeExtensionCall: config.ExperimentalUnsafeNativeExtensionCall,
		EnableCommand:                   true,
		EnableDownload:                  true,
		EnableWebhook:                   true,
		EnableAccessibility:             true,
		EnableSQLite:                    true,
		EnableRecorderCapture:           recorderCaptureAllowed,
		SQLiteProtectedPaths:            sqliteProtectedPaths(config),
		EnableCustomUI:                  true,
		CustomUIActivationSource:        customui.ActivationCLI,
		CustomUIHostPath:                config.CustomUIHostPath,
		CustomUIDriver:                  customui.NewSessionScopedDriverForSession(sharedUIDriver, executionID),
		CustomUIBaseDir:                 appPackage.Root,
		AppShell:                        shell,
		AppOwnedScriptRun:               recipeRunner.Run,
		GracefulCancellation: func() bool {
			state := shell.State()
			return shell.TerminalError() == nil && (state == appshell.StateQuitting || state == appshell.StateStopped)
		},
		Artifacts: artifacts,
		Selection: pkgExecution.TerminalSelection{
			Mode:         selection.Mode,
			Categories:   copyConsoleCategories(selection.Categories),
			IncludeDebug: selection.IncludeDebug,
			ColorMode:    selection.ColorMode,
		},
	}

	runResult := make(chan appModeExecutionResult, 1)
	go func() {
		result, summary, runErr := pkgExecution.Run(request)
		runErr = errors.Join(runErr, shell.Teardown())
		runResult <- appModeExecutionResult{result: result, summary: summary, err: runErr}
	}()
	mainErr := shell.RunMain(appContext)
	if mainErr != nil {
		_ = shell.RequestQuit()
	}
	outcome := <-runResult

	var leaseErr error
	if lease != nil {
		leaseErr = lease.Close()
		lease.Wait()
		leaseClosed = true
	}
	if shouldUseJSONOutput(config) {
		if err := printAgentSummaryJSON(outcome.summary); err != nil {
			return err
		}
	} else {
		printExecutionSummary(selection, outcome.result)
	}
	return errors.Join(mainErr, outcome.err, leaseErr)
}

func appModeRecorderCaptureAllowed(config *Config) bool {
	if config == nil {
		return false
	}
	if config.AllowRecorderCapture {
		return true
	}
	defaultPackage := bundledAppModePath()
	if defaultPackage == "" || strings.TrimSpace(config.AppPath) == "" {
		return false
	}
	requested, err := filepath.Abs(config.AppPath)
	if err != nil {
		return false
	}
	return filepath.Clean(requested) == filepath.Clean(defaultPackage)
}
