package automation

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

func TestAppTargetValidationAndProjection(t *testing.T) {
	runtimeValue := goja.New()
	dottedStringKind := appTargetName
	if runtime.GOOS == "darwin" {
		dottedStringKind = appTargetBundleID
	}
	tests := []struct {
		value     interface{}
		kind      appTargetKind
		pid       int64
		text      string
		operation string
		launch    bool
		code      AppErrorCode
	}{
		{value: float64(42), kind: appTargetPID, pid: 42, operation: "test"},
		{value: "com.opendesk.fixture", kind: dottedStringKind, text: "com.opendesk.fixture", operation: "test"},
		{value: "Fixture", kind: appTargetName, text: "Fixture", operation: "test"},
		{value: map[string]interface{}{"bundleId": "com.opendesk.fixture"}, kind: appTargetBundleID, text: "com.opendesk.fixture", operation: "test"},
		{value: map[string]interface{}{"pid": float64(42), "name": "bad"}, operation: "test", code: AppInvalidArgument},
		{value: float64(42), operation: "test", launch: true, code: AppInvalidArgument},
		{value: float64(1.5), operation: "test", code: AppInvalidArgument},
	}
	for index, test := range tests {
		target, err := parseAppTarget(runtimeValue.ToValue(test.value), test.operation, test.launch)
		if test.code != "" {
			if appErrorCode(err) != test.code {
				t.Fatalf("case %d error=%v code=%q", index, err, appErrorCode(err))
			}
			continue
		}
		if err != nil || target.Kind != test.kind || target.PID != test.pid || target.Value != test.text {
			t.Fatalf("case %d target=%#v err=%v", index, target, err)
		}
	}

	projection := appInstanceProjection(desktopApplicationState{
		PID: 42, Name: "Fixture", BundleIdentifier: "com.opendesk.fixture",
		Path: "/Fixture.app", ExecutablePath: "/Fixture.app/Contents/MacOS/Fixture",
		Active: true, LaunchTimeMS: time.Now().UnixMilli(),
	})
	if projection["bundleId"] != "com.opendesk.fixture" || projection["BundleIdentifier"] != nil || projection["launchedAt"] == nil {
		t.Fatalf("projection=%#v", projection)
	}
	if appMatchesTarget(desktopApplicationState{PID: 42, Terminated: true}, appTarget{Kind: appTargetPID, PID: 42}) {
		t.Fatal("terminated NSRunningApplication snapshot matched as running")
	}
}

func TestAppBundlePathFromExecutable(t *testing.T) {
	path := "/Applications/Fixture.app/Contents/Frameworks/Helper.app/Contents/MacOS/Helper"
	if got := appBundlePathFromExecutable(path); got != "/Applications/Fixture.app" {
		t.Fatalf("bundle path=%q", got)
	}
	if got := appBundlePathFromExecutable("/usr/bin/helper"); got != "" {
		t.Fatalf("non-bundle path=%q", got)
	}
}

func TestAppCapabilitiesRejectUnsupportedOptionsBeforeBackend(t *testing.T) {
	backend := &limitedMemoryAppBackend{memoryAppBackend: newMemoryAppBackend(nil)}
	if err := validateAppReadinessCapability(backend, "window", "test"); appErrorCode(err) != AppNotSupported {
		t.Fatalf("window readiness error=%v", err)
	}
	if err := validateAppLaunchCapabilities(backend, appLaunchOptions{
		appWaitOptions: appWaitOptions{readiness: "process"}, activate: true, activateSet: true,
	}, "test"); appErrorCode(err) != AppNotSupported {
		t.Fatalf("activate error=%v", err)
	}
}

func TestAppJSBindingLifecycleAndMultiProcessGrouping(t *testing.T) {
	backend := newMemoryAppBackend([]desktopApplicationState{
		{PID: 10, Name: "Fixture", BundleIdentifier: "com.opendesk.fixture", Path: "/Fixture.app", ExecutablePath: "/Fixture.app/Contents/MacOS/Fixture"},
		{PID: 11, Name: "Fixture Helper", BundleIdentifier: "com.opendesk.fixture", Path: "/Fixture.app", ExecutablePath: "/Fixture.app/Contents/Frameworks/Helper"},
	})
	backend.cascadeOnTerminate = true
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()
	ready := make(chan *AppRuntime, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		manager := registerApp(runtimeValue, InitJSOptions{
			EventLoop:         loop,
			AppBackendFactory: func() AppBackend { return backend },
			AppWindowProbe:    func(pid int64) (bool, error) { return pid >= 100, nil },
		})
		_, err := runtimeValue.RunString(`
			globalThis.appDone = false;
			globalThis.appFailure = "";
			globalThis.appResult = {};
			(async () => {
				const listed = App.list();
				const grouped = App.get({ bundleId: "com.opendesk.fixture" });
				if (!Array.isArray(listed) || listed.length !== 2) throw new Error("list did not expose both processes");
				if (grouped.pids.length !== 2 || grouped.instances[0].bundleId !== "com.opendesk.fixture" || grouped.instances[0].BundleIdentifier !== undefined) throw new Error("invalid grouped projection");
				if (!App.isRunning("com.opendesk.fixture")) throw new Error("isRunning missed fixture");
				const existing = await App.launch({ bundleId: "com.opendesk.fixture" });
				if (existing.pids.length !== 2) throw new Error("launch existing created a duplicate");
				const stopped = await App.terminate("com.opendesk.fixture");
				if (!stopped.terminated || stopped.force || stopped.pids.length !== 2) throw new Error("graceful terminate result invalid");
				if (!(await App.waitForExit("com.opendesk.fixture"))) throw new Error("waitForExit did not resolve");
				let notFound = "";
				try { await App.terminate("com.opendesk.fixture"); } catch (error) { notFound = error.code; }
				if (notFound !== "NOT_FOUND") throw new Error("missing target code=" + notFound);
				const launched = await App.launch("com.opendesk.fixture", { waitUntilReady: "window", timeout: 1000 });
				if (launched.pids.length !== 1 || launched.instances[0].pid < 100) throw new Error("launch/window readiness invalid");
				const restarted = await App.restart({ pid: launched.pids[0] }, { waitUntilReady: "process" });
				if (restarted.pids.length !== 1 || restarted.pids[0] === launched.pids[0]) throw new Error("restart did not replace PID");
				const forced = await App.terminate("com.opendesk.fixture", { force: true });
				if (!forced.force) throw new Error("force option not explicit in result");
				let timeoutCode = "";
				try { await App.waitForLaunch("com.missing.app", { timeout: 25 }); } catch (error) { timeoutCode = error.code; }
				if (timeoutCode !== "TIMEOUT") throw new Error("timeout code=" + timeoutCode);
				let unsupportedCode = "";
				try { await App.launch("Fixture", { args: ["--bad"] }); } catch (error) { unsupportedCode = error.code; }
				if (unsupportedCode !== "NOT_SUPPORTED") throw new Error("unsupported code=" + unsupportedCode);
				const capabilities = App.getCapabilities();
				if (capabilities.backend !== "memory-app" || !capabilities.grouping.multiProcess) throw new Error("capabilities invalid");
				appResult = { launchCalls: 0, terminateCalls: 0 };
			})().then(() => { appDone = true; }, error => { appFailure = String(error && (error.stack || error)); appDone = true; });
		`)
		if err != nil {
			t.Errorf("app script: %v", err)
		}
		ready <- manager
	}) {
		t.Fatal("event loop stopped before setup")
	}
	manager := <-ready
	waitForAppBool(t, loop, "appDone", true)
	if failure := appStringValue(t, loop, "appFailure"); failure != "" {
		t.Fatal(failure)
	}
	launches, terminations, force := backend.Counts()
	if launches != 3 || terminations != 4 || !force {
		t.Fatalf("backend calls launch=%d terminate=%d force=%v", launches, terminations, force)
	}
	workers, pending := manager.ResourceCounts()
	if workers != 0 || pending != 0 {
		t.Fatalf("resources=%d/%d", workers, pending)
	}
	closeAppRuntime(t, loop, manager)
}

func TestAppWaitCancellationCleansResources(t *testing.T) {
	backend := newMemoryAppBackend(nil)
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()
	ready := make(chan *AppRuntime, 1)
	loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		manager := registerApp(runtimeValue, InitJSOptions{EventLoop: loop, AppBackendFactory: func() AppBackend { return backend }})
		_, err := runtimeValue.RunString(`
			globalThis.canceledCode = "pending";
			App.waitForLaunch("com.missing.app", { timeout: 5000 }).catch(error => { canceledCode = error.code; });
		`)
		if err != nil {
			t.Errorf("app cancellation script: %v", err)
		}
		ready <- manager
	})
	manager := <-ready
	closeAppRuntime(t, loop, manager)
	if workers, pending := manager.ResourceCounts(); workers != 0 || pending != 0 {
		t.Fatalf("resources after close=%d/%d", workers, pending)
	}
}

func appErrorCode(err error) AppErrorCode {
	var typed *AppError
	if errors.As(err, &typed) {
		return typed.Code
	}
	return ""
}

func closeAppRuntime(t *testing.T, loop *eventloop.EventLoop, manager *AppRuntime) {
	t.Helper()
	done := make(chan struct{}, 1)
	if !loop.RunOnLoop(func(*goja.Runtime) { manager.Close(); done <- struct{}{} }) {
		t.Fatal("event loop stopped before App close")
	}
	<-done
	manager.Wait()
}

func waitForAppBool(t *testing.T, loop *eventloop.EventLoop, name string, want bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		result := make(chan bool, 1)
		if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) { result <- runtimeValue.Get(name).ToBoolean() }) {
			t.Fatal("event loop stopped before App value read")
		}
		if <-result == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("%s did not reach %v", name, want)
}

func appStringValue(t *testing.T, loop *eventloop.EventLoop, name string) string {
	t.Helper()
	result := make(chan string, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) { result <- runtimeValue.Get(name).String() }) {
		t.Fatal("event loop stopped before App value read")
	}
	return <-result
}

type memoryAppBackend struct {
	mu                 sync.Mutex
	apps               []desktopApplicationState
	nextPID            int64
	launchCalls        int
	terminateCalls     int
	lastForce          bool
	lastLaunchTarget   appTarget
	cascadeOnTerminate bool
}

type limitedMemoryAppBackend struct{ *memoryAppBackend }

func (b *limitedMemoryAppBackend) Capabilities() map[string]interface{} {
	return map[string]interface{}{
		"launch":    map[string]interface{}{"supported": true, "activate": false},
		"readiness": map[string]interface{}{"process": true, "window": false},
	}
}

func newMemoryAppBackend(apps []desktopApplicationState) *memoryAppBackend {
	copyApps := append([]desktopApplicationState(nil), apps...)
	return &memoryAppBackend{apps: copyApps, nextPID: 100}
}

func (b *memoryAppBackend) Name() string { return "memory-app" }
func (b *memoryAppBackend) Capabilities() map[string]interface{} {
	return map[string]interface{}{
		"list":      map[string]interface{}{"supported": true},
		"launch":    map[string]interface{}{"supported": true, "activate": true},
		"terminate": map[string]interface{}{"supported": true},
		"readiness": map[string]interface{}{"process": true, "window": true, "customPredicate": false},
	}
}
func (b *memoryAppBackend) List(ctx context.Context) ([]desktopApplicationState, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]desktopApplicationState(nil), b.apps...), nil
}
func (b *memoryAppBackend) Launch(ctx context.Context, target appTarget, activate bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.launchCalls++
	b.lastLaunchTarget = target
	for _, app := range b.apps {
		if appMatchesTarget(app, target) {
			return nil
		}
	}
	name, bundleID, path := target.Value, "", ""
	switch target.Kind {
	case appTargetBundleID:
		bundleID, name, path = target.Value, "Fixture", "/Fixture.app"
	case appTargetPath:
		path, name = target.Value, "Fixture"
	}
	b.apps = append(b.apps, desktopApplicationState{
		PID: b.nextPID, Name: name, BundleIdentifier: bundleID, Path: path,
		ExecutablePath: path + "/Contents/MacOS/Fixture", Active: activate, LaunchTimeMS: time.Now().UnixMilli(),
	})
	b.nextPID++
	return nil
}
func (b *memoryAppBackend) Terminate(ctx context.Context, pid int64, force bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.terminateCalls++
	for index, app := range b.apps {
		if app.PID == pid {
			if b.cascadeOnTerminate {
				b.apps = nil
			} else {
				b.apps = append(b.apps[:index], b.apps[index+1:]...)
			}
			b.lastForce = force
			return nil
		}
	}
	return appOperationError("", AppNotFound, fmt.Sprintf("PID %d is unavailable", pid), nil)
}
func (b *memoryAppBackend) Counts() (int, int, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.launchCalls, b.terminateCalls, b.lastForce
}
