package automation

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"unicode"

	"github.com/dop251/goja"
)

func AutoMapMethods(runtime *goja.Runtime, goObj interface{}, jsObjName string) map[string]interface{} {
	val := reflect.ValueOf(goObj)
	typ := val.Type()

	jsObj := make(map[string]interface{})

	for i := 0; i < typ.NumMethod(); i++ {
		method := typ.Method(i)

		if method.PkgPath != "" {
			continue
		}

		jsMethodName := toLowerFirst(method.Name)
		wrapper := createJSMethodWrapper(runtime, val, method)
		jsObj[jsMethodName] = wrapper
	}

	fmt.Println("js:", jsObjName, jsObj)
	runtime.Set(jsObjName, jsObj)
	return jsObj
}

func toLowerFirst(str string) string {
	if len(str) == 0 {
		return ""
	}
	r := []rune(str)
	r[0] = unicode.ToLower(r[0])
	return string(r)
}

func createJSMethodWrapper(runtime *goja.Runtime, receiver reflect.Value, method reflect.Method) func(call goja.FunctionCall) goja.Value {
	return func(call goja.FunctionCall) goja.Value {
		methodType := method.Type

		// 检查方法是否是可变参数方法
		isVariadic := methodType.IsVariadic()

		// 计算固定参数的数量（不包括接收者）
		numIn := methodType.NumIn()
		if isVariadic {
			numIn--
		}

		inputs := make([]reflect.Value, 0, len(call.Arguments)+1)
		inputs = append(inputs, receiver) // 添加接收者

		// 处理固定参数
		for i := 1; i < numIn; i++ {
			paramType := methodType.In(i)
			if i-1 < len(call.Arguments) {
				jsArg := call.Arguments[i-1]
				goArg := reflect.New(paramType).Elem()
				if err := runtime.ExportTo(jsArg, goArg.Addr().Interface()); err != nil {
					panic(runtime.NewGoError(fmt.Errorf("failed to convert parameter %d: %v", i, err)))
				}
				inputs = append(inputs, goArg)
			} else {
				inputs = append(inputs, reflect.Zero(paramType))
			}
		}

		// 处理可变参数
		if isVariadic {
			sliceType := methodType.In(methodType.NumIn() - 1)
			elemType := sliceType.Elem()

			// 将剩余的参数转换为切片元素
			for i := numIn - 1; i < len(call.Arguments); i++ {
				jsArg := call.Arguments[i]
				goArg := reflect.New(elemType).Elem()

				// 特殊处理 interface{} 类型
				if elemType.Kind() == reflect.Interface {
					goArg = reflect.ValueOf(jsArg.Export())
				} else {
					if err := runtime.ExportTo(jsArg, goArg.Addr().Interface()); err != nil {
						panic(runtime.NewGoError(fmt.Errorf("failed to convert variadic parameter %d: %v", i, err)))
					}
				}
				inputs = append(inputs, goArg)
			}
		}

		// 调用方法
		results := method.Func.Call(inputs)

		// 处理返回值
		if len(results) == 0 {
			return goja.Undefined()
		}

		// 检查错误返回值
		if len(results) > 0 {
			lastResult := results[len(results)-1]
			if lastResult.Type().Implements(reflect.TypeOf((*error)(nil)).Elem()) {
				if !lastResult.IsNil() {
					panic(runtime.NewGoError(lastResult.Interface().(error)))
				}
				results = results[:len(results)-1]
			}
		}

		// 如果没有其他返回值，返回 undefined
		if len(results) == 0 {
			return goja.Undefined()
		}

		// 转换返回值为 JavaScript 值
		return runtime.ToValue(results[0].Interface())
	}
}

// AutoMapObject 创建一个新的映射对象
func AutoMapObject(runtime *goja.Runtime, goObj interface{}) map[string]interface{} {
	val := reflect.ValueOf(goObj)
	typ := val.Type()

	jsObj := make(map[string]interface{})

	for i := 0; i < typ.NumMethod(); i++ {
		method := typ.Method(i)

		if method.PkgPath != "" {
			continue
		}

		jsMethodName := toLowerFirst(method.Name)
		wrapper := createJSMethodWrapper(runtime, val, method)
		jsObj[jsMethodName] = wrapper
	}

	return jsObj
}

// MapPageToJS 将 Page 对象映射到 JS 环境
func MapPageToJS(runtime *goja.Runtime, page *Page) error {
	// 创建 page 对象的方法映射
	pageMethods := AutoMapObject(runtime, page)

	// 创建各个组件的方法映射
	mouseMethods := AutoMapObject(runtime, page.Mouse)
	keyboardMethods := AutoMapObject(runtime, page.Keyboard)
	touchscreenMethods := AutoMapObject(runtime, page.Touchscreen)

	// 创建完整的 page 对象结构
	pageObj := make(map[string]interface{})

	// 添加方法
	for name, method := range pageMethods {
		pageObj[name] = method
	}

	// 添加组件
	pageObj["mouse"] = mouseMethods
	pageObj["keyboard"] = keyboardMethods
	pageObj["touchscreen"] = touchscreenMethods

	// 设置到 JS 运行时
	runtime.Set("page", pageObj)

	return nil
}

// getExecutableDir returns the directory where the executable is located
func getExecutableDir() (string, error) {
	execPath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to get executable path: %v", err)
	}
	execDir := filepath.Dir(execPath)
	fmt.Printf("[DEBUG] Executable directory: %s\n", execDir)
	return execDir, nil
}

// getScriptDir returns the directory of the currently running script (if specified)
func getScriptDir() (string, bool, error) {
	// Search for -script flag in command line arguments
	scriptPath := ""
	for i, arg := range os.Args {
		if arg == "-script" && i+1 < len(os.Args) {
			scriptPath = os.Args[i+1]
			break
		}
		if strings.HasPrefix(arg, "-script=") {
			scriptPath = strings.TrimPrefix(arg, "-script=")
			break
		}
	}

	if scriptPath == "" {
		return "", false, nil
	}

	// Make sure we have absolute path
	if !filepath.IsAbs(scriptPath) {
		cwd, err := os.Getwd()
		if err != nil {
			return "", false, fmt.Errorf("failed to get working directory: %v", err)
		}
		scriptPath = filepath.Join(cwd, scriptPath)
	}

	scriptDir := filepath.Dir(scriptPath)
	fmt.Printf("[DEBUG] Script directory: %s\n", scriptDir)
	return scriptDir, true, nil
}

// loadPolyfills loads all polyfill files
func loadPolyfills(runtime *goja.Runtime) error {
	// First try script directory if available
	scriptDir, hasScriptDir, err := getScriptDir()
	if err != nil {
		fmt.Printf("[WARN] Error determining script directory: %v\n", err)
	}

	// Get the executable directory as fallback
	execDir, err := getExecutableDir()
	if err != nil {
		return fmt.Errorf("failed to get executable directory: %v", err)
	}

	// List of directories to check for polyfills
	dirsToCheck := []string{}

	// Add script directory first if available
	if hasScriptDir {
		dirsToCheck = append(dirsToCheck, filepath.Join(scriptDir, "polyfills"))
	}

	// Add executable directory
	dirsToCheck = append(dirsToCheck, filepath.Join(execDir, "polyfills"))

	// Try one directory up from executable
	dirsToCheck = append(dirsToCheck, filepath.Join(filepath.Dir(execDir), "polyfills"))

	// Finally, try current working directory
	cwd, err := os.Getwd()
	if err == nil {
		dirsToCheck = append(dirsToCheck, filepath.Join(cwd, "polyfills"))
	}

	// Try each directory
	var lastErr error
	for _, polyfillsDir := range dirsToCheck {
		fmt.Printf("[DEBUG] Checking for polyfills in: %s\n", polyfillsDir)

		// Check if directory exists
		if _, err := os.Stat(polyfillsDir); os.IsNotExist(err) {
			fmt.Printf("[DEBUG] Directory does not exist: %s\n", polyfillsDir)
			lastErr = fmt.Errorf("directory does not exist: %s", polyfillsDir)
			continue
		}

		// Try to read the directory
		entries, err := os.ReadDir(polyfillsDir)
		if err != nil {
			fmt.Printf("[DEBUG] Failed to read directory: %s (Error: %v)\n", polyfillsDir, err)
			lastErr = fmt.Errorf("failed to read polyfills directory: %v", err)
			continue
		}

		// Found valid directory, proceed with loading
		fmt.Printf("[INFO] Found polyfills directory: %s\n", polyfillsDir)

		// Sort filenames to ensure consistent loading order
		files := make([]string, 0)
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
				files = append(files, entry.Name())
			}
		}
		sort.Strings(files)

		// Load each polyfill file
		for _, file := range files {
			filePath := filepath.Join(polyfillsDir, file)
			content, err := os.ReadFile(filePath)
			if err != nil {
				return fmt.Errorf("failed to read polyfill file %s: %v", file, err)
			}

			// Execute polyfill code
			_, err = runtime.RunString(string(content))
			if err != nil {
				return fmt.Errorf("failed to execute polyfill %s: %v", file, err)
			}

			fmt.Printf("Loaded polyfill: %s\n", file)
		}

		// Successfully loaded polyfills from this directory
		return nil
	}

	// If we got here, we failed to find polyfills in any directory
	return fmt.Errorf("could not find polyfills directory. Tried: %v. Last error: %v", dirsToCheck, lastErr)
}

// loadJSLibs loads all JavaScript library files
func loadJSLibs(runtime *goja.Runtime) error {
	// First try script directory if available
	scriptDir, hasScriptDir, err := getScriptDir()
	if err != nil {
		fmt.Printf("[WARN] Error determining script directory: %v\n", err)
	}

	// Get the executable directory as fallback
	execDir, err := getExecutableDir()
	if err != nil {
		return fmt.Errorf("failed to get executable directory: %v", err)
	}

	// List of directories to check for jslibs
	dirsToCheck := []string{}

	// Add script directory first if available
	if hasScriptDir {
		dirsToCheck = append(dirsToCheck, filepath.Join(scriptDir, "jslibs"))
	}

	// Add executable directory
	dirsToCheck = append(dirsToCheck, filepath.Join(execDir, "jslibs"))

	// Try one directory up from executable
	dirsToCheck = append(dirsToCheck, filepath.Join(filepath.Dir(execDir), "jslibs"))

	// Finally, try current working directory
	cwd, err := os.Getwd()
	if err == nil {
		dirsToCheck = append(dirsToCheck, filepath.Join(cwd, "jslibs"))
	}

	// Try each directory
	var lastErr error
	for _, jslibsDir := range dirsToCheck {
		fmt.Printf("[DEBUG] Checking for jslibs in: %s\n", jslibsDir)

		// Check if directory exists
		if _, err := os.Stat(jslibsDir); os.IsNotExist(err) {
			fmt.Printf("[DEBUG] Directory does not exist: %s\n", jslibsDir)
			lastErr = fmt.Errorf("directory does not exist: %s", jslibsDir)
			continue
		}

		// Try to read the directory
		entries, err := os.ReadDir(jslibsDir)
		if err != nil {
			fmt.Printf("[DEBUG] Failed to read directory: %s (Error: %v)\n", jslibsDir, err)
			lastErr = fmt.Errorf("failed to read jslibs directory: %v", err)
			continue
		}

		// Found valid directory, proceed with loading
		fmt.Printf("[INFO] Found jslibs directory: %s\n", jslibsDir)

		// Collect all .js files
		var jsFiles []string
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
				jsFiles = append(jsFiles, entry.Name())
			}
		}

		// Sort by filename to ensure consistent loading order
		sort.Strings(jsFiles)

		// Load each JavaScript library file
		for _, file := range jsFiles {
			filePath := filepath.Join(jslibsDir, file)
			content, err := os.ReadFile(filePath)
			if err != nil {
				return fmt.Errorf("failed to read JS library file %s: %v", file, err)
			}

			// Execute JavaScript library code
			_, err = runtime.RunString(string(content))
			if err != nil {
				return fmt.Errorf("failed to execute JS library %s: %v", file, err)
			}

			fmt.Printf("Loaded JS library: %s\n", file)
		}

		// Successfully loaded jslibs from this directory
		return nil
	}

	// If we got here, we failed to find jslibs in any directory
	return fmt.Errorf("could not find jslibs directory. Tried: %v. Last error: %v", dirsToCheck, lastErr)
}

// InitJS 初始化 JS 环境

func InitJS(runtime *goja.Runtime) error {
	// 首先初始化 console 对象，因为我们需要它来记录日志
	consoleMethods := AutoMapObject(runtime, NewConsole())
	runtime.Set("console", consoleMethods)

	// Initialize HTTPClient
	httpClient := NewHTTPClient(runtime)
	httpMethods := AutoMapObject(runtime, httpClient)
	runtime.Set("http", httpMethods)

	// Initialize System
	system := NewSystem()
	systemMethods := AutoMapObject(runtime, system)
	runtime.Set("System", systemMethods)

	windowManager := NewWindowManager()
	windowMethods := AutoMapObject(runtime, windowManager)
	runtime.Set("window", windowMethods)

	// 初始化剪贴板
	clipboard := NewClipboard()
	clipboardMethods := AutoMapObject(runtime, clipboard)
	runtime.Set("clipboard", clipboardMethods)

	// Initialize FloatingWindow
	floatingWindow := NewFloatingWindow()
	floatingWindowMethods := AutoMapObject(runtime, floatingWindow)
	runtime.Set("FloatingWindow", floatingWindowMethods)

	// 初始化剪贴板
	fileSystem := NewFileSystem()
	fileSystemMethods := AutoMapObject(runtime, fileSystem)
	runtime.Set("File", fileSystemMethods)

	// 初始化 AppStorage
	appStorage := NewAppStorage("testMonkey")
	appStorageMethods := AutoMapObject(runtime, appStorage)
	runtime.Set("AppStorage", appStorageMethods)

	sound := NewSound()
	soundMethods := AutoMapObject(runtime, sound)
	runtime.Set("Sound", soundMethods)

	imageColor := NewImageColor()
	imageColorMethods := AutoMapObject(runtime, imageColor)
	runtime.Set("ImageColor", imageColorMethods)

	// 初始化计时器系统
	timer := NewTimer(runtime)
	timer.RegisterInRuntime()

	// 创建全局对象
	// global := runtime.GlobalObject()
	// if err := global.Set("globalThis", global); err != nil {
	// 	return fmt.Errorf("failed to set globalThis: %v", err)
	// }

	// 然后加载 polyfills
	if err := loadPolyfills(runtime); err != nil {
		return fmt.Errorf("failed to load polyfills: %v", err)
	}

	// 加载 jslibs
	if err := loadJSLibs(runtime); err != nil {
		return fmt.Errorf("failed to load JS libraries: %v", err)
	}

	// 创建新的 page 实例
	page := NewPage()

	// 映射组件到全局对象
	mouseMethods := AutoMapObject(runtime, page.Mouse)
	keyboardMethods := AutoMapObject(runtime, page.Keyboard)
	touchscreenMethods := AutoMapObject(runtime, page.Touchscreen)

	runtime.Set("mouse", mouseMethods)
	runtime.Set("keyboard", keyboardMethods)
	runtime.Set("touchscreen", touchscreenMethods)

	// 创建 page 对象的方法映射
	pageMethods := AutoMapObject(runtime, page)
	pageObj := make(map[string]interface{})

	// 添加 page 的方法
	for name, method := range pageMethods {
		pageObj[name] = method
	}

	// 添加组件作为 page 的属性
	pageObj["mouse"] = mouseMethods
	pageObj["keyboard"] = keyboardMethods
	pageObj["touchscreen"] = touchscreenMethods

	// 设置 page 对象到 JS 运行时
	runtime.Set("page", pageObj)

	// 初始化屏幕
	screen := NewScreen()
	screenMethods := AutoMapObject(runtime, screen)
	runtime.Set("Screen", screenMethods)
	// 直接在 runtime 中设置别名或引用
	runtime.RunString(`Screen.screenshot = page.screenshot;`)

	// 初始化并注册 axios , 已经被http.go 和axios.js替代
	// axios := NewAxios(runtime)
	// axios.RegisterInRuntime()

	// 验证初始化
	// _, err := runtime.RunString(`
	//     console.log('JavaScript runtime initialized successfully');
	//     console.log('Timer functions available:', {
	//         setTimeout: typeof setTimeout === 'function',
	//         setInterval: typeof setInterval === 'function',
	//         clearTimeout: typeof clearTimeout === 'function',
	//         clearInterval: typeof clearInterval === 'function'
	//     });
	// `)
	// if err != nil {
	// 	return fmt.Errorf("failed to verify initialization: %v", err)
	// }

	return nil
}
