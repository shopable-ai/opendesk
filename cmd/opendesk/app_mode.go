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
	"opendesk/pkg/flowinstall"
	"opendesk/pkg/flowmarketplace"
	"opendesk/pkg/measurement"
	"opendesk/pkg/runtimeenv"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
)

func validateAppModeConfig(config *Config) error {
	if config == nil {
		return nil
	}
	if strings.TrimSpace(config.AppPath) == "" {
		if strings.TrimSpace(config.MarketplaceDevelopmentConfig) != "" {
			return errors.New("-marketplace-development-config requires -app")
		}
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

const officialOpenDeskAppID = "com.opendesk.desktop"

func configureOfficialAppOwnedExecution(packageID string, request *pkgExecution.Request, runner *appRecipeRunner) {
	if request == nil || runner == nil || strings.TrimSpace(packageID) != officialOpenDeskAppID {
		return
	}
	request.AppOwnedScriptInspect = runner.InspectScript
	request.AppOwnedScriptRead = runner.ReadScript
	request.AppOwnedScriptRun = runner.Run
	request.AppOwnedExecutionID = runner.ReserveExecutionID
	request.AppOwnedFlowInspect = runner.InspectFlow
	request.AppOwnedFlowRun = runner.RunFlow
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
		measurementCapture := appMeasurementCapture{}
		measurementSelector := appMeasurementReferenceSelector{driver: sharedUIDriver, baseDir: filepath.Join(artifactsRoot, "measurement")}
		measurementService, err = measurement.NewService(measurement.ServiceOptions{
			Driver: sharedUIDriver, Capture: measurementCapture, Selector: measurementSelector, Clipboard: automation.NewClipboard(),
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
	var flowService *flowinstall.Service
	var flowInstallMu sync.Mutex
	var flowStateMu sync.RWMutex
	flowDocumentInstalled := false
	flowDropSessionID := ""
	if appshell.IsOpenDeskProduct(appPackage.Manifest) {
		flowService, err = flowinstall.NewProductService(environment.Values)
		if err != nil {
			return fmt.Errorf("initialize Flow install service: %w", err)
		}
	}
	flowTrustApprover := func(ctx context.Context, candidate flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
		host, ok := nativeHost.(appshell.FlowInstallHost)
		if !ok {
			return flowinstall.DecisionCancel, fmt.Errorf("native Flow trust prompt is unavailable")
		}
		decision, err := host.ConfirmFlowTrust(ctx, appshell.FlowTrustPrompt{
			FlowID: candidate.FlowID, Name: candidate.Name, PublisherID: candidate.PublisherID,
			PublisherKeyID: candidate.PublisherKeyID, PublisherFingerprint: candidate.PublisherFingerprint,
		})
		if err != nil {
			return flowinstall.DecisionCancel, err
		}
		switch decision {
		case appshell.FlowTrustFlow:
			return flowinstall.DecisionFlow, nil
		case appshell.FlowTrustPublisher:
			return flowinstall.DecisionPublisher, nil
		default:
			return flowinstall.DecisionCancel, nil
		}
	}
	marketplaceConfirmer := flowmarketplace.InstallConfirmerFunc(func(ctx context.Context, release flowmarketplace.Release) (bool, error) {
		host, ok := nativeHost.(appshell.MarketplaceInstallHost)
		if !ok {
			return false, fmt.Errorf("native Marketplace install confirmation is unavailable")
		}
		return host.ConfirmMarketplaceInstall(ctx, appshell.MarketplaceInstallPrompt{
			FlowID:            release.FlowID,
			ReleaseID:         release.ReleaseID,
			Name:              release.FlowName,
			Version:           release.Version,
			PublisherID:       release.PublisherID,
			VerifiedPublisher: release.VerifiedPublisher,
		})
	})
	var marketplaceClient *flowmarketplace.Client
	marketplaceDevelopmentEnabled := false
	if strings.TrimSpace(config.MarketplaceDevelopmentConfig) != "" {
		if !appshell.IsOpenDeskProduct(appPackage.Manifest) {
			return errors.New("Marketplace development client is available only to the OpenDesk product App Mode package")
		}
		marketplaceClient, err = loadMarketplaceDevelopmentClient(config.MarketplaceDevelopmentConfig)
		if err != nil {
			return fmt.Errorf("initialize Marketplace development client: %w", err)
		}
		marketplaceLog, logErr := configureMarketplaceDevelopmentLog(config.MarketplaceDevelopmentConfig)
		if logErr != nil {
			return fmt.Errorf("initialize Marketplace development diagnostics: %w", logErr)
		}
		if marketplaceLog != nil {
			defer marketplaceLog.Close()
		}
		marketplaceDevelopmentEnabled = true
		log.Printf("[MARKETPLACE_INSTALL] loopback development client enabled")
	}
	// A production Marketplace Client is intentionally not constructed from
	// environment variables or Deep Link values. This repository has no
	// deployed Marketplace origin, pinned production attestation roots, or
	// desktop account adapter yet. Without the explicit loopback-only
	// development config above, keep the receiver fail-closed.
	marketplaceInstaller := &flowmarketplace.Installer{
		// Production leaves Client nil until the product ships its pinned
		// Marketplace inputs. The development client exercises the same confirmer
		// and Flow installation service rather than a second installation path.
		Client:      marketplaceClient,
		FlowService: flowService,
		Confirmer:   marketplaceConfirmer,
		TempRoot:    filepath.Join(artifactsRoot, "marketplace-downloads"),
	}
	marketplaceDeepLinkHandler := flowmarketplace.DeepLinkHandler{
		Installer: marketplaceInstaller,
		InstallOptions: func(context.Context) flowinstall.InstallOptions {
			return flowinstall.InstallOptions{Approver: flowTrustApprover}
		},
	}
	installFlowDocument := func(path string, interactive bool) bool {
		if flowService == nil {
			return false
		}
		validatedPath, pathErr := normalizeFlowInstallPath(path)
		if pathErr != nil {
			log.Printf("[FLOW_INSTALL] rejected path=%q error=%v", path, pathErr)
			return false
		}
		path = validatedPath
		flowInstallMu.Lock()
		defer flowInstallMu.Unlock()
		var result flowinstall.InstallResult
		var installErr error
		switch strings.ToLower(filepath.Ext(path)) {
		case ".odflow":
			// Native document open is an installation request, not a run
			// request. Unknown publishers remain blocked until the explicit
			// trust UI exists; this callback never silently approves them.
			options := flowinstall.InstallOptions{}
			if interactive {
				options.Approver = flowTrustApprover
			}
			result, installErr = flowService.Install(appContext, path, options)
		case ".js", ".mjs":
			result, installErr = flowService.InstallScript(appContext, path)
		default:
			log.Printf("[FLOW_INSTALL] rejected unsupported document path=%q", path)
			return false
		}
		if installErr != nil {
			log.Printf("[FLOW_INSTALL] blocked path=%q code=%s error=%v", path, flowinstall.CodeOf(installErr), installErr)
			return false
		}
		flowDocumentInstalled = true
		log.Printf("[FLOW_INSTALL] installed path=%q installId=%s idempotent=%t", path, result.Record.InstallID, result.Idempotent)
		return true
	}
	installFlowDocuments := func(paths []string, interactive bool) bool {
		if len(paths) > maxFlowDocumentPaths {
			log.Printf("[FLOW_INSTALL] rejected batch count=%d limit=%d", len(paths), maxFlowDocumentPaths)
			return false
		}
		installed := false
		for _, path := range paths {
			installed = installFlowDocument(path, interactive) || installed
		}
		return installed
	}
	if flowService != nil {
		sharedUIDriver.SetFileDropHandler(func(event customui.FileDropEvent) {
			// The shared native host also serves Recorder and other product
			// surfaces. Only the App Mode execution that owns the Runner may
			// turn a native file URL drop into a Flow installation request.
			flowStateMu.RLock()
			dropSessionID := flowDropSessionID
			flowStateMu.RUnlock()
			if dropSessionID == "" || event.SessionID != dropSessionID {
				log.Printf("[FLOW_INSTALL] ignored file drop from session=%q window=%q", event.SessionID, event.WindowID)
				return
			}
			paths := append([]string(nil), event.Paths...)
			go func() {
				if installFlowDocuments(paths, true) {
					if activateErr := shell.Activate("flow-file-drop"); activateErr != nil {
						log.Printf("[FLOW_INSTALL] Runner refresh activation failed after drop: %v", activateErr)
					}
				}
			}()
		})
	}
	if documentHost, ok := nativeHost.(appshell.OpenDocumentHost); ok {
		documentHost.SetOpenDocumentHandler(func(path string) {
			if !strings.EqualFold(filepath.Ext(path), ".odflow") {
				log.Printf("[FLOW_INSTALL] rejected non-odflow native document path=%q", path)
				return
			}
			go func() {
				if installFlowDocument(path, true) {
					_ = shell.Activate("flow-document")
				}
			}()
		})
	}
	if urlHost, ok := nativeHost.(appshell.OpenURLHost); ok {
		urlHost.SetOpenURLHandler(func(rawURL string) {
			// AppKit delivers the opaque OS activation on its own event loop. The
			// handler parses only identifier-only intent and never turns raw URL
			// data into a path, command, Runtime argument, or download URL.
			go func() {
				ref, parseErr := flowmarketplace.ParseInstallURL(rawURL)
				if parseErr != nil {
					// Do not log the opaque raw URL: an untrusted caller may include
					// credentials or other sensitive junk in a rejected query.
					log.Printf("[MARKETPLACE_INSTALL] rejected invalid install intent error=%v", parseErr)
					return
				}
				log.Printf("[MARKETPLACE_INSTALL] received flowId=%s releaseId=%s installIntentId=%s", ref.FlowID, ref.ReleaseID, ref.InstallIntentID)
				result, installErr := marketplaceDeepLinkHandler.Handle(appContext, rawURL)
				if installErr != nil {
					log.Printf("[MARKETPLACE_INSTALL] blocked flowId=%s releaseId=%s installIntentId=%s error=%v", ref.FlowID, ref.ReleaseID, ref.InstallIntentID, installErr)
					return
				}
				log.Printf("[MARKETPLACE_INSTALL] installed flowId=%s releaseId=%s installIntentId=%s installId=%s idempotent=%t", ref.FlowID, ref.ReleaseID, ref.InstallIntentID, result.Record.InstallID, result.Idempotent)
				if activateErr := shell.Activate("flow-marketplace-install"); activateErr != nil {
					log.Printf("[MARKETPLACE_INSTALL] Runner refresh activation failed: %v", activateErr)
				}
			}()
		})
	}
	if flowHost, ok := nativeHost.(appshell.FlowInstallHost); ok {
		if err := shell.BindFlowInstallAction(func(appshell.ActionEvent) error {
			go func() {
				paths, pickerErr := flowHost.OpenFlowFiles(appContext)
				if pickerErr != nil {
					log.Printf("[FLOW_INSTALL] file picker failed: %v", pickerErr)
					return
				}
				if installFlowDocuments(paths, true) {
					if err := shell.Activate("flow-file-picker"); err != nil {
						log.Printf("[FLOW_INSTALL] Runner refresh activation failed: %v", err)
					}
				}
			}()
			return nil
		}); err != nil {
			return err
		}
	}
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
	lease, primary, err := appshell.AcquireSingleInstanceWithDocuments(appContext, appPackage.Manifest, config.FlowDocumentPaths, func(paths []string) bool {
		source := "second-instance"
		if installFlowDocuments(paths, true) {
			source = "flow-document-hot"
		}
		return shell.Activate(source) == nil
	})
	if err != nil {
		return err
	}
	if !primary {
		return nil
	}
	installFlowDocuments(config.FlowDocumentPaths, true)
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
		// Keep the native tray/menu callback non-blocking just like Measurement.
		// The goroutine owns the short Promotion barrier and Recorder lifetime.
		source := event.Source
		go func() {
			waitBeforeProductDesktopActivity(appContext, shell, productActivity, "recorder", source)
			finish := productActivity.begin("recorder")
			if openErr := recorder.Open(appContext, source); openErr != nil {
				finish()
				log.Printf("Recorder entry %s failed: %v", source, openErr)
				return
			}
			// Open() intentionally returns after launching/re-showing the long-lived
			// Recorder execution. Follow its existing done channel so the activity
			// flag remains true until Recorder really closes.
			recorder.mu.Lock()
			done := recorder.done
			recorder.mu.Unlock()
			if done == nil {
				finish()
				return
			}
			<-done
			finish()
		}()
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
	recipeRunner.flowService = flowService
	recorder.ordinaryRunning = recipeRunner.Running
	// An open Recorder tray/window is an idle UI execution, not a capture
	// conflict. Block Recipes only while the native input capture is active.
	recipeRunner.recorderCaptureActive = recorder.CaptureActive
	defer recipeRunner.Close()
	if err := shell.Start(appContext); err != nil {
		return fmt.Errorf("start App Shell: %w", err)
	}
	if marketplaceDevelopmentEnabled {
		// The development client being configured is not enough for an OS URL
		// event: AppKit must first have installed the native delegate and this
		// process must have bound its URL handler. The manual helper waits for
		// this marker before sending its no-side-effect protocol preflight.
		log.Printf("[MARKETPLACE_INSTALL] receiver-ready")
	}
	flowInstallMu.Lock()
	installedBeforeShellStart := flowDocumentInstalled
	flowInstallMu.Unlock()
	if installedBeforeShellStart {
		// Refresh/discover the Runner after installation. This action only opens
		// the Runner; it never starts the newly installed Flow.
		if err := shell.Activate("flow-install"); err != nil {
			log.Printf("[FLOW_INSTALL] Runner refresh activation failed: %v", err)
		}
	}

	executionID := pkgExecution.NewExecutionID("app")
	flowStateMu.Lock()
	flowDropSessionID = executionID
	flowStateMu.Unlock()
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
	configureOfficialAppOwnedExecution(appPackage.Manifest.ID, &request, recipeRunner)

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
