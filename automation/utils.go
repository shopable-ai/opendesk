package automation

import (
	"fmt"
	"reflect"
	"unicode"

	"github.com/dop251/goja"
)

func AutoMapMethods(runtime *goja.Runtime, goObj interface{}, jsObjName string) map[string]interface{} {
	val := reflect.ValueOf(goObj)
	typ := val.Type()

	jsObj := make(map[string]interface{})

	for i := 0; i < typ.NumMethod(); i++ {
		method := typ.Method(i)

		if method.PkgPath != "" {
			continue
		}

		jsMethodName := toLowerFirst(method.Name)
		wrapper := createJSMethodWrapper(runtime, val, method)
		jsObj[jsMethodName] = wrapper
	}

	fmt.Println("js:", jsObjName, jsObj)
	runtime.Set(jsObjName, jsObj)
	return jsObj
}

func toLowerFirst(str string) string {
	if len(str) == 0 {
		return ""
	}
	r := []rune(str)
	r[0] = unicode.ToLower(r[0])
	return string(r)
}

func createJSMethodWrapper(runtime *goja.Runtime, receiver reflect.Value, method reflect.Method) func(call goja.FunctionCall) goja.Value {
	return func(call goja.FunctionCall) goja.Value {
		methodType := method.Type
		numIn := methodType.NumIn()
		inputs := make([]reflect.Value, numIn)

		// Set receiver
		inputs[0] = receiver

		// Convert parameters
		for i := 1; i < numIn; i++ {
			paramType := methodType.In(i)

			if i-1 < len(call.Arguments) {
				jsArg := call.Arguments[i-1]

				// 如果参数类型是 interface{}，直接传入 JS 对象
				if paramType.Kind() == reflect.Interface {
					if jsObj := jsArg.ToObject(runtime); jsObj != nil {
						mapped := make(map[string]interface{})
						for _, key := range jsObj.Keys() {
							mapped[key] = jsObj.Get(key).Export()
						}
						inputs[i] = reflect.ValueOf(mapped)
					} else {
						inputs[i] = reflect.Zero(paramType)
					}
				} else {
					// 处理其他类型的参数
					goArg := reflect.New(paramType).Elem()
					if err := runtime.ExportTo(jsArg, goArg.Addr().Interface()); err != nil {
						panic(runtime.NewGoError(fmt.Errorf("failed to convert parameter %d: %v", i, err)))
					}
					inputs[i] = goArg
				}
			} else {
				// 对于缺失的参数使用零值
				inputs[i] = reflect.Zero(paramType)
			}
		}

		// Call method
		results := method.Func.Call(inputs)

		// Handle return values
		if len(results) == 0 {
			return goja.Undefined()
		}

		// Check for error return value
		if len(results) > 0 {
			lastResult := results[len(results)-1]
			if lastResult.Type().Implements(reflect.TypeOf((*error)(nil)).Elem()) {
				if !lastResult.IsNil() {
					panic(runtime.NewGoError(lastResult.Interface().(error)))
				}
				results = results[:len(results)-1]
			}
		}

		// Return undefined if no other return values
		if len(results) == 0 {
			return goja.Undefined()
		}

		// Convert return value to JavaScript value
		result := runtime.ToValue(results[0].Interface())
		return result
	}
}
