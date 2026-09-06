package automation

import (
	"context"
	"fmt"
	goruntime "runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

const accessibilityLimitsTestPID int64 = 424242

func TestAccessibilityRuntimeActiveRefLimitAndTeardown(t *testing.T) {
	backend := newAccessibilityLimitsBackend(false)
	harness := newAccessibilityLimitsHarness(t, backend)

	harness.runScript(t, fmt.Sprintf(`
		globalThis.__limitsDone = false;
		globalThis.__limitsFailure = "";
		globalThis.__limitsResult = null;
		(async () => {
			const within = { app: { pid: %d }, root: "application" };
			const refs = [];
			for (let index = 0; index < %d; index += 1) {
				refs.push(await Accessibility.find(
					{ identifier: "limit-" + index },
					{ within, timeout: 30000 }
				));
			}
			let code = "";
			let actionState = "";
			try {
				await Accessibility.find(
					{ identifier: "over-limit" },
					{ within, timeout: 30000 }
				);
			} catch (error) {
				code = error.code;
				actionState = error.actionState;
			}
			globalThis.__retainedLimitRefs = refs;
			globalThis.__limitsResult = JSON.stringify({ refs: refs.length, code, actionState });
		})().then(
			() => { globalThis.__limitsDone = true; },
			(error) => {
				globalThis.__limitsFailure = String(error && (error.stack || error));
				globalThis.__limitsDone = true;
			}
		);
	`, accessibilityLimitsTestPID, accessibilityMaximumRefs))
	harness.waitForJSDone(t, "__limitsDone", "__limitsFailure", 10*time.Second)

	if got := harness.stringValue(t, "__limitsResult"); got != `{"refs":256,"code":"RESOURCE_LIMIT","actionState":"not_started"}` {
		t.Fatalf("active-ref limit result = %s", got)
	}
	if got := backend.findCalls.Load(); got != accessibilityMaximumRefs {
		t.Fatalf("native Find calls = %d, want %d; over-limit request must not execute", got, accessibilityMaximumRefs)
	}
	if counts := harness.manager.ResourceCounts(); counts != (AccessibilityResourceCounts{
		Workers: 1, Refs: accessibilityMaximumRefs, NativeResources: accessibilityMaximumRefs,
	}) {
		t.Fatalf("resources at active-ref limit = %+v", counts)
	}

	harness.closeOwners(t)
	harness.waitOwners()
	if counts := harness.manager.ResourceCounts(); counts != (AccessibilityResourceCounts{}) {
		t.Fatalf("resources after active-ref teardown = %+v", counts)
	}
	if got := backend.resourcesAtClose.Load(); got != accessibilityMaximumRefs {
		t.Fatalf("native resources handed to backend Close = %d, want %d", got, accessibilityMaximumRefs)
	}
	backend.assertClosedCleanly(t)
}

func TestAccessibilityRuntimeQueueLimitCloseAndLateNativeDiscard(t *testing.T) {
	backend := newAccessibilityLimitsBackend(true)
	harness := newAccessibilityLimitsHarness(t, backend)

	harness.runScript(t, fmt.Sprintf(`
		globalThis.__queueWithin = { app: { pid: %d }, root: "application" };
		globalThis.__queueRequests = [Accessibility.find(
			{ identifier: "in-flight" },
			{ within: globalThis.__queueWithin, timeout: 30000 }
		)];
		globalThis.__queueFullCode = "";
		globalThis.__queueSettled = false;
		globalThis.__queueCodes = [];
	`, accessibilityLimitsTestPID))
	backend.waitForBlockedFind(t)

	harness.runScript(t, fmt.Sprintf(`
		for (let index = 0; index < %d + 1; index += 1) {
			const request = Accessibility.find(
				{ identifier: "queued-" + index },
				{ within: globalThis.__queueWithin, timeout: 30000 }
			);
			request.catch((error) => {
				if (error.code === "QUEUE_FULL") globalThis.__queueFullCode = error.code;
			});
			globalThis.__queueRequests.push(request);
		}
		Promise.allSettled(globalThis.__queueRequests).then((results) => {
			globalThis.__queueCodes = results.map((result) =>
				result.status === "rejected" ? result.reason.code : "RESOLVED"
			);
			globalThis.__queueSettled = true;
		});
	`, accessibilityMaximumQueued))
	harness.waitForJSBoolean(t, `globalThis.__queueFullCode === "QUEUE_FULL"`, 3*time.Second)

	if got := backend.findCalls.Load(); got != 1 {
		t.Fatalf("native Find calls before Close = %d, want only the in-flight request", got)
	}
	if counts := harness.manager.ResourceCounts(); counts != (AccessibilityResourceCounts{
		Workers: 1, Pending: accessibilityMaximumQueued + 1, Queued: accessibilityMaximumQueued,
	}) {
		t.Fatalf("resources at queue limit = %+v", counts)
	}
	if inFlight, pending := harness.manager.AsyncCounts(); inFlight != 1 || pending != accessibilityMaximumQueued+1 {
		t.Fatalf("async counts at queue limit = %d/%d, want 1/%d", inFlight, pending, accessibilityMaximumQueued+1)
	}

	// Close rejects the accepted in-flight and queued Promises immediately. The
	// deliberately uncooperative native call is released only afterwards, so its
	// late retained handle must be discarded by the native worker before Close.
	harness.closeOwners(t)
	harness.waitForJSBoolean(t, "globalThis.__queueSettled", 3*time.Second)
	if got := harness.integerValue(t, `globalThis.__queueCodes.filter((code) => code === "CANCELED").length`); got != accessibilityMaximumQueued+1 {
		t.Fatalf("canceled accepted requests = %d, want %d", got, accessibilityMaximumQueued+1)
	}
	if got := harness.integerValue(t, `globalThis.__queueCodes.filter((code) => code === "QUEUE_FULL").length`); got != 1 {
		t.Fatalf("queue-full requests = %d, want 1", got)
	}
	if counts := harness.manager.ResourceCounts(); counts.Pending != 0 || counts.Refs != 0 {
		t.Fatalf("resources immediately after Close = %+v", counts)
	}

	backend.unblock()
	harness.waitOwners()
	if counts := harness.manager.ResourceCounts(); counts != (AccessibilityResourceCounts{}) {
		t.Fatalf("resources after queued/in-flight teardown = %+v", counts)
	}
	if got := backend.findCalls.Load(); got != 1 {
		t.Fatalf("native Find calls after queue drain = %d, queued/full requests must not execute", got)
	}
	if got := backend.releaseCalls.Load(); got != 1 {
		t.Fatalf("late native handle releases = %d, want 1", got)
	}
	if backend.returnGID.Load() == 0 || backend.returnGID.Load() != backend.releaseGID.Load() || backend.returnGID.Load() != backend.closeGID.Load() {
		t.Fatalf("late result owner goroutines return/release/close = %d/%d/%d", backend.returnGID.Load(), backend.releaseGID.Load(), backend.closeGID.Load())
	}
	backend.assertClosedCleanly(t)
}

func TestAccessibilityRuntimeUnawaitedPromiseTeardownIsResourceClean(t *testing.T) {
	backend := newAccessibilityLimitsBackend(true)
	harness := newAccessibilityLimitsHarness(t, backend)

	harness.runScript(t, fmt.Sprintf(`
		void Accessibility.find(
			{ identifier: "intentionally-unawaited" },
			{ within: { app: { pid: %d }, root: "application" }, timeout: 30000 }
		);
	`, accessibilityLimitsTestPID))
	backend.waitForBlockedFind(t)
	if counts := harness.manager.ResourceCounts(); counts.Workers != 1 || counts.Pending != 1 {
		t.Fatalf("resources before unawaited teardown = %+v", counts)
	}

	harness.closeOwners(t)
	backend.unblock()
	harness.waitOwners()
	if counts := harness.manager.ResourceCounts(); counts != (AccessibilityResourceCounts{}) {
		t.Fatalf("resources after unawaited Promise teardown = %+v", counts)
	}
	if got := backend.releaseCalls.Load(); got != 1 {
		t.Fatalf("unawaited late native handle releases = %d, want 1", got)
	}
	backend.assertClosedCleanly(t)
}

func TestAccessibilityRuntimeReleaseIsIdempotentAndRefBecomesStale(t *testing.T) {
	backend := newAccessibilityLimitsBackend(false)
	harness := newAccessibilityLimitsHarness(t, backend)

	harness.runScript(t, fmt.Sprintf(`
		globalThis.__releaseDone = false;
		globalThis.__releaseFailure = "";
		globalThis.__releaseResult = null;
		(async () => {
			const ref = await Accessibility.find(
				{ identifier: "release-target" },
				{ within: { app: { pid: %d }, root: "application" }, timeout: 30000 }
			);
			const first = await Accessibility.release(ref);
			const duplicate = await Accessibility.release(ref);
			let staleCode = "";
			try {
				await Accessibility.read(ref, { properties: ["role"] });
			} catch (error) {
				staleCode = error.code;
			}
			globalThis.__releaseResult = JSON.stringify({ first, duplicate, staleCode });
		})().then(
			() => { globalThis.__releaseDone = true; },
			(error) => {
				globalThis.__releaseFailure = String(error && (error.stack || error));
				globalThis.__releaseDone = true;
			}
		);
	`, accessibilityLimitsTestPID))
	harness.waitForJSDone(t, "__releaseDone", "__releaseFailure", 5*time.Second)

	if got := harness.stringValue(t, "__releaseResult"); got != `{"first":true,"duplicate":false,"staleCode":"STALE_TARGET"}` {
		t.Fatalf("release/stale result = %s", got)
	}
	if backend.findCalls.Load() != 1 || backend.releaseCalls.Load() != 1 || backend.readCalls.Load() != 0 {
		t.Fatalf("native find/release/read calls = %d/%d/%d, want 1/1/0", backend.findCalls.Load(), backend.releaseCalls.Load(), backend.readCalls.Load())
	}
	if counts := harness.manager.ResourceCounts(); counts != (AccessibilityResourceCounts{Workers: 1}) {
		t.Fatalf("resources after explicit release = %+v", counts)
	}

	harness.closeOwners(t)
	harness.waitOwners()
	if counts := harness.manager.ResourceCounts(); counts != (AccessibilityResourceCounts{}) {
		t.Fatalf("resources after released-ref teardown = %+v", counts)
	}
	backend.assertClosedCleanly(t)
}

type accessibilityLimitsHarness struct {
	loop        *eventloop.EventLoop
	manager     *AccessibilityRuntime
	app         *AppRuntime
	backend     *accessibilityLimitsBackend
	cleanupOnce sync.Once
}

func newAccessibilityLimitsHarness(t *testing.T, backend *accessibilityLimitsBackend) *accessibilityLimitsHarness {
	t.Helper()
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	harness := &accessibilityLimitsHarness{loop: loop, backend: backend}
	ready := make(chan error, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		opts := InitJSOptions{
			Context: context.Background(), EventLoop: loop, EnableAccessibility: true,
			AppBackendFactory:           func() AppBackend { return accessibilityLimitsAppBackend{} },
			AccessibilityBackendFactory: func() AccessibilityBackend { return backend },
		}
		harness.app = registerApp(runtimeValue, opts)
		var err error
		harness.manager, err = registerAccessibility(runtimeValue, opts, harness.app, nil)
		ready <- err
	}) {
		loop.Terminate()
		t.Fatal("event loop stopped before Accessibility setup")
	}
	if err := <-ready; err != nil {
		loop.Terminate()
		t.Fatalf("register Accessibility: %v", err)
	}
	t.Cleanup(func() {
		backend.unblock()
		harness.closeOwners(t)
		harness.waitOwners()
		harness.cleanupOnce.Do(func() { loop.Terminate() })
	})
	return harness
}

func (h *accessibilityLimitsHarness) runScript(t *testing.T, source string) {
	t.Helper()
	result := make(chan error, 1)
	if !h.loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		_, err := runtimeValue.RunString(source)
		result <- err
	}) {
		t.Fatal("event loop stopped before script evaluation")
	}
	if err := <-result; err != nil {
		t.Fatalf("Accessibility seam script: %v", err)
	}
}

func (h *accessibilityLimitsHarness) closeOwners(t *testing.T) {
	t.Helper()
	done := make(chan struct{}, 1)
	if !h.loop.RunOnLoop(func(*goja.Runtime) {
		h.manager.Close()
		h.app.Close()
		done <- struct{}{}
	}) {
		t.Fatal("event loop stopped before Accessibility teardown")
	}
	<-done
}

func (h *accessibilityLimitsHarness) waitOwners() {
	h.manager.Wait()
	h.app.Wait()
}

func (h *accessibilityLimitsHarness) waitForJSDone(t *testing.T, doneName, failureName string, timeout time.Duration) {
	t.Helper()
	h.waitForJSBoolean(t, doneName, timeout)
	if failure := h.stringValue(t, failureName); failure != "" {
		t.Fatal(failure)
	}
}

func (h *accessibilityLimitsHarness) waitForJSBoolean(t *testing.T, expression string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		value, err := h.eval(t, expression)
		if err != nil {
			t.Fatalf("evaluate %q: %v", expression, err)
		}
		if value == "true" {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", expression)
}

func (h *accessibilityLimitsHarness) stringValue(t *testing.T, expression string) string {
	t.Helper()
	value, err := h.eval(t, expression)
	if err != nil {
		t.Fatalf("evaluate %q: %v", expression, err)
	}
	return value
}

func (h *accessibilityLimitsHarness) integerValue(t *testing.T, expression string) int {
	t.Helper()
	value, err := h.eval(t, expression)
	if err != nil {
		t.Fatalf("evaluate %q: %v", expression, err)
	}
	integer, err := strconv.Atoi(value)
	if err != nil {
		t.Fatalf("integer result for %q = %q: %v", expression, value, err)
	}
	return integer
}

func (h *accessibilityLimitsHarness) eval(t *testing.T, expression string) (string, error) {
	t.Helper()
	type evaluation struct {
		value string
		err   error
	}
	result := make(chan evaluation, 1)
	if !h.loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		value, err := runtimeValue.RunString(expression)
		if err != nil {
			result <- evaluation{err: err}
			return
		}
		result <- evaluation{value: value.String()}
	}) {
		return "", fmt.Errorf("event loop stopped")
	}
	item := <-result
	return item.value, item.err
}

type accessibilityLimitsAppBackend struct{}

func (accessibilityLimitsAppBackend) Name() string { return "accessibility-limits-app" }
func (accessibilityLimitsAppBackend) Capabilities() map[string]interface{} {
	return map[string]interface{}{}
}
func (accessibilityLimitsAppBackend) List(ctx context.Context) ([]desktopApplicationState, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return []desktopApplicationState{{
		PID: accessibilityLimitsTestPID, Name: "Accessibility Limits Fixture",
		BundleIdentifier: "com.opendesk.accessibility-limits", Path: "/fixture/AccessibilityLimits.app",
		ExecutablePath: "/fixture/AccessibilityLimits.app/Contents/MacOS/AccessibilityLimits",
		LaunchTimeMS:   1720000000000, Active: true,
	}}, nil
}
func (accessibilityLimitsAppBackend) Launch(context.Context, appTarget, bool) error { return nil }
func (accessibilityLimitsAppBackend) Terminate(context.Context, int64, bool) error  { return nil }

type accessibilityLimitsBackend struct {
	blockFirst  bool
	entered     chan struct{}
	allow       chan struct{}
	unblockOnce sync.Once

	initializeCalls  atomic.Int64
	findCalls        atomic.Int64
	readCalls        atomic.Int64
	releaseCalls     atomic.Int64
	closeCalls       atomic.Int64
	lateReturns      atomic.Int64
	nextHandle       atomic.Uint64
	resourcesAtClose atomic.Int64

	ownerGID        atomic.Int64
	ownerViolations atomic.Int64
	returnGID       atomic.Int64
	releaseGID      atomic.Int64
	closeGID        atomic.Int64

	mu        sync.Mutex
	resources map[uint64]bool
}

func newAccessibilityLimitsBackend(blockFirst bool) *accessibilityLimitsBackend {
	return &accessibilityLimitsBackend{
		blockFirst: blockFirst, entered: make(chan struct{}), allow: make(chan struct{}),
		resources: map[uint64]bool{},
	}
}

func (b *accessibilityLimitsBackend) Name() string { return "accessibility-limits" }

func (b *accessibilityLimitsBackend) Capabilities() AccessibilityBackendCapabilities {
	result := defaultAccessibilityBackendCapabilities(b.Name())
	result.Implemented = true
	result.Status = "available"
	result.Permission = AccessibilityPermissionStatus{State: "granted", Granted: true}
	return result
}

func (b *accessibilityLimitsBackend) Initialize(context.Context) error {
	b.noteNativeOwner()
	b.initializeCalls.Add(1)
	return nil
}

func (b *accessibilityLimitsBackend) Snapshot(context.Context, AccessibilityScope, AccessibilityLimits) (AccessibilitySnapshotData, error) {
	b.noteNativeOwner()
	root := AccessibilityNode{Role: "application", NativeRole: "AXApplication"}
	return AccessibilitySnapshotData{Root: &root, Complete: true, Nodes: 1}, nil
}

func (b *accessibilityLimitsBackend) Find(context.Context, AccessibilityScope, AccessibilitySelector, AccessibilityLimits) (AccessibilityFindData, error) {
	gid := b.noteNativeOwner()
	call := b.findCalls.Add(1)
	if b.blockFirst && call == 1 {
		close(b.entered)
		<-b.allow
		b.lateReturns.Add(1)
		b.returnGID.Store(gid)
	}
	handle := b.nextHandle.Add(1) + 1000
	b.mu.Lock()
	b.resources[handle] = true
	b.mu.Unlock()
	return AccessibilityFindData{
		Found: true, Handle: handle, Complete: true,
		Node: AccessibilityNode{Role: "button", NativeRole: "AXButton"},
	}, nil
}

func (b *accessibilityLimitsBackend) Read(context.Context, uint64, []string) (AccessibilityReadData, error) {
	b.noteNativeOwner()
	b.readCalls.Add(1)
	return AccessibilityReadData{Properties: map[string]interface{}{"role": "button"}}, nil
}

func (b *accessibilityLimitsBackend) Perform(context.Context, uint64, AccessibilityAction) (AccessibilityActionData, error) {
	b.noteNativeOwner()
	return AccessibilityActionData{State: AccessibilityActionAcknowledged}, nil
}

func (b *accessibilityLimitsBackend) MenuSnapshot(context.Context, AccessibilityScope, AccessibilityLimits) (AccessibilityMenuData, error) {
	b.noteNativeOwner()
	return AccessibilityMenuData{Complete: true}, nil
}

func (b *accessibilityLimitsBackend) FindMenuChild(context.Context, AccessibilityScope, uint64, AccessibilityMenuSegment, AccessibilityLimits) (AccessibilityMenuMatch, error) {
	b.noteNativeOwner()
	return AccessibilityMenuMatch{}, nil
}

func (b *accessibilityLimitsBackend) ExpandMenu(context.Context, uint64) (AccessibilityActionData, error) {
	b.noteNativeOwner()
	return AccessibilityActionData{State: AccessibilityActionAcknowledged}, nil
}

func (b *accessibilityLimitsBackend) Release(handle uint64) error {
	gid := b.noteNativeOwner()
	b.releaseGID.Store(gid)
	b.releaseCalls.Add(1)
	b.mu.Lock()
	delete(b.resources, handle)
	b.mu.Unlock()
	return nil
}

func (b *accessibilityLimitsBackend) Close() error {
	gid := b.noteNativeOwner()
	b.closeGID.Store(gid)
	b.closeCalls.Add(1)
	b.mu.Lock()
	b.resourcesAtClose.Store(int64(len(b.resources)))
	b.resources = map[uint64]bool{}
	b.mu.Unlock()
	return nil
}

func (b *accessibilityLimitsBackend) ResourceCount() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.resources)
}

func (b *accessibilityLimitsBackend) waitForBlockedFind(t *testing.T) {
	t.Helper()
	select {
	case <-b.entered:
	case <-time.After(3 * time.Second):
		t.Fatal("native Find did not enter the controlled blocking point")
	}
}

func (b *accessibilityLimitsBackend) unblock() {
	b.unblockOnce.Do(func() { close(b.allow) })
}

func (b *accessibilityLimitsBackend) assertClosedCleanly(t *testing.T) {
	t.Helper()
	if got := b.initializeCalls.Load(); got != 1 {
		t.Fatalf("backend Initialize calls = %d, want 1", got)
	}
	if got := b.closeCalls.Load(); got != 1 {
		t.Fatalf("backend Close calls = %d, want 1", got)
	}
	if got := b.ResourceCount(); got != 0 {
		t.Fatalf("backend native resources after Close = %d", got)
	}
	if got := b.ownerViolations.Load(); got != 0 {
		t.Fatalf("backend calls escaped the fixed native worker owner %d times", got)
	}
}

func (b *accessibilityLimitsBackend) noteNativeOwner() int64 {
	gid := accessibilityLimitsGoroutineID()
	owner := b.ownerGID.Load()
	if owner == 0 {
		if b.ownerGID.CompareAndSwap(0, gid) {
			return gid
		}
		owner = b.ownerGID.Load()
	}
	if owner != gid {
		b.ownerViolations.Add(1)
	}
	return gid
}

func accessibilityLimitsGoroutineID() int64 {
	var buffer [64]byte
	length := goruntime.Stack(buffer[:], false)
	fields := strings.Fields(string(buffer[:length]))
	if len(fields) < 2 {
		return -1
	}
	value, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return -1
	}
	return value
}
