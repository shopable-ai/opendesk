package automation

import (
	"context"
	"fmt"
	"reflect"
	"sync"
	"sync/atomic"

	"github.com/dop251/goja"
)

const desktopAsyncQueueCapacity = 256

// Desktop input, focus changes, application launch, and screenshots all act on
// process-external desktop state. Keep each native operation atomic across
// executions while allowing every JavaScript EventLoop to remain responsive.
var desktopNativeOperationPermit = func() chan struct{} {
	permit := make(chan struct{}, 1)
	permit <- struct{}{}
	return permit
}()

type desktopAsyncResult struct {
	value    interface{}
	hasValue bool
	err      error
}

type desktopAsyncPending struct {
	operation string
	resolve   func(interface{}) error
	reject    func(interface{}) error
}

type desktopAsyncJob struct {
	id     uint64
	invoke func() desktopAsyncResult
}

// DesktopAsyncRuntime is the execution-owned bridge for native desktop calls
// whose public JavaScript contract is Promise-based. Argument export and
// Promise settlement stay on the Goja owner; the serialized worker receives
// only Go values and may block without blocking JavaScript timers or logging.
type DesktopAsyncRuntime struct {
	runtime *goja.Runtime
	loop    interface {
		RunOnLoop(func(*goja.Runtime)) bool
	}
	context context.Context
	cancel  context.CancelFunc

	closing atomic.Bool
	workers atomic.Int64
	queued  atomic.Int64
	wg      sync.WaitGroup
	jobs    chan desktopAsyncJob

	mu      sync.Mutex
	nextID  uint64
	pending map[uint64]desktopAsyncPending
}

func newDesktopAsyncRuntime(runtimeValue *goja.Runtime, opts InitJSOptions) *DesktopAsyncRuntime {
	if runtimeValue == nil || opts.EventLoop == nil {
		return nil
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	owner := &DesktopAsyncRuntime{
		runtime: runtimeValue,
		loop:    opts.EventLoop,
		context: ctx,
		cancel:  cancel,
		jobs:    make(chan desktopAsyncJob, desktopAsyncQueueCapacity),
		pending: make(map[uint64]desktopAsyncPending),
	}
	owner.wg.Add(1)
	go owner.run()
	return owner
}

func (d *DesktopAsyncRuntime) overrideMethods(target map[string]interface{}, receiver interface{}, methodNames ...string) error {
	if d == nil {
		return nil
	}
	value := reflect.ValueOf(receiver)
	if !value.IsValid() || (value.Kind() == reflect.Ptr && value.IsNil()) {
		return fmt.Errorf("desktop async receiver is required")
	}
	typ := value.Type()
	for _, methodName := range methodNames {
		method, ok := typ.MethodByName(methodName)
		if !ok || method.PkgPath != "" {
			return fmt.Errorf("desktop async method %s.%s is unavailable", typ, methodName)
		}
		target[toLowerFirst(methodName)] = d.methodWrapper(value, method)
	}
	return nil
}

func (d *DesktopAsyncRuntime) methodWrapper(receiver reflect.Value, method reflect.Method) func(goja.FunctionCall) goja.Value {
	return func(call goja.FunctionCall) (result goja.Value) {
		promise, resolve, reject := d.runtime.NewPromise()
		promiseValue := d.runtime.ToValue(promise)
		rejectWith := func(err error) goja.Value {
			_ = reject(structuredGoError(d.runtime, err))
			return promiseValue
		}
		defer func() {
			if recovered := recover(); recovered != nil {
				_ = reject(structuredGoError(d.runtime, desktopRecoveredError(method.Name, recovered)))
				result = promiseValue
			}
		}()
		if d.closing.Load() || d.context.Err() != nil {
			return rejectWith(fmt.Errorf("%s canceled: desktop Runtime is closing", method.Name))
		}
		inputs, err := exportReflectInputs(d.runtime, receiver, method, call.Arguments)
		if err != nil {
			return rejectWith(fmt.Errorf("%s: %w", method.Name, err))
		}

		d.mu.Lock()
		d.nextID++
		id := d.nextID
		d.pending[id] = desktopAsyncPending{operation: method.Name, resolve: resolve, reject: reject}
		d.mu.Unlock()
		job := desktopAsyncJob{id: id, invoke: func() desktopAsyncResult {
			return invokeReflectMethod(method, inputs)
		}}
		select {
		case d.jobs <- job:
			d.queued.Add(1)
		case <-d.context.Done():
			d.removePending(id)
			return rejectWith(fmt.Errorf("%s canceled: %w", method.Name, d.context.Err()))
		default:
			d.removePending(id)
			return rejectWith(fmt.Errorf("%s: desktop operation queue is full", method.Name))
		}
		return promiseValue
	}
}

func (d *DesktopAsyncRuntime) run() {
	defer d.wg.Done()
	for {
		if d.context.Err() != nil {
			return
		}
		select {
		case <-d.context.Done():
			return
		case job := <-d.jobs:
			d.queued.Add(-1)
			d.runJob(job)
		}
	}
}

func (d *DesktopAsyncRuntime) runJob(job desktopAsyncJob) {
	select {
	case <-d.context.Done():
		return
	case <-desktopNativeOperationPermit:
	}
	d.workers.Add(1)
	result := job.invoke()
	d.workers.Add(-1)
	desktopNativeOperationPermit <- struct{}{}
	if d.closing.Load() {
		return
	}
	d.loop.RunOnLoop(func(*goja.Runtime) { d.finish(job.id, result) })
}

func (d *DesktopAsyncRuntime) finish(id uint64, result desktopAsyncResult) {
	d.mu.Lock()
	pending, ok := d.pending[id]
	if ok {
		delete(d.pending, id)
	}
	d.mu.Unlock()
	if !ok {
		return
	}
	if result.err != nil {
		_ = pending.reject(structuredGoError(d.runtime, result.err))
		return
	}
	if !result.hasValue {
		_ = pending.resolve(goja.Undefined())
		return
	}
	_ = pending.resolve(jsValueForResult(d.runtime, result.value))
}

func (d *DesktopAsyncRuntime) removePending(id uint64) {
	d.mu.Lock()
	delete(d.pending, id)
	d.mu.Unlock()
}

func (d *DesktopAsyncRuntime) Close() {
	if d == nil || !d.closing.CompareAndSwap(false, true) {
		return
	}
	d.cancel()
	d.mu.Lock()
	pending := d.pending
	d.pending = make(map[uint64]desktopAsyncPending)
	d.mu.Unlock()
	for _, item := range pending {
		_ = item.reject(structuredGoError(d.runtime, fmt.Errorf("%s canceled during execution teardown", item.operation)))
	}
}

func (d *DesktopAsyncRuntime) Wait() {
	if d != nil {
		d.wg.Wait()
	}
}

func (d *DesktopAsyncRuntime) AsyncCounts() (workers int64, pending int) {
	if d == nil {
		return 0, 0
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.workers.Load(), len(d.pending)
}

func (d *DesktopAsyncRuntime) ResourceCounts() (workers int64, pending int, queued int64) {
	if d == nil {
		return 0, 0, 0
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.workers.Load(), len(d.pending), d.queued.Load()
}

func exportReflectInputs(runtimeValue *goja.Runtime, receiver reflect.Value, method reflect.Method, arguments []goja.Value) ([]reflect.Value, error) {
	methodType := method.Type
	isVariadic := methodType.IsVariadic()
	fixedEnd := methodType.NumIn()
	if isVariadic {
		fixedEnd--
	}
	inputs := make([]reflect.Value, 0, len(arguments)+1)
	inputs = append(inputs, receiver)
	for index := 1; index < fixedEnd; index++ {
		parameterType := methodType.In(index)
		value := reflect.New(parameterType).Elem()
		if index-1 < len(arguments) {
			if err := runtimeValue.ExportTo(arguments[index-1], value.Addr().Interface()); err != nil {
				return nil, fmt.Errorf("failed to convert parameter %d: %w", index, err)
			}
		}
		inputs = append(inputs, value)
	}
	if isVariadic {
		elementType := methodType.In(methodType.NumIn() - 1).Elem()
		for index := fixedEnd - 1; index < len(arguments); index++ {
			value := reflect.New(elementType).Elem()
			if err := runtimeValue.ExportTo(arguments[index], value.Addr().Interface()); err != nil {
				return nil, fmt.Errorf("failed to convert variadic parameter %d: %w", index, err)
			}
			inputs = append(inputs, value)
		}
	}
	return inputs, nil
}

func invokeReflectMethod(method reflect.Method, inputs []reflect.Value) (result desktopAsyncResult) {
	defer func() {
		if recovered := recover(); recovered != nil {
			result = desktopAsyncResult{err: desktopRecoveredError(method.Name, recovered)}
		}
	}()
	results := method.Func.Call(inputs)
	if len(results) > 0 {
		last := results[len(results)-1]
		if last.Type().Implements(reflect.TypeOf((*error)(nil)).Elem()) {
			if !last.IsNil() {
				return desktopAsyncResult{err: last.Interface().(error)}
			}
			results = results[:len(results)-1]
		}
	}
	if len(results) == 0 {
		return desktopAsyncResult{}
	}
	return desktopAsyncResult{value: results[0].Interface(), hasValue: true}
}

func desktopRecoveredError(operation string, recovered interface{}) error {
	if err, ok := recovered.(error); ok {
		return fmt.Errorf("%s failed: %w", operation, err)
	}
	return fmt.Errorf("%s failed: %v", operation, recovered)
}
