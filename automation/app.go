package automation

import (
	"context"
	"errors"
	"math"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
)

const (
	defaultAppOperationTimeout = 10 * time.Second
	appPollInterval            = 100 * time.Millisecond
)

type AppErrorCode string

const (
	AppInvalidArgument AppErrorCode = "INVALID_ARGUMENT"
	AppNotSupported    AppErrorCode = "NOT_SUPPORTED"
	AppNotFound        AppErrorCode = "NOT_FOUND"
	AppLaunchFailed    AppErrorCode = "LAUNCH_FAILED"
	AppTerminateFailed AppErrorCode = "TERMINATE_FAILED"
	AppTimeout         AppErrorCode = "TIMEOUT"
	AppCanceled        AppErrorCode = "CANCELED"
	AppBackendFailed   AppErrorCode = "BACKEND_FAILED"
)

type AppError struct {
	Code      AppErrorCode
	Operation string
	Message   string
	Cause     error
}

func (e *AppError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" {
		message = "application lifecycle operation failed"
	}
	return string(e.Code) + ": " + message
}

func (e *AppError) Unwrap() error { return e.Cause }

type appWaitOptions struct {
	timeout   time.Duration
	readiness string
}

type appLaunchOptions struct {
	appWaitOptions
	activate    bool
	activateSet bool
}

type appTerminateOptions struct {
	timeout time.Duration
	force   bool
}

type pendingAppOperation struct {
	resolve func(interface{}) error
	reject  func(interface{}) error
	convert func(interface{}) goja.Value
}

// AppRuntime owns only execution-scoped workers and promise callbacks. The
// backend itself reuses the repository's existing app/process snapshot and
// platform launch/terminate implementation.
type AppRuntime struct {
	runtime *goja.Runtime
	loop    interface {
		RunOnLoop(func(*goja.Runtime)) bool
	}
	context context.Context
	cancel  context.CancelFunc
	backend AppBackend
	window  func(int64) (bool, error)

	onAsyncError func(error)
	closing      atomic.Bool
	workers      atomic.Int64
	wg           sync.WaitGroup
	mu           sync.Mutex
	nextID       uint64
	pending      map[uint64]pendingAppOperation
}

func registerApp(runtimeValue *goja.Runtime, opts InitJSOptions) *AppRuntime {
	var backend AppBackend
	if opts.AppBackendFactory != nil {
		backend = opts.AppBackendFactory()
	} else {
		backend = newDefaultAppBackend()
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	manager := &AppRuntime{
		runtime: runtimeValue, context: ctx, cancel: cancel, backend: backend,
		onAsyncError: opts.OnAsyncError, pending: map[uint64]pendingAppOperation{},
		window: opts.AppWindowProbe,
	}
	if manager.backend == nil {
		manager.backend = newDefaultAppBackend()
	}
	if opts.EventLoop != nil {
		manager.loop = opts.EventLoop
	}
	if manager.window == nil {
		manager.window = appHasWindow
	}
	object := runtimeValue.NewObject()
	_ = object.Set("list", func(call goja.FunctionCall) goja.Value { return manager.list(call) })
	_ = object.Set("get", func(call goja.FunctionCall) goja.Value { return manager.get(call) })
	_ = object.Set("isRunning", func(call goja.FunctionCall) goja.Value { return manager.isRunning(call) })
	_ = object.Set("launch", func(call goja.FunctionCall) goja.Value { return manager.launch(call) })
	_ = object.Set("waitForLaunch", func(call goja.FunctionCall) goja.Value { return manager.waitForLaunch(call) })
	_ = object.Set("waitForExit", func(call goja.FunctionCall) goja.Value { return manager.waitForExit(call) })
	_ = object.Set("terminate", func(call goja.FunctionCall) goja.Value { return manager.terminate(call) })
	_ = object.Set("restart", func(call goja.FunctionCall) goja.Value { return manager.restart(call) })
	_ = object.Set("getCapabilities", func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(manager.capabilities())
	})
	_ = runtimeValue.Set("App", object)
	return manager
}

func (a *AppRuntime) list(call goja.FunctionCall) goja.Value {
	if err := requireEmptyOptions(call.Argument(0), "App.list"); err != nil {
		panic(appJSError(a.runtime, err))
	}
	apps, err := a.backend.List(a.context)
	if err != nil {
		panic(appJSError(a.runtime, wrapAppError("App.list", err)))
	}
	sortApplicationStates(apps)
	result := make([]map[string]interface{}, 0, len(apps))
	for _, app := range apps {
		result = append(result, appInstanceProjection(app))
	}
	return a.runtime.ToValue(result)
}

func (a *AppRuntime) get(call goja.FunctionCall) goja.Value {
	target, err := parseAppTarget(call.Argument(0), "App.get", false)
	if err != nil {
		panic(appJSError(a.runtime, err))
	}
	apps, err := a.matches(a.context, target)
	if err != nil {
		panic(appJSError(a.runtime, wrapAppError("App.get", err)))
	}
	if len(apps) == 0 {
		return goja.Null()
	}
	return a.runtime.ToValue(appGroupProjection(target, apps))
}

func (a *AppRuntime) isRunning(call goja.FunctionCall) goja.Value {
	target, err := parseAppTarget(call.Argument(0), "App.isRunning", false)
	if err != nil {
		panic(appJSError(a.runtime, err))
	}
	apps, err := a.matches(a.context, target)
	if err != nil {
		panic(appJSError(a.runtime, wrapAppError("App.isRunning", err)))
	}
	return a.runtime.ToValue(len(apps) > 0)
}

func (a *AppRuntime) launch(call goja.FunctionCall) goja.Value {
	target, err := parseAppTarget(call.Argument(0), "App.launch", true)
	if err != nil {
		return a.rejected(err)
	}
	options, err := parseAppLaunchOptions(call.Argument(1), "App.launch")
	if err != nil {
		return a.rejected(err)
	}
	if err := validateAppLaunchCapabilities(a.backend, options, "App.launch"); err != nil {
		return a.rejected(err)
	}
	return a.startAsync("App.launch", func(parent context.Context) (interface{}, error) {
		ctx, cancel := context.WithTimeout(parent, options.timeout)
		defer cancel()
		if err := a.backend.Launch(ctx, target, options.activate); err != nil {
			return nil, err
		}
		return a.waitForPresent(ctx, target, options.readiness)
	}, func(value interface{}) goja.Value {
		return a.runtime.ToValue(appGroupProjection(target, value.([]desktopApplicationState)))
	})
}

func (a *AppRuntime) waitForLaunch(call goja.FunctionCall) goja.Value {
	target, err := parseAppTarget(call.Argument(0), "App.waitForLaunch", false)
	if err != nil {
		return a.rejected(err)
	}
	options, err := parseAppWaitOptions(call.Argument(1), "App.waitForLaunch")
	if err != nil {
		return a.rejected(err)
	}
	if err := validateAppReadinessCapability(a.backend, options.readiness, "App.waitForLaunch"); err != nil {
		return a.rejected(err)
	}
	return a.startAsync("App.waitForLaunch", func(parent context.Context) (interface{}, error) {
		ctx, cancel := context.WithTimeout(parent, options.timeout)
		defer cancel()
		return a.waitForPresent(ctx, target, options.readiness)
	}, func(value interface{}) goja.Value {
		return a.runtime.ToValue(appGroupProjection(target, value.([]desktopApplicationState)))
	})
}

func (a *AppRuntime) waitForExit(call goja.FunctionCall) goja.Value {
	target, err := parseAppTarget(call.Argument(0), "App.waitForExit", false)
	if err != nil {
		return a.rejected(err)
	}
	options, err := parseAppExitOptions(call.Argument(1), "App.waitForExit")
	if err != nil {
		return a.rejected(err)
	}
	return a.startAsync("App.waitForExit", func(parent context.Context) (interface{}, error) {
		ctx, cancel := context.WithTimeout(parent, options)
		defer cancel()
		return true, a.waitUntil(ctx, func(ctx context.Context) (bool, error) {
			matches, err := a.matches(ctx, target)
			return len(matches) == 0, err
		})
	}, nil)
}

func (a *AppRuntime) terminate(call goja.FunctionCall) goja.Value {
	target, err := parseAppTarget(call.Argument(0), "App.terminate", false)
	if err != nil {
		return a.rejected(err)
	}
	options, err := parseAppTerminateOptions(call.Argument(1), "App.terminate")
	if err != nil {
		return a.rejected(err)
	}
	return a.startAsync("App.terminate", func(parent context.Context) (interface{}, error) {
		ctx, cancel := context.WithTimeout(parent, options.timeout)
		defer cancel()
		apps, err := a.matches(ctx, target)
		if err != nil {
			return nil, err
		}
		if len(apps) == 0 {
			return nil, appOperationError("", AppNotFound, "no running application matches target", nil)
		}
		pids := applicationPIDs(apps)
		for _, pid := range pids {
			if err := a.backend.Terminate(ctx, pid, options.force); err != nil {
				if !isAppNotFound(err) {
					return nil, err
				}
			}
		}
		if err := a.waitForPIDsExit(ctx, pids); err != nil {
			return nil, err
		}
		if target.Kind != appTargetPID {
			remaining, err := a.matches(ctx, target)
			if err != nil {
				return nil, err
			}
			if len(remaining) > 0 {
				return nil, appOperationError("", AppTerminateFailed, "application remains running under the stable target identity", nil)
			}
		}
		return map[string]interface{}{"terminated": true, "force": options.force, "pids": pids}, nil
	}, nil)
}

func (a *AppRuntime) restart(call goja.FunctionCall) goja.Value {
	target, err := parseAppTarget(call.Argument(0), "App.restart", false)
	if err != nil {
		return a.rejected(err)
	}
	options, force, err := parseAppRestartOptions(call.Argument(1))
	if err != nil {
		return a.rejected(err)
	}
	if err := validateAppLaunchCapabilities(a.backend, options, "App.restart"); err != nil {
		return a.rejected(err)
	}
	return a.startAsync("App.restart", func(parent context.Context) (interface{}, error) {
		ctx, cancel := context.WithTimeout(parent, options.timeout)
		defer cancel()
		apps, err := a.matches(ctx, target)
		if err != nil {
			return nil, err
		}
		launchTarget := target
		if target.Kind == appTargetPID {
			if len(apps) == 0 {
				return nil, appOperationError("", AppNotFound, "PID target is no longer running", nil)
			}
			launchTarget = stableAppTarget(apps[0])
		}
		pids := applicationPIDs(apps)
		for _, pid := range pids {
			if err := a.backend.Terminate(ctx, pid, force); err != nil {
				if !isAppNotFound(err) {
					return nil, err
				}
			}
		}
		if len(pids) > 0 {
			if err := a.waitForPIDsExit(ctx, pids); err != nil {
				return nil, err
			}
		}
		if err := a.backend.Launch(ctx, launchTarget, options.activate); err != nil {
			return nil, err
		}
		return a.waitForPresent(ctx, launchTarget, options.readiness)
	}, func(value interface{}) goja.Value {
		apps := value.([]desktopApplicationState)
		return a.runtime.ToValue(appGroupProjection(stableAppTarget(apps[0]), apps))
	})
}

func (a *AppRuntime) capabilities() map[string]interface{} {
	result := map[string]interface{}{}
	if a.backend != nil {
		for key, value := range a.backend.Capabilities() {
			result[key] = value
		}
	}
	result["schemaVersion"] = 1
	result["platform"] = runtime.GOOS
	result["backend"] = a.backend.Name()
	result["grouping"] = map[string]interface{}{"multiProcess": true, "stableIdentityPreferred": true}
	return result
}

func (a *AppRuntime) matches(ctx context.Context, target appTarget) ([]desktopApplicationState, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	apps, err := a.backend.List(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]desktopApplicationState, 0)
	for _, app := range apps {
		if appMatchesTarget(app, target) {
			result = append(result, app)
		}
	}
	sortApplicationStates(result)
	return result, nil
}

func (a *AppRuntime) waitForPresent(ctx context.Context, target appTarget, readiness string) ([]desktopApplicationState, error) {
	var result []desktopApplicationState
	err := a.waitUntil(ctx, func(ctx context.Context) (bool, error) {
		matches, err := a.matches(ctx, target)
		if err != nil || len(matches) == 0 {
			return false, err
		}
		if readiness == "window" {
			for _, app := range matches {
				ready, err := a.window(app.PID)
				if err != nil {
					return false, err
				}
				if ready {
					result = matches
					return true, nil
				}
			}
			return false, nil
		}
		result = matches
		return true, nil
	})
	return result, err
}

func (a *AppRuntime) waitForPIDsExit(ctx context.Context, pids []int64) error {
	set := make(map[int64]bool, len(pids))
	for _, pid := range pids {
		set[pid] = true
	}
	return a.waitUntil(ctx, func(ctx context.Context) (bool, error) {
		apps, err := a.backend.List(ctx)
		if err != nil {
			return false, err
		}
		for _, app := range apps {
			if set[app.PID] {
				return false, nil
			}
		}
		return true, nil
	})
}

func (a *AppRuntime) waitUntil(ctx context.Context, predicate func(context.Context) (bool, error)) error {
	ticker := time.NewTicker(appPollInterval)
	defer ticker.Stop()
	for {
		ready, err := predicate(ctx)
		if err != nil {
			return err
		}
		if ready {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (a *AppRuntime) startAsync(operation string, worker func(context.Context) (interface{}, error), convert func(interface{}) goja.Value) goja.Value {
	if a.loop == nil {
		return a.rejected(appOperationError(operation, AppNotSupported, "App lifecycle methods require the execution EventLoop", nil))
	}
	if a.closing.Load() {
		return a.rejected(appOperationError(operation, AppCanceled, "App runtime is closing", nil))
	}
	promise, resolve, reject := a.runtime.NewPromise()
	a.mu.Lock()
	a.nextID++
	id := a.nextID
	a.pending[id] = pendingAppOperation{resolve: resolve, reject: reject, convert: convert}
	a.mu.Unlock()
	a.workers.Add(1)
	a.wg.Add(1)
	go func() {
		defer a.workers.Add(-1)
		defer a.wg.Done()
		value, err := worker(a.context)
		err = wrapAppError(operation, err)
		if a.closing.Load() {
			return
		}
		if !a.loop.RunOnLoop(func(*goja.Runtime) { a.finishAsync(id, value, err) }) && err != nil {
			a.reportAsync(err)
		}
	}()
	return a.runtime.ToValue(promise)
}

func (a *AppRuntime) finishAsync(id uint64, value interface{}, err error) {
	a.mu.Lock()
	pending, ok := a.pending[id]
	if ok {
		delete(a.pending, id)
	}
	a.mu.Unlock()
	if !ok {
		return
	}
	if err != nil {
		_ = pending.reject(appJSError(a.runtime, err))
		return
	}
	if pending.convert != nil {
		_ = pending.resolve(pending.convert(value))
		return
	}
	_ = pending.resolve(value)
}

func (a *AppRuntime) rejected(err error) goja.Value {
	promise, _, reject := a.runtime.NewPromise()
	_ = reject(appJSError(a.runtime, err))
	return a.runtime.ToValue(promise)
}

func (a *AppRuntime) Close() {
	if a == nil || !a.closing.CompareAndSwap(false, true) {
		return
	}
	a.cancel()
	a.mu.Lock()
	pending := a.pending
	a.pending = map[uint64]pendingAppOperation{}
	a.mu.Unlock()
	for _, item := range pending {
		_ = item.reject(appJSError(a.runtime, appOperationError("App.cleanup", AppCanceled, "application operation canceled during execution teardown", nil)))
	}
}

func (a *AppRuntime) Wait() {
	if a != nil {
		a.wg.Wait()
	}
}

func (a *AppRuntime) ResourceCounts() (int64, int) {
	if a == nil {
		return 0, 0
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.workers.Load(), len(a.pending)
}

func (a *AppRuntime) reportAsync(err error) {
	if err != nil && a.onAsyncError != nil {
		a.onAsyncError(err)
	}
}

func appHasWindow(pid int64) (bool, error) {
	return appHasWindowPlatform(pid)
}

func appHasWindowFromFacade(pid int64) (bool, error) {
	windows, err := NewWindowManager().List()
	if err != nil {
		return false, err
	}
	for _, window := range windows {
		if integerValue(window["pid"]) == pid {
			return true, nil
		}
	}
	return false, nil
}

func parseAppTarget(value goja.Value, operation string, launch bool) (appTarget, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return appTarget{}, appOperationError(operation, AppInvalidArgument, "target is required", nil)
	}
	switch raw := value.Export().(type) {
	case string:
		return classifyAppStringTarget(raw, operation, launch)
	case int64:
		return appPIDTarget(raw, operation, launch)
	case int32:
		return appPIDTarget(int64(raw), operation, launch)
	case int:
		return appPIDTarget(int64(raw), operation, launch)
	case float64:
		if math.IsNaN(raw) || math.IsInf(raw, 0) || raw != math.Trunc(raw) {
			return appTarget{}, appOperationError(operation, AppInvalidArgument, "PID target must be an integer", nil)
		}
		return appPIDTarget(int64(raw), operation, launch)
	case map[string]interface{}:
		if len(raw) != 1 {
			return appTarget{}, appOperationError(operation, AppInvalidArgument, "target object must contain exactly one of pid, name, bundleId, or path", nil)
		}
		for key, item := range raw {
			switch key {
			case "pid":
				pid, ok := finiteAppPID(item)
				if !ok {
					return appTarget{}, appOperationError(operation, AppInvalidArgument, "target.pid must be a positive 32-bit integer", nil)
				}
				return appPIDTarget(pid, operation, launch)
			case "name", "bundleId", "path":
				text, ok := item.(string)
				if !ok || strings.TrimSpace(text) == "" {
					return appTarget{}, appOperationError(operation, AppInvalidArgument, "target."+key+" must be a non-empty string", nil)
				}
				text = strings.TrimSpace(text)
				kind := appTargetName
				if key == "bundleId" {
					kind = appTargetBundleID
				} else if key == "path" {
					kind = appTargetPath
					if !filepath.IsAbs(text) || filepath.Clean(text) != text {
						return appTarget{}, appOperationError(operation, AppInvalidArgument, "target.path must be a clean absolute path", nil)
					}
					if launch {
						if err := validateAppBundlePath(text); err != nil {
							return appTarget{}, err
						}
					}
				}
				return normalizeAppTarget(appTarget{Kind: kind, Value: text}), nil
			default:
				return appTarget{}, appOperationError(operation, AppInvalidArgument, "target contains an unknown field", nil)
			}
		}
	}
	return appTarget{}, appOperationError(operation, AppInvalidArgument, "target must be a PID, string, or identity object", nil)
}

func classifyAppStringTarget(value, operation string, launch bool) (appTarget, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return appTarget{}, appOperationError(operation, AppInvalidArgument, "target string must not be empty", nil)
	}
	if filepath.IsAbs(value) {
		if filepath.Clean(value) != value {
			return appTarget{}, appOperationError(operation, AppInvalidArgument, "target path must be clean", nil)
		}
		if launch {
			if err := validateAppBundlePath(value); err != nil {
				return appTarget{}, err
			}
		}
		return normalizeAppTarget(appTarget{Kind: appTargetPath, Value: value}), nil
	}
	if runtime.GOOS == "darwin" && strings.Contains(value, ".") && !strings.ContainsAny(value, `/\\`) {
		return normalizeAppTarget(appTarget{Kind: appTargetBundleID, Value: value}), nil
	}
	return normalizeAppTarget(appTarget{Kind: appTargetName, Value: value}), nil
}

func appPIDTarget(pid int64, operation string, launch bool) (appTarget, error) {
	if pid <= 0 || pid > math.MaxInt32 {
		return appTarget{}, appOperationError(operation, AppInvalidArgument, "PID target must be a positive 32-bit integer", nil)
	}
	if launch {
		return appTarget{}, appOperationError(operation, AppInvalidArgument, "App.launch does not accept a PID target", nil)
	}
	return appTarget{Kind: appTargetPID, PID: pid}, nil
}

func finiteAppPID(value interface{}) (int64, bool) {
	var number float64
	switch typed := value.(type) {
	case int:
		number = float64(typed)
	case int32:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, false
	}
	return int64(number), !math.IsNaN(number) && !math.IsInf(number, 0) && number == math.Trunc(number) && number > 0 && number <= math.MaxInt32
}

func requireEmptyOptions(value goja.Value, operation string) error {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok || len(options) != 0 {
		return appOperationError(operation, AppInvalidArgument, "options must be an empty object when provided", nil)
	}
	return nil
}

func parseAppLaunchOptions(value goja.Value, operation string) (appLaunchOptions, error) {
	result := appLaunchOptions{appWaitOptions: appWaitOptions{timeout: defaultAppOperationTimeout, readiness: "process"}, activate: true}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, appOperationError(operation, AppInvalidArgument, "options must be an object", nil)
	}
	allowed := map[string]bool{"activate": true, "waitUntilReady": true, "timeout": true, "args": true, "env": true, "cwd": true}
	for key := range options {
		if !allowed[key] {
			return result, appOperationError(operation, AppInvalidArgument, "options contains an unknown field", nil)
		}
		if key == "args" || key == "env" || key == "cwd" {
			return result, appOperationError(operation, AppNotSupported, key+" is not supported by the current application launcher", nil)
		}
	}
	if raw, exists := options["activate"]; exists {
		activate, valid := raw.(bool)
		if !valid {
			return result, appOperationError(operation, AppInvalidArgument, "activate must be a boolean", nil)
		}
		result.activate = activate
		result.activateSet = true
	}
	if err := applyAppWaitFields(&result.appWaitOptions, options, operation); err != nil {
		return result, err
	}
	return result, nil
}

func parseAppWaitOptions(value goja.Value, operation string) (appWaitOptions, error) {
	result := appWaitOptions{timeout: defaultAppOperationTimeout, readiness: "process"}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, appOperationError(operation, AppInvalidArgument, "options must be an object", nil)
	}
	for key := range options {
		if key != "waitUntilReady" && key != "timeout" {
			return result, appOperationError(operation, AppInvalidArgument, "options contains an unknown field", nil)
		}
	}
	if err := applyAppWaitFields(&result, options, operation); err != nil {
		return result, err
	}
	return result, nil
}

func applyAppWaitFields(result *appWaitOptions, options map[string]interface{}, operation string) error {
	if raw, exists := options["waitUntilReady"]; exists {
		readiness, valid := raw.(string)
		if !valid || (readiness != "process" && readiness != "window") {
			return appOperationError(operation, AppInvalidArgument, "waitUntilReady must be process or window", nil)
		}
		result.readiness = readiness
	}
	if raw, exists := options["timeout"]; exists {
		timeout, err := appTimeout(raw, operation)
		if err != nil {
			return err
		}
		result.timeout = timeout
	}
	return nil
}

func parseAppExitOptions(value goja.Value, operation string) (time.Duration, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return defaultAppOperationTimeout, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok || len(options) > 1 {
		return 0, appOperationError(operation, AppInvalidArgument, "options may contain only timeout", nil)
	}
	for key, raw := range options {
		if key != "timeout" {
			return 0, appOperationError(operation, AppInvalidArgument, "options contains an unknown field", nil)
		}
		return appTimeout(raw, operation)
	}
	return defaultAppOperationTimeout, nil
}

func parseAppTerminateOptions(value goja.Value, operation string) (appTerminateOptions, error) {
	result := appTerminateOptions{timeout: defaultAppOperationTimeout}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, appOperationError(operation, AppInvalidArgument, "options must be an object", nil)
	}
	for key, raw := range options {
		switch key {
		case "force":
			force, valid := raw.(bool)
			if !valid {
				return result, appOperationError(operation, AppInvalidArgument, "force must be a boolean", nil)
			}
			result.force = force
		case "timeout":
			timeout, err := appTimeout(raw, operation)
			if err != nil {
				return result, err
			}
			result.timeout = timeout
		default:
			return result, appOperationError(operation, AppInvalidArgument, "options contains an unknown field", nil)
		}
	}
	return result, nil
}

func parseAppRestartOptions(value goja.Value) (appLaunchOptions, bool, error) {
	result := appLaunchOptions{appWaitOptions: appWaitOptions{timeout: defaultAppOperationTimeout, readiness: "process"}, activate: true}
	force := false
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, force, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, force, appOperationError("App.restart", AppInvalidArgument, "options must be an object", nil)
	}
	allowed := map[string]bool{"activate": true, "waitUntilReady": true, "timeout": true, "force": true}
	for key := range options {
		if !allowed[key] {
			return result, force, appOperationError("App.restart", AppInvalidArgument, "options contains an unknown field", nil)
		}
	}
	if raw, exists := options["force"]; exists {
		var valid bool
		force, valid = raw.(bool)
		if !valid {
			return result, force, appOperationError("App.restart", AppInvalidArgument, "force must be a boolean", nil)
		}
	}
	if raw, exists := options["activate"]; exists {
		activate, valid := raw.(bool)
		if !valid {
			return result, force, appOperationError("App.restart", AppInvalidArgument, "activate must be a boolean", nil)
		}
		result.activate = activate
		result.activateSet = true
	}
	if err := applyAppWaitFields(&result.appWaitOptions, options, "App.restart"); err != nil {
		return result, force, err
	}
	return result, force, nil
}

func appTimeout(value interface{}, operation string) (time.Duration, error) {
	var milliseconds float64
	switch typed := value.(type) {
	case int:
		milliseconds = float64(typed)
	case int64:
		milliseconds = float64(typed)
	case float64:
		milliseconds = typed
	default:
		return 0, appOperationError(operation, AppInvalidArgument, "timeout must be a finite number of milliseconds", nil)
	}
	if math.IsNaN(milliseconds) || math.IsInf(milliseconds, 0) || milliseconds <= 0 || milliseconds > 300000 {
		return 0, appOperationError(operation, AppInvalidArgument, "timeout must be greater than 0 and at most 300000 milliseconds", nil)
	}
	return time.Duration(milliseconds * float64(time.Millisecond)), nil
}

func validateAppLaunchCapabilities(backend AppBackend, options appLaunchOptions, operation string) error {
	if err := validateAppReadinessCapability(backend, options.readiness, operation); err != nil {
		return err
	}
	if options.activateSet && !appCapabilityFlag(backend, "launch", "activate") {
		return appOperationError(operation, AppNotSupported, "activate is not supported by the current application launcher", nil)
	}
	return nil
}

func validateAppReadinessCapability(backend AppBackend, readiness, operation string) error {
	if readiness == "window" && !appCapabilityFlag(backend, "readiness", "window") {
		return appOperationError(operation, AppNotSupported, "window readiness is not supported by the current application backend", nil)
	}
	return nil
}

func appCapabilityFlag(backend AppBackend, section, key string) bool {
	if backend == nil {
		return false
	}
	value := backend.Capabilities()[section]
	switch fields := value.(type) {
	case map[string]interface{}:
		result, _ := fields[key].(bool)
		return result
	case map[string]bool:
		return fields[key]
	default:
		return false
	}
}

func appMatchesTarget(app desktopApplicationState, target appTarget) bool {
	target = normalizeAppTarget(target)
	if app.Terminated {
		return false
	}
	switch target.Kind {
	case appTargetPID:
		return app.PID == target.PID
	case appTargetBundleID:
		return strings.EqualFold(app.BundleIdentifier, target.Value)
	case appTargetPath:
		return app.Path == target.Value || app.ExecutablePath == target.Value
	case appTargetName:
		return strings.EqualFold(app.Name, target.Value)
	default:
		return false
	}
}

func sortApplicationStates(apps []desktopApplicationState) {
	sort.Slice(apps, func(i, j int) bool {
		if apps[i].Name != apps[j].Name {
			return apps[i].Name < apps[j].Name
		}
		return apps[i].PID < apps[j].PID
	})
}

func applicationPIDs(apps []desktopApplicationState) []int64 {
	pids := make([]int64, 0, len(apps))
	for _, app := range apps {
		if app.PID > 0 {
			pids = append(pids, app.PID)
		}
	}
	sort.Slice(pids, func(i, j int) bool { return pids[i] < pids[j] })
	return pids
}

func stableAppTarget(app desktopApplicationState) appTarget {
	if app.BundleIdentifier != "" {
		return appTarget{Kind: appTargetBundleID, Value: app.BundleIdentifier}
	}
	if app.Path != "" {
		return appTarget{Kind: appTargetPath, Value: app.Path}
	}
	return appTarget{Kind: appTargetName, Value: app.Name}
}

func appInstanceProjection(app desktopApplicationState) map[string]interface{} {
	result := map[string]interface{}{
		"pid": app.PID, "name": app.Name, "bundleId": app.BundleIdentifier,
		"path": app.Path, "executablePath": app.ExecutablePath,
		"activationPolicy": app.ActivationPolicy, "active": app.Active,
		"hidden": app.Hidden, "terminated": app.Terminated,
	}
	if app.LaunchTimeMS > 0 {
		result["launchedAt"] = time.UnixMilli(app.LaunchTimeMS).UTC().Format(time.RFC3339Nano)
	} else {
		result["launchedAt"] = nil
	}
	return result
}

func appGroupProjection(target appTarget, apps []desktopApplicationState) map[string]interface{} {
	target = normalizeAppTarget(target)
	instances := make([]map[string]interface{}, 0, len(apps))
	for _, app := range apps {
		instances = append(instances, appInstanceProjection(app))
	}
	identity := map[string]interface{}{"kind": string(target.Kind)}
	if target.Kind == appTargetPID {
		identity["value"] = target.PID
	} else {
		identity["value"] = target.Value
	}
	first := apps[0]
	return map[string]interface{}{
		"identity": identity, "name": first.Name, "bundleId": first.BundleIdentifier,
		"path": first.Path, "pids": applicationPIDs(apps), "instances": instances,
		"running": true,
	}
}

func appOperationError(operation string, code AppErrorCode, message string, cause error) error {
	return &AppError{Code: code, Operation: operation, Message: message, Cause: cause}
}

func isAppNotFound(err error) bool {
	var appErr *AppError
	return errors.As(err, &appErr) && appErr.Code == AppNotFound
}

func wrapAppError(operation string, err error) error {
	if err == nil {
		return nil
	}
	var appErr *AppError
	if errors.As(err, &appErr) {
		copy := *appErr
		copy.Operation = operation
		return &copy
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return appOperationError(operation, AppTimeout, "application operation timed out", err)
	}
	if errors.Is(err, context.Canceled) {
		return appOperationError(operation, AppCanceled, "application operation was canceled", err)
	}
	return appOperationError(operation, AppBackendFailed, "application lifecycle backend failed", err)
}

func appJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	object := runtimeValue.NewGoError(err)
	var appErr *AppError
	if errors.As(err, &appErr) {
		_ = object.Set("code", string(appErr.Code))
		_ = object.Set("operation", appErr.Operation)
	}
	return object
}
