package automation

import (
	"fmt"
	"time"

	"github.com/dop251/goja"
)

// Go 代码 (automation/js.go)
func registerNativeFunctions(runtime *goja.Runtime) {
	// setTimeout 原生实现
	runtime.Set("$setTimeout", func(call goja.FunctionCall) goja.Value {
		callback := call.Argument(0)
		delay := call.Argument(1).ToInteger()

		go func() {
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

	// setInterval 原生实现
	runtime.Set("$setInterval", func(call goja.FunctionCall) goja.Value {
		callback := call.Argument(0)
		delay := call.Argument(1).ToInteger()
		stop := make(chan bool)

		go func() {
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

	// clearTimeout 原生实现
	runtime.Set("$clearTimeout", func(call goja.FunctionCall) goja.Value {
		if ch, ok := call.Argument(0).Export().(chan bool); ok {
			close(ch)
		}
		return goja.Undefined()
	})

	// clearInterval 原生实现
	runtime.Set("$clearInterval", func(call goja.FunctionCall) goja.Value {
		if ch, ok := call.Argument(0).Export().(chan bool); ok {
			close(ch)
		}
		return goja.Undefined()
	})
}
