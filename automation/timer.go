package automation

import (
	"fmt"
	"math"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

// Timer owns JavaScript timer handles for one runtime. The eventloop package
// may use helper goroutines to wait for time, but it always returns JavaScript
// callbacks to the runtime-owner goroutine.
type Timer struct {
	runtime      *goja.Runtime
	loop         *eventloop.EventLoop
	onAsyncError func(error)
	entries      map[int]*timerEntry
	nextID       int
}

type timerEntry struct {
	timeout  *eventloop.Timer
	interval *eventloop.Interval
}

func NewTimer(runtime *goja.Runtime, loop *eventloop.EventLoop, onAsyncError func(error)) *Timer {
	return &Timer{
		runtime:      runtime,
		loop:         loop,
		onAsyncError: onAsyncError,
		entries:      make(map[int]*timerEntry),
	}
}

func (t *Timer) RegisterInRuntime() {
	if t.loop == nil {
		t.runtime.Set("setTimeout", t.unsupportedTimer("setTimeout"))
		t.runtime.Set("setInterval", t.unsupportedTimer("setInterval"))
		t.runtime.Set("clearTimeout", func(goja.FunctionCall) goja.Value { return goja.Undefined() })
		t.runtime.Set("clearInterval", func(goja.FunctionCall) goja.Value { return goja.Undefined() })
		return
	}

	t.runtime.Set("setTimeout", t.SetTimeout)
	t.runtime.Set("clearTimeout", t.ClearTimeout)
	t.runtime.Set("setInterval", t.SetInterval)
	t.runtime.Set("clearInterval", t.ClearInterval)
}

func (t *Timer) unsupportedTimer(name string) func(goja.FunctionCall) goja.Value {
	return func(goja.FunctionCall) goja.Value {
		panic(t.runtime.NewTypeError("%s requires an event-loop-owned runtime", name))
	}
}

func (t *Timer) SetTimeout(call goja.FunctionCall) goja.Value {
	callback := t.callback(call.Argument(0), "setTimeout")
	id := t.newID()
	entry := &timerEntry{}
	t.entries[id] = entry
	entry.timeout = t.loop.SetTimeout(func(rt *goja.Runtime) {
		delete(t.entries, id)
		t.call(callback)
	}, timerDelay(call.Argument(1)))
	if entry.timeout == nil {
		delete(t.entries, id)
		panic(t.runtime.NewGoError(fmt.Errorf("runtime event loop has terminated")))
	}
	return t.runtime.ToValue(id)
}

func (t *Timer) SetInterval(call goja.FunctionCall) goja.Value {
	callback := t.callback(call.Argument(0), "setInterval")
	id := t.newID()
	entry := &timerEntry{}
	t.entries[id] = entry
	entry.interval = t.loop.SetInterval(func(rt *goja.Runtime) {
		if _, exists := t.entries[id]; !exists {
			return
		}
		if err := t.call(callback); err != nil {
			t.clear(id)
		}
	}, timerDelay(call.Argument(1)))
	if entry.interval == nil {
		delete(t.entries, id)
		panic(t.runtime.NewGoError(fmt.Errorf("runtime event loop has terminated")))
	}
	return t.runtime.ToValue(id)
}

// Delay returns an event-loop-owned Promise that resolves after the requested
// number of milliseconds. Unlike System.sleep(), this pauses only the calling
// JavaScript workflow and never suspends the host operating system.
func (t *Timer) Delay(milliseconds float64) goja.Value {
	if t.loop == nil {
		panic(t.runtime.NewTypeError("System.delay requires an event-loop-owned runtime"))
	}
	duration, err := strictTimerDelay(milliseconds)
	if err != nil {
		panic(t.runtime.NewTypeError("System.delay: %s", err.Error()))
	}
	promise, resolve, _ := t.runtime.NewPromise()
	id := t.newID()
	entry := &timerEntry{}
	t.entries[id] = entry
	entry.timeout = t.loop.SetTimeout(func(rt *goja.Runtime) {
		delete(t.entries, id)
		if err := resolve(goja.Undefined()); err != nil && t.onAsyncError != nil {
			t.onAsyncError(err)
		}
	}, duration)
	if entry.timeout == nil {
		delete(t.entries, id)
		panic(t.runtime.NewGoError(fmt.Errorf("runtime event loop has terminated")))
	}
	return t.runtime.ToValue(promise)
}

func (t *Timer) ClearTimeout(call goja.FunctionCall) goja.Value {
	t.clear(int(call.Argument(0).ToInteger()))
	return goja.Undefined()
}

func (t *Timer) ClearInterval(call goja.FunctionCall) goja.Value {
	t.clear(int(call.Argument(0).ToInteger()))
	return goja.Undefined()
}

func (t *Timer) Cleanup() {
	for id := range t.entries {
		t.clear(id)
	}
}

func (t *Timer) Count() int {
	return len(t.entries)
}

func (t *Timer) newID() int {
	t.nextID++
	return t.nextID
}

func (t *Timer) callback(value goja.Value, name string) goja.Callable {
	callback, ok := goja.AssertFunction(value)
	if !ok {
		panic(t.runtime.NewTypeError("%s callback must be a function", name))
	}
	return callback
}

func (t *Timer) call(callback goja.Callable) error {
	_, err := callback(goja.Undefined())
	if err != nil && t.onAsyncError != nil {
		t.onAsyncError(err)
	}
	return err
}

func (t *Timer) clear(id int) {
	entry, exists := t.entries[id]
	if !exists {
		return
	}
	delete(t.entries, id)
	if entry.timeout != nil {
		t.loop.ClearTimeout(entry.timeout)
	}
	if entry.interval != nil {
		t.loop.ClearInterval(entry.interval)
	}
}

func timerDelay(value goja.Value) time.Duration {
	milliseconds := int64(0)
	if value != nil && !goja.IsUndefined(value) && !goja.IsNull(value) {
		milliseconds = value.ToInteger()
	}
	if milliseconds < 0 {
		milliseconds = 0
	}
	const maxMilliseconds = int64((24 * time.Hour) / time.Millisecond)
	if milliseconds > maxMilliseconds {
		milliseconds = maxMilliseconds
	}
	return time.Duration(milliseconds) * time.Millisecond
}

func strictTimerDelay(milliseconds float64) (time.Duration, error) {
	if math.IsNaN(milliseconds) || math.IsInf(milliseconds, 0) {
		return 0, fmt.Errorf("milliseconds must be finite")
	}
	if milliseconds < 0 {
		return 0, fmt.Errorf("milliseconds must be greater than or equal to 0")
	}
	const maxMilliseconds = float64((24 * time.Hour) / time.Millisecond)
	if milliseconds > maxMilliseconds {
		return 0, fmt.Errorf("milliseconds must not exceed %g", maxMilliseconds)
	}
	return time.Duration(milliseconds * float64(time.Millisecond)), nil
}
