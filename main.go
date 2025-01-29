package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testMonkey-go/automation"
	"time"

	"github.com/dop251/goja"
)

// 全局变量，保持运行时环境
var (
	jsRuntime *goja.Runtime
	page      *automation.Page
)

func initRuntime() {
	if jsRuntime == nil {
		jsRuntime = goja.New()
		page = automation.NewPage()

		// 初始化 axios
		axios := automation.NewAxios(jsRuntime)
		axios.RegisterInRuntime()

		// 自动映射各个对象的方法
		automation.AutoMapMethods(jsRuntime, page.Keyboard, "keyboard")
		automation.AutoMapMethods(jsRuntime, page.Mouse, "mouse")
		automation.AutoMapMethods(jsRuntime, page.Touchscreen, "touchscreen")
		automation.AutoMapMethods(jsRuntime, page, "page")
		automation.AutoMapMethods(jsRuntime, automation.NewConsole(), "console")

		// notify 函数仍然保持原样，因为它是特殊情况
		jsRuntime.Set("notify", func(call goja.FunctionCall) goja.Value {
			// 现有的 notify 实现...
			return goja.Undefined()
		})
	}
}

func main() {
	scriptPath := flag.String("script", "", "Script file path (.txt or .js)")
	delay := flag.Int("delay", 3, "Delay before start (seconds)")
	flag.Parse()

	if *scriptPath == "" {
		fmt.Println("Please specify script path: -script path/to/script.[txt|js]")
		return
	}

	content, err := os.ReadFile(*scriptPath)
	if err != nil {
		fmt.Printf("Failed to read script: %v\n", err)
		return
	}

	// 执行脚本前初始化运行时环境
	initRuntime()

	fmt.Printf("Starting in %d seconds...\n", *delay)
	time.Sleep(time.Duration(*delay) * time.Second)

	// Execute the script based on file extension
	ext := strings.ToLower(filepath.Ext(*scriptPath))
	fmt.Printf("Detected file extension: %s\n", ext) // Debug logging

	if ext == ".js" {
		err = executeJavaScript(string(content))
	} else {
		page := automation.NewPage()
		err = automation.RunScript(page, string(content))
	}

	if err != nil {
		fmt.Printf("Script execution failed: %v\n", err)
		return
	}

	fmt.Println("Script execution completed!")
}

func executeJavaScript(script string) error {
	// 处理脚本包装
	script = strings.TrimSpace(script)
	if !strings.HasPrefix(script, "(async") && !strings.HasPrefix(script, "async") {
		script = fmt.Sprintf(`
			(async () => {
				try {
					%s
				} catch (err) {
					console.error("Script execution error:", err);
					throw err;
				}
			})();
		`, script)
	}

	_, err := jsRuntime.RunString(script)
	return err
}

func executeTextScript(script string) error {
	browser := automation.NewBrowser()
	page, err := browser.NewPage()
	if err != nil {
		return err
	}
	return automation.RunScript(page, script)
}
