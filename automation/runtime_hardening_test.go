package automation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

func TestJSMethodAllowlistHasNoImplicitHTTPDiagnostics(t *testing.T) {
	vm := goja.New()
	methods := AutoMapObject(vm, NewHTTPClient(vm))
	for _, method := range []string{"request", "get", "post"} {
		if _, ok := methods[method]; !ok {
			t.Fatalf("documented http.%s missing from allowlist", method)
		}
	}
	for _, method := range []string{"activeWorkers", "pendingCallbacks", "wait", "cancelPending"} {
		if _, ok := methods[method]; ok {
			t.Fatalf("internal HTTP lifecycle method was exposed to JS: %s", method)
		}
	}
}

func TestJSMethodAllowlistReferencesRealExportedMethods(t *testing.T) {
	for typ, methods := range jsMethodAllowlist {
		for _, method := range methods {
			resolved, ok := typ.MethodByName(method)
			if !ok || resolved.PkgPath != "" {
				t.Fatalf("allowlist references non-public %s.%s", typ, method)
			}
		}
	}
	if _, exists := jsMethodAllowlist[reflect.TypeOf((*HTTPClient)(nil))]; !exists {
		t.Fatal("HTTPClient allowlist is missing")
	}
}

func TestStaticJavaScriptBundleCacheReadsOnceAcrossConcurrentRuntimes(t *testing.T) {
	polyfillDir, err := resolveResourceDir("polyfills")
	if err != nil {
		t.Fatal(err)
	}
	jslibDir, err := resolveResourceDir("jslibs")
	if err != nil {
		t.Fatal(err)
	}
	files := append(staticJavaScriptFiles(t, polyfillDir), staticJavaScriptFiles(t, jslibDir)...)
	t.Setenv("SKIP_FYNE_INIT", "1")

	staticJavaScriptBundles.Lock()
	previousBundles := staticJavaScriptBundles.byName
	staticJavaScriptBundles.byName = make(map[string]compiledJavaScriptBundle)
	staticJavaScriptBundles.Unlock()
	previousReadFile := staticJavaScriptReadFile
	var reads atomic.Int64
	staticJavaScriptReadFile = func(path string) ([]byte, error) {
		reads.Add(1)
		return os.ReadFile(path)
	}
	t.Cleanup(func() {
		staticJavaScriptReadFile = previousReadFile
		staticJavaScriptBundles.Lock()
		staticJavaScriptBundles.byName = previousBundles
		staticJavaScriptBundles.Unlock()
	})

	const runtimes = 12
	errs := make(chan error, runtimes)
	var workers sync.WaitGroup
	for i := 0; i < runtimes; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			vm := goja.New()
			if err := InitJS(vm); err != nil {
				errs <- err
				return
			}
			if value := vm.Get("axios"); value == nil || goja.IsUndefined(value) {
				errs <- &cacheTestError{message: "axios was absent after cached bundle execution"}
			}
		}()
	}
	workers.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	if got, want := reads.Load(), int64(len(files)); got != want {
		t.Fatalf("static bundle disk reads = %d, want exactly %d (%v)", got, want, files)
	}
}

func TestHTTPResponseBodyLimitIsNormalized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("oversized"))
	}))
	defer server.Close()
	request := httpRequest{
		context: context.Background(),
		method:  http.MethodGet,
		url:     server.URL,
		headers: make(http.Header),
	}
	_, err := performHTTPRequest(server.Client(), 4, request)
	if err == nil || err.Error() != "HTTP response body exceeds configured limit of 4 bytes" {
		t.Fatalf("response body limit error = %v", err)
	}
}

func TestRuntimeResourceCountsIncludeAsyncOwners(t *testing.T) {
	counts := RuntimeResourceCounts{
		NotificationWorkers:  1,
		NotificationPending:  2,
		AudioPatternWorkers:  3,
		AudioPatternPending:  4,
		AudioPatternWatches:  5,
		AudioPatternSessions: 6,

		AccessibilityWorkers:         7,
		AccessibilityPending:         8,
		AccessibilityQueued:          9,
		AccessibilityRefs:            10,
		AccessibilityNativeResources: 11,
	}
	if counts.IsZero() {
		t.Fatal("notification resources were omitted from RuntimeResourceCounts.IsZero")
	}
	for _, test := range []struct {
		name   string
		counts RuntimeResourceCounts
	}{
		{name: "workers", counts: RuntimeResourceCounts{AccessibilityWorkers: 1}},
		{name: "pending", counts: RuntimeResourceCounts{AccessibilityPending: 1}},
		{name: "queued", counts: RuntimeResourceCounts{AccessibilityQueued: 1}},
		{name: "refs", counts: RuntimeResourceCounts{AccessibilityRefs: 1}},
		{name: "native resources", counts: RuntimeResourceCounts{AccessibilityNativeResources: 1}},
	} {
		if test.counts.IsZero() {
			t.Fatalf("accessibility %s were omitted from RuntimeResourceCounts.IsZero", test.name)
		}
	}
	for _, field := range []string{
		"notificationWorkers=1", "notificationPending=2",
		"audioPatternWorkers=3", "audioPatternPending=4",
		"audioPatternWatches=5", "audioPatternSessions=6",
		"accessibilityWorkers=7", "accessibilityPending=8",
		"accessibilityQueued=9", "accessibilityRefs=10", "accessibilityNativeResources=11",
	} {
		if !strings.Contains(counts.String(), field) {
			t.Fatalf("RuntimeResourceCounts.String() omitted %q: %s", field, counts.String())
		}
	}
}

func TestAccessibilityGenericRuntimeDefaultsDisabledWithoutBackendAccess(t *testing.T) {
	vm := goja.New()
	backend := &accessibilityDisabledProbeBackend{
		unsupportedAccessibilityBackend: unsupportedAccessibilityBackend{reason: "test backend must not be initialized"},
	}
	var lifecycle *RuntimeLifecycle
	if err := InitJSWithOptions(vm, InitJSOptions{
		AccessibilityBackendFactory: func() AccessibilityBackend { return backend },
		OnReady:                     func(value *RuntimeLifecycle) { lifecycle = value },
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if lifecycle != nil {
			lifecycle.CancelAsync()
			lifecycle.Wait()
		}
	})
	value, err := vm.RunString(`
		globalThis.__accessibilityDisabled = null;
		globalThis.__menuDisabled = null;
		const caps = Accessibility.getCapabilities();
		Accessibility.snapshot({ within: { app: { pid: 1 }, root: "application" } })
			.then(() => { globalThis.__accessibilityDisabled = "resolved"; }, error => {
				globalThis.__accessibilityDisabled = [error.code, error.operation, error.actionState];
			});
		UI.getMenuItems({ within: { app: { pid: 1 }, root: "menuBar" } })
			.then(() => { globalThis.__menuDisabled = "resolved"; }, error => {
				globalThis.__menuDisabled = [error.code, error.operation, error.actionState];
			});
		caps.hostAuthorization.enabled;
	`)
	if err != nil {
		t.Fatal(err)
	}
	if value.ToBoolean() {
		t.Fatal("generic InitJS unexpectedly enabled native Accessibility")
	}
	for name, want := range map[string]string{
		"__accessibilityDisabled": `["CAPABILITY_DISABLED","Accessibility.snapshot","not_started"]`,
		"__menuDisabled":          `["CAPABILITY_DISABLED","UI.getMenuItems","not_started"]`,
	} {
		got, err := vm.RunString("JSON.stringify(" + name + ")")
		if err != nil {
			t.Fatal(err)
		}
		if got.String() != want {
			t.Fatalf("%s = %s, want %s", name, got.String(), want)
		}
	}
	if backend.initializeCalls.Load() != 0 {
		t.Fatalf("disabled Accessibility initialized the backend %d times", backend.initializeCalls.Load())
	}
}

func TestAccessibilityProgressPreservesExplicitBackendActionState(t *testing.T) {
	progress := newAccessibilityProgress(false)
	progress.update(func(value *accessibilityProgress) { value.actionState = AccessibilityActionUnknown })
	failure := normalizeAccessibilityError(
		"Accessibility.perform", "test", "axreq-test-1",
		&AccessibilityError{
			Code: AccessibilityElementDisabled, Phase: "action_check",
			ActionState: AccessibilityActionNotStarted, Message: "disabled",
		},
	)
	if state, explicit := accessibilityExplicitActionState(failure); explicit {
		progress.update(func(value *accessibilityProgress) { value.actionState = state })
	}
	applyAccessibilityProgress(failure, progress)
	if failure.ActionState != AccessibilityActionNotStarted {
		t.Fatalf("explicit backend action state = %q, want %q", failure.ActionState, AccessibilityActionNotStarted)
	}

	menuFailure := accessibilityMenuFailure(failure, 1, 1, true, AccessibilityActionUnknown)
	var typed *AccessibilityError
	if !errors.As(menuFailure, &typed) {
		t.Fatalf("menu failure type = %T, want *AccessibilityError", menuFailure)
	}
	if typed.ActionState != AccessibilityActionNotStarted {
		t.Fatalf("explicit menu backend action state = %q, want %q", typed.ActionState, AccessibilityActionNotStarted)
	}
}

func TestAccessibilityLateErroredResultIsDiscardedOnWorker(t *testing.T) {
	backend := &accessibilityLateDiscardBackend{}
	runtime := &AccessibilityRuntime{
		backend: backend,
		jobs:    make(chan accessibilityJob, 1), workerDone: make(chan struct{}),
	}
	runtime.closing.Store(true)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runtime.jobs <- accessibilityJob{
		ctx: ctx,
		run: func(ctx context.Context, _ AccessibilityBackend) (interface{}, error) {
			cancel()
			<-ctx.Done()
			return uint64(73), nil
		},
		discard: func(backend AccessibilityBackend, value interface{}) {
			if handle, ok := value.(uint64); ok {
				_ = backend.Release(handle)
			}
		},
	}
	close(runtime.jobs)
	runtime.runWorker()
	if got := backend.released.Load(); got != 73 {
		t.Fatalf("discarded handle = %d, want 73", got)
	}
}

func TestAccessibilityDeadlinesSettleQueuedAndInFlightExactlyOnce(t *testing.T) {
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()

	backend := newAccessibilityDeadlineBackend()
	firstStarted := make(chan struct{}, 1)
	releaseFirst := make(chan struct{})
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseFirst) }) }
	var manager *AccessibilityRuntime
	defer func() {
		release()
		if manager != nil {
			accessibilityCloseRuntimeOnLoop(loop, manager)
			manager.Wait()
		}
	}()

	type setupResult struct {
		manager       *AccessibilityRuntime
		firstPromise  *goja.Promise
		secondPromise *goja.Promise
		issuedAt      time.Time
	}
	ready := make(chan setupResult, 1)
	firstSettled := make(chan accessibilityTestSettlement, 2)
	secondSettled := make(chan accessibilityTestSettlement, 2)
	var firstFinishes atomic.Int64
	var secondFinishes atomic.Int64
	var queuedExecuted atomic.Int64
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		created := newAccessibilityRuntime(runtimeValue, InitJSOptions{
			Context: context.Background(), EventLoop: loop,
			AccessibilityBackendFactory: func() AccessibilityBackend { return backend },
		}, nil, nil)
		issuedAt := time.Now()
		firstValue := created.start(
			"Accessibility.testInFlightDeadline", 250*time.Millisecond, nil,
			func(context.Context, AccessibilityBackend) (interface{}, error) {
				firstStarted <- struct{}{}
				<-releaseFirst
				backend.nativeResources.Add(1)
				return uint64(73), nil
			}, nil,
			func(_ interface{}, err error) {
				firstFinishes.Add(1)
				firstSettled <- accessibilityTestSettlement{at: time.Now(), err: err}
			},
			func(owner AccessibilityBackend, value interface{}) {
				if handle, ok := value.(uint64); ok {
					_ = owner.Release(handle)
				}
			},
		)
		secondValue := created.start(
			"Accessibility.testQueuedDeadline", 60*time.Millisecond, nil,
			func(context.Context, AccessibilityBackend) (interface{}, error) {
				queuedExecuted.Add(1)
				return true, nil
			}, nil,
			func(_ interface{}, err error) {
				secondFinishes.Add(1)
				secondSettled <- accessibilityTestSettlement{at: time.Now(), err: err}
			}, nil,
		)
		firstPromise, _ := firstValue.Export().(*goja.Promise)
		secondPromise, _ := secondValue.Export().(*goja.Promise)
		ready <- setupResult{manager: created, firstPromise: firstPromise, secondPromise: secondPromise, issuedAt: issuedAt}
	}) {
		t.Fatal("event loop stopped before Accessibility deadline setup")
	}
	setup := <-ready
	manager = setup.manager
	if setup.firstPromise == nil || setup.secondPromise == nil {
		t.Fatal("Accessibility start did not return Promises")
	}
	select {
	case <-firstStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("first Accessibility request never entered the native worker")
	}

	var first, second accessibilityTestSettlement
	select {
	case first = <-firstSettled:
	case <-time.After(2 * time.Second):
		t.Fatal("in-flight request did not settle at its deadline while the backend remained blocked")
	}
	select {
	case second = <-secondSettled:
	case <-time.After(2 * time.Second):
		t.Fatal("queued request did not settle at its own deadline while the worker remained blocked")
	}
	assertAccessibilityTestFailure(t, first.err, AccessibilityTimeout, "deadline")
	assertAccessibilityTestFailure(t, second.err, AccessibilityTimeout, "queue")
	var firstFailure, secondFailure *AccessibilityError
	errors.As(first.err, &firstFailure)
	errors.As(second.err, &secondFailure)
	if firstFailure.ActionState != AccessibilityActionUnknown {
		t.Fatalf("in-flight timeout actionState = %q, want %q", firstFailure.ActionState, AccessibilityActionUnknown)
	}
	if secondFailure.ActionState != AccessibilityActionNotStarted {
		t.Fatalf("queued timeout actionState = %q, want %q", secondFailure.ActionState, AccessibilityActionNotStarted)
	}
	if elapsed := first.at.Sub(setup.issuedAt); elapsed > time.Second {
		t.Fatalf("in-flight deadline settlement took %s, want less than 1s", elapsed)
	}
	if elapsed := second.at.Sub(setup.issuedAt); elapsed > time.Second {
		t.Fatalf("queued deadline settlement took %s, want less than 1s", elapsed)
	}
	if got := queuedExecuted.Load(); got != 0 {
		t.Fatalf("queued expired request executed backend %d times, want 0", got)
	}
	if got := manager.ResourceCounts().Pending; got != 0 {
		t.Fatalf("pending requests after deadline settlement = %d, want 0", got)
	}
	assertAccessibilityPromise(t, loop, setup.firstPromise, goja.PromiseStateRejected, string(AccessibilityTimeout), "deadline")
	assertAccessibilityPromise(t, loop, setup.secondPromise, goja.PromiseStateRejected, string(AccessibilityTimeout), "queue")

	// The first call returns a retained native value after its Promise has
	// already rejected. It must be released by the worker before processing the
	// expired queued job, and neither late completion may settle twice.
	release()
	select {
	case handle := <-backend.released:
		if handle != 73 {
			t.Fatalf("late released handle = %d, want 73", handle)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("late native result was not released")
	}
	deadline := time.Now().Add(2 * time.Second)
	for manager.queued.Load() != 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if got := manager.queued.Load(); got != 0 {
		t.Fatalf("worker did not drain expired queued request: queued=%d", got)
	}
	if got := queuedExecuted.Load(); got != 0 {
		t.Fatalf("expired queued request executed after worker unblocked: calls=%d", got)
	}

	// A normal completion must stop its deadline callback. Waiting beyond the
	// original timeout proves cancellation of the watcher does not reject or
	// finish the Promise a second time.
	normalSettled := make(chan accessibilityTestSettlement, 2)
	var normalFinishes atomic.Int64
	var normalExecuted atomic.Int64
	normalReady := make(chan *goja.Promise, 1)
	if !loop.RunOnLoop(func(*goja.Runtime) {
		value := manager.start(
			"Accessibility.testNormalCompletion", 200*time.Millisecond, nil,
			func(context.Context, AccessibilityBackend) (interface{}, error) {
				normalExecuted.Add(1)
				return "ok", nil
			}, nil,
			func(_ interface{}, err error) {
				normalFinishes.Add(1)
				normalSettled <- accessibilityTestSettlement{at: time.Now(), err: err}
			}, nil,
		)
		promise, _ := value.Export().(*goja.Promise)
		normalReady <- promise
	}) {
		t.Fatal("event loop stopped before normal Accessibility request")
	}
	normalPromise := <-normalReady
	select {
	case settlement := <-normalSettled:
		if settlement.err != nil {
			t.Fatalf("normal Accessibility request failed: %v", settlement.err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("normal Accessibility request did not complete")
	}
	assertAccessibilityPromise(t, loop, normalPromise, goja.PromiseStateFulfilled, "ok", "")
	time.Sleep(300 * time.Millisecond)
	if got := normalFinishes.Load(); got != 1 {
		t.Fatalf("normal request finish calls after deadline = %d, want 1", got)
	}
	if got := firstFinishes.Load(); got != 1 {
		t.Fatalf("in-flight request finish calls after late result = %d, want 1", got)
	}
	if got := secondFinishes.Load(); got != 1 {
		t.Fatalf("queued request finish calls after drain = %d, want 1", got)
	}
	if got := normalExecuted.Load(); got != 1 {
		t.Fatalf("normal request backend calls = %d, want 1", got)
	}

	accessibilityCloseRuntimeOnLoop(loop, manager)
	manager.Wait()
	assertAccessibilityRuntimeDrained(t, manager, backend)
}

func TestAccessibilityDeadlineOverridesLateBackendErrorBeforeLoopSettlement(t *testing.T) {
	runtimeValue := goja.New()
	loop := &accessibilityManualLoop{callbacks: make(chan func(*goja.Runtime), 4)}
	backend := newAccessibilityDeadlineBackend()
	manager := newAccessibilityRuntime(runtimeValue, InitJSOptions{
		Context:                     context.Background(),
		AccessibilityBackendFactory: func() AccessibilityBackend { return backend },
	}, nil, nil)
	manager.loop = loop
	started := make(chan struct{}, 1)
	releaseNative := make(chan struct{})
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseNative) }) }
	defer func() {
		release()
		manager.Close()
		manager.Wait()
	}()

	settled := make(chan accessibilityTestSettlement, 2)
	var finishes atomic.Int64
	value := manager.start(
		"Accessibility.testLateBackendError", 100*time.Millisecond, nil,
		func(context.Context, AccessibilityBackend) (interface{}, error) {
			started <- struct{}{}
			<-releaseNative
			backend.nativeResources.Add(1)
			return uint64(107), errors.New("late backend failure")
		}, nil,
		func(_ interface{}, err error) {
			finishes.Add(1)
			settled <- accessibilityTestSettlement{at: time.Now(), err: err}
		},
		func(owner AccessibilityBackend, value interface{}) {
			if handle, ok := value.(uint64); ok {
				_ = owner.Release(handle)
			}
		},
	)
	promise, _ := value.Export().(*goja.Promise)
	if promise == nil {
		t.Fatal("Accessibility start did not return a Promise")
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("late-error request never entered the native worker")
	}

	// Capture (but do not execute) the timer's event-loop callback first. Then
	// let the backend return its own error and execute the worker callback ahead
	// of the timer callback. The worker must still carry the authoritative
	// context failure, so loop callback ordering cannot change public semantics.
	var timerCallback func(*goja.Runtime)
	select {
	case timerCallback = <-loop.callbacks:
	case <-time.After(2 * time.Second):
		t.Fatal("deadline did not enqueue its event-loop settlement")
	}
	release()
	var workerCallback func(*goja.Runtime)
	select {
	case workerCallback = <-loop.callbacks:
	case <-time.After(2 * time.Second):
		t.Fatal("late backend result did not enqueue worker completion")
	}
	workerCallback(runtimeValue)
	timerCallback(runtimeValue)

	var settlement accessibilityTestSettlement
	select {
	case settlement = <-settled:
	case <-time.After(2 * time.Second):
		t.Fatal("late backend error did not settle")
	}
	assertAccessibilityTestFailure(t, settlement.err, AccessibilityTimeout, "deadline")
	var failure *AccessibilityError
	errors.As(settlement.err, &failure)
	if failure.ActionState != AccessibilityActionUnknown {
		t.Fatalf("late backend timeout actionState = %q, want %q", failure.ActionState, AccessibilityActionUnknown)
	}
	if got := finishes.Load(); got != 1 {
		t.Fatalf("late backend error finish calls = %d, want 1", got)
	}
	if promise.State() != goja.PromiseStateRejected {
		t.Fatalf("late backend Promise state = %v, want rejected", promise.State())
	}
	errorObject := promise.Result().ToObject(runtimeValue)
	if code := errorObject.Get("code").String(); code != string(AccessibilityTimeout) {
		t.Fatalf("late backend Promise code = %q, want %q", code, AccessibilityTimeout)
	}
	if state := errorObject.Get("actionState").String(); state != string(AccessibilityActionUnknown) {
		t.Fatalf("late backend Promise actionState = %q, want %q", state, AccessibilityActionUnknown)
	}
	select {
	case handle := <-backend.released:
		if handle != 107 {
			t.Fatalf("late backend released handle = %d, want 107", handle)
		}
	default:
		t.Fatal("late backend value was not discarded on the worker")
	}

	manager.Close()
	manager.Wait()
	assertAccessibilityRuntimeDrained(t, manager, backend)
}

func TestAccessibilityCloseAndLateResultSettleExactlyOnce(t *testing.T) {
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()

	backend := newAccessibilityDeadlineBackend()
	started := make(chan struct{}, 1)
	releaseNative := make(chan struct{})
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseNative) }) }
	var manager *AccessibilityRuntime
	defer func() {
		release()
		if manager != nil {
			accessibilityCloseRuntimeOnLoop(loop, manager)
			manager.Wait()
		}
	}()

	type setupResult struct {
		manager *AccessibilityRuntime
		promise *goja.Promise
	}
	ready := make(chan setupResult, 1)
	settled := make(chan accessibilityTestSettlement, 2)
	var finishes atomic.Int64
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		created := newAccessibilityRuntime(runtimeValue, InitJSOptions{
			Context: context.Background(), EventLoop: loop,
			AccessibilityBackendFactory: func() AccessibilityBackend { return backend },
		}, nil, nil)
		value := created.start(
			"Accessibility.testClose", 200*time.Millisecond, nil,
			func(context.Context, AccessibilityBackend) (interface{}, error) {
				started <- struct{}{}
				<-releaseNative
				backend.nativeResources.Add(1)
				return uint64(91), nil
			}, nil,
			func(_ interface{}, err error) {
				finishes.Add(1)
				settled <- accessibilityTestSettlement{at: time.Now(), err: err}
			},
			func(owner AccessibilityBackend, value interface{}) {
				if handle, ok := value.(uint64); ok {
					_ = owner.Release(handle)
				}
			},
		)
		promise, _ := value.Export().(*goja.Promise)
		ready <- setupResult{manager: created, promise: promise}
	}) {
		t.Fatal("event loop stopped before Accessibility Close setup")
	}
	setup := <-ready
	manager = setup.manager
	if setup.promise == nil {
		t.Fatal("Accessibility start did not return a Promise")
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("Accessibility Close request never entered the native worker")
	}
	accessibilityCloseRuntimeOnLoop(loop, manager)
	select {
	case settlement := <-settled:
		assertAccessibilityTestFailure(t, settlement.err, AccessibilityCanceled, "cleanup")
	case <-time.After(2 * time.Second):
		t.Fatal("Accessibility Close did not settle the in-flight request")
	}
	assertAccessibilityPromise(t, loop, setup.promise, goja.PromiseStateRejected, string(AccessibilityCanceled), "cleanup")

	// Keep the backend blocked beyond the request's former deadline. Close has
	// removed the settlement authority and stopped its watcher, so no second
	// finish/reject is possible.
	time.Sleep(300 * time.Millisecond)
	if got := finishes.Load(); got != 1 {
		t.Fatalf("Close request finish calls after deadline = %d, want 1", got)
	}
	release()
	select {
	case handle := <-backend.released:
		if handle != 91 {
			t.Fatalf("Close late released handle = %d, want 91", handle)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Close did not release the late native result")
	}
	manager.Wait()
	if got := finishes.Load(); got != 1 {
		t.Fatalf("Close request finish calls after worker exit = %d, want 1", got)
	}
	assertAccessibilityRuntimeDrained(t, manager, backend)
}

type accessibilityTestSettlement struct {
	at  time.Time
	err error
}

type accessibilityDeadlineBackend struct {
	unsupportedAccessibilityBackend
	initializeCalls atomic.Int64
	releaseCalls    atomic.Int64
	closeCalls      atomic.Int64
	nativeResources atomic.Int64
	released        chan uint64
}

type accessibilityManualLoop struct {
	callbacks chan func(*goja.Runtime)
}

func (l *accessibilityManualLoop) RunOnLoop(callback func(*goja.Runtime)) bool {
	l.callbacks <- callback
	return true
}

func newAccessibilityDeadlineBackend() *accessibilityDeadlineBackend {
	return &accessibilityDeadlineBackend{released: make(chan uint64, 4)}
}

func (b *accessibilityDeadlineBackend) Initialize(context.Context) error {
	b.initializeCalls.Add(1)
	return nil
}

func (b *accessibilityDeadlineBackend) Release(handle uint64) error {
	b.releaseCalls.Add(1)
	b.nativeResources.Add(-1)
	b.released <- handle
	return nil
}

func (b *accessibilityDeadlineBackend) ResourceCount() int {
	return int(b.nativeResources.Load())
}

func (b *accessibilityDeadlineBackend) Close() error {
	b.closeCalls.Add(1)
	return nil
}

func assertAccessibilityTestFailure(t *testing.T, err error, code AccessibilityErrorCode, phase string) {
	t.Helper()
	var failure *AccessibilityError
	if !errors.As(err, &failure) {
		t.Fatalf("Accessibility settlement error = %T %v, want *AccessibilityError", err, err)
	}
	if failure.Code != code || failure.Phase != phase {
		t.Fatalf("Accessibility settlement = code %q phase %q, want code %q phase %q", failure.Code, failure.Phase, code, phase)
	}
}

func assertAccessibilityPromise(t *testing.T, loop *eventloop.EventLoop, promise *goja.Promise, wantState goja.PromiseState, wantValue, wantPhase string) {
	t.Helper()
	if promise == nil {
		t.Fatal("Accessibility Promise is nil")
	}
	type observation struct {
		state goja.PromiseState
		value string
		phase string
	}
	observed := make(chan observation, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		result := observation{state: promise.State()}
		if promise.State() == goja.PromiseStateRejected {
			object := promise.Result().ToObject(runtimeValue)
			result.value = object.Get("code").String()
			result.phase = object.Get("phase").String()
		} else {
			result.value = promise.Result().String()
		}
		observed <- result
	}) {
		t.Fatal("event loop stopped before Accessibility Promise inspection")
	}
	result := <-observed
	if result.state != wantState || result.value != wantValue || result.phase != wantPhase {
		t.Fatalf("Accessibility Promise = state %v value %q phase %q, want state %v value %q phase %q", result.state, result.value, result.phase, wantState, wantValue, wantPhase)
	}
}

func accessibilityCloseRuntimeOnLoop(loop *eventloop.EventLoop, manager *AccessibilityRuntime) {
	if manager == nil || manager.closing.Load() {
		return
	}
	done := make(chan struct{}, 1)
	if loop.RunOnLoop(func(*goja.Runtime) {
		manager.Close()
		done <- struct{}{}
	}) {
		<-done
	}
}

func assertAccessibilityRuntimeDrained(t *testing.T, manager *AccessibilityRuntime, backend *accessibilityDeadlineBackend) {
	t.Helper()
	counts := manager.ResourceCounts()
	if counts.Workers != 0 || counts.Pending != 0 || counts.Queued != 0 || counts.Refs != 0 || counts.NativeResources != 0 {
		t.Fatalf("Accessibility runtime resources after Wait = %+v", counts)
	}
	if got := backend.releaseCalls.Load(); got != 1 {
		t.Fatalf("native release calls = %d, want 1", got)
	}
	if got := backend.closeCalls.Load(); got != 1 {
		t.Fatalf("backend Close calls = %d, want 1", got)
	}
}

type accessibilityDisabledProbeBackend struct {
	unsupportedAccessibilityBackend
	initializeCalls atomic.Int64
}

type accessibilityLateDiscardBackend struct {
	unsupportedAccessibilityBackend
	released atomic.Uint64
}

func (b *accessibilityLateDiscardBackend) Initialize(context.Context) error { return nil }
func (b *accessibilityLateDiscardBackend) Release(handle uint64) error {
	b.released.Store(handle)
	return nil
}

func (b *accessibilityDisabledProbeBackend) Initialize(context.Context) error {
	b.initializeCalls.Add(1)
	return b.unsupported("initialize")
}

func staticJavaScriptFiles(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && len(entry.Name()) > 3 && entry.Name()[len(entry.Name())-3:] == ".js" {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)
	return files
}

type cacheTestError struct{ message string }

func (e *cacheTestError) Error() string { return e.message }
