package automation

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
)

const accessibilityWorkerJoinTimeout = 31 * time.Second

type accessibilityRefState uint8

const (
	accessibilityRefActive accessibilityRefState = iota
	accessibilityRefReleasing
	accessibilityRefReleased
)

type accessibilityElementRef struct {
	object     *goja.Object
	id         string
	handle     uint64
	role       string
	nativeRole string
	target     AccessibilityTargetIdentity
	window     *AccessibilityWindowIdentity
	state      accessibilityRefState
}

type accessibilityScopeSpec struct {
	kind      AccessibilityScopeKind
	appTarget appTarget
	window    *AccessibilityWindowIdentity
	ref       *accessibilityElementRef
}

// accessibilityWindowIdentityResolver is an internal, platform-specific fast
// path for revalidating one already-resolved window. It avoids enumerating
// unrelated applications and must still return the exact PID/native handle.
type accessibilityWindowIdentityResolver interface {
	resolveAccessibilityWindow(context.Context, AccessibilityWindowIdentity) (map[string]interface{}, error)
}

type accessibilityProgress struct {
	mu                sync.Mutex
	actionState       AccessibilityActionState
	completedLevels   int
	expansionOccurred bool
	failedLevel       int
	isMenu            bool
}

func newAccessibilityProgress(menu bool) *accessibilityProgress {
	return &accessibilityProgress{actionState: AccessibilityActionNotStarted, failedLevel: -1, isMenu: menu}
}

func (p *accessibilityProgress) snapshot() (AccessibilityActionState, int, bool, int, bool) {
	if p == nil {
		return AccessibilityActionNotStarted, 0, false, -1, false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.actionState, p.completedLevels, p.expansionOccurred, p.failedLevel, p.isMenu
}

func (p *accessibilityProgress) update(fn func(*accessibilityProgress)) {
	if p == nil {
		return
	}
	p.mu.Lock()
	fn(p)
	p.mu.Unlock()
}

type accessibilityPending struct {
	resolve     func(interface{}) error
	reject      func(interface{}) error
	cancel      context.CancelFunc
	stopContext func() bool
	operation   string
	requestID   string
	project     func(interface{}, string) (interface{}, error)
	finish      func(interface{}, error)
	progress    *accessibilityProgress
}

const (
	accessibilityJobQueued uint32 = iota
	accessibilityJobInitializing
	accessibilityJobRunning
	accessibilityJobCompleted
	accessibilityJobExpired
)

type accessibilityJobState struct {
	phase atomic.Uint32
}

type accessibilityJob struct {
	id        uint64
	ctx       context.Context
	operation string
	requestID string
	run       func(context.Context, AccessibilityBackend) (interface{}, error)
	discard   func(AccessibilityBackend, interface{})
	state     *accessibilityJobState
}

// AccessibilityRuntime is the single execution-scoped owner for native
// Accessibility requests, managed references, menu composition, and backend
// resources. Goja values never enter its worker goroutine.
type AccessibilityRuntime struct {
	runtime *goja.Runtime
	loop    interface {
		RunOnLoop(func(*goja.Runtime)) bool
	}
	context context.Context
	cancel  context.CancelFunc
	backend AccessibilityBackend
	app     *AppRuntime
	windows *WindowManager
	enabled bool
	nonce   string

	closing  atomic.Bool
	workers  atomic.Int64
	queued   atomic.Int64
	inFlight atomic.Int64

	mu           sync.Mutex
	nextRequest  uint64
	nextRef      uint64
	reservedRefs int
	pending      map[uint64]accessibilityPending
	refs         map[*goja.Object]*accessibilityElementRef

	startMu       sync.Mutex
	workerStarted bool
	jobs          chan accessibilityJob
	workerDone    chan struct{}
	waitOnce      sync.Once
}

func newAccessibilityRuntime(runtimeValue *goja.Runtime, opts InitJSOptions, app *AppRuntime, windows *WindowManager) *AccessibilityRuntime {
	backend := AccessibilityBackend(nil)
	if opts.AccessibilityBackendFactory != nil {
		backend = opts.AccessibilityBackendFactory()
	}
	if backend == nil {
		backend = newDefaultAccessibilityBackend()
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	manager := &AccessibilityRuntime{
		runtime: runtimeValue, context: ctx, cancel: cancel, backend: backend,
		app: app, windows: windows, enabled: opts.EnableAccessibility,
		nonce: accessibilityNonce(), pending: map[uint64]accessibilityPending{},
		refs: map[*goja.Object]*accessibilityElementRef{},
		jobs: make(chan accessibilityJob, accessibilityMaximumQueued), workerDone: make(chan struct{}),
	}
	if opts.EventLoop != nil {
		manager.loop = opts.EventLoop
	}
	return manager
}

func accessibilityNonce() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err == nil {
		return hex.EncodeToString(buffer)
	}
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

func (a *AccessibilityRuntime) backendName() string {
	if a == nil || a.backend == nil {
		return "unsupported"
	}
	return a.backend.Name()
}

func (a *AccessibilityRuntime) nextRequestIdentity(operation string) (uint64, string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.nextRequest++
	return a.nextRequest, "axreq-" + a.nonce + "-" + strconv.FormatUint(a.nextRequest, 10)
}

func (a *AccessibilityRuntime) rejected(operation string, err error) goja.Value {
	_, requestID := a.nextRequestIdentity(operation)
	return a.rejectedWithRequest(operation, requestID, err)
}

func (a *AccessibilityRuntime) rejectedWithRequest(operation, requestID string, err error) goja.Value {
	promise, _, reject := a.runtime.NewPromise()
	normalized := normalizeAccessibilityError(operation, a.backendName(), requestID, err)
	_ = reject(structuredGoError(a.runtime, normalized))
	return a.runtime.ToValue(promise)
}

func (a *AccessibilityRuntime) resolved(value interface{}) goja.Value {
	promise, resolve, _ := a.runtime.NewPromise()
	_ = resolve(value)
	return a.runtime.ToValue(promise)
}

func (a *AccessibilityRuntime) start(
	operation string,
	timeout time.Duration,
	progress *accessibilityProgress,
	run func(context.Context, AccessibilityBackend) (interface{}, error),
	project func(interface{}, string) (interface{}, error),
	finish func(interface{}, error),
	discard func(AccessibilityBackend, interface{}),
) goja.Value {
	id, requestID := a.nextRequestIdentity(operation)
	if a.loop == nil {
		return a.rejectedWithRequest(operation, requestID, accessibilityError(AccessibilityNotSupported, "runtime", "accessibility methods require the execution EventLoop", nil))
	}
	if a.closing.Load() {
		return a.rejectedWithRequest(operation, requestID, accessibilityError(AccessibilityCanceled, "runtime", "accessibility runtime is closing", nil))
	}
	ctx, cancel := context.WithTimeout(a.context, timeout)
	promise, resolve, reject := a.runtime.NewPromise()
	pending := accessibilityPending{
		resolve: resolve, reject: reject, cancel: cancel, operation: operation,
		requestID: requestID, project: project, finish: finish, progress: progress,
	}
	a.mu.Lock()
	if a.closing.Load() {
		a.mu.Unlock()
		cancel()
		_ = reject(structuredGoError(a.runtime, normalizeAccessibilityError(operation, a.backendName(), requestID, accessibilityError(AccessibilityCanceled, "runtime", "accessibility runtime is closing", nil))))
		return a.runtime.ToValue(promise)
	}
	a.pending[id] = pending
	a.mu.Unlock()

	state := &accessibilityJobState{}
	stopContext := context.AfterFunc(ctx, func() { a.settleContextDone(id, ctx, state) })
	pending.stopContext = stopContext
	a.mu.Lock()
	stored, exists := a.pending[id]
	if exists {
		stored.stopContext = stopContext
		a.pending[id] = stored
	}
	a.mu.Unlock()
	if !exists {
		stopContext()
	}

	// Closing the bounded queue and accepting a new job are serialized. This
	// prevents teardown from closing jobs between the authorization recheck and
	// the send below.
	a.startMu.Lock()
	if a.closing.Load() {
		a.startMu.Unlock()
		a.mu.Lock()
		_, exists := a.pending[id]
		delete(a.pending, id)
		a.mu.Unlock()
		stopAccessibilityPending(pending)
		failure := accessibilityError(AccessibilityCanceled, "runtime", "accessibility runtime is closing", nil)
		if exists {
			if finish != nil {
				finish(nil, failure)
			}
			_ = reject(structuredGoError(a.runtime, normalizeAccessibilityError(operation, a.backendName(), requestID, failure)))
		}
		return a.runtime.ToValue(promise)
	}
	if !a.workerStarted {
		a.workerStarted = true
		a.workers.Store(1)
		go a.runWorker()
	}
	a.queued.Add(1)
	job := accessibilityJob{id: id, ctx: ctx, operation: operation, requestID: requestID, run: run, discard: discard, state: state}
	select {
	case a.jobs <- job:
		a.startMu.Unlock()
		return a.runtime.ToValue(promise)
	default:
		a.queued.Add(-1)
		a.startMu.Unlock()
		a.mu.Lock()
		_, exists := a.pending[id]
		delete(a.pending, id)
		a.mu.Unlock()
		stopAccessibilityPending(pending)
		if exists && finish != nil {
			finish(nil, accessibilityError(AccessibilityQueueFull, "queue", "accessibility request queue is full", nil))
		}
		if exists {
			_ = reject(structuredGoError(a.runtime, normalizeAccessibilityError(operation, a.backendName(), requestID, accessibilityError(AccessibilityQueueFull, "queue", "accessibility request queue is full", nil))))
		}
		return a.runtime.ToValue(promise)
	}
}

func (a *AccessibilityRuntime) runWorker() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	defer a.workers.Store(0)
	defer close(a.workerDone)

	initialized := false
	for job := range a.jobs {
		a.queued.Add(-1)
		if err := job.ctx.Err(); err != nil {
			if job.state != nil {
				job.state.phase.CompareAndSwap(accessibilityJobQueued, accessibilityJobExpired)
			}
			a.completeWorkerJob(job, nil, accessibilityContextFailure(err, true, AccessibilityActionNotStarted))
			continue
		}
		if job.state != nil && !job.state.phase.CompareAndSwap(accessibilityJobQueued, accessibilityJobInitializing) {
			err := job.ctx.Err()
			if err == nil {
				err = context.Canceled
			}
			a.completeWorkerJob(job, nil, accessibilityContextFailure(err, true, AccessibilityActionNotStarted))
			continue
		}
		if !initialized {
			initializeErr := a.backend.Initialize(job.ctx)
			if initializeErr != nil {
				a.finishActiveJob(job, nil, initializeErr, accessibilityJobInitializing, AccessibilityActionNotStarted)
				continue
			}
			initialized = true
		}
		if err := job.ctx.Err(); err != nil {
			if job.state != nil {
				job.state.phase.CompareAndSwap(accessibilityJobInitializing, accessibilityJobExpired)
			}
			a.completeWorkerJob(job, nil, accessibilityContextFailure(err, false, AccessibilityActionNotStarted))
			continue
		}
		if job.state != nil && !job.state.phase.CompareAndSwap(accessibilityJobInitializing, accessibilityJobRunning) {
			err := job.ctx.Err()
			if err == nil {
				err = context.Canceled
			}
			a.completeWorkerJob(job, nil, accessibilityContextFailure(err, false, AccessibilityActionNotStarted))
			continue
		}
		a.inFlight.Store(1)
		value, err := job.run(job.ctx, a.backend)
		a.inFlight.Store(0)
		a.finishActiveJob(job, value, err, accessibilityJobRunning, AccessibilityActionUnknown)
	}
	_ = a.backend.Close()
}

func accessibilityContextCode(err error) AccessibilityErrorCode {
	if errors.Is(err, context.DeadlineExceeded) {
		return AccessibilityTimeout
	}
	return AccessibilityCanceled
}

func accessibilityContextFailure(err error, beforeNative bool, actionState AccessibilityActionState) error {
	phase := "deadline"
	message := "accessibility request exceeded its deadline"
	if beforeNative {
		phase = "queue"
		message = "accessibility request expired before native execution"
	} else if !errors.Is(err, context.DeadlineExceeded) {
		message = "accessibility request canceled during native execution"
	}
	if beforeNative && !errors.Is(err, context.DeadlineExceeded) {
		message = "accessibility request canceled before native execution"
	}
	failure := accessibilityError(accessibilityContextCode(err), phase, message, err)
	if typed, ok := failure.(*AccessibilityError); ok {
		typed.ActionState = actionState
	}
	return failure
}

func (a *AccessibilityRuntime) settleContextDone(id uint64, ctx context.Context, state *accessibilityJobState) {
	err := ctx.Err()
	if err == nil {
		return
	}
	beforeNative := true
	actionState := AccessibilityActionNotStarted
	if state != nil {
		for {
			phase := state.phase.Load()
			switch phase {
			case accessibilityJobQueued:
				beforeNative = true
			case accessibilityJobInitializing:
				beforeNative = false
			case accessibilityJobRunning:
				beforeNative = false
				actionState = AccessibilityActionUnknown
			case accessibilityJobCompleted, accessibilityJobExpired:
				return
			default:
				return
			}
			if state.phase.CompareAndSwap(phase, accessibilityJobExpired) {
				break
			}
		}
	}
	failure := accessibilityContextFailure(err, beforeNative, actionState)
	a.loop.RunOnLoop(func(*goja.Runtime) { a.finishWorkerJob(id, nil, failure) })
}

func (a *AccessibilityRuntime) finishActiveJob(job accessibilityJob, value interface{}, err error, activePhase uint32, expiredActionState AccessibilityActionState) {
	if job.state == nil {
		if ctxErr := job.ctx.Err(); ctxErr != nil {
			err = accessibilityContextFailure(ctxErr, activePhase == accessibilityJobQueued, expiredActionState)
		} else {
			a.stopPendingContext(job.id)
		}
		a.completeWorkerJob(job, value, err)
		return
	}
	if ctxErr := job.ctx.Err(); ctxErr != nil {
		job.state.phase.CompareAndSwap(activePhase, accessibilityJobExpired)
	}
	if job.state.phase.CompareAndSwap(activePhase, accessibilityJobCompleted) {
		a.stopPendingContext(job.id)
		a.completeWorkerJob(job, value, err)
		return
	}
	ctxErr := job.ctx.Err()
	if ctxErr == nil {
		ctxErr = context.Canceled
	}
	a.completeWorkerJob(job, value, accessibilityContextFailure(ctxErr, false, expiredActionState))
}

func stopAccessibilityPending(pending accessibilityPending) {
	if pending.stopContext != nil {
		pending.stopContext()
	}
	pending.cancel()
}

func (a *AccessibilityRuntime) stopPendingContext(id uint64) {
	a.mu.Lock()
	pending, ok := a.pending[id]
	var stopContext func() bool
	if ok {
		stopContext = pending.stopContext
		pending.stopContext = nil
		a.pending[id] = pending
	}
	a.mu.Unlock()
	if stopContext != nil {
		stopContext()
	}
}

func (a *AccessibilityRuntime) completeWorkerJob(job accessibilityJob, value interface{}, err error) {
	// A native result that missed its deadline must be disposed on the native
	// worker before it can become unreachable. In particular, Find may return a
	// retained handle immediately before the shared deadline expires. Clearing
	// discard here also prevents the closing/RunOnLoop-failure paths below from
	// releasing the same handle twice.
	if err != nil && job.discard != nil {
		job.discard(a.backend, value)
		job.discard = nil
		value = nil
	}
	if a.closing.Load() {
		if job.discard != nil {
			job.discard(a.backend, value)
		}
		return
	}
	if a.loop.RunOnLoop(func(*goja.Runtime) { a.finishWorkerJob(job.id, value, err) }) {
		return
	}
	if job.discard != nil {
		job.discard(a.backend, value)
	}
}

func (a *AccessibilityRuntime) finishWorkerJob(id uint64, value interface{}, err error) {
	a.mu.Lock()
	pending, ok := a.pending[id]
	if ok {
		delete(a.pending, id)
	}
	a.mu.Unlock()
	if !ok {
		return
	}
	stopAccessibilityPending(pending)
	if pending.finish != nil {
		pending.finish(value, err)
	}
	normalized := normalizeAccessibilityError(pending.operation, a.backendName(), pending.requestID, err)
	if normalized != nil {
		applyAccessibilityProgress(normalized, pending.progress)
		_ = pending.reject(structuredGoError(a.runtime, normalized))
		return
	}
	if pending.project != nil {
		projected, projectErr := pending.project(value, pending.requestID)
		if projectErr != nil {
			projectedError := normalizeAccessibilityError(pending.operation, a.backendName(), pending.requestID, projectErr)
			_ = pending.reject(structuredGoError(a.runtime, projectedError))
			return
		}
		_ = pending.resolve(projected)
		return
	}
	_ = pending.resolve(value)
}

func applyAccessibilityProgress(failure *AccessibilityError, progress *accessibilityProgress) {
	if failure == nil || progress == nil {
		return
	}
	state, completed, expanded, failed, menu := progress.snapshot()
	if failure.ActionState == "" || (failure.ActionState == AccessibilityActionNotStarted && state != AccessibilityActionNotStarted) {
		failure.ActionState = state
	}
	if menu {
		if failure.FailedLevel == nil {
			if failed < 0 {
				failed = completed
			}
			failure.FailedLevel = &failed
			failure.CompletedLevels = completed
			failure.ExpansionOccurred = expanded
		} else if expanded {
			failure.ExpansionOccurred = true
		}
	}
}

func (a *AccessibilityRuntime) reserveRef() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	active := 0
	for _, ref := range a.refs {
		if ref.state != accessibilityRefReleased {
			active++
		}
	}
	if active+a.reservedRefs >= accessibilityMaximumRefs {
		return accessibilityError(AccessibilityResourceLimit, "reference", "accessibility element reference limit reached", nil)
	}
	a.reservedRefs++
	return nil
}

func (a *AccessibilityRuntime) finishRefReservation() {
	a.mu.Lock()
	if a.reservedRefs > 0 {
		a.reservedRefs--
	}
	a.mu.Unlock()
}

func (a *AccessibilityRuntime) materializeRef(data AccessibilityFindData, scope AccessibilityScope) (interface{}, error) {
	if !data.Found {
		return goja.Null(), nil
	}
	if data.Handle == 0 {
		return nil, accessibilityError(AccessibilityBackendFailed, "reference", "native backend returned an invalid element handle", nil)
	}
	a.mu.Lock()
	a.nextRef++
	id := "axref-" + a.nonce + "-" + strconv.FormatUint(a.nextRef, 10)
	a.mu.Unlock()
	object := a.runtime.NewObject()
	for name, value := range map[string]interface{}{
		"kind": "AccessibilityElementRef", "id": id,
		"role": data.Node.Role, "nativeRole": data.Node.NativeRole,
	} {
		if err := object.DefineDataProperty(name, a.runtime.ToValue(value), goja.FLAG_FALSE, goja.FLAG_FALSE, goja.FLAG_TRUE); err != nil {
			return nil, accessibilityError(AccessibilityBackendFailed, "reference", "could not create managed accessibility reference", err)
		}
	}
	ref := &accessibilityElementRef{object: object, id: id, handle: data.Handle, role: data.Node.Role, nativeRole: data.Node.NativeRole, target: scope.Target, window: cloneAccessibilityWindow(scope.Window), state: accessibilityRefActive}
	a.mu.Lock()
	a.refs[object] = ref
	a.mu.Unlock()
	return object, nil
}

func cloneAccessibilityWindow(value *AccessibilityWindowIdentity) *AccessibilityWindowIdentity {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func (a *AccessibilityRuntime) lookupRef(value goja.Value, operation string, allowReleased bool) (*accessibilityElementRef, error) {
	object, ok := value.(*goja.Object)
	if !ok || object == nil {
		return nil, accessibilityError(AccessibilityInvalidArgument, "reference", "ref must be an AccessibilityElementRef created by this execution", nil)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	ref, ok := a.refs[object]
	if !ok {
		return nil, accessibilityError(AccessibilityInvalidArgument, "reference", "ref is forged or belongs to another execution", nil)
	}
	if ref.state == accessibilityRefReleased && !allowReleased {
		return nil, accessibilityError(AccessibilityStaleTarget, "reference", "accessibility element reference was released", nil)
	}
	if ref.state == accessibilityRefReleasing && !allowReleased {
		return nil, accessibilityError(AccessibilityStaleTarget, "reference", "accessibility element reference is being released", nil)
	}
	return ref, nil
}

func (a *AccessibilityRuntime) resolveScope(ctx context.Context, spec accessibilityScopeSpec, requireForeground bool) (AccessibilityScope, error) {
	switch spec.kind {
	case AccessibilityScopeApplication, AccessibilityScopeMenuBar:
		if a.app == nil {
			return AccessibilityScope{}, accessibilityError(AccessibilityBackendFailed, "identity", "App target resolver is unavailable", nil)
		}
		matches, err := a.app.matches(ctx, spec.appTarget)
		if err != nil {
			return AccessibilityScope{}, accessibilityError(AccessibilityBackendFailed, "identity", "could not resolve App target", err)
		}
		if len(matches) == 0 {
			return AccessibilityScope{}, accessibilityError(AccessibilityTargetNotFound, "identity", "App target is not running", nil)
		}
		if len(matches) != 1 {
			return AccessibilityScope{}, accessibilityError(AccessibilityAmbiguousTarget, "identity", "App target matches more than one running instance", nil)
		}
		if requireForeground && !matches[0].Active {
			return AccessibilityScope{}, accessibilityError(AccessibilityStaleTarget, "foreground", "target application is not foreground", nil)
		}
		identity, err := accessibilityIdentity(matches[0])
		if err != nil {
			return AccessibilityScope{}, err
		}
		return AccessibilityScope{Kind: spec.kind, PID: identity.PID, Target: identity}, nil
	case AccessibilityScopeWindow:
		return a.resolveWindowScope(ctx, spec.window, requireForeground)
	case AccessibilityScopeElement:
		if spec.ref == nil {
			return AccessibilityScope{}, accessibilityError(AccessibilityInvalidArgument, "reference", "element scope is missing its managed reference", nil)
		}
		if err := a.validateTargetIdentity(ctx, spec.ref.target); err != nil {
			return AccessibilityScope{}, err
		}
		if spec.ref.window != nil {
			if _, err := a.resolveWindowScope(ctx, spec.ref.window, requireForeground); err != nil {
				return AccessibilityScope{}, err
			}
		} else if requireForeground {
			current, err := a.currentApplication(ctx, spec.ref.target.PID)
			if err != nil {
				return AccessibilityScope{}, err
			}
			if !current.Active {
				return AccessibilityScope{}, accessibilityError(AccessibilityStaleTarget, "foreground", "target application is not foreground", nil)
			}
		}
		return AccessibilityScope{Kind: AccessibilityScopeElement, PID: spec.ref.target.PID, Target: spec.ref.target, Window: cloneAccessibilityWindow(spec.ref.window), ElementHandle: spec.ref.handle}, nil
	default:
		return AccessibilityScope{}, accessibilityError(AccessibilityInvalidArgument, "scope", "unsupported accessibility scope", nil)
	}
}

func accessibilityIdentity(app desktopApplicationState) (AccessibilityTargetIdentity, error) {
	if app.PID <= 0 || app.Terminated {
		return AccessibilityTargetIdentity{}, accessibilityError(AccessibilityStaleTarget, "identity", "target process identity is unavailable", nil)
	}
	if app.LaunchTimeMS <= 0 {
		return AccessibilityTargetIdentity{}, accessibilityError(AccessibilityStaleTarget, "identity", "target process instance has no verifiable launch identity", nil)
	}
	return AccessibilityTargetIdentity{PID: app.PID, LaunchTimeMS: app.LaunchTimeMS, BundleIdentifier: app.BundleIdentifier, Path: app.Path, ExecutablePath: app.ExecutablePath}, nil
}

func (a *AccessibilityRuntime) currentApplication(ctx context.Context, pid int64) (desktopApplicationState, error) {
	if a.app == nil || a.app.backend == nil {
		return desktopApplicationState{}, accessibilityError(AccessibilityBackendFailed, "identity", "App target resolver is unavailable", nil)
	}
	apps, err := a.app.backend.List(ctx)
	if err != nil {
		return desktopApplicationState{}, accessibilityError(AccessibilityBackendFailed, "identity", "could not refresh target process identity", err)
	}
	for _, app := range apps {
		if app.PID == pid && !app.Terminated {
			return app, nil
		}
	}
	return desktopApplicationState{}, accessibilityError(AccessibilityStaleTarget, "identity", "target process instance is no longer running", nil)
}

func (a *AccessibilityRuntime) validateTargetIdentity(ctx context.Context, expected AccessibilityTargetIdentity) error {
	current, err := a.currentApplication(ctx, expected.PID)
	if err != nil {
		return err
	}
	if current.LaunchTimeMS <= 0 || current.LaunchTimeMS != expected.LaunchTimeMS ||
		(expected.BundleIdentifier != "" && current.BundleIdentifier != expected.BundleIdentifier) ||
		(expected.Path != "" && current.Path != expected.Path) ||
		(expected.ExecutablePath != "" && current.ExecutablePath != expected.ExecutablePath) {
		return accessibilityError(AccessibilityStaleTarget, "identity", "target process instance identity changed", nil)
	}
	return nil
}

func (a *AccessibilityRuntime) resolveWindowScope(ctx context.Context, expected *AccessibilityWindowIdentity, requireForeground bool) (AccessibilityScope, error) {
	if expected == nil || expected.PID <= 0 || expected.Handle == 0 || expected.ID == "" {
		return AccessibilityScope{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within window has no resolved native identity", nil)
	}
	if a.windows == nil {
		return AccessibilityScope{}, accessibilityError(AccessibilityBackendFailed, "identity", "window resolver is unavailable", nil)
	}
	var matched map[string]interface{}
	if resolver, ok := a.windows.impl.(accessibilityWindowIdentityResolver); ok {
		resolved, resolveErr := resolver.resolveAccessibilityWindow(ctx, *expected)
		if resolveErr != nil {
			return AccessibilityScope{}, accessibilityError(AccessibilityBackendFailed, "identity", "could not refresh exact window identity", resolveErr)
		}
		matched = resolved
	} else {
		rows, listErr := a.windows.List()
		if listErr != nil {
			return AccessibilityScope{}, accessibilityError(AccessibilityBackendFailed, "identity", "could not refresh window identity", listErr)
		}
		for _, row := range rows {
			pid := integerValue(row["pid"])
			handle := uint64Value(row["handle"])
			id, _ := row["id"].(string)
			if pid == expected.PID && handle == expected.Handle && id == expected.ID {
				if matched != nil {
					return AccessibilityScope{}, accessibilityError(AccessibilityAmbiguousTarget, "identity", "window identity resolved to more than one current observation", nil)
				}
				matched = row
			}
		}
	}
	if matched == nil {
		return AccessibilityScope{}, accessibilityError(AccessibilityStaleTarget, "identity", "window identity is no longer current", nil)
	}
	foreground, _ := matched["isForeground"].(bool)
	if requireForeground && !foreground {
		return AccessibilityScope{}, accessibilityError(AccessibilityStaleTarget, "foreground", "target window is not foreground", nil)
	}
	currentApp, err := a.currentApplication(ctx, expected.PID)
	if err != nil {
		return AccessibilityScope{}, err
	}
	target, err := accessibilityIdentity(currentApp)
	if err != nil {
		return AccessibilityScope{}, err
	}
	current := &AccessibilityWindowIdentity{
		ID: expected.ID, PID: expected.PID, Handle: expected.Handle,
		Title: stringValue(matched["title"]), X: integerValue(matched["x"]), Y: integerValue(matched["y"]),
		Width: integerValue(matched["width"]), Height: integerValue(matched["height"]), IsForeground: foreground,
	}
	return AccessibilityScope{Kind: AccessibilityScopeWindow, PID: expected.PID, Target: target, Window: current}, nil
}

func (a *AccessibilityRuntime) capabilities() map[string]interface{} {
	capabilities := defaultAccessibilityBackendCapabilities("unsupported")
	if a != nil && a.backend != nil {
		capabilities = a.backend.Capabilities()
	}
	available := capabilities.Implemented && capabilities.Permission.Granted
	return map[string]interface{}{
		"schemaVersion": 1,
		"platform":      capabilities.Platform,
		"backend":       capabilities.Backend,
		"hostAuthorization": map[string]interface{}{
			"enabled": a != nil && a.enabled,
		},
		"implementation": map[string]interface{}{
			"available": capabilities.Implemented, "status": capabilities.Status,
			"menus": capabilities.Menus, "actions": capabilities.Actions,
			"coordinateMapping": capabilities.CoordinateMapping, "notes": capabilities.Notes,
		},
		"permission": map[string]interface{}{
			"required": capabilities.Permission.Required, "state": capabilities.Permission.State,
			"granted": capabilities.Permission.Granted, "cached": capabilities.Permission.Cached,
		},
		"available": available && a != nil && a.enabled,
		"limits": map[string]interface{}{
			"defaultTimeoutMs": accessibilityDefaultTimeout.Milliseconds(), "maxTimeoutMs": accessibilityMaximumTimeout.Milliseconds(),
			"defaultMaxDepth": accessibilityDefaultMaxDepth, "maxMaxDepth": accessibilityMaximumMaxDepth,
			"defaultMaxNodes": accessibilityDefaultMaxNodes, "maxMaxNodes": accessibilityMaximumMaxNodes,
			"maxActiveRefs": accessibilityMaximumRefs, "maxQueuedRequests": accessibilityMaximumQueued,
		},
		"cancellation": map[string]interface{}{"hardCancel": false},
	}
}

func (a *AccessibilityRuntime) Close() {
	if a == nil || !a.closing.CompareAndSwap(false, true) {
		return
	}
	a.cancel()
	a.mu.Lock()
	pending := a.pending
	a.pending = map[uint64]accessibilityPending{}
	for _, ref := range a.refs {
		ref.state = accessibilityRefReleased
	}
	a.reservedRefs = 0
	a.mu.Unlock()
	for _, item := range pending {
		stopAccessibilityPending(item)
		state, completed, expanded, failed, menu := item.progress.snapshot()
		failure := &AccessibilityError{
			Code: AccessibilityCanceled, Operation: item.operation, Backend: a.backendName(), Phase: "cleanup",
			RequestID: item.requestID, ActionState: state, Message: "accessibility request canceled during execution teardown",
			CompletedLevels: completed, ExpansionOccurred: expanded,
		}
		if menu {
			if failed < 0 {
				failed = completed
			}
			failure.FailedLevel = &failed
		}
		if item.finish != nil {
			item.finish(nil, failure)
		}
		_ = item.reject(structuredGoError(a.runtime, failure))
	}
	a.startMu.Lock()
	started := a.workerStarted
	if started {
		close(a.jobs)
	}
	a.startMu.Unlock()
	if !started {
		close(a.workerDone)
	}
}

func (a *AccessibilityRuntime) Wait() {
	if a == nil {
		return
	}
	a.waitOnce.Do(func() {
		timer := time.NewTimer(accessibilityWorkerJoinTimeout)
		defer timer.Stop()
		select {
		case <-a.workerDone:
		case <-timer.C:
		}
	})
}

func (a *AccessibilityRuntime) AsyncCounts() (int64, int) {
	if a == nil {
		return 0, 0
	}
	a.mu.Lock()
	pending := len(a.pending)
	a.mu.Unlock()
	// An idle fixed native thread and retained refs do not keep a successful
	// JavaScript execution alive. Accepted work does.
	return a.inFlight.Load(), pending
}

func (a *AccessibilityRuntime) ResourceCounts() AccessibilityResourceCounts {
	if a == nil {
		return AccessibilityResourceCounts{}
	}
	a.mu.Lock()
	pending := len(a.pending)
	refs := 0
	for _, ref := range a.refs {
		if ref.state != accessibilityRefReleased {
			refs++
		}
	}
	a.mu.Unlock()
	native := 0
	if a.backend != nil {
		native = a.backend.ResourceCount()
	}
	return AccessibilityResourceCounts{Workers: a.workers.Load(), Pending: pending, Queued: int(a.queued.Load()), Refs: refs, NativeResources: native}
}

func (a *AccessibilityRuntime) String() string {
	counts := a.ResourceCounts()
	return fmt.Sprintf("workers=%d pending=%d queued=%d refs=%d nativeResources=%d", counts.Workers, counts.Pending, counts.Queued, counts.Refs, counts.NativeResources)
}
