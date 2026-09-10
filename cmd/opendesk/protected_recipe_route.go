package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"opendesk/internal/packagecli"
	"opendesk/internal/protectedcli"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/runtimeenv"
	"opendesk/pkg/scriptloader"
)

// This file adds the protected-package entrypoints without changing the plain
// JavaScript path. The package command and ai-run protected source are routed
// before the legacy flag parser; direct -script .odpkg reuses the same Config,
// cancellation, UI, capability and console helpers as the existing direct CLI.
func init() {
	args := commandLineArgs()
	if packagecli.IsCommand(args) {
		os.Exit(packagecli.Execute(args, os.Stdout, os.Stderr))
	}
	if isAIProtectedRecipeInvocation(args) {
		os.Exit(protectedcli.Execute(args, os.Stdin, os.Stdout, os.Stderr))
	}
	if directProtectedPackagePath(args) == "" {
		return
	}

	normalizeMacOSLaunchServicesArgs()
	normalizeMacOSBundleLaunchWorkingDirectory()
	config := parseFlags()
	configureTerminalOutput(config)
	if config.consoleConfigErr != nil {
		terminalPrintf(os.Stderr, "[ERROR] OpenDesk console configuration: %v\n", config.consoleConfigErr)
		os.Exit(2)
	}
	if config.ScriptText != "" || config.ScriptStdin {
		terminalPrintln(os.Stderr, "[ERROR] please specify only one script source: -script, -script-text, or -script-stdin")
		os.Exit(2)
	}
	// P0 does not extend the legacy HTTP transport with package decryption.
	// Refuse the combined mode rather than letting a protected package drift
	// into HTTP's inline-script preview/execution path.
	if config.HttpMode {
		terminalPrintln(os.Stderr, "[ERROR] unsupported_format: HTTP mode does not support .odpkg in Protected Recipe P0")
		os.Exit(1)
	}
	if err := executeProtectedScript(config); err != nil {
		if errors.Is(err, errScriptInstanceReplaced) {
			if !shouldUseJSONOutput(config) {
				terminalPrintln(os.Stdout, "[META] [INFO] Protected recipe execution was replaced by a newer invocation")
			}
			os.Exit(0)
		}
		terminalPrintf(os.Stderr, "[ERROR] Protected recipe execution failed: %v\n", err)
		os.Exit(1)
	}
	os.Exit(0)
}

func isAIProtectedRecipeInvocation(args []string) bool {
	return len(args) >= 3 && args[0] == "ai" && args[1] == "run" && strings.EqualFold(filepath.Ext(args[2]), ".odpkg")
}

func directProtectedPackagePath(args []string) string {
	for index := 0; index < len(args); index++ {
		arg := args[index]
		if arg == "-script" || arg == "--script" {
			if index+1 < len(args) && strings.EqualFold(filepath.Ext(args[index+1]), ".odpkg") {
				return args[index+1]
			}
			continue
		}
		for _, prefix := range []string{"-script=", "--script="} {
			if strings.HasPrefix(arg, prefix) {
				candidate := strings.TrimPrefix(arg, prefix)
				if strings.EqualFold(filepath.Ext(candidate), ".odpkg") {
					return candidate
				}
			}
		}
	}
	return ""
}

func executeProtectedScript(config *Config) error {
	if config == nil || !strings.EqualFold(filepath.Ext(config.ScriptPath), ".odpkg") {
		return fmt.Errorf("unsupported_format: protected direct execution requires a .odpkg file")
	}
	if err := resolveCustomUIActivation(config); err != nil {
		return err
	}
	workingDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("read execution working directory: %w", err)
	}
	environment, err := runtimeenv.Resolve(runtimeenv.Options{
		WorkingDirectory: workingDir,
		File:             config.EnvironmentFile,
		Inherited:        os.Environ(),
	})
	if err != nil {
		return fmt.Errorf("resolve local execution environment: %w", err)
	}

	executionSignals := newDirectExecutionSignalController(context.Background())
	defer executionSignals.Stop()
	executionContext := executionSignals.Context()
	instanceLease, err := acquireReplacingScriptInstance(config.ScriptPath, executionSignals.Cancel)
	if err != nil {
		return err
	}
	defer instanceLease.Close()

	selection := buildExecutionConsoleSelection(config)
	loader := scriptloader.NewProductionFileLoader()
	result, summary, protection, runErr := protectedcli.RunProtectedFile(
		executionContext,
		loader,
		config.ScriptPath,
		protectedcli.RunOptions{
			ExecutionIDPrefix:                 "direct-protected",
			LogDir:                            config.LogDir,
			WorkDir:                           workingDir,
			Environment:                       environment.Values,
			TimeoutMinutes:                    config.Timeout,
			SaveLastScript:                    config.SaveLastScript,
			StackMode:                         config.StackMode,
			ExpectedCancellation:              func() bool { return instanceLease.WasReplaced() },
			EnableNativeExtensions:            true,
			EnableUnsafeNativeExtensionCall:   config.ExperimentalUnsafeNativeExtensionCall,
			EnableCommand:                     true,
			EnableDownload:                    true,
			EnableAccessibility:               true,
			EnableSQLite:                      true,
			EnableRecorderCapture:             config.AllowRecorderCapture,
			SQLiteProtectedPaths:              sqliteProtectedPaths(config),
			EnableCustomUI:                    config.CustomUI,
			CustomUIActivationSource:          config.CustomUIActivationSource,
			CustomUIHostPath:                  config.CustomUIHostPath,
			Selection: pkgExecution.TerminalSelection{
				Mode:         selection.Mode,
				Categories:   copyConsoleCategories(selection.Categories),
				IncludeDebug: selection.IncludeDebug,
				ColorMode:    selection.ColorMode,
			},
		},
		nil,
	)

	// Loading/authorization errors occur before an Execution exists. Surface the
	// stable protected error code without manufacturing an empty execution summary.
	if runErr != nil && result.ExecutionID == "" {
		code := protectedcli.ErrorCodeOf(runErr)
		if code == "" {
			code = "invalid_package"
		}
		return fmt.Errorf("%s: %w", code, runErr)
	}

	if summary.Meta == nil {
		summary.Meta = map[string]any{}
	}
	summary.Meta["protection"] = protection
	if shouldUseJSONOutput(config) {
		if err := printAgentSummaryJSON(summary); err != nil {
			return err
		}
	} else {
		printExecutionSummary(selection, result)
		if selection.Categories["summary"] {
			terminalPrintf(os.Stdout, "[SUMMARY] protection=protected packageId=%s productId=%s publisherId=%s publisherKeyId=%s packageDigest=%s\n",
				protection.PackageID, protection.ProductID, protection.PublisherID, protection.PublisherKeyID, protection.PackageDigest)
		}
	}

	if runErr != nil {
		if instanceLease.WasReplaced() && errors.Is(runErr, context.Canceled) {
			return errScriptInstanceReplaced
		}
		return fmt.Errorf("script execution failed: %w", runErr)
	}
	return nil
}
