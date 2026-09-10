package protectedcli

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"opendesk/pkg/customui"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/scriptloader"
)

type Error struct {
	Code    string
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return fmt.Sprintf("%s: %s", e.Code, e.Message)
	}
	return e.Code
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

// ErrorCodeOf keeps protected loading errors distinct from errors produced by
// the existing JavaScript runtime. Unknown runtime failures are execution_failed.
func ErrorCodeOf(err error) string {
	if err == nil {
		return ""
	}
	var protectedErr *Error
	if errors.As(err, &protectedErr) {
		return protectedErr.Code
	}
	if code := scriptloader.ErrorCodeOf(err); code != "" {
		return code
	}
	if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "timed out") {
		return "timeout"
	}
	return "execution_failed"
}

type ExecuteFunc func(pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error)

type RunOptions struct {
	ExecutionIDPrefix string
	LogDir            string
	LogDirIsRoot      bool
	WorkDir           string
	Environment       map[string]string
	Input             any
	Timeout           time.Duration
	TimeoutMinutes    int
	SaveLastScript    string
	StackMode         string

	ExpectedCancellation            func() bool
	EnableNativeExtensions          bool
	EnableUnsafeNativeExtensionCall bool
	EnableCommand                   bool
	EnableDownload                  bool
	EnableAccessibility             bool
	EnableSQLite                    bool
	EnableRecorderCapture           bool
	SQLiteProtectedPaths            []string
	EnableCustomUI                  bool
	CustomUIActivationSource        customui.ActivationSource
	CustomUIHostPath                string
	CustomUIBaseDir                 string
	Selection                       pkgExecution.TerminalSelection
}

// RunProtectedFile is the P0 composition point between ScriptLoader and the
// existing execution runtime. It never writes decrypted source to disk.
func RunProtectedFile(ctx context.Context, loader scriptloader.Loader, filePath string, options RunOptions, execute ExecuteFunc) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, scriptloader.ProtectionInfo, error) {
	if strings.TrimSpace(options.SaveLastScript) != "" {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, scriptloader.ProtectionInfo{}, &Error{Code: "protected_source_export_denied", Message: "-save-last-script cannot export a protected recipe source"}
	}
	if loader == nil {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, scriptloader.ProtectionInfo{}, &Error{Code: "invalid_package", Message: "script loader is required"}
	}
	if execute == nil {
		execute = pkgExecution.Run
	}

	source, err := loader.Load(ctx, filePath)
	if err != nil {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, scriptloader.ProtectionInfo{}, err
	}
	if err := scriptloader.ValidateFileSource(filePath, source); err != nil {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, scriptloader.ProtectionInfo{}, err
	}
	return RunProtectedSource(ctx, source, filePath, options, execute)
}

// RunProtectedSource composes an already-resolved protected ScriptSource into
// the existing execution runtime. Keeping source loading separate lets each
// CLI use its normal parser and lifecycle while sharing the protected artifact
// and execution-request policy.
func RunProtectedSource(ctx context.Context, source *scriptloader.ScriptSource, filePath string, options RunOptions, execute ExecuteFunc) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, scriptloader.ProtectionInfo, error) {
	if source != nil && source.Protection.Mode == scriptloader.ProtectionProtected {
		defer zeroBytes(source.Content)
	}
	if strings.TrimSpace(options.SaveLastScript) != "" {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, scriptloader.ProtectionInfo{}, &Error{Code: "protected_source_export_denied", Message: "-save-last-script cannot export a protected recipe source"}
	}
	if execute == nil {
		execute = pkgExecution.Run
	}
	if source == nil || source.Protection.Mode != scriptloader.ProtectionProtected {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, scriptloader.ProtectionInfo{}, &Error{Code: "invalid_package", Message: "protected execution requires a protected ScriptSource"}
	}
	if source.Protection.PackageDigest == "" {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, scriptloader.ProtectionInfo{}, &Error{Code: "invalid_package", Message: "protected ScriptSource is missing package digest"}
	}
	prefix := strings.TrimSpace(options.ExecutionIDPrefix)
	if prefix == "" {
		prefix = "protected"
	}
	executionID := pkgExecution.NewExecutionID(prefix)
	artifactDir := strings.TrimSpace(options.LogDir)
	if options.LogDirIsRoot && artifactDir != "" {
		artifactDir = filepath.Join(artifactDir, executionID)
	}
	artifacts, err := pkgExecution.PrepareArtifacts(artifactDir, executionID, source.Ext)
	if err != nil {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, source.Protection, err
	}
	// Protected Artifact Policy: remove the snapshot path before the emitter
	// sees it, so summary/event/agent output cannot advertise a plaintext source
	// snapshot that must never exist.
	artifacts.ScriptSnapshotPath = ""

	workDir := options.WorkDir
	if strings.TrimSpace(workDir) == "" {
		workDir = filepath.Dir(filePath)
	}
	selection := options.Selection
	if selection.Categories == nil {
		selection = pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}}
	}
	request := pkgExecution.Request{
		Context:              ctx,
		ExpectedCancellation: options.ExpectedCancellation,
		ExecutionID:          executionID,
		SourceLabel:          source.Source,
		ScriptPath:           "",
		Ext:                  source.Ext,
		StackMode:            options.StackMode,
		// ScriptHash is intentionally the ciphertext package digest, not a hash
		// of decrypted JavaScript. This prevents RunWithEmitter from deriving and
		// publishing the plaintext source hash.
		ScriptHash:                      source.Protection.PackageDigest,
		ScriptContent:                   source.Content,
		Input:                           options.Input,
		WorkDir:                         workDir,
		Environment:                     options.Environment,
		Timeout:                         options.Timeout,
		TimeoutMinutes:                  options.TimeoutMinutes,
		EnableNativeExtensions:          options.EnableNativeExtensions,
		EnableUnsafeNativeExtensionCall: options.EnableUnsafeNativeExtensionCall,
		EnableCommand:                   options.EnableCommand,
		EnableDownload:                  options.EnableDownload,
		EnableAccessibility:             options.EnableAccessibility,
		EnableSQLite:                    options.EnableSQLite,
		EnableRecorderCapture:           options.EnableRecorderCapture,
		SQLiteProtectedPaths:            options.SQLiteProtectedPaths,
		EnableCustomUI:                  options.EnableCustomUI,
		CustomUIActivationSource:        options.CustomUIActivationSource,
		CustomUIHostPath:                options.CustomUIHostPath,
		CustomUIBaseDir:                 options.CustomUIBaseDir,
		Meta:                            map[string]any{"protection": source.Protection},
		Artifacts:                       artifacts,
		Selection:                       selection,
	}
	result, summary, runErr := execute(request)
	return result, summary, source.Protection, runErr
}

func zeroBytes(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
