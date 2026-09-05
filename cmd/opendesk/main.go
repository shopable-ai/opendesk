package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"opendesk/automation"
	"opendesk/internal/aicli"
	pkgContainer "opendesk/pkg/container"
	"opendesk/pkg/customui"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/feature"
	pkgHttp "opendesk/pkg/http"
	"opendesk/pkg/nativeextension"
	"opendesk/pkg/runtimeconfig"
	pkgScheduler "opendesk/pkg/scheduler"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/go-vgo/robotgo"
)

func init() {
	if automation.MacOSRegionSelectorHelperRequested(os.Args[1:]) {
		// Pin the primordial process thread before Go can schedule main
		// elsewhere. AppKit must own that thread for the selector lifetime.
		runtime.LockOSThread()
		return
	}
	if aicli.IsCommand(os.Args[1:]) || nativeExtensionCLIRequested(os.Args[1:]) || automation.MacOSNotificationHelperRequested(os.Args[1:]) || automation.MacOSRegionSelectorHelperRequested(os.Args[1:]) {
		return
	}
}

// Config holds the application configuration
type Config struct {
	ScriptPath                            string
	ScriptText                            string
	ScriptStdin                           bool
	StackMode                             string
	SaveLastScript                        string
	LogDir                                string
	ConsoleMode                           string
	ConsoleCategories                     string
	Debug                                 bool
	EnvironmentFile                       string
	OutputFormat                          string
	Delay                                 int
	Timeout                               int // 修改为 timeout，单位为分钟
	ExperimentalNativeExtension           bool
	ExperimentalUnsafeNativeExtensionCall bool
	CustomUI                              bool
	CustomUIDisabled                      bool
	RuntimeConfigPath                     string
	CustomUIActivationSource              customui.ActivationSource
	ResolvedRuntimeConfigPath             string
	CustomUIHostPath                      string
	HttpMode                              bool
	Port                                  string
	SchedulerDBPath                       string
	VisionOCRImagePath                    string
	VisionDetectImagePath                 string
	VisionTargetText                      string
	VisionProvider                        string
	VisionLang                            string
	VisionMinConfidence                   float64
	VisionIncludeRaw                      bool
	MacPermissionHelper                   string
	MacPermissionTarget                   string
	NativeExtension                       string
	NativeMethod                          string
	NativeParams                          string
	NativeTimeoutMS                       int
	NativeRequestID                       string
	consoleConfigErr                      error
	customUIResolveOnce                   sync.Once
	customUIResolveErr                    error
}

func parseFlags() *Config {
	config := &Config{}

	flag.StringVar(&config.ScriptPath, "script", "", "Script file path (.txt or .js)")
	flag.StringVar(&config.ScriptText, "script-text", "", "Execute JavaScript source directly from the command line")
	flag.StringVar(&config.StackMode, "stack", "legacy", "Browser automation surface: legacy | upgraded | playwright")
	flag.StringVar(&config.SaveLastScript, "save-last-script", "", "Persist the executed script source to the given path")
	flag.StringVar(&config.LogDir, "log-dir", "", "Persist run logs and summary to the given directory")
	flag.StringVar(&config.ConsoleMode, "console-mode", defaultConsoleMode, "Terminal output mode: normal | full | script | meta | summary | quiet | agent")
	flag.StringVar(&config.ConsoleCategories, "console-categories", "", "Override terminal output categories: framework,meta,script,summary,error")
	flag.BoolVar(&config.Debug, "debug", false, "Show complete diagnostic terminal output (unless console mode/categories is explicitly set)")
	flag.StringVar(&config.EnvironmentFile, "env-file", "", "OpenDesk environment file (default: .env then .opendesk.env in the working directory)")
	flag.StringVar(&config.OutputFormat, "output-format", "text", "Agent output format: text | json")
	flag.IntVar(&config.Delay, "delay", 0, "Delay before start (seconds)")
	flag.IntVar(&config.Timeout, "timeout", 30, "Execution timeout in minutes (0 for no timeout)") // 默认30分钟
	flag.BoolVar(&config.ExperimentalNativeExtension, "experimental-native-extension", false, "Deprecated compatibility flag; local CLI JavaScript already enables manifest-discovered NativeExtensions")
	flag.BoolVar(&config.ExperimentalUnsafeNativeExtensionCall, "experimental-unsafe-native-extension-call", false, "Enable unsafe low-level NativeExtension.call for explicit local diagnostics")
	flag.BoolVar(&config.CustomUI, "ui", false, "Explicitly enable custom UI for this CLI execution or HTTP server")
	flag.BoolVar(&config.CustomUIDisabled, "no-ui", false, "Explicitly disable custom UI, overriding every other activation source")
	flag.StringVar(&config.RuntimeConfigPath, "config", "", "Runtime project configuration path")
	flag.StringVar(&config.CustomUIHostPath, "ui-host", "", "Custom UI native host path (internal/development override)")
	flag.BoolVar(&config.HttpMode, "http", false, "Start in HTTP server mode")
	flag.StringVar(&config.Port, "port", "60844", "HTTP server port")
	flag.StringVar(&config.SchedulerDBPath, "scheduler-db", "", "Scheduler SQLite database path (default: ~/.opendesk/opendesk/scheduler.db)")
	flag.StringVar(&config.VisionOCRImagePath, "vision-ocr-image", "", "Run OCR in CLI mode using image path")
	flag.StringVar(&config.VisionDetectImagePath, "vision-detect-ui-image", "", "Run UI detection in CLI mode using image path")
	flag.StringVar(&config.VisionTargetText, "vision-target-text", "", "Target text for UI detection")
	flag.StringVar(&config.VisionProvider, "vision-provider", defaultCLIVisionProvider(), "OCR provider (apple/paddle/local/openai/azure/google/aws)")
	flag.StringVar(&config.VisionLang, "vision-lang", "ch", "OCR language")
	flag.Float64Var(&config.VisionMinConfidence, "vision-min-confidence", 0.5, "Minimum confidence for detect-ui")
	flag.BoolVar(&config.VisionIncludeRaw, "vision-include-raw", false, "Include raw provider response in OCR output")
	flag.StringVar(&config.MacPermissionHelper, "mac-permission-helper", "", "Internal macOS permission helper mode")
	flag.StringVar(&config.MacPermissionTarget, "mac-permission-target", "", "Internal macOS permission helper target app")
	flag.StringVar(&config.NativeExtension, "native-extension", "", "Call a Native Process Extension executable directly")
	flag.StringVar(&config.NativeMethod, "native-method", "", "Native Process Extension method")
	flag.StringVar(&config.NativeParams, "native-params", "{}", "Native Process Extension params as a JSON object")
	flag.IntVar(&config.NativeTimeoutMS, "native-timeout-ms", 3000, "Native Process Extension timeout in milliseconds")
	flag.StringVar(&config.NativeRequestID, "native-request-id", "", "Optional Native Process Extension request id")

	flag.Parse()
	overrides := consoleOverridesFromVisitedFlags(flag.CommandLine, config)
	consoleSettings, err := resolveConsoleSettingsFromProcess(overrides)
	if err != nil {
		config.consoleConfigErr = err
		return config
	}
	config.ConsoleMode = consoleSettings.Mode
	config.ConsoleCategories = consoleSettings.Categories
	config.OutputFormat = consoleSettings.OutputFormat
	return config
}

func defaultCLIVisionProvider() string {
	if runtime.GOOS == "darwin" {
		return "apple"
	}
	return "paddle"
}

func resolveCustomUIActivation(config *Config) error {
	if config == nil {
		return nil
	}
	config.customUIResolveOnce.Do(func() {
		useWorkingDirectory := isAutoRunJs || strings.EqualFold(filepath.Base(strings.TrimSpace(config.ScriptPath)), "tm.config.js")
		activation, err := runtimeconfig.ResolveUI(runtimeconfig.UIResolveOptions{
			ForceDisable:        config.CustomUIDisabled,
			ForceEnable:         config.CustomUI,
			ExplicitConfigPath:  config.RuntimeConfigPath,
			ScriptPath:          config.ScriptPath,
			UseWorkingDirectory: useWorkingDirectory,
		})
		if err != nil {
			config.customUIResolveErr = err
			return
		}
		config.CustomUI = activation.Enabled
		config.CustomUIActivationSource = activation.Source
		config.ResolvedRuntimeConfigPath = activation.ConfigPath
	})
	return config.customUIResolveErr
}

var isAutoRunJs bool = false

func main() {
	os.Stdout.Sync()
	if aicli.IsCommand(os.Args[1:]) {
		os.Exit(aicli.Execute(os.Args[1:], os.Stdout, os.Stderr))
	}
	if automation.MacOSNotificationHelperRequested(os.Args[1:]) {
		os.Exit(automation.RunMacOSNotificationHelper(os.Stdin, os.Stdout, os.Stderr))
	}
	if automation.MacOSRegionSelectorHelperRequested(os.Args[1:]) {
		os.Exit(automation.RunMacOSRegionSelectorHelper(os.Stdin, os.Stdout, os.Stderr))
	}
	nativeMode := nativeExtensionCLIRequested(os.Args[1:])

	defer func() {
		if r := recover(); r != nil {
			if nativeMode {
				_ = writeNativeExtensionCLIError(os.Stdout, nativeExtensionCLIError{
					Code:    "internal_error",
					Message: "native extension CLI failed unexpectedly",
				}, map[string]any{})
				fmt.Fprintf(os.Stderr, "native extension CLI panic: %v\n", r)
				os.Exit(1)
			}
			fmt.Printf("Recovered from panic: %v\n", r)
			if len(os.Args) == 1 {
				fmt.Println("\nPress 'Enter' to exit...")
				fmt.Scanln()
			}
			os.Exit(1)
		}
	}()

	config := parseFlags()
	if nativeMode {
		host := nativeextension.NewHost()
		os.Exit(executeNativeExtensionCLI(context.Background(), config, os.Stdout, os.Stderr, host))
	}
	if handled, code := handleInternalMacPermissionHelper(config); handled {
		os.Exit(code)
	}
	if config.consoleConfigErr != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] OpenDesk console configuration: %v\n", config.consoleConfigErr)
		os.Exit(2)
	}
	selection := buildExecutionConsoleSelection(config)

	if shouldEchoStartupCategory("framework", selection) {
		fmt.Printf("robotgo version: %s\n", robotgo.Version)
		fmt.Println("[DEBUG] Program starting...")
	}
	// Note: initRuntime is now only called in legacy mode when needed

	// 检查是否是双击启动（无参数启动）
	if len(os.Args) == 1 {
		isAutoRunJs = true
		config.HttpMode = true // 双击启动时默认启用 HTTP 模式
		if shouldEchoStartupCategory("framework", selection) {
			fmt.Println("[DEBUG] Double-clicked detected. Setting default HTTP mode.")
		}
	}

	// 如果是双击启动
	if isAutoRunJs {
		// 尝试查找和执行脚本
		scriptFile, err := findScriptFile()
		if err != nil {
			if shouldEchoStartupCategory("framework", selection) {
				fmt.Printf("[INFO] No tm.config.js found: %v\n", err)
			}
		} else {
			if shouldEchoStartupCategory("framework", selection) {
				fmt.Printf("[INFO] Found script file: %s\n", scriptFile)
			}
			config.ScriptPath = scriptFile

			// The script starts only after the App has reserved its HTTP socket
			// and completed service startup. That prevents a duplicate Finder
			// launch from running tm.config.js before it discovers the existing
			// OpenDesk service.
		}

		// 启动 HTTP 服务器（默认行为）
		if shouldEchoStartupCategory("framework", selection) {
			fmt.Println("[INFO] Starting HTTP server...")
		}
		if err := startHttpServer(config.Port, config); err != nil {
			exitHTTPStartupFailure(err, config.Port)
		}
		return
	}

	// 命令行视觉模式（不依赖 HTTP）
	if config.VisionOCRImagePath != "" || config.VisionDetectImagePath != "" {
		if err := executeVisionCLI(config); err != nil {
			fmt.Printf("[ERROR] Vision CLI execution failed: %v\n", err)
			os.Exit(1)
		}

		if config.HttpMode {
			if err := startHttpServer(config.Port, config); err != nil {
				exitHTTPStartupFailure(err, config.Port)
			}
		}
		return
	}

	// 命令行模式的处理
	if hasScriptSource(config) {
		if config.ScriptPath != "" {
			if shouldEchoStartupCategory("framework", selection) {
				fmt.Printf("[DEBUG] Executing script: %s\n", config.ScriptPath)
			}
		} else if config.ScriptText != "" {
			if shouldEchoStartupCategory("framework", selection) {
				fmt.Println("[DEBUG] Executing inline script text")
			}
		} else if config.ScriptStdin {
			if shouldEchoStartupCategory("framework", selection) {
				fmt.Println("[DEBUG] Executing script from stdin")
			}
		}

		if err := executeScript(config); err != nil {
			if errors.Is(err, errScriptInstanceReplaced) {
				fmt.Println("[INFO] Script execution was replaced by a newer invocation")
				return
			}
			fmt.Printf("[ERROR] Script execution failed: %v\n", err)
			os.Exit(1)
		}

		if shouldEchoStartupCategory("framework", selection) {
			fmt.Println("[DEBUG] Script execution completed")
		}

		// 如果指定了 HTTP 模式，继续运行 HTTP 服务器
		if config.HttpMode {
			if err := startHttpServer(config.Port, config); err != nil {
				exitHTTPStartupFailure(err, config.Port)
			}
		}
		return
	}

	// 没有脚本的情况
	fmt.Println("Please specify a script source: -script path/to/script.[txt|js], -script-text 'code', or -script-stdin")

	// 如果是 HTTP 模式，启动服务器
	if config.HttpMode {
		if err := startHttpServer(config.Port, config); err != nil {
			exitHTTPStartupFailure(err, config.Port)
		}
		return
	}

	if isAutoRunJs {
		fmt.Println("\nPress 'Enter' to exit...")
		fmt.Scanln()
	}
}

type nativeExtensionCaller interface {
	Call(context.Context, nativeextension.CallOptions) (nativeextension.CallResult, error)
}

type nativeExtensionCLIError struct {
	Code          string `json:"code"`
	Message       string `json:"message"`
	ExtensionCode string `json:"extensionCode,omitempty"`
}

type nativeExtensionCLISuccessEnvelope struct {
	OK       bool                     `json:"ok"`
	Result   any                      `json:"result"`
	Evidence nativeextension.Evidence `json:"evidence"`
}

type nativeExtensionCLIErrorEnvelope struct {
	OK       bool                    `json:"ok"`
	Error    nativeExtensionCLIError `json:"error"`
	Evidence any                     `json:"evidence"`
}

func nativeExtensionCLIRequested(args []string) bool {
	for _, arg := range args {
		if arg == "--" {
			return false
		}
		if arg == "-native-extension" || arg == "--native-extension" ||
			strings.HasPrefix(arg, "-native-extension=") || strings.HasPrefix(arg, "--native-extension=") {
			return true
		}
	}
	return false
}

func executeNativeExtensionCLI(ctx context.Context, config *Config, stdout, stderr io.Writer, caller nativeExtensionCaller) int {
	startedAt := time.Now()
	params, err := decodeNativeExtensionParams(config.NativeParams)
	if err != nil {
		return writeNativeExtensionCLIResult(stdout, stderr, nativeExtensionCLIError{
			Code:    "invalid_params",
			Message: err.Error(),
		}, nativeExtensionAttemptEvidence(config, nativeextension.CodeInvalidParams, startedAt))
	}

	result, err := caller.Call(ctx, nativeextension.CallOptions{
		Executable: config.NativeExtension,
		Method:     config.NativeMethod,
		Params:     params,
		Timeout:    time.Duration(config.NativeTimeoutMS) * time.Millisecond,
		RequestID:  config.NativeRequestID,
	})
	if err != nil {
		errorBody := nativeExtensionCLIError{Code: "native_extension_error", Message: err.Error()}
		evidence := result.Evidence
		var callErr *nativeextension.CallError
		if errors.As(err, &callErr) {
			errorBody.Code = fmt.Sprint(callErr.Code)
			errorBody.Message = callErr.Message
			evidence = callErr.Evidence
			if callErr.ExtensionError != nil {
				errorBody.ExtensionCode = fmt.Sprint(callErr.ExtensionError.Code)
			}
		}
		return writeNativeExtensionCLIResult(stdout, stderr, errorBody, evidence)
	}

	if err := json.NewEncoder(stdout).Encode(nativeExtensionCLISuccessEnvelope{
		OK:       true,
		Result:   result.Result,
		Evidence: result.Evidence,
	}); err != nil {
		fmt.Fprintf(stderr, "failed to encode native extension CLI response: %v\n", err)
		return 1
	}
	return 0
}

func nativeExtensionAttemptEvidence(config *Config, errorCode nativeextension.ErrorCode, startedAt time.Time) nativeextension.Evidence {
	evidence := nativeextension.Evidence{
		Protocol:        nativeextension.ProtocolName,
		ProtocolVersion: nativeextension.ProtocolVersion,
		Status:          nativeextension.StatusFailed,
		ErrorCode:       errorCode,
	}
	if config != nil {
		evidence.Executable = strings.TrimSpace(config.NativeExtension)
		evidence.Method = strings.TrimSpace(config.NativeMethod)
		evidence.RequestID = strings.TrimSpace(config.NativeRequestID)
	}
	evidence.DurationMS = time.Since(startedAt).Milliseconds()
	return evidence
}

func decodeNativeExtensionParams(raw string) (map[string]any, error) {
	var params map[string]any
	if err := json.Unmarshal([]byte(raw), &params); err != nil {
		return nil, fmt.Errorf("native params must be a JSON object: %w", err)
	}
	if params == nil {
		return nil, fmt.Errorf("native params must be a JSON object")
	}
	return params, nil
}

func writeNativeExtensionCLIResult(stdout, stderr io.Writer, cliErr nativeExtensionCLIError, evidence any) int {
	if err := writeNativeExtensionCLIError(stdout, cliErr, evidence); err != nil {
		fmt.Fprintf(stderr, "failed to encode native extension CLI error: %v\n", err)
	}
	return 1
}

func writeNativeExtensionCLIError(stdout io.Writer, cliErr nativeExtensionCLIError, evidence any) error {
	return json.NewEncoder(stdout).Encode(nativeExtensionCLIErrorEnvelope{
		OK:       false,
		Error:    cliErr,
		Evidence: evidence,
	})
}

func handleInternalMacPermissionHelper(config *Config) (bool, int) {
	if config == nil {
		return false, 0
	}
	switch strings.TrimSpace(config.MacPermissionHelper) {
	case "":
		return false, 0
	case "automation-prompt":
		target := strings.TrimSpace(config.MacPermissionTarget)
		if target == "" {
			target = "System Events"
		}
		if automation.TriggerMacAutomationPermissionHelper(target) {
			return true, 0
		}
		return true, 1
	default:
		fmt.Fprintf(os.Stderr, "unknown mac permission helper: %s\n", config.MacPermissionHelper)
		return true, 2
	}
}

func findScriptFile() (string, error) {
	fmt.Println("[DEBUG] Looking for tm.config.js...")

	// 只查找 tm.config.js
	if _, err := os.Stat("tm.config.js"); err == nil {
		fmt.Println("[DEBUG] Found tm.config.js")
		return "tm.config.js", nil
	}

	fmt.Println("[DEBUG] tm.config.js not found")
	return "", fmt.Errorf("tm.config.js not found")
}

// applyWorkingDirectory changes the process directory only after confirming
// that the requested path exists and is a directory. It is intentionally kept
// separate from flag parsing so command entrypoints can opt into it explicitly.
func applyWorkingDirectory(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("working directory is empty")
	}
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat working directory %q: %w", path, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("working directory %q is not a directory", path)
	}
	if err := os.Chdir(path); err != nil {
		return fmt.Errorf("change working directory to %q: %w", path, err)
	}
	return nil
}

// Helper function to create standardized API response
type APIResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type RunArtifacts struct {
	Dir                string    `json:"dir"`
	Source             string    `json:"source"`
	Ext                string    `json:"ext"`
	ScriptHash         string    `json:"script_hash"`
	StartedAt          time.Time `json:"started_at"`
	StdoutPath         string    `json:"stdout_path"`
	StderrPath         string    `json:"stderr_path"`
	ScriptSnapshotPath string    `json:"script_snapshot_path"`
	SummaryPath        string    `json:"summary_path"`
}

type RunSummary struct {
	Source             string `json:"source"`
	Ext                string `json:"ext"`
	ScriptHash         string `json:"script_hash"`
	Success            bool   `json:"success"`
	Error              string `json:"error,omitempty"`
	DurationMs         int64  `json:"duration_ms"`
	StdoutPath         string `json:"stdout_path,omitempty"`
	StderrPath         string `json:"stderr_path,omitempty"`
	ScriptSnapshotPath string `json:"script_snapshot_path,omitempty"`
	StartedAt          string `json:"started_at"`
	FinishedAt         string `json:"finished_at"`
}

// ConsoleSelection 描述当前终端应回显哪些日志类别。
type ConsoleSelection struct {
	Mode         string
	Categories   map[string]bool
	IncludeDebug bool
}

type teeCapture struct {
	origStdout *os.File
	origStderr *os.File
	stdoutR    *os.File
	stdoutW    *os.File
	stderrR    *os.File
	stderrW    *os.File
	stdoutFile *os.File
	stderrFile *os.File
	selection  ConsoleSelection
	wg         sync.WaitGroup
}

func writeJSONResponse(w http.ResponseWriter, response APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Modified handleScriptExecution function to run scripts directly in the runtime
func handleScriptExecution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Method not allowed",
		})
		return
	}

	// Parse request body
	var requestBody struct {
		Script *string `json:"script"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Failed to parse request body: " + err.Error(),
		})
		return
	}

	// 打印接收到的消息
	fmt.Println("[DEBUG] Received script execution request")

	// Check for missing script parameter
	if requestBody.Script == nil {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Missing required parameter: script",
		})
		return
	}

	// Check for empty script content
	if strings.TrimSpace(*requestBody.Script) == "" {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Script content cannot be empty",
		})
		return
	}

	// 打印脚本长度和前20个字符
	scriptContent := *requestBody.Script
	scriptLength := len(scriptContent)
	previewLength := 20
	if scriptLength < previewLength {
		previewLength = scriptLength
	}
	scriptPreview := scriptContent[:previewLength]
	scriptHash := computeScriptHash([]byte(scriptContent))
	fmt.Printf("[DEBUG] Script length: %d characters\n", scriptLength)
	fmt.Printf("[DEBUG] Script hash: %s\n", scriptHash)
	fmt.Printf("[DEBUG] Script preview: %s\n", scriptPreview)

	// Set script status to running
	updateScriptStatus("running", nil)

	// Execute script in a new goroutine directly using the runtime
	go func() {
		scriptContent := *requestBody.Script
		fmt.Printf("[%s] Executing script directly in runtime\n",
			time.Now().Format("15:04:05.000"))

		if err := executeScriptContent([]byte(scriptContent), "http:inline", ".js", 30); err != nil {
			fmt.Printf("[%s] Script execution error: %v\n",
				time.Now().Format("15:04:05.000"),
				err)
			updateScriptStatus("error", err)
		} else {
			updateScriptStatus("completed", nil)
		}
	}()

	// Return success response
	writeJSONResponse(w, APIResponse{
		Code:    0,
		Message: "Script execution started successfully",
	})
}

// 全局变量用于跟踪脚本执行状态
var scriptStatus = struct {
	Status    string
	StartTime time.Time
	Error     string
}{
	Status: "idle",
}

// 用于更新脚本状态的辅助函数
func updateScriptStatus(status string, err error) {
	scriptStatus.Status = status
	if err != nil {
		scriptStatus.Error = err.Error()
	} else {
		scriptStatus.Error = ""
	}
	if status == "running" {
		scriptStatus.StartTime = time.Now()
	}
}

func executeScript(config *Config) error {
	if err := resolveCustomUIActivation(config); err != nil {
		return err
	}
	content, sourceLabel, ext, err := resolveScriptSource(config)
	if err != nil {
		return err
	}

	// A direct file invocation is replaceable by the next invocation of that
	// same file. The old execution receives a local takeover request, cancels
	// through its Runtime context, and releases global shortcuts before the new
	// execution can start. Inline/stdin sources have no stable file identity and
	// deliberately keep their existing independent-execution behavior.
	executionSignals := newDirectExecutionSignalController(context.Background())
	defer executionSignals.Stop()
	executionContext := executionSignals.Context()
	var instanceLease *scriptInstanceLease
	if config.ScriptPath != "" {
		instanceLease, err = acquireReplacingScriptInstance(config.ScriptPath, executionSignals.Cancel)
		if err != nil {
			return err
		}
		defer instanceLease.Close()
	}

	selection := buildExecutionConsoleSelection(config)
	executionID := pkgExecution.NewExecutionID("direct")
	artifacts, err := pkgExecution.PrepareArtifacts(config.LogDir, executionID, ext)
	if err != nil {
		return err
	}
	if err := persistExecutionSnapshots(config.SaveLastScript, artifacts.ScriptSnapshotPath, content); err != nil {
		return err
	}

	request := pkgExecution.Request{
		Context:              executionContext,
		ExpectedCancellation: func() bool { return instanceLease != nil && instanceLease.WasReplaced() },
		ExecutionID:          executionID,
		SourceLabel:          sourceLabel,
		Ext:                  ext,
		StackMode:            config.StackMode,
		ScriptHash:           pkgExecution.ComputeScriptHash(content),
		ScriptContent:        content,
		TimeoutMinutes:       config.Timeout,
		// NativeExtensions is available to every local CLI JavaScript
		// execution. The remote HTTP/MCP paths construct their own Requests and
		// leave this capability false; the unsafe V0 surface remains separately
		// gated below.
		EnableNativeExtensions:          true,
		EnableUnsafeNativeExtensionCall: config.ExperimentalUnsafeNativeExtensionCall,
		EnableCommand:                   true,
		EnableCustomUI:                  config.CustomUI,
		CustomUIActivationSource:        config.CustomUIActivationSource,
		CustomUIHostPath:                config.CustomUIHostPath,
		Artifacts:                       artifacts,
		Selection: pkgExecution.TerminalSelection{
			Mode:         selection.Mode,
			Categories:   copyConsoleCategories(selection.Categories),
			IncludeDebug: selection.IncludeDebug,
		},
	}

	result, summary, execErr := pkgExecution.Run(request)
	if shouldUseJSONOutput(config) {
		if err := printAgentSummaryJSON(summary); err != nil {
			return err
		}
	} else {
		printExecutionSummary(selection, result)
	}
	if execErr != nil {
		if instanceLease != nil && instanceLease.WasReplaced() && errors.Is(execErr, context.Canceled) {
			return errScriptInstanceReplaced
		}
		return fmt.Errorf("script execution failed: %v", execErr)
	}
	return nil
}

func buildExecutionConsoleSelection(config *Config) ConsoleSelection {
	if config == nil {
		return buildConsoleSelection(defaultConsoleMode, "")
	}
	if shouldUseJSONOutput(config) {
		return buildConsoleSelection("agent", "")
	}
	return buildConsoleSelection(config.ConsoleMode, config.ConsoleCategories)
}

func shouldUseJSONOutput(config *Config) bool {
	if config == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(config.OutputFormat), "json") {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(config.ConsoleMode), "agent")
}

func copyConsoleCategories(categories map[string]bool) map[string]bool {
	copied := make(map[string]bool, len(categories))
	for key, value := range categories {
		copied[key] = value
	}
	return copied
}

func persistExecutionSnapshots(explicitPath, artifactPath string, content []byte) error {
	targets := make([]string, 0, 2)
	if strings.TrimSpace(explicitPath) != "" {
		targets = append(targets, explicitPath)
	}
	if strings.TrimSpace(artifactPath) != "" {
		targets = append(targets, artifactPath)
	}

	seen := make(map[string]struct{}, len(targets))
	for _, target := range targets {
		if _, ok := seen[target]; ok {
			continue
		}
		seen[target] = struct{}{}
		if err := saveScriptSnapshot(target, content); err != nil {
			return err
		}
	}
	return nil
}

func printExecutionSummary(selection ConsoleSelection, result pkgExecution.ExecutionResult) {
	if !selection.Categories["summary"] {
		return
	}
	status := string(result.Status)
	if status == "" {
		status = "unknown"
	}
	fmt.Printf("[SUMMARY] status=%s duration=%dms source=%s hash=%s\n", status, result.DurationMs, result.Source, result.ScriptHash)
	fmt.Printf("[SUMMARY] logs=%s stdout=%s stderr=%s\n", result.Artifacts.RunDir, result.Artifacts.StdoutPath, result.Artifacts.StderrPath)
	fmt.Printf("[SUMMARY] script_snapshot=%s summary=%s agent_summary=%s events=%s\n", result.Artifacts.ScriptSnapshotPath, result.Artifacts.SummaryPath, result.Artifacts.AgentSummaryPath, result.Artifacts.EventLogPath)
}

func printAgentSummaryJSON(summary pkgExecution.AgentSummary) error {
	data, err := json.MarshalIndent(summary, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal agent summary: %w", err)
	}
	fmt.Println(string(data))
	return nil
}

func executeScriptContent(content []byte, sourceLabel, ext string, timeoutMinutes int) error {
	executionID := pkgExecution.NewExecutionID("legacy-http")
	artifacts, err := pkgExecution.PrepareArtifacts("", executionID, ext)
	if err != nil {
		return err
	}
	request := pkgExecution.Request{
		ExecutionID: executionID, SourceLabel: sourceLabel, Ext: ext,
		ScriptHash: pkgExecution.ComputeScriptHash(content), ScriptContent: content,
		TimeoutMinutes: timeoutMinutes, Artifacts: artifacts,
		Selection: pkgExecution.TerminalSelection{Mode: "agent", Categories: map[string]bool{"error": true}},
	}
	_, _, err = pkgExecution.Run(request)
	return err
}

func hasScriptSource(config *Config) bool {
	return config.ScriptPath != "" || config.ScriptText != "" || config.ScriptStdin
}

func resolveScriptSource(config *Config) ([]byte, string, string, error) {
	if config == nil {
		return nil, "", "", fmt.Errorf("config is required")
	}

	sourceCount := 0
	if config.ScriptPath != "" {
		sourceCount++
	}
	if config.ScriptText != "" {
		sourceCount++
	}
	if config.ScriptStdin {
		sourceCount++
	}
	if sourceCount == 0 {
		return nil, "", "", fmt.Errorf("no script source provided")
	}
	if sourceCount > 1 {
		return nil, "", "", fmt.Errorf("please specify only one script source: -script, -script-text, or -script-stdin")
	}

	if config.ScriptPath != "" {
		content, err := os.ReadFile(config.ScriptPath)
		if err != nil {
			return nil, "", "", fmt.Errorf("failed to read script: %v", err)
		}
		ext := strings.ToLower(filepath.Ext(config.ScriptPath))
		if ext == "" {
			ext = ".js"
		}
		return content, "file:" + config.ScriptPath, ext, nil
	}

	if config.ScriptText != "" {
		return []byte(config.ScriptText), "inline", ".js", nil
	}

	content, err := io.ReadAll(os.Stdin)
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to read script from stdin: %v", err)
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return nil, "", "", fmt.Errorf("stdin script content cannot be empty")
	}
	return content, "stdin", ".js", nil
}

func saveScriptSnapshot(path string, content []byte) error {
	if path == "" {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("failed to create script snapshot directory: %v", err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("failed to save script snapshot: %v", err)
	}
	return nil
}

func computeScriptHash(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

func prepareRunArtifacts(config *Config, sourceLabel, ext string, content []byte, startedAt time.Time) (*RunArtifacts, error) {
	if config == nil {
		return nil, fmt.Errorf("config is required")
	}

	logDir := strings.TrimSpace(config.LogDir)
	if logDir == "" && (config.ScriptText != "" || config.ScriptStdin) {
		logDir = filepath.Join(".runtime", "runs", "direct-"+startedAt.Format("20060102-150405"))
	}
	if logDir == "" {
		return nil, nil
	}
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create log directory: %v", err)
	}

	return &RunArtifacts{
		Dir:                logDir,
		Source:             sourceLabel,
		Ext:                ext,
		ScriptHash:         computeScriptHash(content),
		StartedAt:          startedAt,
		StdoutPath:         filepath.Join(logDir, "stdout.log"),
		StderrPath:         filepath.Join(logDir, "stderr.log"),
		ScriptSnapshotPath: filepath.Join(logDir, "script_snapshot"+ext),
		SummaryPath:        filepath.Join(logDir, "summary.json"),
	}, nil
}

func persistScriptSnapshots(explicitPath string, artifacts *RunArtifacts, content []byte) error {
	targets := make([]string, 0, 2)
	if strings.TrimSpace(explicitPath) != "" {
		targets = append(targets, explicitPath)
	}
	if artifacts != nil && strings.TrimSpace(artifacts.ScriptSnapshotPath) != "" {
		targets = append(targets, artifacts.ScriptSnapshotPath)
	}

	seen := make(map[string]struct{}, len(targets))
	for _, target := range targets {
		if _, ok := seen[target]; ok {
			continue
		}
		seen[target] = struct{}{}
		if err := saveScriptSnapshot(target, content); err != nil {
			return err
		}
	}
	return nil
}

func startTeeCapture(stdoutPath, stderrPath string, selection ConsoleSelection) (*teeCapture, error) {
	var stdoutFile *os.File
	var stderrFile *os.File
	var err error

	if stdoutPath != "" {
		stdoutFile, err = os.Create(stdoutPath)
		if err != nil {
			return nil, fmt.Errorf("failed to create stdout log: %v", err)
		}
	}
	if stderrPath != "" {
		stderrFile, err = os.Create(stderrPath)
		if err != nil {
			if stdoutFile != nil {
				_ = stdoutFile.Close()
			}
			return nil, fmt.Errorf("failed to create stderr log: %v", err)
		}
	}

	stdoutR, stdoutW, err := os.Pipe()
	if err != nil {
		if stdoutFile != nil {
			_ = stdoutFile.Close()
		}
		if stderrFile != nil {
			_ = stderrFile.Close()
		}
		return nil, fmt.Errorf("failed to create stdout pipe: %v", err)
	}
	stderrR, stderrW, err := os.Pipe()
	if err != nil {
		if stdoutFile != nil {
			_ = stdoutFile.Close()
		}
		if stderrFile != nil {
			_ = stderrFile.Close()
		}
		_ = stdoutR.Close()
		_ = stdoutW.Close()
		return nil, fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	capture := &teeCapture{
		origStdout: os.Stdout,
		origStderr: os.Stderr,
		stdoutR:    stdoutR,
		stdoutW:    stdoutW,
		stderrR:    stderrR,
		stderrW:    stderrW,
		stdoutFile: stdoutFile,
		stderrFile: stderrFile,
		selection:  selection,
	}

	capture.wg.Add(2)
	go func() {
		defer capture.wg.Done()
		capture.streamLines(capture.stdoutR, capture.origStdout, capture.stdoutFile)
	}()
	go func() {
		defer capture.wg.Done()
		capture.streamLines(capture.stderrR, capture.origStderr, capture.stderrFile)
	}()

	os.Stdout = stdoutW
	os.Stderr = stderrW
	return capture, nil
}

func (c *teeCapture) Close() error {
	if c == nil {
		return nil
	}

	os.Stdout = c.origStdout
	os.Stderr = c.origStderr

	_ = c.stdoutW.Close()
	_ = c.stderrW.Close()
	c.wg.Wait()

	_ = c.stdoutR.Close()
	_ = c.stderrR.Close()

	if c.stdoutFile != nil {
		if err := c.stdoutFile.Close(); err != nil {
			if c.stderrFile != nil {
				_ = c.stderrFile.Close()
			}
			return err
		}
	}
	if c.stderrFile != nil {
		return c.stderrFile.Close()
	}
	return nil
}

func (c *teeCapture) streamLines(reader *os.File, terminal *os.File, file *os.File) {
	scanner := bufio.NewScanner(reader)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if file != nil {
			_, _ = file.WriteString(line + "\n")
		}
		if shouldEchoConsoleLine(c.selection, line) {
			_, _ = terminal.WriteString(line + "\n")
		}
	}
}

// normalizeConsoleMode 统一模式名称，避免无效值导致行为漂移。
func normalizeConsoleMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", "normal":
		return defaultConsoleMode
	case "full":
		return "full"
	case "script":
		return "script"
	case "meta":
		return "meta"
	case "summary":
		return "summary"
	case "quiet":
		return "quiet"
	case "agent":
		return "agent"
	default:
		return defaultConsoleMode
	}
}

// parseConsoleCategories 解析命令行传入的日志分类覆盖项。
func parseConsoleCategories(raw string) map[string]bool {
	result := map[string]bool{}
	for _, item := range strings.Split(raw, ",") {
		key := strings.ToLower(strings.TrimSpace(item))
		if key == "" {
			continue
		}
		result[key] = true
	}
	return result
}

// defaultConsoleCategories 按模式生成默认日志分类集合。
func defaultConsoleCategories(mode string) map[string]bool {
	switch normalizeConsoleMode(mode) {
	case "normal":
		// Normal mode is the end-user default: useful script output without
		// framework chatter or JavaScript debug-level events.
		return map[string]bool{"script": true, "summary": true, "error": true}
	case "full":
		return map[string]bool{"framework": true, "meta": true, "script": true, "summary": true, "error": true}
	case "script":
		// script 模式保留脚本日志、摘要和错误。
		return map[string]bool{"script": true, "summary": true, "error": true}
	case "meta":
		// meta 模式用于排查执行过程，只保留执行元信息和错误。
		return map[string]bool{"meta": true, "error": true}
	case "summary":
		// summary 模式只输出最终摘要，适合低 token 场景。
		return map[string]bool{"summary": true, "error": true}
	case "quiet":
		// quiet 模式默认只保留错误。
		return map[string]bool{"error": true}
	case "agent":
		// agent 模式默认不打印噪音，只保留错误到终端。
		return map[string]bool{"error": true}
	default:
		return map[string]bool{"script": true, "summary": true, "error": true}
	}
}

// buildConsoleSelection 先按模式取默认集合，再允许命令行分类覆盖。
func buildConsoleSelection(mode, categories string) ConsoleSelection {
	normalizedMode := normalizeConsoleMode(mode)
	selection := ConsoleSelection{
		Mode:         normalizedMode,
		Categories:   defaultConsoleCategories(normalizedMode),
		IncludeDebug: normalizedMode == "full" || normalizedMode == "script" || normalizedMode == "meta",
	}

	override := parseConsoleCategories(categories)
	if len(override) > 0 {
		selection.Categories = override
	}
	return selection
}

func shouldEchoStartupCategory(category string, selection ConsoleSelection) bool {
	if selection.Mode == "agent" {
		return false
	}
	return selection.Categories[category]
}

// shouldEchoConsoleLine 根据日志分类决定是否回显到终端。
func shouldEchoConsoleLine(selection ConsoleSelection, line string) bool {
	rawLine := strings.TrimSpace(line)
	if rawLine == "" {
		return false
	}
	line = stripANSI(rawLine)
	if !selection.IncludeDebug && strings.HasPrefix(line, "[DEBUG]") {
		return false
	}

	category := classifyConsoleLine(line)
	return selection.Categories[category]
}

// classifyConsoleLine 将终端输出分到固定类别，便于按需显示。
func classifyConsoleLine(line string) string {
	if isErrorConsoleLine(line) {
		return "error"
	}
	if strings.HasPrefix(line, "[SUMMARY]") {
		return "summary"
	}
	if isFrameworkNoiseLine(line) {
		return "framework"
	}
	if strings.HasPrefix(line, "[LOG]") {
		return "script"
	}
	if strings.Contains(line, "Starting script execution") ||
		strings.Contains(line, "Script source:") ||
		strings.Contains(line, "Script hash:") ||
		strings.Contains(line, "开始执行 JavaScript") ||
		strings.Contains(line, "JavaScript 执行完成") ||
		strings.Contains(line, "Script execution completed") {
		return "meta"
	}
	return "framework"
}

func isErrorConsoleLine(line string) bool {
	line = stripANSI(line)
	return strings.HasPrefix(line, "[ERROR]") ||
		strings.Contains(line, "Script execution failed") ||
		strings.Contains(line, "Recovered from panic") ||
		strings.Contains(line, "panic:")
}

func isFrameworkNoiseLine(line string) bool {
	line = stripANSI(line)
	noisePrefixes := []string{
		"robotgo version:",
		"[DEBUG]",
		"Loaded polyfill:",
		"Loaded JS library:",
		"JS environment:",
		"[build]",
		"[codesign]",
		"ld: warning:",
	}
	for _, prefix := range noisePrefixes {
		if strings.HasPrefix(line, prefix) {
			return true
		}
	}

	noiseContains := []string{
		"Polyfilling page functions",
		"Timer polyfills loaded successfully",
		"Sleep utility functions loaded successfully",
		"Probing polyfills in:",
		"Probing jslibs in:",
		"Using polyfills from:",
		"Using jslibs from:",
		"Looking for polyfills in:",
		"Looking for JS libraries in:",
		"Executable directory:",
	}
	for _, part := range noiseContains {
		if strings.Contains(line, part) {
			return true
		}
	}
	return false
}

func stripANSI(s string) string {
	var b strings.Builder
	b.Grow(len(s))

	for i := 0; i < len(s); i++ {
		if s[i] == 0x1b && i+1 < len(s) && s[i+1] == '[' {
			i += 2
			for i < len(s) {
				c := s[i]
				if (c >= '0' && c <= '9') || c == ';' {
					i++
					continue
				}
				break
			}
			continue
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

func writeRunSummary(artifacts *RunArtifacts, duration time.Duration, execErr error) error {
	if artifacts == nil {
		return nil
	}

	summary := RunSummary{
		Source:             artifacts.Source,
		Ext:                artifacts.Ext,
		ScriptHash:         artifacts.ScriptHash,
		Success:            execErr == nil,
		DurationMs:         duration.Milliseconds(),
		StdoutPath:         artifacts.StdoutPath,
		StderrPath:         artifacts.StderrPath,
		ScriptSnapshotPath: artifacts.ScriptSnapshotPath,
		StartedAt:          artifacts.StartedAt.Format(time.RFC3339),
		FinishedAt:         time.Now().Format(time.RFC3339),
	}
	if execErr != nil {
		summary.Error = execErr.Error()
	}

	data, err := json.MarshalIndent(summary, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal run summary: %v", err)
	}
	if err := os.WriteFile(artifacts.SummaryPath, data, 0o644); err != nil {
		return fmt.Errorf("failed to write run summary: %v", err)
	}
	return nil
}

// printRunSummary 按当前输出分类决定是否把摘要回显到终端。
func printRunSummary(selection ConsoleSelection, artifacts *RunArtifacts, duration time.Duration, execErr error) {
	if artifacts == nil {
		return
	}
	if !selection.Categories["summary"] {
		return
	}

	status := "success"
	if execErr != nil {
		status = "failed"
	}

	fmt.Printf("[SUMMARY] status=%s duration=%v source=%s hash=%s\n", status, duration, artifacts.Source, artifacts.ScriptHash)
	fmt.Printf("[SUMMARY] logs=%s stdout=%s stderr=%s\n", artifacts.Dir, artifacts.StdoutPath, artifacts.StderrPath)
	fmt.Printf("[SUMMARY] script_snapshot=%s summary=%s\n", artifacts.ScriptSnapshotPath, artifacts.SummaryPath)
}

func executeVisionCLI(config *Config) error {
	v := automation.NewVision()

	if config.VisionOCRImagePath != "" {
		opts := map[string]interface{}{
			"imagePath":     config.VisionOCRImagePath,
			"provider":      config.VisionProvider,
			"lang":          config.VisionLang,
			"includeRaw":    config.VisionIncludeRaw,
			"timeoutMs":     12000,
			"minConfidence": config.VisionMinConfidence,
		}
		result, err := v.RunOCR(opts)
		if err != nil {
			return err
		}
		fmt.Println("[VISION_OCR_RESULT]")
		if err := printPrettyJSON(result); err != nil {
			return err
		}
	}

	detectImage := config.VisionDetectImagePath
	if detectImage == "" {
		detectImage = config.VisionOCRImagePath
	}

	if detectImage != "" && config.VisionTargetText != "" {
		opts := map[string]interface{}{
			"imagePath":         detectImage,
			"provider":          config.VisionProvider,
			"lang":              config.VisionLang,
			"targetText":        config.VisionTargetText,
			"matchMode":         "contains",
			"minConfidence":     config.VisionMinConfidence,
			"defaultRole":       "text",
			"includeRaw":        config.VisionIncludeRaw,
			"detectOrientation": true,
		}
		result, err := v.DetectUI(opts)
		if err != nil {
			return err
		}
		fmt.Println("[VISION_DETECT_UI_RESULT]")
		if err := printPrettyJSON(result); err != nil {
			return err
		}
	}

	return nil
}

func printPrettyJSON(v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal result json: %w", err)
	}
	fmt.Println(string(data))
	return nil
}

// 获取本机IP地址
func getLocalIPs() []string {
	var ips []string
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ips
	}

	for _, addr := range addrs {
		// 检查ip地址判断是否回环地址
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				ips = append(ips, ipnet.IP.String())
			}
		}
	}
	return ips
}

// enableCORS adds CORS headers to the response
func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
}

// corsMiddleware wraps an http.HandlerFunc and adds CORS support
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// Modified startHttpServer function
func startHttpServer(port string, configs ...*Config) error {
	if strings.TrimSpace(port) == "" {
		port = "60844"
	}

	if !feature.UseDIContainer {
		fmt.Println("[WARN] USE_DI_CONTAINER=0 is a route-compatible alias; it now uses the unified execution server.")
	}
	var config *Config
	if len(configs) > 0 {
		config = configs[0]
	}
	return startContainerBasedServer(port, config)
}

func exitHTTPStartupFailure(err error, port string) {
	if err == nil {
		return
	}
	if reuseRunningOpenDesk(err, port) {
		fmt.Printf("[INFO] OpenDesk is already running at http://127.0.0.1:%s; reusing the existing desktop service.\n", port)
		return
	}
	fmt.Fprintf(os.Stderr, "[ERROR] OpenDesk did not start: %v\n", err)
	reportMacOSAppStartupFailure(err)
	os.Exit(1)
}

// startContainerBasedServer starts the HTTP server using the new container architecture
func startContainerBasedServer(port string, appConfig *Config) error {
	fmt.Println("[INFO] Starting server with container-based architecture")
	if err := resolveCustomUIActivation(appConfig); err != nil {
		return fmt.Errorf("custom UI configuration failed: %w", err)
	}

	// Reserve the socket before starting the Scheduler. A duplicate Finder
	// launch must fail at the ownership boundary, rather than briefly creating
	// a second Scheduler against the same persisted task database.
	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return fmt.Errorf("listen on port %s: %w", port, err)
	}
	listenerOwned := true
	defer func() {
		if listenerOwned {
			_ = listener.Close()
		}
	}()

	// Create container
	cfg := &pkgContainer.Config{
		RuntimePoolSize: 10,
	}
	if appConfig != nil {
		cfg.EnableCustomUI = appConfig.CustomUI
		cfg.CustomUIActivationSource = appConfig.CustomUIActivationSource
		cfg.CustomUIHostPath = appConfig.CustomUIHostPath
	}

	container, err := pkgContainer.NewContainer(cfg)
	if err != nil {
		return fmt.Errorf("create execution container: %w", err)
	}
	defer container.Close()

	schedulerDBPath := ""
	if appConfig != nil {
		schedulerDBPath = appConfig.SchedulerDBPath
	}
	schedulerStore, err := pkgScheduler.OpenStore(schedulerDBPath)
	if err != nil {
		return fmt.Errorf("open Scheduler database: %w", err)
	}
	defer schedulerStore.Close()
	scriptRoot, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("locate Scheduler script root: %w", err)
	}
	schedulerExecutor, err := pkgScheduler.NewScriptExecutor(scriptRoot, 30*time.Minute)
	if err != nil {
		return fmt.Errorf("initialize Scheduler executor: %w", err)
	}
	schedulerService, err := pkgScheduler.NewService(schedulerStore, schedulerExecutor, pkgScheduler.Options{ScriptRoot: scriptRoot})
	if err != nil {
		return fmt.Errorf("initialize Scheduler: %w", err)
	}
	if err := schedulerService.Start(context.Background()); err != nil {
		return fmt.Errorf("start Scheduler: %w", err)
	}
	defer func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = schedulerService.Close(shutdownContext)
	}()

	server := pkgHttp.NewServerWithScheduler(container, port, schedulerService)

	// Only advertise readiness after the scheduler is running and the socket is
	// reserved. This is the startup boundary used by the macOS status item.
	// 获取并打印本机IP地址
	ips := getLocalIPs()
	fmt.Println("\n可用的服务地址:")
	for _, ip := range ips {
		fmt.Printf("http://%s:%s\n", ip, port)
	}
	fmt.Printf("http://localhost:%s\n", port)
	fmt.Printf("Scheduler: http://127.0.0.1:%s/scheduler\n", port)
	fmt.Printf("Scheduler database: %s\n", schedulerStore.Path())
	fmt.Println("----------------------------------------")
	fmt.Printf("OpenDesk ready: http://127.0.0.1:%s/status (pid %d)\n", port, os.Getpid())
	fmt.Println("服务器已启动 (Container Mode)，按 Ctrl+C 关闭")
	if isAutoRunJs {
		startMacOSAppStatusItem(port)
	}
	// Run the server behind an explicit shutdown boundary so SIGINT/SIGTERM
	// cancel active JavaScript and drain native UI hosts before the process exits.
	serverDone := make(chan error, 1)
	listenerOwned = false
	go func() { serverDone <- server.Serve(listener) }()
	if isAutoRunJs && appConfig != nil && appConfig.ScriptPath != "" {
		go func() {
			fmt.Println("[INFO] Starting script execution...")
			if err := executeScript(appConfig); err != nil {
				if errors.Is(err, errScriptInstanceReplaced) {
					fmt.Println("[INFO] Script execution was replaced by a newer invocation")
					return
				}
				fmt.Printf("[ERROR] Script execution failed: %v\n", err)
				return
			}
			fmt.Println("[INFO] Script execution completed successfully")
		}()
	}
	shutdownSignals := make(chan os.Signal, 1)
	signal.Notify(shutdownSignals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(shutdownSignals)
	select {
	case err := <-serverDone:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("HTTP server failed: %w", err)
		}
	case received := <-shutdownSignals:
		fmt.Printf("[INFO] Received %s; draining HTTP executions\n", received)
		shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err := server.Shutdown(shutdownContext)
		cancel()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("HTTP server shutdown failed: %w", err)
		}
		if err := <-serverDone; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("HTTP server stopped unexpectedly: %w", err)
		}
	}
	return nil
}

// Modified handleStatus function
func handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Method not allowed",
		})
		return
	}

	if scriptStatus.Error != "" {
		writeJSONResponse(w, APIResponse{
			Code:    500,
			Message: scriptStatus.Error,
			Data: map[string]interface{}{
				"status":     scriptStatus.Status,
				"start_time": scriptStatus.StartTime.Format(time.RFC3339),
			},
		})
		return
	}

	writeJSONResponse(w, APIResponse{
		Code:    0, // 成功时返回 0
		Message: "Success",
		Data: map[string]interface{}{
			"status":     scriptStatus.Status,
			"start_time": scriptStatus.StartTime.Format(time.RFC3339),
		},
	})
}

func handleVisionOCR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Method not allowed",
		})
		return
	}

	payload, cleanup, err := parseVisionRequestPayload(r)
	if err != nil {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Invalid request body: " + err.Error(),
		})
		return
	}
	if cleanup != nil {
		defer cleanup()
	}

	vision := automation.NewVision()
	result, err := vision.RunOCR(payload)
	if err != nil {
		writeJSONResponse(w, APIResponse{
			Code:    500,
			Message: "Vision OCR failed: " + err.Error(),
		})
		return
	}

	writeJSONResponse(w, APIResponse{
		Code:    0,
		Message: "Success",
		Data:    result,
	})
}

func handleVisionDetectUI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Method not allowed",
		})
		return
	}

	payload, cleanup, err := parseVisionRequestPayload(r)
	if err != nil {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Invalid request body: " + err.Error(),
		})
		return
	}
	if cleanup != nil {
		defer cleanup()
	}

	vision := automation.NewVision()
	result, err := vision.DetectUI(payload)
	if err != nil {
		writeJSONResponse(w, APIResponse{
			Code:    500,
			Message: "Vision detect-ui failed: " + err.Error(),
		})
		return
	}

	writeJSONResponse(w, APIResponse{
		Code:    0,
		Message: "Success",
		Data:    result,
	})
}

func parseVisionRequestPayload(r *http.Request) (map[string]interface{}, func(), error) {
	contentType := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if strings.HasPrefix(contentType, "image/") || strings.HasPrefix(contentType, "application/octet-stream") {
		return parseVisionBinaryPayload(r)
	}
	if strings.HasPrefix(contentType, "multipart/form-data") || strings.HasPrefix(contentType, "application/x-www-form-urlencoded") {
		return parseVisionFormPayload(r)
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return nil, nil, err
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}
	return payload, nil, nil
}

func parseVisionBinaryPayload(r *http.Request) (map[string]interface{}, func(), error) {
	payload := map[string]interface{}{}
	for key, values := range r.URL.Query() {
		if len(values) == 0 {
			continue
		}
		payload[key] = values[0]
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, nil, err
	}
	if len(body) == 0 {
		return nil, nil, fmt.Errorf("empty binary body")
	}
	payload["imageBytes"] = body
	return payload, nil, nil
}

func parseVisionFormPayload(r *http.Request) (map[string]interface{}, func(), error) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		if err := r.ParseForm(); err != nil {
			return nil, nil, err
		}
	}

	payload := map[string]interface{}{}
	for key, values := range r.Form {
		if len(values) == 0 {
			continue
		}
		payload[key] = values[0]
	}

	if r.MultipartForm == nil || len(r.MultipartForm.File) == 0 {
		return payload, nil, nil
	}

	fileField, fileHeader := findFirstVisionUpload(r.MultipartForm.File)
	if fileHeader == nil {
		return payload, nil, nil
	}

	src, err := fileHeader.Open()
	if err != nil {
		return nil, nil, err
	}
	defer src.Close()

	ext := filepath.Ext(fileHeader.Filename)
	tmpFile, err := os.CreateTemp("", "opendesk-vision-*"+ext)
	if err != nil {
		return nil, nil, err
	}
	if _, err := io.Copy(tmpFile, src); err != nil {
		tmpPath := tmpFile.Name()
		tmpFile.Close()
		_ = os.Remove(tmpPath)
		return nil, nil, err
	}
	tmpPath := tmpFile.Name()
	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return nil, nil, err
	}

	cleanup := func() {
		_ = os.Remove(tmpPath)
	}

	if _, ok := payload["imagePath"]; !ok {
		payload["imagePath"] = tmpPath
	}
	payload["_imageUploadField"] = fileField
	return payload, cleanup, nil
}

func findFirstVisionUpload(files map[string][]*multipart.FileHeader) (string, *multipart.FileHeader) {
	for _, key := range []string{"imageFile", "image", "file", "upload"} {
		if headers := files[key]; len(headers) > 0 && headers[0] != nil {
			return key, headers[0]
		}
	}
	for key, headers := range files {
		if len(headers) > 0 && headers[0] != nil {
			return key, headers[0]
		}
	}
	return "", nil
}

func handleVisionCapabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		writeJSONResponse(w, APIResponse{
			Code:    400,
			Message: "Method not allowed",
		})
		return
	}

	payload := map[string]interface{}{}
	if provider := strings.TrimSpace(r.URL.Query().Get("provider")); provider != "" {
		payload["provider"] = provider
	}

	if r.Method == http.MethodPost {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeJSONResponse(w, APIResponse{
				Code:    400,
				Message: "Invalid request body: " + err.Error(),
			})
			return
		}
		if len(strings.TrimSpace(string(body))) > 0 {
			var bodyPayload map[string]interface{}
			if err := json.Unmarshal(body, &bodyPayload); err != nil {
				writeJSONResponse(w, APIResponse{
					Code:    400,
					Message: "Invalid JSON body: " + err.Error(),
				})
				return
			}
			for k, v := range bodyPayload {
				payload[k] = v
			}
		}
	}

	vision := automation.NewVision()
	result, err := vision.GetCapabilities(payload)
	if err != nil {
		writeJSONResponse(w, APIResponse{
			Code:    500,
			Message: "Vision capabilities failed: " + err.Error(),
		})
		return
	}

	writeJSONResponse(w, APIResponse{
		Code:    0,
		Message: "Success",
		Data:    result,
	})
}

func handleRoot(w http.ResponseWriter, r *http.Request) {
	// 检查 public/index.html 是否存在
	indexPath := filepath.Join("public", "index.html")
	if _, err := os.Stat(indexPath); err == nil {
		// 存在 index.html，直接返回文件内容
		content, err := os.ReadFile(indexPath)
		if err != nil {
			http.Error(w, "Error reading index.html", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(content)
		return
	}

	// 如果不存在 index.html，显示默认界面
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	html := `
<!DOCTYPE html>
<html>
<head>
    <title>Script Execution Interface</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
        }
        .button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .button:hover {
            background-color: #45a049;
        }
    </style>
</head>
<body>
    <h1>Script Execution Interface</h1>
    <form action="/execute" method="post" enctype="multipart/form-data">
        <div class="form-group">
            <label for="script">Script File (.js or .txt):</label>
            <input type="file" id="script" name="script" accept=".js,.txt" required>
        </div>
        <div class="form-group">
            <label for="delay">Delay before execution (seconds):</label>
            <input type="number" id="delay" name="delay" value="0" min="0">
        </div>
        <div class="form-group">
            <label for="timeout">Execution timeout (minutes, 0 for no timeout):</label>
            <input type="number" id="timeout" name="timeout" value="30" min="0">
        </div>
        <button type="submit" class="button">Execute Script</button>
    </form>
</body>
</html>
`
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(html))
}

// createLocalTempDir creates a temporary directory in the current working directory
func createLocalTempDir() (string, error) {
	// Create a 'tmp' directory in the current working directory
	tmpDir := filepath.Join(".", "tmp")
	err := os.MkdirAll(tmpDir, 0755)
	if err != nil {
		return "", fmt.Errorf("failed to create local temp directory: %v", err)
	}
	return tmpDir, nil
}

// createTempFile creates a temporary file in the specified directory with given prefix and content
func createTempFile(dir, prefix string, content []byte) (string, error) {
	// Create a temporary file with a random name
	tempFile, err := os.CreateTemp(dir, prefix)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %v", err)
	}

	// Write content to the file
	if _, err := tempFile.Write(content); err != nil {
		tempFile.Close()
		os.Remove(tempFile.Name())
		return "", fmt.Errorf("failed to write to temp file: %v", err)
	}

	// Ensure content is written to disk
	if err := tempFile.Sync(); err != nil {
		tempFile.Close()
		os.Remove(tempFile.Name())
		return "", fmt.Errorf("failed to sync temp file: %v", err)
	}

	tempFile.Close()
	return tempFile.Name(), nil
}

// cleanup removes the temporary directory and its contents
func cleanup(tmpDir string) error {
	return os.RemoveAll(tmpDir)
}
