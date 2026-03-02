// In automation/timer.go

package automation

import (
	"fmt"
	"sync"
	"time"

	"github.com/dop251/goja"
)

type TimerType int

const (
	TimeoutTimer TimerType = iota
	IntervalTimer
)

type timerEntry struct {
	timer     *time.Timer
	ticker    *time.Ticker
	callback  goja.Callable
	timerType TimerType
	done      chan struct{}
}

type Timer struct {
	runtime *goja.Runtime
	timers  map[int]*timerEntry
	counter int
	mutex   sync.RWMutex
}

func NewTimer(runtime *goja.Runtime) *Timer {
	return &Timer{
		runtime: runtime,
		timers:  make(map[int]*timerEntry),
		counter: 0,
	}
}

func (t *Timer) RegisterInRuntime() {
	t.runtime.Set("setTimeout", t.SetTimeout)
	t.runtime.Set("clearTimeout", t.ClearTimeout)
	t.runtime.Set("setInterval", t.SetInterval)
	t.runtime.Set("clearInterval", t.ClearInterval)
}

func (t *Timer) callbackWrapper(fn goja.Callable) func() {
	return func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("Recovered from panic in timer callback: %v\n", r)
			}
		}()

		// 在 runtime 的上下文中执行回调
		_, err := fn(t.runtime.GlobalObject())
		if err != nil {
			fmt.Printf("Error in timer callback: %v\n", err)
		}
	}
}

func (t *Timer) SetTimeout(callback goja.Value, delay goja.Value) goja.Value {
	t.mutex.Lock()
	t.counter++
	timerId := t.counter
	t.mutex.Unlock()

	milliseconds := int64(1000) // 默认 1 秒
	if delay != nil && !goja.IsUndefined(delay) && !goja.IsNull(delay) {
		milliseconds = delay.ToInteger()
	}
	if milliseconds < 0 {
		milliseconds = 0
	}

	fn, ok := goja.AssertFunction(callback)
	if !ok {
		panic(t.runtime.NewTypeError("setTimeout callback must be a function"))
	}

	entry := &timerEntry{
		timerType: TimeoutTimer,
		done:      make(chan struct{}),
		callback:  fn,
	}

	entry.timer = time.AfterFunc(time.Duration(milliseconds)*time.Millisecond, t.callbackWrapper(fn))

	t.mutex.Lock()
	t.timers[timerId] = entry
	t.mutex.Unlock()

	return t.runtime.ToValue(timerId)
}

func (t *Timer) SetInterval(callback goja.Value, delay goja.Value) goja.Value {
	t.mutex.Lock()
	t.counter++
	timerId := t.counter
	t.mutex.Unlock()

	milliseconds := int64(1000) // 默认 1 秒
	if delay != nil && !goja.IsUndefined(delay) && !goja.IsNull(delay) {
		milliseconds = delay.ToInteger()
	}
	if milliseconds < 0 {
		milliseconds = 0
	}

	fn, ok := goja.AssertFunction(callback)
	if !ok {
		panic(t.runtime.NewTypeError("setInterval callback must be a function"))
	}

	entry := &timerEntry{
		timerType: IntervalTimer,
		done:      make(chan struct{}),
		callback:  fn,
	}

	// 创建 ticker
	entry.ticker = time.NewTicker(time.Duration(milliseconds) * time.Millisecond)

	// 启动 goroutine 处理定时任务
	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("Recovered from panic in interval: %v\n", r)
			}
		}()

		for {
			select {
			case <-entry.ticker.C:
				t.callbackWrapper(fn)()
			case <-entry.done:
				entry.ticker.Stop()
				return
			}
		}
	}()

	t.mutex.Lock()
	t.timers[timerId] = entry
	t.mutex.Unlock()

	return t.runtime.ToValue(timerId)
}

func (t *Timer) ClearTimeout(timerId goja.Value) goja.Value {
	id := int(timerId.ToInteger())

	t.mutex.Lock()
	defer t.mutex.Unlock()

	if entry, exists := t.timers[id]; exists && entry.timerType == TimeoutTimer {
		if entry.timer != nil {
			entry.timer.Stop()
		}
		close(entry.done)
		delete(t.timers, id)
	}

	return goja.Undefined()
}

func (t *Timer) ClearInterval(timerId goja.Value) goja.Value {
	id := int(timerId.ToInteger())

	t.mutex.Lock()
	defer t.mutex.Unlock()

	if entry, exists := t.timers[id]; exists && entry.timerType == IntervalTimer {
		if entry.ticker != nil {
			entry.ticker.Stop()
		}
		close(entry.done)
		delete(t.timers, id)
	}

	return goja.Undefined()
}

func (t *Timer) Cleanup() {
	t.mutex.Lock()
	defer t.mutex.Unlock()

	for id, entry := range t.timers {
		if entry.timerType == TimeoutTimer && entry.timer != nil {
			entry.timer.Stop()
		} else if entry.timerType == IntervalTimer && entry.ticker != nil {
			entry.ticker.Stop()
		}
		close(entry.done)
		delete(t.timers, id)
	}
}
