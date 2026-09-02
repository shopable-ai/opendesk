package automation

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"unicode"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
	"opendesk/pkg/customui"
	"opendesk/pkg/nativeextension"
)

// InitJSOptions 控制 JS 运行时初始化行为。
type InitJSOptions struct {
	EventSink                       EventSink
	Context                         context.Context
	EventLoop                       *eventloop.EventLoop
	EnableNativeExtensions          bool
	EnableUnsafeNativeExtensionCall bool
	NativeExtensionRoots            []nativeextension.DiscoveryRoot
	EnableCustomUI                  bool
	CustomUIActivationSource        customui.ActivationSource
	CustomUIDriver                  customui.Driver
	CustomUIHostPath                string
	CustomUISessionID               string
	CustomUIBaseDir                 string
	OnAsyncError                    func(error)
	// GlobalShortcutBackendFactory is an internal dependency seam for runtime
	// tests. Normal executions leave it nil and use the platform backend.
	GlobalShortcutBackendFactory GlobalShortcutBackendFactory
	// DesktopEventBackendFactory is an internal dependency seam for lifecycle
	// and event-storm tests. Product executions use the explicit polling backend.
	DesktopEventBackendFactory DesktopEventBackendFactory
	// AudioBackendFactory is an internal dependency seam for Audio unit tests.
	// Normal executions use the platform-selected backend.
	AudioBackendFactory AudioBackendFactory
	// ClipboardBackendFactory is an internal dependency seam for rich-format,
	// size-limit, format-negotiation, and privacy tests.
	ClipboardBackendFactory ClipboardBackendFactory
	// ScreenCaptureBackendFactory is an internal dependency seam for selector,
	// recording lifecycle, and structured-error tests.
	ScreenCaptureBackendFactory  ScreenCaptureBackendFactory
	ScreenCaptureDisplayResolver func() []DisplayInfo
	// AppBackendFactory and AppWindowProbe are internal dependency seams for
	// lifecycle and readiness tests. Product executions reuse the native app
	// snapshot plus the existing normalized Window facade.
	AppBackendFactory AppBackendFactory
	AppWindowProbe    func(int64) (bool, error)
	// NotificationInteractionBackendFactory is an internal dependency seam for
	// own-app list/wait/dismiss lifecycle and privacy tests.
	NotificationInteractionBackendFactory NotificationInteractionBackendFactory
	// SystemSessionBackendFactory is an internal seam for confirmation,
	// capability, and destructive-action tests. Product executions use the
	// platform backend.
	SystemSessionBackendFactory SystemSessionBackendFactory
	OnReady                     func(*RuntimeLifecycle)
}

// RuntimeLifecycle exposes only teardown-safe resources to the runtime owner.
// It is supplied during InitJSWithOptions and must not be used to access Goja
// from another goroutine.
type RuntimeLifecycle struct {
	Timers         *Timer
	HTTP           *HTTPClient
	Sound          *Sound
	UI             *CustomUIRuntime
	GlobalShortcut *GlobalShortcutRuntime
	Events         *DesktopEventsRuntime
	ScreenCapture  *ScreenCaptureRuntime
	App            *AppRuntime
	Notifications  *NotificationsRuntime
}

// Wait joins host workers after their execution context has been cancelled.
// RuntimeLifecycle is never exposed to JavaScript.
func (l *RuntimeLifecycle) Wait() {
	if l != nil && l.HTTP != nil {
		l.HTTP.Wait()
	}
	if l != nil && l.Sound != nil {
		l.Sound.Wait()
	}
	if l != nil && l.UI != nil {
		l.UI.Wait()
	}
	if l != nil && l.Events != nil {
		l.Events.Wait()
	}
	if l != nil && l.ScreenCapture != nil {
		l.ScreenCapture.Wait()
	}
	if l != nil && l.App != nil {
		l.App.Wait()
	}
	if l != nil && l.Notifications != nil {
		l.Notifications.Wait()
	}
}

// CancelAsync discards pending host callbacks after the execution context is
// cancelled. It is called by the runtime owner before EventLoop.Terminate.
func (l *RuntimeLifecycle) CancelAsync() {
	if l != nil && l.HTTP != nil {
		l.HTTP.CancelPending()
	}
	if l != nil && l.UI != nil {
		l.UI.CancelAsync()
	}
	if l != nil && l.Sound != nil {
		l.Sound.Close()
	}
	if l != nil && l.GlobalShortcut != nil {
		l.GlobalShortcut.Close()
	}
	if l != nil && l.Events != nil {
		l.Events.Close()
	}
	if l != nil && l.ScreenCapture != nil {
		l.ScreenCapture.Close()
	}
	if l != nil && l.App != nil {
		l.App.Close()
	}
	if l != nil && l.Notifications != nil {
		l.Notifications.Close()
	}
}

// AsyncCounts is a teardown diagnostic owned by the execution runtime.
func (l *RuntimeLifecycle) AsyncCounts() (timers int, workers int64, callbacks int) {
	if l == nil {
		return 0, 0, 0
	}
	if l.Timers != nil {
		timers = l.Timers.Count()
	}
	if l.HTTP != nil {
		workers = l.HTTP.ActiveWorkers()
		callbacks = l.HTTP.PendingCallbacks()
	}
	if l.Sound != nil {
		soundWorkers, _, _ := l.Sound.ResourceCounts()
		workers += soundWorkers
	}
	if l.UI != nil {
		uiWorkers, uiCallbacks := l.UI.AsyncCounts()
		workers += uiWorkers
		callbacks += uiCallbacks
	}
	if l.GlobalShortcut != nil {
		bindings, pending := l.GlobalShortcut.ResourceCounts()
		callbacks += bindings + pending
	}
	if l.Events != nil {
		subscriptions, pending := l.Events.ResourceCounts()
		callbacks += subscriptions + pending
	}
	if l.ScreenCapture != nil {
		captureWorkers, capturePending, _ := l.ScreenCapture.ResourceCounts()
		workers += captureWorkers
		callbacks += capturePending
	}
	if l.App != nil {
		appWorkers, appPending := l.App.ResourceCounts()
		workers += appWorkers
		callbacks += appPending
	}
	if l.Notifications != nil {
		notificationWorkers, notificationPending := l.Notifications.ResourceCounts()
		workers += notificationWorkers
		callbacks += notificationPending
	}
	return timers, workers, callbacks
}

type RuntimeResourceCounts struct {
	Timers             int
	HTTPWorkers        int64
	HTTPCallbacks      int
	UIWorkers          int64
	UIPending          int
	UIQueued           int
	UIWindows          int
	UIListeners        int
	UIDriverSinks      int
	UIHostProcesses    int
	ShortcutBindings   int
	ShortcutPending    int
	EventSubscriptions int
	EventPending       int
	CaptureWorkers     int64
	CapturePending     int
	CaptureSessions    int
	AppWorkers         int64
	AppPending         int
	SoundWorkers       int64
	SoundPending       int
	SoundPlaybacks     int
}

func (l *RuntimeLifecycle) ResourceCounts() RuntimeResourceCounts {
	counts := RuntimeResourceCounts{}
	if l == nil {
		return counts
	}
	if l.Timers != nil {
		counts.Timers = l.Timers.Count()
	}
	if l.HTTP != nil {
		counts.HTTPWorkers = l.HTTP.ActiveWorkers()
		counts.HTTPCallbacks = l.HTTP.PendingCallbacks()
	}
	if l.UI != nil {
		ui := l.UI.ResourceCounts()
		counts.UIWorkers = ui.Workers
		counts.UIPending = ui.Pending
		counts.UIQueued = ui.Queued
		counts.UIWindows = ui.Windows
		counts.UIListeners = ui.Listeners
		counts.UIDriverSinks = ui.DriverSinks
		counts.UIHostProcesses = ui.HostProcesses
	}
	if l.GlobalShortcut != nil {
		counts.ShortcutBindings, counts.ShortcutPending = l.GlobalShortcut.ResourceCounts()
	}
	if l.Events != nil {
		counts.EventSubscriptions, counts.EventPending = l.Events.ResourceCounts()
	}
	if l.ScreenCapture != nil {
		counts.CaptureWorkers, counts.CapturePending, counts.CaptureSessions = l.ScreenCapture.ResourceCounts()
	}
	if l.App != nil {
		counts.AppWorkers, counts.AppPending = l.App.ResourceCounts()
	}
	if l.Sound != nil {
		counts.SoundWorkers, counts.SoundPending, counts.SoundPlaybacks = l.Sound.ResourceCounts()
	}
	return counts
}

func (c RuntimeResourceCounts) IsZero() bool {
	return c.Timers == 0 && c.HTTPWorkers == 0 && c.HTTPCallbacks == 0 &&
		c.UIWorkers == 0 && c.UIPending == 0 && c.UIQueued == 0 && c.UIWindows == 0 &&
		c.UIListeners == 0 && c.UIDriverSinks == 0 && c.UIHostProcesses == 0 &&
		c.ShortcutBindings == 0 && c.ShortcutPending == 0 &&
		c.EventSubscriptions == 0 && c.EventPending == 0 &&
		c.CaptureWorkers == 0 && c.CapturePending == 0 && c.CaptureSessions == 0 &&
		c.AppWorkers == 0 && c.AppPending == 0 &&
		c.SoundWorkers == 0 && c.SoundPending == 0 && c.SoundPlaybacks == 0
}

func (c RuntimeResourceCounts) String() string {
	return fmt.Sprintf("timers=%d httpWorkers=%d httpCallbacks=%d uiWorkers=%d uiPending=%d uiQueued=%d uiWindows=%d uiListeners=%d uiDriverSinks=%d uiHostProcesses=%d shortcutBindings=%d shortcutPending=%d eventSubscriptions=%d eventPending=%d captureWorkers=%d capturePending=%d captureSessions=%d appWorkers=%d appPending=%d soundWorkers=%d soundPending=%d soundPlaybacks=%d",
		c.Timers, c.HTTPWorkers, c.HTTPCallbacks, c.UIWorkers, c.UIPending, c.UIQueued,
		c.UIWindows, c.UIListeners, c.UIDriverSinks, c.UIHostProcesses, c.ShortcutBindings, c.ShortcutPending,
		c.EventSubscriptions, c.EventPending, c.CaptureWorkers, c.CapturePending, c.CaptureSessions,
		c.AppWorkers, c.AppPending, c.SoundWorkers, c.SoundPending, c.SoundPlaybacks)
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
	jsObj := AutoMapObject(runtime, goObj)
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
					panic(structuredGoError(runtime, lastResult.Interface().(error)))
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

// jsErrorProperties is deliberately package-private: native Runtime APIs may
// opt into structured JavaScript errors without teaching this generic
// reflection bridge about every public error type.
type jsErrorProperties interface {
	JSProperties() map[string]interface{}
}

func structuredGoError(runtime *goja.Runtime, err error) *goja.Object {
	object := runtime.NewGoError(err)
	var structured jsErrorProperties
	if errors.As(err, &structured) {
		for key, value := range structured.JSProperties() {
			_ = object.Set(key, value)
		}
	}
	return object
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
	case DisplayModeInfo:
		return runtime.ToValue(displayModeToMap(v))
	case []DisplayModeInfo:
		return runtime.ToValue(displayModesToMaps(v))
	case DisplayModeChangeResult:
		return runtime.ToValue(displayModeChangeToMap(v))
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

// jsMethodAllowlist is the native half of the documented JavaScript API. It
// is intentionally explicit: adding an exported Go method cannot publish a
// new JavaScript capability by accident. Polyfill-only methods are catalogued
// in tests/runtime-api/manifest.js and never belong here.
var jsMethodAllowlist = map[reflect.Type][]string{
	reflect.TypeOf((*Console)(nil)):        {"Log", "Info", "Warn", "Error", "Debug", "Table", "Group", "GroupEnd", "Time", "TimeEnd", "Clear"},
	reflect.TypeOf((*HTTPClient)(nil)):     {"Request", "Get", "Post"},
	reflect.TypeOf((*System)(nil)):         {"Delay", "GetPlatformInfo", "GetSystemInfo", "GetProcessList", "KillProcess", "GetNetworkInterfaces", "GetNetworkConnections", "GetPowerInfo", "Shutdown", "Restart", "Sleep", "GetDirectoryContents", "GetExecutablePath", "GetWorkingDirectory", "GetUserInfo", "IsAdministrator", "GetSystemMetrics", "GetFingerprint", "ToJSON"},
	reflect.TypeOf((*WindowManager)(nil)):  {"GetCapabilities", "GetActiveWindow", "GetWindowByTitle", "GetFocusWindow", "Focus", "SetWindowBounds", "SetWidth", "SetHeight", "Maximize", "Minimize", "Restore", "RestoreByPID", "MinimizeByPID", "MaximizeByPID", "CloseWindow", "CloseActiveWindow", "Kill", "Title", "GetTitle", "Content", "GetContent", "List", "SetAlwaysOnTop", "UnsetTopMost", "BringToTop"},
	reflect.TypeOf((*FileSystem)(nil)):     {"Path", "Cwd", "Create", "CreateIfNotExists", "CreateWithDirs", "Exists", "EnsureDir", "Read", "ReadBytes", "Write", "Append", "WriteBytes", "AppendBytes", "Copy", "RenameWithoutExtension", "Rename", "Move", "GetExtension", "GetName", "GetNameWithoutExtension", "Remove", "RemoveDir", "ListDir", "IsFile", "IsDir", "IsEmptyDir", "GetHumanReadableSize", "GetSimplifiedPath", "Join", "Open"},
	reflect.TypeOf((*AppStorage)(nil)):     {"GetItem", "SetItem", "RemoveItem", "Clear", "GetLength", "Key"},
	reflect.TypeOf((*Sound)(nil)):          {"PlaySuccess", "PlayFail", "PlayWarning", "PlayError", "PlayCaptcha", "PlaySound", "Play"},
	reflect.TypeOf((*ImageColor)(nil)):     {"FindPos", "LoadBase64", "Resize", "Clip", "Pixel", "FindColor", "FindColorBlocks", "HasColor", "IsGray", "GetSize", "Save", "FindRedChannel", "FindGreenChannel", "FindBlueChannel", "ToRGB", "ToRGBA", "ToHSL", "ToHSLA", "IsColorSimilar", "AnalyzeLayout"},
	reflect.TypeOf((*OCR)(nil)):            {"ExtractText"},
	reflect.TypeOf((*Vision)(nil)):         {"RunOCR", "DetectUI", "GetCapabilities", "AnalyzeLayout", "AnnotateRegions"},
	reflect.TypeOf((*Page)(nil)):           {"Browser", "Context", "Screenshot", "CaptureScreen", "CheckScreenshotPermissions", "OpenMacOSPrivacySettings", "RequestMacPermissions", "EnsureMacPermissions", "RequestMacAutomationPermission", "Goto", "OpenURL", "OpenApp", "OpenURLInApp", "Title", "WaitFor", "Url"},
	reflect.TypeOf((*Mouse)(nil)):          {"Click", "ClickForPID", "Move", "Down", "Up", "GetPos", "Wheel"},
	reflect.TypeOf((*Keyboard)(nil)):       {"Type", "Press", "Down", "Up", "Combination"},
	reflect.TypeOf((*Touchscreen)(nil)):    {"Tap"},
	reflect.TypeOf((*Browser)(nil)):        {"NewPage", "NewContext", "DefaultContext", "Contexts", "Pages", "LastPage", "Close", "IsClosed"},
	reflect.TypeOf((*BrowserContext)(nil)): {"Browser", "NewPage", "AdoptPage", "Pages", "LastPage", "Close", "IsClosed", "Cookies", "SetCookies", "ClearCookies", "Storage", "SetStorage", "GetStorage", "ClearStorage", "Session", "SetSessionValue", "GetSessionValue", "ClearSession"},
	reflect.TypeOf((*Screen)(nil)):         {"GetWidth", "GetHeight", "GetDisplays", "GetPrimaryDisplay", "GetDisplay", "GetVirtualBounds", "Pixel", "Pixels", "GetDisplayCapabilities", "GetDisplayMode", "ListDisplayModes", "SetDisplayMode"},
}

// AutoMapObject creates the explicit JavaScript method mapping for a known
// native API object. Unknown Go types receive no reflected methods.
func AutoMapObject(runtime *goja.Runtime, goObj interface{}) map[string]interface{} {
	val := reflect.ValueOf(goObj)
	jsObj := make(map[string]interface{})
	if !val.IsValid() || (val.Kind() == reflect.Ptr && val.IsNil()) {
		return jsObj
	}
	typ := val.Type()
	for _, goMethodName := range jsMethodAllowlist[typ] {
		method, found := typ.MethodByName(goMethodName)
		if !found || method.PkgPath != "" {
			continue
		}
		jsObj[toLowerFirst(goMethodName)] = createJSMethodWrapper(runtime, val, method)
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

type compiledJavaScriptAsset struct {
	name    string
	program *goja.Program
}

type compiledJavaScriptBundle struct {
	dir    string
	assets []compiledJavaScriptAsset
	err    error
}

var staticJavaScriptBundles = struct {
	sync.Mutex
	byName map[string]compiledJavaScriptBundle
}{byName: make(map[string]compiledJavaScriptBundle)}

// staticJavaScriptReadFile is a narrow seam for cache verification. Production
// always uses os.ReadFile; tests replace it only while exercising a reset cache.
var staticJavaScriptReadFile = os.ReadFile

// loadStaticJavaScriptAssets resolves, reads, and compiles each static asset at
// most once per process. goja.Program is immutable and safe to run in multiple
// runtimes, which removes per-runtime filesystem I/O and parse costs.
func loadStaticJavaScriptAssets(runtime *goja.Runtime, name, label string, sink EventSink) error {
	staticJavaScriptBundles.Lock()
	bundle, exists := staticJavaScriptBundles.byName[name]
	if !exists {
		bundle = compileStaticJavaScriptAssets(name, label, sink)
		staticJavaScriptBundles.byName[name] = bundle
	}
	staticJavaScriptBundles.Unlock()
	if bundle.err != nil {
		return bundle.err
	}

	for _, asset := range bundle.assets {
		if _, err := runtime.RunProgram(asset.program); err != nil {
			return fmt.Errorf("failed to execute %s %s: %w", label, asset.name, err)
		}
		emitRuntimeLog(sink, "debug", fmt.Sprintf("Loaded %s: %s", label, asset.name), nil)
	}
	return nil
}

func compileStaticJavaScriptAssets(name, label string, sink EventSink) compiledJavaScriptBundle {
	dir, err := resolveResourceDirWithSink(name, sink)
	if err != nil {
		return compiledJavaScriptBundle{err: fmt.Errorf("failed to resolve %s directory: %w", label, err)}
	}
	emitRuntimeLog(sink, "debug", fmt.Sprintf("Compiling %s from: %s", label, dir), nil)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return compiledJavaScriptBundle{dir: dir, err: fmt.Errorf("failed to read %s directory: %w", label, err)}
	}

	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)
	if len(files) == 0 {
		emitRuntimeLog(sink, "warn", fmt.Sprintf("No %s files found in: %s", label, dir), nil)
	}

	bundle := compiledJavaScriptBundle{dir: dir, assets: make([]compiledJavaScriptAsset, 0, len(files))}
	for _, file := range files {
		path := filepath.Join(dir, file)
		content, err := staticJavaScriptReadFile(path)
		if err != nil {
			bundle.err = fmt.Errorf("failed to read %s %s: %w", label, file, err)
			return bundle
		}
		program, err := goja.Compile(path, string(content), false)
		if err != nil {
			bundle.err = fmt.Errorf("failed to compile %s %s: %w", label, file, err)
			return bundle
		}
		bundle.assets = append(bundle.assets, compiledJavaScriptAsset{name: file, program: program})
	}
	return bundle
}

func loadPolyfillsWithSink(runtime *goja.Runtime, sink EventSink) error {
	return loadStaticJavaScriptAssets(runtime, "polyfills", "polyfill", sink)
}

func loadPolyfills(runtime *goja.Runtime) error {
	return loadPolyfillsWithSink(runtime, nil)
}

func loadJSLibsWithSink(runtime *goja.Runtime, sink EventSink) error {
	return loadStaticJavaScriptAssets(runtime, "jslibs", "JS library", sink)
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

	httpClient := NewHTTPClientWithOptions(runtime, opts.Context, opts.EventLoop, opts.OnAsyncError)
	httpMethods := AutoMapObject(runtime, httpClient)
	runtime.Set("http", httpMethods)

	timer := NewTimer(runtime, opts.EventLoop, opts.OnAsyncError)
	timer.RegisterInRuntime()

	var sessionBackend SystemSessionBackend
	if opts.SystemSessionBackendFactory != nil {
		sessionBackend = opts.SystemSessionBackendFactory()
	}
	system := NewSystemWithSessionBackend(runtime, timer, sessionBackend)
	systemMethods := AutoMapObject(runtime, system)
	registerSystemSession(runtime, system, systemMethods)
	runtime.Set("System", systemMethods)

	windowManager := NewWindowManager()
	windowMethods := AutoMapObject(runtime, windowManager)
	runtime.Set("window", windowMethods)

	registerClipboard(runtime, opts)
	appRuntime := registerApp(runtime, opts)
	notificationsRuntime := registerNotifications(runtime, opts)

	globalShortcut := registerGlobalShortcut(runtime, opts)
	events := registerDesktopEvents(runtime, opts)

	fileSystem := NewFileSystem()
	fileSystemMethods := AutoMapObject(runtime, fileSystem)
	runtime.Set("File", fileSystemMethods)

	appStorage := NewAppStorage("testMonkey")
	appStorageMethods := AutoMapObject(runtime, appStorage)
	runtime.Set("AppStorage", appStorageMethods)

	sound := registerSound(runtime, opts)
	registerAudio(runtime, opts)

	imageColor := NewImageColor()
	imageColorMethods := AutoMapObject(runtime, imageColor)
	runtime.Set("ImageColor", imageColorMethods)

	ocr := NewOCR()
	ocrMethods := AutoMapObject(runtime, ocr)
	runtime.Set("OCR", ocrMethods)

	vision := NewVision()
	visionMethods := AutoMapObject(runtime, vision)
	runtime.Set("Vision", visionMethods)

	if opts.EnableNativeExtensions {
		if err := registerNativeExtensions(runtime, opts.Context, opts.EventSink, opts.NativeExtensionRoots); err != nil {
			return fmt.Errorf("failed to register NativeExtensions: %w", err)
		}
	}
	if opts.EnableUnsafeNativeExtensionCall {
		if err := registerNativeExtension(runtime, opts.Context, opts.EventSink); err != nil {
			return fmt.Errorf("failed to register NativeExtension: %w", err)
		}
	}
	uiRuntime, err := registerCustomUI(runtime, opts)
	if err != nil {
		return fmt.Errorf("failed to register custom UI: %w", err)
	}
	// Dialog is always injected so untrusted transports get a stable,
	// fail-closed DIALOG_DISABLED error rather than an absent global. Its native
	// implementation is still owned by the explicitly authorized Custom UI host.
	if err := registerDialog(runtime, uiRuntime, opts); err != nil {
		return fmt.Errorf("failed to register Dialog: %w", err)
	}

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

	// notify() is supplied by 000-systemBase.js. Register its native bridge
	// before loading polyfills so every execution transport gets the documented
	// global helper through the same Runtime initialization path.
	if err := runtime.Set("notify____Inject", func(call goja.FunctionCall) goja.Value {
		return notifyBridge(runtime, call)
	}); err != nil {
		return fmt.Errorf("failed to register notify bridge: %w", err)
	}

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
	screenCapture := registerScreenCapture(runtime, screenMethods, opts)
	runtime.Set("Screen", screenMethods)
	if _, err := runtime.RunString(`Screen.screenshot = page.screenshot;`); err != nil {
		return fmt.Errorf("failed to bind Screen.screenshot: %v", err)
	}
	if opts.OnReady != nil {
		opts.OnReady(&RuntimeLifecycle{Timers: timer, HTTP: httpClient, Sound: sound, UI: uiRuntime, GlobalShortcut: globalShortcut, Events: events, ScreenCapture: screenCapture, App: appRuntime, Notifications: notificationsRuntime})
	}
	return nil
}

// InitJS 保持原有初始化入口。
func InitJS(runtime *goja.Runtime) error {
	return InitJSWithOptions(runtime, InitJSOptions{})
}
