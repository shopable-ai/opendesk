package automation

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/dop251/goja"
	"opendesk/pkg/customui"
)

// All values are detached from Goja before entering startAsync. The native
// Session owns windows; no JS timers, global notification registry, or second
// executor are introduced by this convenience API.
func (u *CustomUIRuntime) jsNotify(call goja.FunctionCall) goja.Value {
	spec := customui.DefaultNotificationSpec()
	value := call.Argument(0)
	if value != nil && !goja.IsNull(value) && !goja.IsUndefined(value) {
		if text, ok := value.Export().(string); ok {
			spec.Message = text
		} else if err := u.exportNotification(value, &spec); err != nil {
			panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "ui.notify", Message: err.Error()}))
		}
	} else {
		panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "ui.notify", Message: "a message or notification options are required"}))
	}
	normalized, err := customui.NormalizeNotification(spec)
	if err != nil {
		panic(customUIJSError(u.runtime, err))
	}
	u.nextNotificationID++
	id := fmt.Sprintf("OpenDeskNotification%d", u.nextNotificationID)
	for {
		if _, exists := u.session.Window(id); !exists {
			break
		}
		u.nextNotificationID++
		id = fmt.Sprintf("OpenDeskNotification%d", u.nextNotificationID)
	}
	return u.startAsyncUntilObserved("ui.notify", func(ctx context.Context) (any, error) {
		window, err := u.session.Create(ctx, customui.WindowSpec{ID: id, Kind: "notification", Title: "OpenDesk", Notification: &normalized})
		if err != nil {
			return nil, err
		}
		if _, err = window.Show(ctx); err != nil {
			cleanup, cancel := context.WithTimeout(context.Background(), dialogCloseTimeout)
			defer cancel()
			_, _ = window.Close(cleanup)
			return nil, err
		}
		return window, nil
	}, func(value any) goja.Value { return u.runtime.ToValue(u.jsNotificationHandle(value.(*customui.Window))) }, nil)
}

func (u *CustomUIRuntime) exportNotification(value goja.Value, destination any) error {
	object, ok := value.(*goja.Object)
	if !ok || object.ClassName() != "Object" {
		return fmt.Errorf("notification options must be a plain object")
	}
	plain := map[string]any{}
	for _, key := range object.Keys() {
		value := object.Get(key)
		if goja.IsUndefined(value) || (goja.IsNull(value) && key != "progress") {
			return fmt.Errorf("notification %s cannot be null or undefined", key)
		}
		if key != "position" {
			plain[key] = value.Export()
			continue
		}
		position, ok := value.(*goja.Object)
		if !ok || position.ClassName() != "Object" {
			return fmt.Errorf("notification position must be an object")
		}
		fields := map[string]any{}
		for _, name := range position.Keys() {
			field := position.Get(name)
			if goja.IsNull(field) || goja.IsUndefined(field) {
				return fmt.Errorf("notification position.%s is required", name)
			}
			if name == "target" {
				if target, isObject := field.(*goja.Object); isObject {
					field = target.Get("id")
					if field == nil || goja.IsNull(field) || goja.IsUndefined(field) {
						return fmt.Errorf("notification target must have an id")
					}
				}
				if _, isString := field.Export().(string); !isString {
					return fmt.Errorf("notification target must be a FloatingWindow or window id")
				}
			}
			fields[name] = field.Export()
		}
		// Never carry the default auto discriminator into an explicit object.
		if _, exists := fields["mode"]; !exists {
			return fmt.Errorf("notification position.mode is required")
		}
		plain[key] = fields
	}
	encoded, err := json.Marshal(plain)
	if err != nil {
		return fmt.Errorf("notification options contain non-JSON values: %w", err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(encoded)))
	decoder.DisallowUnknownFields()
	return decoder.Decode(destination)
}

func (u *CustomUIRuntime) jsNotificationHandle(window *customui.Window) map[string]any {
	return map[string]any{
		"id": window.ID(),
		"update": func(call goja.FunctionCall) goja.Value {
			var patch customui.NotificationPatch
			if err := u.exportNotification(call.Argument(0), &patch); err != nil {
				panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "notification.update", WindowID: window.ID(), Message: err.Error()}))
			}
			return u.startAsync("notification.update", func(ctx context.Context) (any, error) { return window.UpdateNotification(ctx, patch) }, nil)
		},
		"close": func(goja.FunctionCall) goja.Value {
			return u.startAsync("notification.close", func(ctx context.Context) (any, error) { return window.Close(ctx) }, nil)
		},
		"getState": func(goja.FunctionCall) goja.Value {
			return u.startAsync("notification.getState", func(ctx context.Context) (any, error) { return window.State(ctx) }, nil)
		},
		"waitUntilClosed": func(goja.FunctionCall) goja.Value {
			return u.startAsyncUntilObserved("notification.waitUntilClosed", func(ctx context.Context) (any, error) {
				select {
				case <-window.WaitClosed():
					return window.State(ctx)
				case <-ctx.Done():
					return nil, &customui.Error{Code: customui.CodeCanceled, Operation: "notification.waitUntilClosed", WindowID: window.ID(), Message: "waiting for notification close", Cause: ctx.Err()}
				}
			}, nil, nil)
		},
	}
}
