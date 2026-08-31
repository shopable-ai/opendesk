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

// InitJSOptions 控制 JS 运行时初始化行为。
type InitJSOptions struct {
	EventSink EventSink
}

func emitRuntimeLog(sink EventSink, level, message string, fields map[string]any) {
	if sink != nil {
		sink.Emit("framework", level, "runtime", "log", message, fields)
		return
	}
	prefix := "[INFO]"
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		prefix = "[DEBUG]"
	case "warn":
		prefix = "[WARN]"
	case "error":
		prefix = "[ERROR]"
	}
	fmt.Printf("%s %s\n", prefix, message)
}

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
		return jsValueForResult(runtime, results[0].Interface())
	}
}

func jsValueForResult(runtime *goja.Runtime, result interface{}) goja.Value {
	switch v := result.(type) {
	case []byte:
		return runtime.ToValue(runtime.NewArrayBuffer(v))
	case *Browser:
		if v == nil {
			return goja.Null()
		}
		return runtime.ToValue(AutoMapObject(runtime, v))
	case *BrowserContext:
		if v == nil {
			return goja.Null()
		}
		return runtime.ToValue(AutoMapObject(runtime, v))
	case *Page:
		if v == nil {
			return goja.Null()
		}
		return runtime.ToValue(autoMapPageResult(runtime, v))
	default:
		return runtime.ToValue(result)
	}
}

// autoMapPageResult preserves the public page shape when a browser or context
// method returns a native Page. Raw Go pointers expose fields but not the
// JavaScript method names required by the compatibility surface.
func autoMapPageResult(runtime *goja.Runtime, page *Page) map[string]interface{} {
	pageMethods := AutoMapObject(runtime, page)
	pageObj := make(map[string]interface{}, len(pageMethods)+3)
	for name, method := range pageMethods {
		pageObj[name] = method
	}
	pageObj["mouse"] = AutoMapObject(runtime, page.Mouse)
	pageObj["keyboard"] = AutoMapObject(runtime, page.Keyboard)
	pageObj["touchscreen"] = AutoMapObject(runtime, page.Touchscreen)
	return pageObj
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

func getExecutableDirWithSink(sink EventSink) (string, error) {
	execPath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to get executable path: %v", err)
	}
	execDir := filepath.Dir(execPath)
	emitRuntimeLog(sink, "debug", fmt.Sprintf("Executable directory: %s", execDir), nil)
	return execDir, nil
}

// getExecutableDir 返回可执行文件所在目录。
func getExecutableDir() (string, error) {
	return getExecutableDirWithSink(nil)
}

func hasJSFiles(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
			return true
		}
	}
	return false
}

// resolveResourceDirWithSink 优先查找可执行文件目录，其次查找当前工作目录。
func resolveResourceDirWithSink(name string, sink EventSink) (string, error) {
	candidates := make([]string, 0, 8)

	appendProbeChain := func(base string) {
		if strings.TrimSpace(base) == "" {
			return
		}
		current := base
		for {
			candidates = append(candidates, filepath.Join(current, name))
			parent := filepath.Dir(current)
			if parent == current {
				break
			}
			current = parent
		}
	}

	if execDir, err := getExecutableDirWithSink(sink); err == nil {
		appendProbeChain(execDir)
	}
	if wd, err := os.Getwd(); err == nil {
		appendProbeChain(wd)
	}

	seen := make(map[string]struct{})
	for _, dir := range candidates {
		if _, ok := seen[dir]; ok {
			continue
		}
		seen[dir] = struct{}{}

		emitRuntimeLog(sink, "debug", fmt.Sprintf("Probing %s in: %s", name, dir), nil)
		if hasJSFiles(dir) {
			emitRuntimeLog(sink, "debug", fmt.Sprintf("Using %s from: %s", name, dir), nil)
			return dir, nil
		}
	}

	if len(candidates) == 0 {
		return "", fmt.Errorf("no candidate directory available for %s", name)
	}

	if err := os.MkdirAll(candidates[0], 0o755); err != nil {
		return "", fmt.Errorf("failed to create %s directory: %v", name, err)
	}
	emitRuntimeLog(sink, "warn", fmt.Sprintf("No JS files found for %s, fallback directory: %s", name, candidates[0]), nil)
	return candidates[0], nil
}

// resolveResourceDir 保持原有无 sink 调用入口。
func resolveResourceDir(name string) (string, error) {
	return resolveResourceDirWithSink(name, nil)
}

func loadPolyfillsWithSink(runtime *goja.Runtime, sink EventSink) error {
	polyfillsDir, err := resolveResourceDirWithSink("polyfills", sink)
	if err != nil {
		return fmt.Errorf("failed to resolve polyfills directory: %v", err)
	}
	emitRuntimeLog(sink, "debug", fmt.Sprintf("Looking for polyfills in: %s", polyfillsDir), nil)

	entries, err := os.ReadDir(polyfillsDir)
	if err != nil {
		return fmt.Errorf("failed to read polyfills directory: %v", err)
	}

	files := make([]string, 0)
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	if len(files) == 0 {
		emitRuntimeLog(sink, "warn", fmt.Sprintf("No polyfill files found in: %s", polyfillsDir), nil)
	}

	for _, file := range files {
		filePath := filepath.Join(polyfillsDir, file)
		content, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read polyfill file %s: %v", file, err)
		}
		_, err = runtime.RunString(string(content))
		if err != nil {
			return fmt.Errorf("failed to execute polyfill %s: %v", file, err)
		}
		emitRuntimeLog(sink, "debug", fmt.Sprintf("Loaded polyfill: %s", file), nil)
	}

	return nil
}

func loadPolyfills(runtime *goja.Runtime) error {
	return loadPolyfillsWithSink(runtime, nil)
}

func loadJSLibsWithSink(runtime *goja.Runtime, sink EventSink) error {
	jslibsDir, err := resolveResourceDirWithSink("jslibs", sink)
	if err != nil {
		return fmt.Errorf("failed to resolve jslibs directory: %v", err)
	}
	emitRuntimeLog(sink, "debug", fmt.Sprintf("Looking for JS libraries in: %s", jslibsDir), nil)

	entries, err := os.ReadDir(jslibsDir)
	if err != nil {
		return fmt.Errorf("failed to read jslibs directory: %v", err)
	}

	var jsFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
			jsFiles = append(jsFiles, entry.Name())
		}
	}
	sort.Strings(jsFiles)

	if len(jsFiles) == 0 {
		emitRuntimeLog(sink, "warn", fmt.Sprintf("No JS library files found in: %s", jslibsDir), nil)
	}

	for _, file := range jsFiles {
		filePath := filepath.Join(jslibsDir, file)
		content, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read JS library file %s: %v", file, err)
		}
		_, err = runtime.RunString(string(content))
		if err != nil {
			return fmt.Errorf("failed to execute JS library %s: %v", file, err)
		}
		emitRuntimeLog(sink, "debug", fmt.Sprintf("Loaded JS library: %s", file), nil)
	}

	return nil
}

func loadJSLibs(runtime *goja.Runtime) error {
	return loadJSLibsWithSink(runtime, nil)
}

type initEventSink struct {
	base EventSink
}

func (s initEventSink) Emit(category, level, source, kind, message string, fields map[string]any) {
	if s.base == nil {
		return
	}
	if category == "script" {
		category = "framework"
	}
	s.base.Emit(category, level, source, kind, message, fields)
}

// InitJSWithOptions 初始化 JS 环境并支持事件接收器。
func InitJSWithOptions(runtime *goja.Runtime, opts InitJSOptions) error {
	initSink := initEventSink{base: opts.EventSink}
	consoleMethods := AutoMapObject(runtime, NewConsoleWithSink(initSink))
	runtime.Set("console", consoleMethods)

	httpClient := NewHTTPClient(runtime)
	httpMethods := AutoMapObject(runtime, httpClient)
	runtime.Set("http", httpMethods)

	system := NewSystem()
	systemMethods := AutoMapObject(runtime, system)
	runtime.Set("System", systemMethods)

	windowManager := NewWindowManager()
	windowMethods := AutoMapObject(runtime, windowManager)
	runtime.Set("window", windowMethods)

	clipboard := NewClipboard()
	clipboardMethods := AutoMapObject(runtime, clipboard)
	runtime.Set("clipboard", clipboardMethods)

	if os.Getenv("SKIP_FYNE_INIT") == "" {
		floatingWindow := NewFloatingWindow()
		floatingWindowMethods := AutoMapObject(runtime, floatingWindow)
		runtime.Set("FloatingWindow", floatingWindowMethods)
	}

	fileSystem := NewFileSystem()
	fileSystemMethods := AutoMapObject(runtime, fileSystem)
	runtime.Set("File", fileSystemMethods)

	appStorage := NewAppStorage("testMonkey")
	appStorageMethods := AutoMapObject(runtime, appStorage)
	runtime.Set("AppStorage", appStorageMethods)

	sound := NewSound()
	soundMethods := AutoMapObject(runtime, sound)
	runtime.Set("Sound", soundMethods)

	imageColor := NewImageColor()
	imageColorMethods := AutoMapObject(runtime, imageColor)
	runtime.Set("ImageColor", imageColorMethods)

	ocr := NewOCR()
	ocrMethods := AutoMapObject(runtime, ocr)
	runtime.Set("OCR", ocrMethods)

	vision := NewVision()
	visionMethods := AutoMapObject(runtime, vision)
	runtime.Set("Vision", visionMethods)

	timer := NewTimer(runtime)
	timer.RegisterInRuntime()

	page := NewPage()
	mouseMethods := AutoMapObject(runtime, page.Mouse)
	keyboardMethods := AutoMapObject(runtime, page.Keyboard)
	touchscreenMethods := AutoMapObject(runtime, page.Touchscreen)

	runtime.Set("mouse", mouseMethods)
	runtime.Set("keyboard", keyboardMethods)
	runtime.Set("touchscreen", touchscreenMethods)

	pageMethods := AutoMapObject(runtime, page)
	pageObj := make(map[string]interface{})
	for name, method := range pageMethods {
		pageObj[name] = method
	}
	pageObj["mouse"] = mouseMethods
	pageObj["keyboard"] = keyboardMethods
	pageObj["touchscreen"] = touchscreenMethods

	// Provide explicit raw inject surfaces before polyfills load so compatibility
	// wrappers can decorate the legacy object model instead of failing on missing
	// globals.
	runtime.Set("page____Inject", pageObj)
	runtime.Set("page", pageObj)

	browser := NewBrowser()
	browser.DefaultContext().AdoptPage(page)
	browserMethods := AutoMapObject(runtime, browser)
	runtime.Set("browser____Inject", browserMethods)
	runtime.Set("browser", browserMethods)

	defaultContext := browser.DefaultContext()
	contextMethods := AutoMapObject(runtime, defaultContext)
	runtime.Set("context____Inject", contextMethods)
	runtime.Set("context", contextMethods)

	if err := loadPolyfillsWithSink(runtime, opts.EventSink); err != nil {
		return fmt.Errorf("failed to load polyfills: %v", err)
	}
	if err := loadJSLibsWithSink(runtime, opts.EventSink); err != nil {
		return fmt.Errorf("failed to load JS libraries: %v", err)
	}

	// 初始化完成后切换到真实脚本日志接收器，避免把运行期脚本日志继续记为 framework。
	runtime.Set("console", AutoMapObject(runtime, NewConsoleWithSink(opts.EventSink)))

	screen := NewScreen()
	screenMethods := AutoMapObject(runtime, screen)
	runtime.Set("Screen", screenMethods)
	if _, err := runtime.RunString(`Screen.screenshot = page.screenshot;`); err != nil {
		return fmt.Errorf("failed to bind Screen.screenshot: %v", err)
	}
	return nil
}

// InitJS 保持原有初始化入口。
func InitJS(runtime *goja.Runtime) error {
	return InitJSWithOptions(runtime, InitJSOptions{})
}
