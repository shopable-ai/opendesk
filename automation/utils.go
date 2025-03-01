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

func loadPolyfills(runtime *goja.Runtime) error {
	// Get the executable directory
	execDir, err := getExecutableDir()
	if err != nil {
		return fmt.Errorf("failed to get executable directory: %v", err)
	}

	// polyfills directory is a subdirectory of the executable directory
	polyfillsDir := filepath.Join(execDir, "polyfills")
	fmt.Printf("[DEBUG] Looking for polyfills in: %s\n", polyfillsDir)

	// Create the directory if it doesn't exist
	if err := os.MkdirAll(polyfillsDir, 0755); err != nil {
		return fmt.Errorf("failed to create polyfills directory: %v", err)
	}

	// Read all files in the directory
	entries, err := os.ReadDir(polyfillsDir)
	if err != nil {
		return fmt.Errorf("failed to read polyfills directory: %v", err)
	}

	// Filter and sort JavaScript files
	files := make([]string, 0)
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	if len(files) == 0 {
		fmt.Printf("[WARN] No polyfill files found in: %s\n", polyfillsDir)
	}

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

	return nil
}

func loadJSLibs(runtime *goja.Runtime) error {
	// Get the executable directory
	execDir, err := getExecutableDir()
	if err != nil {
		return fmt.Errorf("failed to get executable directory: %v", err)
	}

	// jslibs directory is a subdirectory of the executable directory
	jslibsDir := filepath.Join(execDir, "jslibs")
	fmt.Printf("[DEBUG] Looking for JS libraries in: %s\n", jslibsDir)

	// Create the directory if it doesn't exist
	if err := os.MkdirAll(jslibsDir, 0755); err != nil {
		return fmt.Errorf("failed to create jslibs directory: %v", err)
	}

	// Read all files in the directory
	entries, err := os.ReadDir(jslibsDir)
	if err != nil {
		return fmt.Errorf("failed to read jslibs directory: %v", err)
	}

	// Filter and sort JavaScript library files
	var jsFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
			jsFiles = append(jsFiles, entry.Name())
		}
	}
	sort.Strings(jsFiles)

	if len(jsFiles) == 0 {
		fmt.Printf("[WARN] No JS library files found in: %s\n", jslibsDir)
	}

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

	return nil
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
