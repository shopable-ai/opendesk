package automation

import (
	"fmt"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
)

// activeTimers keeps track of running timers globally
var activeTimers int32

// registerNativeFunctions registers timer-related functions in the JS runtime
func registerNativeFunctions(runtime *goja.Runtime) {
	// 确保 globalThis 存在并初始化计数器
	runtime.Set("__activeTimers", int32(0))

	// setTimeout implementation
	runtime.Set("$setTimeout", func(call goja.FunctionCall) goja.Value {
		callback := call.Argument(0)
		delay := call.Argument(1).ToInteger()

		// Increment active timer count
		atomic.AddInt32(&activeTimers, 1)
		runtime.Set("__activeTimers", atomic.LoadInt32(&activeTimers))

		go func() {
			defer func() {
				// Decrement timer count when done
				atomic.AddInt32(&activeTimers, -1)
				runtime.Set("__activeTimers", atomic.LoadInt32(&activeTimers))
			}()

			time.Sleep(time.Duration(delay) * time.Millisecond)
			if fn, ok := goja.AssertFunction(callback); ok {
				_, err := fn(goja.Undefined())
				if err != nil {
					fmt.Printf("Error in setTimeout callback: %v\n", err)
				}
			}
		}()

		return goja.Undefined()
	})

	// setInterval implementation
	runtime.Set("$setInterval", func(call goja.FunctionCall) goja.Value {
		callback := call.Argument(0)
		delay := call.Argument(1).ToInteger()
		stop := make(chan bool)

		// Increment active timer count
		atomic.AddInt32(&activeTimers, 1)
		runtime.Set("__activeTimers", atomic.LoadInt32(&activeTimers))

		go func() {
			defer func() {
				// Decrement timer count when stopped
				atomic.AddInt32(&activeTimers, -1)
				runtime.Set("__activeTimers", atomic.LoadInt32(&activeTimers))
			}()

			ticker := time.NewTicker(time.Duration(delay) * time.Millisecond)
			defer ticker.Stop()

			for {
				select {
				case <-ticker.C:
					if fn, ok := goja.AssertFunction(callback); ok {
						_, err := fn(goja.Undefined())
						if err != nil {
							fmt.Printf("Error in setInterval callback: %v\n", err)
							return
						}
					}
				case <-stop:
					return
				}
			}
		}()

		return runtime.ToValue(stop)
	})

	// clearTimeout implementation
	runtime.Set("$clearTimeout", func(call goja.FunctionCall) goja.Value {
		if ch, ok := call.Argument(0).Export().(chan bool); ok {
			close(ch)
		}
		return goja.Undefined()
	})

	// clearInterval implementation
	runtime.Set("$clearInterval", func(call goja.FunctionCall) goja.Value {
		if ch, ok := call.Argument(0).Export().(chan bool); ok {
			close(ch)
		}
		return goja.Undefined()
	})

	// Add helper function to check if any timers are active
	runtime.Set("$getActiveTimers", func(call goja.FunctionCall) goja.Value {
		return runtime.ToValue(atomic.LoadInt32(&activeTimers))
	})
}

// GetActiveTimers returns the current number of active timers
func GetActiveTimers() int32 {
	return atomic.LoadInt32(&activeTimers)
}
