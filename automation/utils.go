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

// AutoMapObject 创建一个新的映射对象
func AutoMapObject(runtime *goja.Runtime, goObj interface{}) map[string]interface{} {
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

	return jsObj
}

// MapPageToJS 将 Page 对象映射到 JS 环境
func MapPageToJS(runtime *goja.Runtime, page *Page) error {
	// 创建 page 对象的方法映射
	pageMethods := AutoMapObject(runtime, page)

	// 创建各个组件的方法映射
	mouseMethods := AutoMapObject(runtime, page.Mouse)
	keyboardMethods := AutoMapObject(runtime, page.Keyboard)
	touchscreenMethods := AutoMapObject(runtime, page.Touchscreen)

	// 创建完整的 page 对象结构
	pageObj := make(map[string]interface{})

	// 添加方法
	for name, method := range pageMethods {
		pageObj[name] = method
	}

	// 添加组件
	pageObj["mouse"] = mouseMethods
	pageObj["keyboard"] = keyboardMethods
	pageObj["touchscreen"] = touchscreenMethods

	// 设置到 JS 运行时
	runtime.Set("page", pageObj)

	return nil
}

// InitJS 初始化 JS 环境，同时支持全局对象和 page 属性
func InitJS(runtime *goja.Runtime) error {
	// 创建新的 page 实例
	page := NewPage()

	// 映射组件到全局对象
	mouseMethods := AutoMapObject(runtime, page.Mouse)
	keyboardMethods := AutoMapObject(runtime, page.Keyboard)
	touchscreenMethods := AutoMapObject(runtime, page.Touchscreen)

	runtime.Set("mouse", mouseMethods)
	runtime.Set("keyboard", keyboardMethods)
	runtime.Set("touchscreen", touchscreenMethods)

	// 创建 page 对象的方法映射
	pageMethods := AutoMapObject(runtime, page)

	// 创建完整的 page 对象结构
	pageObj := make(map[string]interface{})

	// 添加 page 的方法
	for name, method := range pageMethods {
		pageObj[name] = method
	}

	// 同时添加组件作为 page 的属性
	pageObj["mouse"] = mouseMethods
	pageObj["keyboard"] = keyboardMethods
	pageObj["touchscreen"] = touchscreenMethods

	// 设置 page 对象到 JS 运行时
	runtime.Set("page", pageObj)

	// 映射 console 对象
	consoleMethods := AutoMapObject(runtime, NewConsole())
	runtime.Set("console", consoleMethods)

	return nil
}
