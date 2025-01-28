// automation/utils.go
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
	// 打印数据  'js:', jsObjName, jsObj
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

		// 设置receiver
		inputs[0] = receiver

		// 转换参数
		for i := 1; i < numIn; i++ {
			if i-1 < len(call.Arguments) {
				jsArg := call.Arguments[i-1]
				goArg := reflect.New(methodType.In(i)).Elem()

				if err := runtime.ExportTo(jsArg, goArg.Addr().Interface()); err != nil {
					panic(runtime.NewGoError(err))
				}
				inputs[i] = goArg
			} else {
				inputs[i] = reflect.Zero(methodType.In(i))
			}
		}

		// 调用方法
		results := method.Func.Call(inputs)

		// 处理返回值
		if len(results) == 0 {
			return goja.Undefined()
		}

		// 检查错误返回值
		if len(results) > 0 {
			lastResult := results[len(results)-1]
			if lastResult.Type().Implements(reflect.TypeOf((*error)(nil)).Elem()) {
				if !lastResult.IsNil() {
					panic(runtime.NewGoError(lastResult.Interface().(error)))
				}
				results = results[:len(results)-1]
			}
		}

		// 如果没有其他返回值
		if len(results) == 0 {
			return goja.Undefined()
		}

		// 转换返回值为 JavaScript 值
		result := runtime.ToValue(results[0].Interface())
		return result
	}
}
