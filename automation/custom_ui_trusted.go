package automation

import (
	"context"
	"encoding/json"
	"fmt"
	"opendesk/pkg/customui"

	"github.com/dop251/goja"
)

type customUITrustedDeclaration struct {
	Kind     string                  `json:"kind,omitempty"`
	ID       string                  `json:"id"`
	Title    string                  `json:"title,omitempty"`
	Position *customUIWindowPosition `json:"position"`
	Content  customui.TrustedFile    `json:"content"`
}

func (u *CustomUIRuntime) jsCreateTrustedWindow(call goja.FunctionCall) goja.Value {
	var declaration customUITrustedDeclaration
	fail := func(err error) {
		panic(customUIJSError(u.runtime, customUIOperationError(err, "createTrustedWindow", declaration.ID)))
	}
	if err := exportCustomUIValue(call.Argument(0), &declaration); err != nil {
		fail(&customui.Error{Code: customui.CodeInvalidSpec, Message: "invalid trusted window declaration", Cause: err})
	}
	spec, err := (customUIWindowDeclaration{ID: declaration.ID, Kind: declaration.Kind, Title: declaration.Title, Position: declaration.Position}).windowSpec()
	if err != nil {
		fail(err)
	}
	if u.appShell != nil && spec.ID == u.appShell.shell.Manifest().Window.MainID {
		spec.AppCloseBehavior = u.appShell.shell.Manifest().Window.CloseBehavior
	}
	return u.startAsync("createTrustedWindow", func(ctx context.Context) (any, error) {
		caps := u.driver.Capabilities(ctx)
		if caps.Platform != "darwin" || !caps.Window["trustedWindow"] {
			return nil, &customui.Error{Code: customui.CodeUnsupportedCapability, Capability: "trustedWindow", Message: "trusted windows require macOS 11 or later and a compatible native host"}
		}
		content, err := customui.LoadTrustedContent(declaration.Content, u.baseDir)
		if err != nil {
			return nil, err
		}
		spec.Content = customui.ContentSpec{}
		spec.Trusted = content
		return u.session.Create(ctx, spec)
	}, func(value any) goja.Value {
		window := value.(*customui.Window)
		if u.appShell != nil && window.ID() == u.appShell.shell.Manifest().Window.MainID {
			u.appShell.mainWindowReady()
		}
		object := u.jsWindowObject(window)
		object["controls"] = func() any { return []customui.Control{} }
		object["postMessage"] = func(call goja.FunctionCall) goja.Value {
			value, err := u.trustedJSONValue(call.Argument(0), 0, new(int))
			var data []byte
			if err == nil {
				data, err = json.Marshal(value)
			}
			if err == nil {
				err = customui.ValidateTrustedJSON(data)
			}
			if err != nil {
				panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "postMessage", Message: "message must be bounded JSON", Cause: err}))
			}
			return u.startAsync("postMessage", func(ctx context.Context) (any, error) {
				return nil, customUIOperationError(window.PostMessage(ctx, data), "postMessage", window.ID())
			}, func(any) goja.Value { return goja.Undefined() })
		}
		return u.runtime.ToValue(object)
	})
}

// Inspect before Export: cycles, functions, undefined and non-JSON objects must
// fail rather than being silently coerced or recursively exported by Goja.
func (u *CustomUIRuntime) trustedJSONValue(value goja.Value, depth int, nodes *int) (any, error) {
	*nodes++
	if depth > 32 || *nodes > 4096 || value == nil || goja.IsUndefined(value) {
		return nil, fmt.Errorf("message exceeds JSON limits")
	}
	if goja.IsNull(value) {
		return nil, nil
	}
	if object, ok := value.(*goja.Object); ok {
		switch object.ClassName() {
		case "Array":
			length := object.Get("length").ToInteger()
			if length > 4096 {
				return nil, fmt.Errorf("array exceeds JSON limits")
			}
			result := make([]any, int(length))
			for i := range result {
				v, err := u.trustedJSONValue(object.Get(fmt.Sprint(i)), depth+1, nodes)
				if err != nil {
					return nil, err
				}
				result[i] = v
			}
			return result, nil
		case "Object":
			prototype := u.runtime.Get("Object").ToObject(u.runtime).Get("prototype")
			if object.Prototype() != prototype {
				return nil, fmt.Errorf("plain JSON object required")
			}
			result := map[string]any{}
			for _, key := range object.Keys() {
				v, err := u.trustedJSONValue(object.Get(key), depth+1, nodes)
				if err != nil {
					return nil, err
				}
				result[key] = v
			}
			return result, nil
		default:
			return nil, fmt.Errorf("JSON object required")
		}
	}
	switch result := value.Export().(type) {
	case string, bool, int64, int32, int, float64:
		return result, nil
	default:
		return nil, fmt.Errorf("JSON primitive required")
	}
}
