package main

import (
	"bufio"
	"clawdesk/automation"
	pkgContainer "clawdesk/pkg/container"
	pkgExecution "clawdesk/pkg/execution"
	"clawdesk/pkg/feature"
	pkgHttp "clawdesk/pkg/http"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/dop251/goja"
	"github.com/go-vgo/robotgo"
)

func init() {
	if shouldEchoFrameworkStartup() {
		fmt.Printf("robotgo version: %s\n", robotgo.Version)
	}
}

// Config holds the application configuration
type Config struct {
	ScriptPath            string
	ScriptText            string
	ScriptStdin           bool
	StackMode             string
	SaveLastScript        string
	LogDir                string
	ConsoleMode           string
	ConsoleCategories     string
	OutputFormat          string
	Delay                 int
	Timeout               int // 修改为 timeout，单位为分钟
	HttpMode              bool
	Port                  string
	VisionOCRImagePath    string
	VisionDetectImagePath string
	VisionTargetText      string
	VisionProvider        string
	VisionLang            string
	VisionMinConfidence   float64
	VisionIncludeRaw      bool
	MacPermissionHelper   string
	MacPermissionTarget   string
}

func parseFlags() *Config {
	config := &Config{}

	flag.StringVar(&config.ScriptPath, "script", "", "Script file path (.txt or .js)")
	flag.StringVar(&config.ScriptText, "script-text", "", "Execute JavaScript source directly from the command line")
	flag.BoolVar(&config.ScriptStdin, "script-stdin", false, "Read JavaScript source from stdin and execute it directly")
	flag.StringVar(&config.StackMode, "stack", "legacy", "Browser automation surface: legacy | upgraded | playwright")
	flag.StringVar(&config.SaveLastScript, "save-last-script", "", "Persist the executed script source to the given path")
	flag.StringVar(&config.LogDir, "log-dir", "", "Persist run logs and summary to the given directory")
	flag.StringVar(&config.ConsoleMode, "console-mode", "full", "Terminal output mode: full | script | summary | quiet | agent")
	flag.StringVar(&config.ConsoleCategories, "console-categories", "", "Override terminal output categories: framework,meta,script,summary,error")
	flag.StringVar(&config.OutputFormat, "output-format", "text", "Agent output format: text | json")
	flag.IntVar(&config.Delay, "delay", 0, "Delay before start (seconds)")
	flag.IntVar(&config.Timeout, "timeout", 30, "Execution timeout in minutes (0 for no timeout)") // 默认30分钟
	flag.BoolVar(&config.HttpMode, "http", false, "Start in HTTP server mode")
	flag.StringVar(&config.Port, "port", "60844", "HTTP server port")
	flag.StringVar(&config.VisionOCRImagePath, "vision-ocr-image", "", "Run OCR in CLI mode using image path")
	flag.StringVar(&config.VisionDetectImagePath, "vision-detect-ui-image", "", "Run UI detection in CLI mode using image path")
	flag.StringVar(&config.VisionTargetText, "vision-target-text", "", "Target text for UI detection")
	flag.StringVar(&config.VisionProvider, "vision-provider", "paddle", "OCR provider (paddle/openai/azure/google/aws)")
	flag.StringVar(&config.VisionLang, "vision-lang", "ch", "OCR language")
	flag.Float64Var(&config.VisionMinConfidence, "vision-min-confidence", 0.5, "Minimum confidence for detect-ui")
	flag.BoolVar(&config.VisionIncludeRaw, "vision-include-raw", false, "Include raw provider response in OCR output")
	flag.StringVar(&config.MacPermissionHelper, "mac-permission-helper", "", "Internal macOS permission helper mode")
	flag.StringVar(&config.MacPermissionTarget, "mac-permission-target", "", "Internal macOS permission helper target app")

	flag.Parse()
	return config
}

func initRuntime() *goja.Runtime {
	jsRuntime := goja.New()

	// 初始化 JS 环境
	if err := automation.InitJS(jsRuntime); err != nil {
		panic(err)
	}

	// 初始化并注册 axios
	axios := automation.NewAxios(jsRuntime)
	axios.RegisterInRuntime()

	// 可以添加这行来调试环境设置
	printJSEnvironment(jsRuntime)

	// 或者只调试特定对象
	// debugPageObject(jsRuntime, "page")
	// debugPageObject(jsRuntime, "mouse")
	// debugPageObject(jsRuntime, "axios")

	// notify 函数仍然保持原样，因为它是特殊情况

	// 实现 notify 函数
	jsRuntime.Set("notify____Inject", func(call goja.FunctionCall) goja.Value {
		fmt.Println("Notify function called") // 调试日志

		if len(call.Arguments) < 1 {
			fmt.Println("No arguments provided to notify")
			return goja.Undefined()
		}

		// 解析参数
		options := call.Argument(0).ToObject(jsRuntime)
		if options == nil {
			fmt.Println("Failed to parse notify options")
			return goja.Undefined()
		}

		// 转换为 NotifyOptions
		notifyOpts := &automation.NotifyOptions{
			Title:   toString(options.Get("title")),
			Message: toString(options.Get("message")),
			Sound:   toBool(options.Get("sound")),
			Timeout: time.Duration(toInt(options.Get("timeout"))) * time.Millisecond,
		}

		fmt.Printf("Sending notification: %+v\n", notifyOpts) // 调试日志

		// 调用通知
		err := automation.Notify(notifyOpts)
		if err != nil {
			fmt.Printf("Notification error: %v\n", err) // 调试日志
			panic(jsRuntime.NewGoError(err))
		}

		fmt.Println("Notification sent successfully") // 调试日志
		return goja.Undefined()
	})

	return jsRuntime
}

var isAutoRunJs bool = false

func main() {
	os.Stdout.Sync()

	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("Recovered from panic: %v\n", r)
			fmt.Println("\nPress 'Enter' to exit...")
			fmt.Scanln()
		}
	}()

	config := parseFlags()
	if handled, code := handleInternalMacPermissionHelper(config); handled {
		os.Exit(code)
	}
	selection := buildExecutionConsoleSelection(config)

	if shouldEchoStartupCategory("framework", selection) {
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

			// 在新的 goroutine 中执行脚本
			go func() {
				if shouldEchoStartupCategory("framework", selection) {
					fmt.Println("[INFO] Starting script execution...")
				}
				if err := executeScript(config); err != nil {
					fmt.Printf("[ERROR] Script execution failed: %v\n", err)
				} else {
					if shouldEchoStartupCategory("framework", selection) {
						fmt.Println("[INFO] Script execution completed successfully")
					}
				}
			}()
		}

		// 启动 HTTP 服务器（默认行为）
		if shouldEchoStartupCategory("framework", selection) {
			fmt.Println("[INFO] Starting HTTP server...")
		}
		startHttpServer(config.Port) // 这会阻塞主线程
		return
	}

	// 命令行视觉模式（不依赖 HTTP）
	if config.VisionOCRImagePath != "" || config.VisionDetectImagePath != "" {
		if err := executeVisionCLI(config); err != nil {
			fmt.Printf("[ERROR] Vision CLI execution failed: %v\n", err)
			os.Exit(1)
		}

		if config.HttpMode {
			startHttpServer(config.Port)
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
			fmt.Printf("[ERROR] Script execution failed: %v\n", err)
			fmt.Println("\nPress 'Enter' to exit...")
			fmt.Scanln()
			os.Exit(1)
		}

		if shouldEchoStartupCategory("framework", selection) {
			fmt.Println("[DEBUG] Script execution completed")
		}

		// 如果指定了 HTTP 模式，继续运行 HTTP 服务器
		if config.HttpMode {
			startHttpServer(config.Port)
		}
		return
	}

	// 没有脚本的情况
	fmt.Println("Please specify a script source: -script path/to/script.[txt|js], -script-text 'code', or -script-stdin")

	// 如果是 HTTP 模式，启动服务器
	if config.HttpMode {
		startHttpServer(config.Port)
		return
	}

	if isAutoRunJs {
		fmt.Println("\nPress 'Enter' to exit...")
		fmt.Scanln()
	}
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

func executeJavaScript(jsRuntime *goja.Runtime, script string, timeoutMinutes int) error {
	startTime := time.Now()
	fmt.Printf("[%s] 开始执行 JavaScript...\n", startTime.Format("15:04:05.000"))

	// 创建一个channel来等待脚本完成
	done := make(chan error)

	// 处理脚本包装逻辑（保持不变）...
	script = strings.TrimSpace(script)
	if !strings.HasPrefix(script, "(async") && !strings.HasPrefix(script, "async") {
		script = fmt.Sprintf(`
            (async () => {
                try {
                    %s
                } catch (err) {
                    console.error("[%s] Script execution error:", err.message || err);
                    throw err;
                }
            })();
        `, script, time.Now().Format("15:04:05.000"))
	}

	// 添加Promise完成处理和全局完成标记（保持不变）...
	completeScript := fmt.Sprintf(`
        globalThis.__scriptComplete = false;
        globalThis.__activeTimers = globalThis.__activeTimers || 0;

        (async () => {
            try {
                await %s;

                await new Promise(resolve => {
                    const checkTimers = () => {
                        const activeTimers = globalThis.__activeTimers || 0;
                        if (activeTimers === 0) {
                            globalThis.__scriptComplete = true;
                            resolve();
                        } else {
                            setTimeout(checkTimers, 100);
                        }
                    };
                    checkTimers();
                });

                console.log("[%s] Script execution completed successfully");
            } catch (err) {
                console.error("[%s] Error in script execution:", err.message || err);
                throw err;
            }
        })();
    `, script, time.Now().Format("15:04:05.000"), time.Now().Format("15:04:05.000"))

	// 在goroutine中执行脚本
	go func() {
		_, err := jsRuntime.RunString(completeScript)
		if err != nil {
			done <- fmt.Errorf("script execution failed: %v", err)
			return
		}

		// 等待脚本实际完成
		for {
			time.Sleep(100 * time.Millisecond)
			completeValue := jsRuntime.Get("__scriptComplete")
			if completeValue != nil && completeValue.ToBoolean() {
				break
			}
		}

		done <- nil
	}()

	// 根据 timeout 参数决定执行模式
	var err error
	if timeoutMinutes == 0 {
		// 无超时模式
		err = <-done
	} else {
		// 有超时限制的模式
		select {
		case err = <-done:
			// 正常完成
		case <-time.After(time.Duration(timeoutMinutes) * time.Minute):
			err = fmt.Errorf("script execution timed out after %d minutes", timeoutMinutes)
		}
	}

	// 检查执行结果
	if err != nil {
		return fmt.Errorf("[%s] 执行失败: %v", time.Now().Format("15:04:05.000"), err)
	}

	// 计算并显示执行时间
	executionTime := time.Since(startTime)
	fmt.Printf("[%s] JavaScript 执行完成，耗时: %v\n", time.Now().Format("15:04:05.000"), executionTime)
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
	Mode       string
	Categories map[string]bool
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
	content, sourceLabel, ext, err := resolveScriptSource(config)
	if err != nil {
		return err
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
		ExecutionID:    executionID,
		SourceLabel:    sourceLabel,
		Ext:            ext,
		StackMode:      config.StackMode,
		ScriptHash:     pkgExecution.ComputeScriptHash(content),
		ScriptContent:  content,
		TimeoutMinutes: config.Timeout,
		Artifacts:      artifacts,
		Selection: pkgExecution.TerminalSelection{
			Mode:       selection.Mode,
			Categories: copyConsoleCategories(selection.Categories),
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
		return fmt.Errorf("script execution failed: %v", execErr)
	}
	return nil
}

func buildExecutionConsoleSelection(config *Config) ConsoleSelection {
	if config == nil {
		return buildConsoleSelection("full", "")
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
	scriptHash := computeScriptHash(content)
	fmt.Printf("[%s] Detected file extension: %s\n", time.Now().Format("15:04:05.000"), ext)
	fmt.Printf("[%s] Script source: %s\n", time.Now().Format("15:04:05.000"), sourceLabel)
	fmt.Printf("[%s] Script hash: %s\n", time.Now().Format("15:04:05.000"), scriptHash)

	if ext == ".js" {
		jsRuntime := initRuntime()
		return executeJavaScript(jsRuntime, string(content), timeoutMinutes)
	}

	page := automation.NewPage()
	return automation.RunScript(page, string(content))
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
	case "", "full":
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
		return "full"
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
		return map[string]bool{"framework": true, "meta": true, "script": true, "summary": true, "error": true}
	}
}

// buildConsoleSelection 先按模式取默认集合，再允许命令行分类覆盖。
func buildConsoleSelection(mode, categories string) ConsoleSelection {
	normalizedMode := normalizeConsoleMode(mode)
	selection := ConsoleSelection{
		Mode:       normalizedMode,
		Categories: defaultConsoleCategories(normalizedMode),
	}

	override := parseConsoleCategories(categories)
	if len(override) > 0 {
		selection.Categories = override
	}
	return selection
}

func desiredConsoleConfigFromArgs() ConsoleSelection {
	args := os.Args[1:]
	mode := "full"
	categories := ""
	outputFormat := "text"
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "-console-mode" && i+1 < len(args) {
			mode = args[i+1]
			continue
		}
		if strings.HasPrefix(arg, "-console-mode=") {
			mode = strings.TrimPrefix(arg, "-console-mode=")
			continue
		}
		if arg == "-console-categories" && i+1 < len(args) {
			categories = args[i+1]
			continue
		}
		if strings.HasPrefix(arg, "-console-categories=") {
			categories = strings.TrimPrefix(arg, "-console-categories=")
			continue
		}
		if arg == "-output-format" && i+1 < len(args) {
			outputFormat = args[i+1]
			continue
		}
		if strings.HasPrefix(arg, "-output-format=") {
			outputFormat = strings.TrimPrefix(arg, "-output-format=")
		}
	}
	if strings.EqualFold(strings.TrimSpace(outputFormat), "json") && mode == "full" && categories == "" {
		mode = "agent"
	}
	return buildConsoleSelection(mode, categories)
}

func shouldEchoFrameworkStartup() bool {
	return shouldEchoStartupCategory("framework", desiredConsoleConfigFromArgs())
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

// printJSEnvironment 用于调试输出当前设置的所有全局变量和方法
func printJSEnvironment(runtime *goja.Runtime) {
	fmt.Println("\nJS environment:")

	// 打印全局对象
	// fmt.Println("\nGlobal objects:")
	// fmt.Println("- mouse:", runtime.Get("mouse"))
	// fmt.Println("- keyboard:", runtime.Get("keyboard"))
	// fmt.Println("- touchscreen:", runtime.Get("touchscreen"))
	// fmt.Println("- console:", runtime.Get("console"))

	// 打印 page 对象及其属性
	// fmt.Println("\nPage object and properties:")
	// page := runtime.Get("page")
	// fmt.Println("- page:", page)

	// if pageObj := page.ToObject(runtime); pageObj != nil {
	// 	fmt.Println("\nPage methods:")
	// 	for _, key := range pageObj.Keys() {
	// 		value := pageObj.Get(key)
	// 		fmt.Printf("  - page.%s: %v\n", key, value)

	// 		// 如果是对象类型的属性，进一步打印其方法
	// 		if obj := value.ToObject(runtime); obj != nil {
	// 			fmt.Printf("    Methods of page.%s:\n", key)
	// 			for _, methodKey := range obj.Keys() {
	// 				methodValue := obj.Get(methodKey)
	// 				fmt.Printf("      - %s: %v\n", methodKey, methodValue)
	// 			}
	// 		}
	// 	}
	// }

	// fmt.Println("\nExample property access:")
	// fmt.Println("- page.mouse:", runtime.Get("page").ToObject(runtime).Get("mouse"))
	// fmt.Println("- page.keyboard:", runtime.Get("page").ToObject(runtime).Get("keyboard"))
	// fmt.Println("- page.touchscreen:", runtime.Get("page").ToObject(runtime).Get("touchscreen"))

	// 尝试执行一个简单的方法来验证可用性
	// fmt.Println("\nTrying to get page title:")
	// if fn := runtime.Get("page").ToObject(runtime).Get("title"); fn != nil {
	// 	result, err := runtime.RunString("page.title()")
	// 	if err == nil {
	// 		fmt.Printf("  Title result: %v\n", result)
	// 	} else {
	// 		fmt.Printf("  Error calling title: %v\n", err)
	// 	}
	// }

	// fmt.Println("\nEnd of JS environment debug info")
	// fmt.Println("----------------------------------------")
}

// 可选：添加更具体的调试帮助函数
func debugPageObject(runtime *goja.Runtime, objName string) {
	fmt.Printf("\nDebugging %s object:\n", objName)
	obj := runtime.Get(objName)
	if obj == nil {
		fmt.Printf("%s object not found\n", objName)
		return
	}

	if jsObj := obj.ToObject(runtime); jsObj != nil {
		fmt.Printf("%s methods:\n", objName)
		for _, key := range jsObj.Keys() {
			value := jsObj.Get(key)
			fmt.Printf("- %s.%s: %v\n", objName, key, value)
		}
	}
}

// 辅助函数用于类型转换
func toString(v goja.Value) string {
	if v == nil || goja.IsUndefined(v) {
		return ""
	}
	return v.String()
}

func toBool(v goja.Value) bool {
	if v == nil || goja.IsUndefined(v) {
		return false
	}
	return v.ToBoolean()
}

func toInt(v goja.Value) int {
	if v == nil || goja.IsUndefined(v) {
		return 0
	}
	num := v.ToInteger()
	return int(num)
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
func startHttpServer(port string) {
	if strings.TrimSpace(port) == "" {
		port = "60844"
	}

	// Check if we should use the new container-based architecture
	if feature.UseDIContainer {
		startContainerBasedServer(port)
		return
	}

	// Legacy implementation
	// 获取并打印本机IP地址
	ips := getLocalIPs()
	fmt.Println("\n可用的服务地址:")
	for _, ip := range ips {
		fmt.Printf("http://%s:%s\n", ip, port)
	}
	fmt.Printf("http://localhost:%s\n", port)
	fmt.Println("----------------------------------------")
	fmt.Println("服务器已启动，按 Ctrl+C 关闭")

	// Wrap handlers with CORS middleware
	http.HandleFunc("/SCRIPT_RUN", corsMiddleware(handleScriptExecution))
	http.HandleFunc("/status", corsMiddleware(handleStatus))
	http.HandleFunc("/v1/vision/ocr", corsMiddleware(handleVisionOCR))
	http.HandleFunc("/v1/vision/detect-ui", corsMiddleware(handleVisionDetectUI))
	http.HandleFunc("/v1/vision/capabilities", corsMiddleware(handleVisionCapabilities))
	http.HandleFunc("/", corsMiddleware(handleRoot))

	// 直接使用 ListenAndServe，这将阻塞主线程
	serverAddr := ":" + port
	if err := http.ListenAndServe(serverAddr, nil); err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
		os.Exit(1)
	}
}

// startContainerBasedServer starts the HTTP server using the new container architecture
func startContainerBasedServer(port string) {
	fmt.Println("[INFO] Starting server with container-based architecture")

	// Create container
	cfg := &pkgContainer.Config{
		RuntimePoolSize: 10,
	}

	container, err := pkgContainer.NewContainer(cfg)
	if err != nil {
		fmt.Printf("[ERROR] Failed to create container: %v\n", err)
		os.Exit(1)
	}
	defer container.Close()

	// 获取并打印本机IP地址
	ips := getLocalIPs()
	fmt.Println("\n可用的服务地址:")
	for _, ip := range ips {
		fmt.Printf("http://%s:%s\n", ip, port)
	}
	fmt.Printf("http://localhost:%s\n", port)
	fmt.Println("----------------------------------------")
	fmt.Println("服务器已启动 (Container Mode)，按 Ctrl+C 关闭")

	// Create and start server
	server := pkgHttp.NewServer(container, port)
	if err := server.Start(); err != nil {
		fmt.Printf("[ERROR] Server failed to start: %v\n", err)
		os.Exit(1)
	}
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
	tmpFile, err := os.CreateTemp("", "clawdesk-vision-*"+ext)
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
