package automation

import (
	"context"
	"errors"
	"fmt"
	"math"
	"opendesk/pkg/customui"
	"opendesk/pkg/customui/toolbar"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/dop251/goja"
)

const floatingMaxLabelRunes = 60

var floatingButtonIDPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,63}$`)

type floatingButton struct {
	spec     toolbar.ButtonSpec
	inFlight bool
	callback goja.Callable
}

type floatingWindowOptionsDeclaration struct {
	X           *float64                           `json:"x,omitempty"`
	Y           *float64                           `json:"y,omitempty"`
	Theme       string                             `json:"theme,omitempty"`
	Title       string                             `json:"title,omitempty"`
	AlwaysOnTop *bool                              `json:"alwaysOnTop,omitempty"`
	Draggable   *bool                              `json:"draggable,omitempty"`
	Orientation string                             `json:"orientation,omitempty"`
	Toolbar     *floatingToolbarOptionsDeclaration `json:"toolbar,omitempty"`
}

// floatingToolbarOptionsDeclaration is deliberately a small, declarative
// layout contract. It describes wrapping constraints, never native frames or
// caller-provided views.
type floatingToolbarOptionsDeclaration struct {
	MaxWidth   *float64 `json:"maxWidth,omitempty"`
	MaxColumns *float64 `json:"maxColumns,omitempty"`
	MaxRows    *float64 `json:"maxRows,omitempty"`
}

type floatingToolbarLayout struct {
	configured bool
	maxColumns int
	maxRows    int
	maxWidth   float64
}

func (layout floatingToolbarLayout) columns() int {
	if layout.maxColumns == 0 {
		return toolbar.MaxColumns
	}
	return layout.maxColumns
}

// floatingWindow is owned exclusively by the Goja EventLoop. Its logical
// button state and revision are authoritative; native goroutines exchange only
// structured toolbar values through CustomUIRuntime's bounded event queue.
type floatingWindow struct {
	ui           *CustomUIRuntime
	windowID     string
	window       *customui.Window
	starting     bool
	closed       bool
	buttons      []floatingButton
	bounds       customui.Bounds
	theme        string
	title        string
	alwaysOnTop  bool
	draggable    bool
	orientation  string
	layout       floatingToolbarLayout
	revision     uint64
	errorHandler goja.Callable
}

func newDefaultFloatingWindow(ui *CustomUIRuntime) *floatingWindow {
	return newFloatingToolbar(ui, "legacy-floating-window", floatingWindowOptionsDeclaration{})
}

func newFloatingToolbar(ui *CustomUIRuntime, windowID string, options floatingWindowOptionsDeclaration) *floatingWindow {
	value := &floatingWindow{
		ui: ui, windowID: windowID, bounds: customui.Bounds{X: 100, Y: 100},
		theme: "dark", title: "Toolbar", alwaysOnTop: true, draggable: true,
		orientation: toolbar.OrientationHorizontal,
	}
	if options.X != nil {
		value.bounds.X = *options.X
	}
	if options.Y != nil {
		value.bounds.Y = *options.Y
	}
	if options.Theme != "" {
		value.theme = options.Theme
	}
	if options.Title != "" {
		value.title = options.Title
	}
	if options.AlwaysOnTop != nil {
		value.alwaysOnTop = *options.AlwaysOnTop
	}
	if options.Draggable != nil {
		value.draggable = *options.Draggable
	}
	if options.Orientation != "" {
		value.orientation = options.Orientation
	}
	if options.Toolbar != nil {
		value.layout = floatingToolbarLayoutFromDeclaration(*options.Toolbar)
	}
	return value
}

func (u *CustomUIRuntime) jsFloatingWindowConstructor() *goja.Object {
	constructor := u.runtime.ToValue(func(call goja.ConstructorCall) *goja.Object {
		options, err := u.parseFloatingWindowOptions(call.Argument(0))
		if err != nil {
			panic(customUIJSError(u.runtime, err))
		}
		u.nextToolbarID++
		windowID := fmt.Sprintf("floating-toolbar-%d", u.nextToolbarID)
		value := newFloatingToolbar(u, windowID, options)
		u.floatingToolbars[windowID] = value
		return value.jsObject()
	}).ToObject(u.runtime)
	defaultObject := u.defaultToolbar.jsObject()
	for _, name := range []string{
		"addButton", "removeButton", "updateButton", "getButtonState", "onButtonClick", "onError", "show", "hide", "close",
		"setPosition", "setAlwaysOnTop", "waitUntilClosed", "run",
	} {
		_ = constructor.Set(name, defaultObject.Get(name))
	}
	return constructor
}

func (u *CustomUIRuntime) parseFloatingWindowOptions(value goja.Value) (floatingWindowOptionsDeclaration, error) {
	var options floatingWindowOptionsDeclaration
	if value != nil && !goja.IsUndefined(value) && !goja.IsNull(value) {
		if err := exportCustomUIValue(value, &options); err != nil {
			return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "ui", Message: "toolbar options are invalid", Cause: err}
		}
	}
	if options.X != nil && !finiteCustomUINumber(*options.X) || options.Y != nil && !finiteCustomUINumber(*options.Y) {
		return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "position", Message: "x and y must be finite numbers"}
	}
	if options.Theme != "" && options.Theme != "dark" {
		return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "theme", Message: "FloatingWindow v1 supports only the dark theme"}
	}
	if options.Orientation == "" {
		options.Orientation = toolbar.OrientationHorizontal
	}
	if !toolbar.IsValidOrientation(options.Orientation) {
		return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "orientation", Message: `orientation must be "horizontal" or "vertical"`}
	}
	if options.Toolbar != nil {
		if options.Orientation == toolbar.OrientationVertical && (options.Toolbar.MaxWidth != nil || options.Toolbar.MaxColumns != nil || options.Toolbar.MaxRows != nil) {
			return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "toolbar", Message: "toolbar wrapping options are supported only for horizontal toolbars"}
		}
		if options.Toolbar.MaxWidth != nil {
			width := *options.Toolbar.MaxWidth
			if !finiteCustomUINumber(width) || width < toolbar.MinOuterWidth || width > toolbar.MaxOuterWidth {
				return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "toolbar", Message: fmt.Sprintf("toolbar.maxWidth must be a finite number between %d and %d", toolbar.MinOuterWidth, toolbar.MaxOuterWidth)}
			}
		}
		for _, constraint := range []struct {
			name       string
			value      *float64
			upperBound int
		}{
			{name: "maxColumns", value: options.Toolbar.MaxColumns, upperBound: toolbar.MaxColumns},
			{name: "maxRows", value: options.Toolbar.MaxRows, upperBound: toolbar.MaxButtons},
		} {
			if constraint.value == nil {
				continue
			}
			if !finiteCustomUINumber(*constraint.value) || math.Trunc(*constraint.value) != *constraint.value || *constraint.value < 1 || *constraint.value > float64(constraint.upperBound) {
				return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "toolbar", Message: fmt.Sprintf("toolbar.%s must be an integer between 1 and %d", constraint.name, constraint.upperBound)}
			}
		}
	}
	if utf8.RuneCountInString(options.Title) > 128 {
		return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "title", Message: "title must contain at most 128 Unicode characters"}
	}
	return options, nil
}

func floatingToolbarLayoutFromDeclaration(declaration floatingToolbarOptionsDeclaration) floatingToolbarLayout {
	layout := floatingToolbarLayout{}
	if declaration.MaxWidth != nil {
		layout.configured = true
		layout.maxWidth = *declaration.MaxWidth
		layout.maxColumns = toolbar.MaxColumnsForWidth(*declaration.MaxWidth)
	}
	if declaration.MaxColumns != nil {
		layout.configured = true
		columns := int(*declaration.MaxColumns)
		if layout.maxColumns == 0 || columns < layout.maxColumns {
			layout.maxColumns = columns
		}
	}
	if declaration.MaxRows != nil {
		layout.configured = true
		layout.maxRows = int(*declaration.MaxRows)
	}
	return layout
}

func (f *floatingWindow) jsObject() *goja.Object {
	object := f.ui.runtime.NewObject()
	methods := map[string]any{
		"addButton": func(call goja.FunctionCall) goja.Value {
			f.requireMutable("addButton")
			id := f.stringArgument(call, 0, "id", "FloatingWindow.addButton")
			label := f.stringArgument(call, 1, "label", "FloatingWindow.addButton")
			iconName := f.stringArgument(call, 2, "iconName", "FloatingWindow.addButton")
			button, err := newFloatingButton(id, label, iconName)
			if err != nil {
				panic(customUIJSError(f.ui.runtime, err))
			}
			if f.button(id) != nil {
				panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeDuplicateID, Operation: "FloatingWindow.addButton", WindowID: f.windowID, TargetID: id, Capability: "button", Message: "button id already exists"}))
			}
			if len(f.buttons) >= f.maxButtons() {
				panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", WindowID: f.windowID, TargetID: id, Capability: "button", Message: fmt.Sprintf("%s floating toolbar supports at most %d buttons", f.orientation, f.maxButtons())}))
			}
			if callbackValue := call.Argument(3); callbackValue != nil && !goja.IsUndefined(callbackValue) && !goja.IsNull(callbackValue) {
				callback, ok := goja.AssertFunction(callbackValue)
				if !ok {
					panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", WindowID: f.windowID, TargetID: id, Capability: "callback", Message: "callback must be a function"}))
				}
				button.callback = callback
			}
			button.spec.State.Revision = f.nextRevision()
			f.buttons = append(f.buttons, button)
			return goja.Undefined()
		},
		"removeButton": func(call goja.FunctionCall) goja.Value {
			f.requireMutable("removeButton")
			id := f.stringArgument(call, 0, "id", "FloatingWindow.removeButton")
			for index := range f.buttons {
				if f.buttons[index].spec.ID == id {
					f.buttons = append(f.buttons[:index], f.buttons[index+1:]...)
					f.nextRevision()
					return goja.Undefined()
				}
			}
			panic(customUIJSError(f.ui.runtime, f.buttonNotFound("FloatingWindow.removeButton", id)))
		},
		"updateButton": func(call goja.FunctionCall) goja.Value { return f.updateButton(call) },
		"getButtonState": func(call goja.FunctionCall) goja.Value {
			id := f.stringArgument(call, 0, "id", "FloatingWindow.getButtonState")
			button := f.button(id)
			if button == nil {
				panic(customUIJSError(f.ui.runtime, f.buttonNotFound("FloatingWindow.getButtonState", id)))
			}
			if f.window == nil {
				return f.resolved(publicFloatingButtonState(button.spec, toolbar.ButtonResult{}))
			}
			return f.ui.startAsync("FloatingWindow.getButtonState", func(ctx context.Context) (any, error) {
				state, err := f.window.ToolbarButtonState(ctx, id)
				return state, customUIOperationError(err, "FloatingWindow.getButtonState", f.windowID)
			}, func(value any) goja.Value {
				current := f.button(id)
				if current == nil {
					return goja.Undefined()
				}
				return f.ui.runtime.ToValue(jsonCompatible(publicFloatingButtonState(current.spec, value.(toolbar.ButtonResult))))
			})
		},
		"onButtonClick": func(call goja.FunctionCall) goja.Value {
			id := f.stringArgument(call, 0, "id", "FloatingWindow.onButtonClick")
			button := f.button(id)
			if button == nil {
				panic(customUIJSError(f.ui.runtime, f.buttonNotFound("FloatingWindow.onButtonClick", id)))
			}
			callback, ok := goja.AssertFunction(call.Argument(1))
			if !ok {
				panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.onButtonClick", WindowID: f.windowID, TargetID: id, Capability: "callback", Message: "callback must be a function"}))
			}
			button.callback = callback
			return goja.Undefined()
		},
		"onError": func(call goja.FunctionCall) goja.Value {
			callback, ok := goja.AssertFunction(call.Argument(0))
			if !ok {
				panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.onError", WindowID: f.windowID, Capability: "callback", Message: "error handler must be a function"}))
			}
			f.errorHandler = callback
			return goja.Undefined()
		},
		"show": func(goja.FunctionCall) goja.Value { return f.show() },
		"hide": func(goja.FunctionCall) goja.Value {
			if f.window == nil {
				return f.resolved(nil)
			}
			return f.ui.startAsync("FloatingWindow.hide", func(ctx context.Context) (any, error) { return f.window.Hide(ctx) }, nil)
		},
		"close": func(goja.FunctionCall) goja.Value {
			if f.window == nil {
				f.release()
				return f.resolved(nil)
			}
			return f.ui.startAsync("FloatingWindow.close", func(ctx context.Context) (any, error) { return f.window.Close(ctx) }, nil)
		},
		"setPosition": func(call goja.FunctionCall) goja.Value { return f.setPosition(call) },
		"setAlwaysOnTop": func(call goja.FunctionCall) goja.Value {
			f.alwaysOnTop = call.Argument(0).ToBoolean()
			if f.window == nil {
				return f.resolved(f.alwaysOnTop)
			}
			enabled := f.alwaysOnTop
			return f.ui.startAsync("FloatingWindow.setAlwaysOnTop", func(ctx context.Context) (any, error) { return f.window.SetAlwaysOnTop(ctx, enabled) }, nil)
		},
		"waitUntilClosed": func(goja.FunctionCall) goja.Value { return f.waitUntilClosed("FloatingWindow.waitUntilClosed") },
		"run":             func(goja.FunctionCall) goja.Value { return f.waitUntilClosed("FloatingWindow.run") },
	}
	for name, method := range methods {
		_ = object.Set(name, method)
	}
	_ = object.Set("id", f.windowID)
	return object
}

func (f *floatingWindow) setPosition(call goja.FunctionCall) goja.Value {
	x, y := call.Argument(0).ToFloat(), call.Argument(1).ToFloat()
	if !finiteCustomUINumber(x) || !finiteCustomUINumber(y) {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.setPosition", WindowID: f.windowID, Capability: "position", Message: "x and y must be finite numbers"}))
	}
	f.bounds.X, f.bounds.Y = x, y
	if f.window == nil {
		return f.resolved(f.bounds)
	}
	return f.ui.startAsync("FloatingWindow.setPosition", func(ctx context.Context) (any, error) {
		state, err := f.window.State(ctx)
		if err != nil {
			return nil, customUIOperationError(err, "FloatingWindow.setPosition", f.windowID)
		}
		state.Bounds.X, state.Bounds.Y = x, y
		result, err := f.window.SetBounds(ctx, state.Bounds)
		return result, customUIOperationError(err, "FloatingWindow.setPosition", f.windowID)
	}, func(value any) goja.Value {
		state := value.(customui.WindowState)
		f.bounds = state.Bounds
		return f.ui.runtime.ToValue(jsonCompatible(state))
	})
}

func (f *floatingWindow) waitUntilClosed(operation string) goja.Value {
	if f.window == nil {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidState, Operation: operation, WindowID: f.windowID, Capability: "lifecycle", Message: "await toolbar.show() before waiting for close"}))
	}
	window := f.window
	return f.ui.startAsync(operation, func(ctx context.Context) (any, error) {
		select {
		case <-window.WaitClosed():
			return window.State(context.Background())
		case <-ctx.Done():
			return nil, &customui.Error{Code: customui.CodeCanceled, Operation: operation, WindowID: window.ID(), Capability: "lifecycle", Message: "waiting for floating window close", Cause: ctx.Err()}
		}
	}, nil)
}

func (f *floatingWindow) requireMutable(operation string) {
	if f.window != nil || f.starting || f.closed {
		panic(customUIJSError(f.ui.runtime, &customui.Error{
			Code: customui.CodeInvalidState, Operation: "FloatingWindow." + operation, WindowID: f.windowID, Capability: "structure",
			Message: "buttons can be added or removed only before the first show(); use updateButton() for post-show state",
		}))
	}
}

func (f *floatingWindow) show() goja.Value {
	if f.closed {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidState, Operation: "FloatingWindow.show", WindowID: f.windowID, Capability: "lifecycle", Message: "toolbar is closed"}))
	}
	if f.window != nil {
		return f.ui.startAsync("FloatingWindow.show", func(ctx context.Context) (any, error) { return f.window.Show(ctx) }, nil)
	}
	if f.starting {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeBusy, Operation: "FloatingWindow.show", WindowID: f.windowID, Capability: "lifecycle", Message: "floating toolbar is being created"}))
	}
	if len(f.buttons) < toolbar.MinButtons || len(f.buttons) > f.maxButtons() {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.show", WindowID: f.windowID, Capability: "button", Message: fmt.Sprintf("%s floating toolbar requires between 1 and %d buttons", f.orientation, f.maxButtons())}))
	}
	f.starting = true
	declaration := f.toolbarSpec()
	spec := customui.WindowSpec{
		ID: f.windowID, Kind: "floating", Title: f.title, Theme: f.theme,
		Bounds: f.bounds, AlwaysOnTop: f.alwaysOnTop, Draggable: f.draggable, Toolbar: &declaration,
	}
	return f.ui.startAsyncFinally("FloatingWindow.show", func(ctx context.Context) (any, error) {
		window, err := f.ui.session.Create(ctx, spec)
		if err != nil {
			return nil, err
		}
		state, err := window.Show(ctx)
		if err != nil {
			_, _ = window.Close(context.Background())
			return nil, err
		}
		return struct {
			window *customui.Window
			state  customui.WindowState
		}{window: window, state: state}, nil
	}, func(value any) goja.Value {
		result := value.(struct {
			window *customui.Window
			state  customui.WindowState
		})
		f.window = result.window
		f.bounds = result.state.Bounds
		f.starting = false
		return f.ui.runtime.ToValue(jsonCompatible(result.state))
	}, func(error) { f.starting = false })
}

func (f *floatingWindow) toolbarSpec() toolbar.ToolbarSpec {
	buttons := make([]toolbar.ButtonSpec, len(f.buttons))
	for index := range f.buttons {
		buttons[index] = f.buttons[index].spec
	}
	orientation := f.orientation
	if orientation == "" {
		orientation = toolbar.OrientationHorizontal
	}
	columns := 0
	if orientation == toolbar.OrientationHorizontal && f.layout.configured {
		columns, _ = toolbar.ColumnsForButtonCount(len(buttons), f.layout.columns(), f.layout.maxRows)
	}
	return toolbar.ToolbarSpec{SchemaVersion: toolbar.SchemaVersion, Revision: f.revision, Orientation: orientation, Columns: columns, MaxWidth: f.layout.maxWidth, Buttons: buttons}
}

func (f *floatingWindow) maxButtons() int {
	return toolbar.MaxButtonsForLayout(f.orientation, f.layout.columns(), f.layout.maxRows)
}

type floatingButtonPublicState struct {
	ID                string                   `json:"id"`
	Label             string                   `json:"label"`
	Icon              string                   `json:"icon"`
	Active            bool                     `json:"active"`
	Disabled          bool                     `json:"disabled"`
	Busy              bool                     `json:"busy"`
	Error             string                   `json:"error"`
	Revision          uint64                   `json:"revision"`
	RenderedText      string                   `json:"renderedText"`
	Tooltip           string                   `json:"tooltip"`
	TooltipVisible    bool                     `json:"tooltipVisible"`
	IconPresentation  toolbar.IconPresentation `json:"iconPresentation"`
	AccessibilityName string                   `json:"accessibilityName"`
	LocalBounds       toolbar.Bounds           `json:"localBounds"`
	ScreenBounds      toolbar.Bounds           `json:"screenBounds"`
}

func publicFloatingButtonState(spec toolbar.ButtonSpec, native toolbar.ButtonResult) floatingButtonPublicState {
	presentation, _ := toolbar.IconPresentationFor(spec.Icon)
	if native.IconPresentation.SystemSymbol != "" {
		presentation = native.IconPresentation
	}
	accessibilityName := native.AccessibilityName
	if accessibilityName == "" {
		accessibilityName = spec.Label
	}
	tooltip := native.Tooltip
	if tooltip == "" {
		tooltip = spec.Label
	}
	return floatingButtonPublicState{
		ID: spec.ID, Label: spec.Label, Icon: spec.Icon, Active: spec.State.Active,
		Disabled: spec.State.Disabled, Busy: spec.State.Busy, Error: spec.State.Error,
		Revision: spec.State.Revision, RenderedText: native.RenderedText,
		Tooltip: tooltip, TooltipVisible: native.TooltipVisible,
		IconPresentation: presentation, AccessibilityName: accessibilityName,
		LocalBounds: native.LocalBounds, ScreenBounds: native.ScreenBounds,
	}
}

func (f *floatingWindow) updateButton(call goja.FunctionCall) goja.Value {
	id := f.stringArgument(call, 0, "id", "FloatingWindow.updateButton")
	button := f.button(id)
	if button == nil {
		panic(customUIJSError(f.ui.runtime, f.buttonNotFound("FloatingWindow.updateButton", id)))
	}
	if f.starting {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeBusy, Operation: "FloatingWindow.updateButton", WindowID: f.windowID, TargetID: id, Capability: "state", Message: "toolbar creation is still in progress"}))
	}
	if err := f.applyButtonPatch(button, call.Argument(1)); err != nil {
		panic(customUIJSError(f.ui.runtime, err))
	}
	spec := button.spec
	if f.window == nil {
		return f.resolved(publicFloatingButtonState(spec, toolbar.ButtonResult{}))
	}
	if f.closed {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidState, Operation: "FloatingWindow.updateButton", WindowID: f.windowID, TargetID: id, Capability: "state", Message: "toolbar is closed"}))
	}
	return f.ui.startAsync("FloatingWindow.updateButton", func(ctx context.Context) (any, error) {
		state, err := f.window.ApplyToolbarButton(ctx, spec)
		return state, customUIOperationError(err, "FloatingWindow.updateButton", f.windowID)
	}, func(value any) goja.Value {
		current := f.button(id)
		if current == nil {
			return goja.Undefined()
		}
		return f.ui.runtime.ToValue(jsonCompatible(publicFloatingButtonState(current.spec, value.(toolbar.ButtonResult))))
	})
}

func (f *floatingWindow) applyButtonPatch(button *floatingButton, value goja.Value) error {
	var patch map[string]any
	if err := exportCustomUIValue(value, &patch); err != nil {
		return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.updateButton", WindowID: f.windowID, TargetID: button.spec.ID, Capability: "state", Message: "button patch is invalid", Cause: err}
	}
	if len(patch) == 0 {
		return f.invalidButtonPatch(button.spec.ID, "button patch must change at least one property")
	}
	for key := range patch {
		switch key {
		case "icon", "label", "active", "disabled", "busy", "error":
		default:
			return f.invalidButtonPatch(button.spec.ID, "unknown button patch field "+key)
		}
	}
	candidate := button.spec
	if raw, exists := patch["label"]; exists {
		label, ok := raw.(string)
		if !ok {
			return f.invalidButtonPatch(button.spec.ID, "label must be a string")
		}
		if _, err := newFloatingButton(button.spec.ID, label, candidate.Icon); err != nil {
			return withFloatingOperation(err, "FloatingWindow.updateButton", f.windowID, button.spec.ID)
		}
		candidate.Label = label
	}
	if raw, exists := patch["icon"]; exists {
		icon, ok := raw.(string)
		if !ok {
			return f.invalidButtonPatch(button.spec.ID, "icon must be a string")
		}
		if _, ok := toolbar.IconToken(icon); !ok {
			return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.updateButton", WindowID: f.windowID, TargetID: button.spec.ID, Capability: "icon", Message: "unknown built-in toolbar icon " + icon}
		}
		candidate.Icon = icon
	}
	for key, target := range map[string]*bool{"active": &candidate.State.Active, "disabled": &candidate.State.Disabled, "busy": &candidate.State.Busy} {
		if raw, exists := patch[key]; exists {
			value, ok := raw.(bool)
			if !ok {
				return f.invalidButtonPatch(button.spec.ID, key+" must be a boolean")
			}
			*target = value
		}
	}
	if raw, exists := patch["error"]; exists {
		switch typed := raw.(type) {
		case nil:
			candidate.State.Error = ""
		case string:
			if len(typed) > 2048 {
				return f.invalidButtonPatch(button.spec.ID, "error must contain at most 2048 bytes")
			}
			candidate.State.Error = typed
		default:
			return f.invalidButtonPatch(button.spec.ID, "error must be a string or null")
		}
	}
	candidate.State.Revision = f.nextRevision()
	button.spec = candidate
	return nil
}

func withFloatingOperation(err error, operation, windowID, targetID string) error {
	var uiErr *customui.Error
	if !errors.As(err, &uiErr) {
		return err
	}
	copy := *uiErr
	copy.Operation, copy.WindowID, copy.TargetID = operation, windowID, targetID
	return &copy
}

func (f *floatingWindow) invalidButtonPatch(id, message string) error {
	return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.updateButton", WindowID: f.windowID, TargetID: id, Capability: "state", Message: message}
}

func newFloatingButton(id, label, icon string) (floatingButton, error) {
	if !floatingButtonIDPattern.MatchString(id) {
		return floatingButton{}, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", TargetID: id, Capability: "button", Message: "button id must match [A-Za-z][A-Za-z0-9_-]{0,63}"}
	}
	if strings.TrimSpace(label) == "" {
		return floatingButton{}, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", TargetID: id, Capability: "label", Message: "button label must not be empty"}
	}
	if utf8.RuneCountInString(label) > floatingMaxLabelRunes {
		return floatingButton{}, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", TargetID: id, Capability: "label", Message: fmt.Sprintf("button label must contain at most %d Unicode characters", floatingMaxLabelRunes)}
	}
	if _, ok := toolbar.IconToken(icon); !ok {
		return floatingButton{}, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", TargetID: id, Capability: "icon", Message: "unknown built-in toolbar icon " + icon}
	}
	return floatingButton{spec: toolbar.ButtonSpec{ID: id, Label: label, Icon: icon}}, nil
}

func (f *floatingWindow) dispatch(event customui.Event, argument goja.Value) {
	if event.WindowID != f.windowID {
		return
	}
	if event.Type == "close" {
		f.release()
		delete(f.ui.floatingToolbars, f.windowID)
		return
	}
	if event.Type != "click" || f.closed {
		return
	}
	button := f.button(event.TargetID)
	if button == nil || button.callback == nil || button.spec.State.Disabled || button.spec.State.Busy || button.inFlight {
		return
	}
	button.inFlight = true
	button.spec.State.Busy = true
	button.spec.State.Error = ""
	button.spec.State.Revision = f.nextRevision()
	f.syncButtonState(button.spec, nil)
	result, err := button.callback(goja.Undefined(), argument)
	if err != nil {
		f.finishCallback(button, err)
		return
	}
	f.awaitCallback(button, result)
}

func (f *floatingWindow) awaitCallback(button *floatingButton, value goja.Value) {
	promiseConstructor := f.ui.runtime.Get("Promise").ToObject(f.ui.runtime)
	resolve, ok := goja.AssertFunction(promiseConstructor.Get("resolve"))
	if !ok {
		f.finishCallback(button, fmt.Errorf("Promise.resolve is unavailable"))
		return
	}
	promiseValue, err := resolve(promiseConstructor, value)
	if err != nil {
		f.finishCallback(button, err)
		return
	}
	promiseObject := promiseValue.ToObject(f.ui.runtime)
	then, ok := goja.AssertFunction(promiseObject.Get("then"))
	if !ok {
		f.finishCallback(button, fmt.Errorf("callback result is not awaitable"))
		return
	}
	onFulfilled := f.ui.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		f.finishCallback(button, nil)
		return goja.Undefined()
	})
	onRejected := f.ui.runtime.ToValue(func(call goja.FunctionCall) goja.Value {
		f.finishCallback(button, fmt.Errorf("%s", call.Argument(0).String()))
		return goja.Undefined()
	})
	if _, err := then(promiseObject, onFulfilled, onRejected); err != nil {
		f.finishCallback(button, err)
	}
}

func (f *floatingWindow) finishCallback(button *floatingButton, callbackErr error) {
	if button == nil || !button.inFlight {
		return
	}
	button.inFlight = false
	button.spec.State.Busy = false
	var structured *customui.Error
	if callbackErr != nil {
		structured = &customui.Error{
			Code: customui.CodeCallbackFailed, Operation: "FloatingWindow.callback", WindowID: f.windowID,
			TargetID: button.spec.ID, Capability: "callback", Message: "button callback failed", Cause: callbackErr,
		}
		button.spec.State.Error = structured.Error()
	}
	button.spec.State.Revision = f.nextRevision()
	if structured != nil {
		// Logical busy/error state is already authoritative on the owner loop.
		// Notify the JavaScript error listener in this same turn so a native
		// readback cannot observe error before onError has observed its context.
		f.reportCallbackError(structured)
	}
	f.syncButtonState(button.spec, func(updateErr error) {
		if updateErr != nil {
			f.ui.reportAsyncError(updateErr)
		}
	})
}

func (f *floatingWindow) syncButtonState(spec toolbar.ButtonSpec, done func(error)) {
	if f.window == nil || f.closed || f.ui.closing.Load() {
		if done != nil {
			done(nil)
		}
		return
	}
	window := f.window
	f.ui.startBackground(func(ctx context.Context) error {
		_, err := window.ApplyToolbarButton(ctx, spec)
		return customUIOperationError(err, "FloatingWindow.updateButton", f.windowID)
	}, done)
}

func (f *floatingWindow) reportCallbackError(err error) {
	if f.errorHandler == nil {
		f.ui.reportAsyncError(err)
		return
	}
	result, handlerErr := f.errorHandler(goja.Undefined(), customUIJSError(f.ui.runtime, err))
	if handlerErr != nil {
		f.ui.reportAsyncError(handlerErr)
		return
	}
	f.observeErrorHandler(result)
}

func (f *floatingWindow) observeErrorHandler(value goja.Value) {
	promiseConstructor := f.ui.runtime.Get("Promise").ToObject(f.ui.runtime)
	resolve, ok := goja.AssertFunction(promiseConstructor.Get("resolve"))
	if !ok {
		return
	}
	promiseValue, err := resolve(promiseConstructor, value)
	if err != nil {
		f.ui.reportAsyncError(err)
		return
	}
	promiseObject := promiseValue.ToObject(f.ui.runtime)
	then, ok := goja.AssertFunction(promiseObject.Get("then"))
	if !ok {
		return
	}
	onRejected := f.ui.runtime.ToValue(func(call goja.FunctionCall) goja.Value {
		f.ui.reportAsyncError(fmt.Errorf("FloatingWindow.onError failed: %s", call.Argument(0).String()))
		return goja.Undefined()
	})
	_, _ = then(promiseObject, goja.Undefined(), onRejected)
}

func (f *floatingWindow) button(id string) *floatingButton {
	for index := range f.buttons {
		if f.buttons[index].spec.ID == id {
			return &f.buttons[index]
		}
	}
	return nil
}

func (f *floatingWindow) buttonNotFound(operation, id string) error {
	return &customui.Error{Code: customui.CodeNotFound, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "button", Message: "button not found"}
}

func (f *floatingWindow) listenerCount() int {
	count := 0
	for index := range f.buttons {
		if f.buttons[index].callback != nil {
			count++
		}
	}
	if f.errorHandler != nil {
		count++
	}
	return count
}

func (f *floatingWindow) release() {
	if f.closed {
		return
	}
	f.closed = true
	f.errorHandler = nil
	for index := range f.buttons {
		f.buttons[index].callback = nil
		f.buttons[index].inFlight = false
		f.buttons[index].spec.State.Busy = false
	}
}

func (f *floatingWindow) nextRevision() uint64 {
	f.revision++
	return f.revision
}

func (f *floatingWindow) resolved(value any) goja.Value {
	promise, resolve, _ := f.ui.runtime.NewPromise()
	_ = resolve(jsonCompatible(value))
	return f.ui.runtime.ToValue(promise)
}

func (f *floatingWindow) stringArgument(call goja.FunctionCall, index int, name, operation string) string {
	value := call.Argument(index)
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, Message: name + " must be a string"}))
	}
	exported, ok := value.Export().(string)
	if !ok {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, Message: name + " must be a string"}))
	}
	return exported
}
