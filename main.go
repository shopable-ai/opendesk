package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testMonkey-go/automation"
	"time"

	"github.com/dop251/goja"
	"github.com/go-vgo/robotgo"
)

func init() {
	fmt.Printf("robotgo version: %s\n", robotgo.Version)
}

// 全局变量，保持运行时环境
var (
	jsRuntime *goja.Runtime
	page      *automation.Page
)

// Config holds the application configuration
type Config struct {
	ScriptPath string
	Delay      int
	Timeout    int // 修改为 timeout，单位为分钟
	HttpMode   bool
	Port       string
}

func parseFlags() *Config {
	config := &Config{}

	flag.StringVar(&config.ScriptPath, "script", "", "Script file path (.txt or .js)")
	flag.IntVar(&config.Delay, "delay", 0, "Delay before start (seconds)")
	flag.IntVar(&config.Timeout, "timeout", 30, "Execution timeout in minutes (0 for no timeout)") // 默认30分钟
	flag.BoolVar(&config.HttpMode, "http", false, "Start in HTTP server mode")
	flag.StringVar(&config.Port, "port", "8080", "HTTP server port")

	flag.Parse()
	return config
}

func initRuntime() {
	if jsRuntime == nil {
		jsRuntime = goja.New()

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
	}
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

	fmt.Println("[DEBUG] Program starting...")
	fmt.Println("[DEBUG] Initializing runtime...")
	initRuntime()

	// 检查是否是双击启动（无参数启动）
	if len(os.Args) == 1 {
		isAutoRunJs = true
		config.HttpMode = true // 双击启动时默认启用 HTTP 模式
		fmt.Println("[DEBUG] Double-clicked detected. Setting default HTTP mode.")
	}

	// 明确设置 HTTP 模式的 isAutoRunJs
	if config.HttpMode {
		isAutoRunJs = true
		fmt.Println("[DEBUG] HTTP mode active.")
	}

	// 如果是双击启动或HTTP模式
	if isAutoRunJs {
		// 尝试查找和执行脚本
		scriptFile, err := findScriptFile()
		if err != nil {
			fmt.Printf("[INFO] No tm.config.js found: %v\n", err)
		} else {
			fmt.Printf("[INFO] Found script file: %s\n", scriptFile)
			config.ScriptPath = scriptFile

			// 在新的 goroutine 中执行脚本
			go func() {
				fmt.Println("[INFO] Starting script execution...")
				if err := executeScript(config); err != nil {
					fmt.Printf("[ERROR] Script execution failed: %v\n", err)
				} else {
					fmt.Println("[INFO] Script execution completed successfully")
				}
			}()
		}

		// 启动 HTTP 服务器（默认行为）
		fmt.Println("[INFO] Starting HTTP server...")
		startHttpServer() // 这会阻塞主线程
		return
	}

	// 命令行模式的处理
	if config.ScriptPath != "" {
		fmt.Printf("[DEBUG] Executing script: %s\n", config.ScriptPath)

		if err := executeScript(config); err != nil {
			fmt.Printf("[ERROR] Script execution failed: %v\n", err)
			fmt.Println("\nPress 'Enter' to exit...")
			fmt.Scanln()
			os.Exit(1)
		}

		fmt.Println("[DEBUG] Script execution completed")

		// 如果指定了 HTTP 模式，继续运行 HTTP 服务器
		if config.HttpMode {
			startHttpServer()
		}
		return
	}

	// 没有脚本的情况
	fmt.Println("Please specify script path: -script path/to/script.[txt|js]")

	// 如果是 HTTP 模式，启动服务器
	if config.HttpMode {
		startHttpServer()
		return
	}

	if isAutoRunJs {
		fmt.Println("\nPress 'Enter' to exit...")
		fmt.Scanln()
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

func executeJavaScript(script string, timeoutMinutes int) error {
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
	fmt.Printf("[DEBUG] Script length: %d characters\n", scriptLength)
	fmt.Printf("[DEBUG] Script preview: %s\n", scriptPreview)

	// Set script status to running
	updateScriptStatus("running", nil)

	// Execute script in a new goroutine directly using the runtime
	go func() {
		scriptContent := *requestBody.Script
		fmt.Printf("[%s] Executing script directly in runtime\n",
			time.Now().Format("15:04:05.000"))

		// Use the default timeout of 30 minutes
		if err := executeJavaScript(scriptContent, 30); err != nil {
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

// 修改 executeScript 函数的返回值类型，使其返回错误
func executeScript(config *Config) error {
	startTime := time.Now()
	fmt.Printf("[%s] Starting script execution...\n", startTime.Format("15:04:05.000"))

	content, err := os.ReadFile(config.ScriptPath)
	if err != nil {
		return fmt.Errorf("failed to read script: %v", err)
	}

	ext := strings.ToLower(filepath.Ext(config.ScriptPath))
	fmt.Printf("[%s] Detected file extension: %s\n", time.Now().Format("15:04:05.000"), ext)

	// 所有 .js 文件都通过 executeJavaScript 处理
	if ext == ".js" {
		err = executeJavaScript(string(content), config.Timeout)
	} else {
		page := automation.NewPage()
		err = automation.RunScript(page, string(content))
	}

	if err != nil {
		return fmt.Errorf("script execution failed: %v", err)
	}

	executionTime := time.Since(startTime)
	fmt.Printf("[%s] Script execution completed! Total time: %v\n",
		time.Now().Format("15:04:05.000"),
		executionTime)

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
func startHttpServer() {
	const port = "60844"

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
	http.HandleFunc("/", corsMiddleware(handleRoot))

	// 直接使用 ListenAndServe，这将阻塞主线程
	serverAddr := ":" + port
	if err := http.ListenAndServe(serverAddr, nil); err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
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
