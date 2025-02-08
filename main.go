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
		debugPageObject(jsRuntime, "page")
		debugPageObject(jsRuntime, "mouse")

		// 调试 axios 对象
		debugPageObject(jsRuntime, "axios")

		// notify 函数仍然保持原样，因为它是特殊情况

		// 实现 notify 函数
		jsRuntime.Set("notify", func(call goja.FunctionCall) goja.Value {
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

func main() {
	// 记录开始时间
	startTime := time.Now()

	scriptPath := flag.String("script", "", "Script file path (.txt or .js)")
	delay := flag.Int("delay", 0, "Delay before start (seconds)")
	flag.Parse()

	if *scriptPath == "" {
		fmt.Println("Please specify script path: -script path/to/script.[txt|js]")
		return
	}

	fmt.Printf("[%s] 开始执行脚本...\n", time.Now().Format("15:04:05.000"))

	content, err := os.ReadFile(*scriptPath)
	if err != nil {
		fmt.Printf("Failed to read script: %v\n", err)
		return
	}

	// 执行脚本前初始化运行时环境
	initRuntime()

	// 只有当明确指定了 delay 参数且大于 0 时才等待
	if flag.Lookup("delay").Value.String() != "0" {
		fmt.Printf("[%s] 等待 %d 秒后开始...\n", time.Now().Format("15:04:05.000"), *delay)
		time.Sleep(time.Duration(*delay) * time.Second)
	}

	// Execute the script based on file extension
	ext := strings.ToLower(filepath.Ext(*scriptPath))
	fmt.Printf("[%s] 检测到文件扩展名: %s\n", time.Now().Format("15:04:05.000"), ext)

	if ext == ".js" {
		err = executeJavaScript(string(content))
	} else {
		page := automation.NewPage()
		err = automation.RunScript(page, string(content))
	}

	if err != nil {
		fmt.Printf("[%s] 脚本执行失败: %v\n", time.Now().Format("15:04:05.000"), err)
		return
	}

	// 计算并显示总执行时间
	executionTime := time.Since(startTime)
	fmt.Printf("[%s] 脚本执行完成！总耗时: %v\n", time.Now().Format("15:04:05.000"), executionTime)
}

func executeJavaScript(script string) error {
	startTime := time.Now()
	fmt.Printf("[%s] 开始执行 JavaScript...\n", startTime.Format("15:04:05.000"))

	// 创建一个channel来等待脚本完成
	done := make(chan error)

	// 处理脚本包装
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

	// 添加Promise完成处理和全局完成标记
	completeScript := fmt.Sprintf(`
        // 初始化全局状态
        globalThis.__scriptComplete = false;
        globalThis.__activeTimers = globalThis.__activeTimers || 0;

        (async () => {
            try {
                // 执行主脚本
                await %s;

                // 等待所有pending的定时器完成
                await new Promise(resolve => {
                    const checkTimers = () => {
                        // 检查是否还有活动的定时器
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
			// 修复：正确获取单个返回值
			completeValue := jsRuntime.Get("__scriptComplete")
			if completeValue != nil && completeValue.ToBoolean() {
				break
			}
		}

		done <- nil
	}()

	// 等待脚本完成或超时
	select {
	case err := <-done:
		if err != nil {
			return err
		}
	case <-time.After(30 * time.Minute): // 设置合理的超时时间
		return fmt.Errorf("script execution timed out")
	}

	executionTime := time.Since(startTime)
	fmt.Printf("[%s] JavaScript 执行完成，耗时: %v\n", time.Now().Format("15:04:05.000"), executionTime)
	return nil
}

func executeTextScript(script string) error {
	browser := automation.NewBrowser()
	page, err := browser.NewPage()
	if err != nil {
		return err
	}
	return automation.RunScript(page, script)
}

// printJSEnvironment 用于调试输出当前设置的所有全局变量和方法
func printJSEnvironment(runtime *goja.Runtime) {
	fmt.Println("\nJS environment:")

	// 打印全局对象
	fmt.Println("\nGlobal objects:")
	fmt.Println("- mouse:", runtime.Get("mouse"))
	fmt.Println("- keyboard:", runtime.Get("keyboard"))
	fmt.Println("- touchscreen:", runtime.Get("touchscreen"))
	fmt.Println("- console:", runtime.Get("console"))

	// 打印 page 对象及其属性
	fmt.Println("\nPage object and properties:")
	page := runtime.Get("page")
	fmt.Println("- page:", page)

	if pageObj := page.ToObject(runtime); pageObj != nil {
		fmt.Println("\nPage methods:")
		for _, key := range pageObj.Keys() {
			value := pageObj.Get(key)
			fmt.Printf("  - page.%s: %v\n", key, value)

			// 如果是对象类型的属性，进一步打印其方法
			if obj := value.ToObject(runtime); obj != nil {
				fmt.Printf("    Methods of page.%s:\n", key)
				for _, methodKey := range obj.Keys() {
					methodValue := obj.Get(methodKey)
					fmt.Printf("      - %s: %v\n", methodKey, methodValue)
				}
			}
		}
	}

	fmt.Println("\nExample property access:")
	fmt.Println("- page.mouse:", runtime.Get("page").ToObject(runtime).Get("mouse"))
	fmt.Println("- page.keyboard:", runtime.Get("page").ToObject(runtime).Get("keyboard"))
	fmt.Println("- page.touchscreen:", runtime.Get("page").ToObject(runtime).Get("touchscreen"))

	// 尝试执行一个简单的方法来验证可用性
	fmt.Println("\nTrying to get page title:")
	if fn := runtime.Get("page").ToObject(runtime).Get("title"); fn != nil {
		result, err := runtime.RunString("page.title()")
		if err == nil {
			fmt.Printf("  Title result: %v\n", result)
		} else {
			fmt.Printf("  Error calling title: %v\n", err)
		}
	}

	fmt.Println("\nEnd of JS environment debug info")
	fmt.Println("----------------------------------------")
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
