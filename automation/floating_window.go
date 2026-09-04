package automation

import (
	"context"
	"errors"
	"fmt"
	"math"
	"opendesk/pkg/customui"
	"opendesk/pkg/customui/toolbar"
	"regexp"
	"sort"
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

type floatingImageIconDeclaration struct {
	Path          string `json:"path"`
	RenderingMode string `json:"renderingMode,omitempty"`
}

// floatingToolbarItem keeps the public pre-show builder small while the
// native wire model remains a typed ordered item list. Only Button owns a
// callback or mutable presentation state; Separator and Spacer are inert.
type floatingToolbarItem struct {
	typeName string
	id       string
	button   *floatingButton
}

type floatingLifecycleListener struct {
	typeName string
	callback goja.Callable
}

type floatingWindowOptionsDeclaration struct {
	X           *float64                           `json:"x,omitempty"`
	Y           *float64                           `json:"y,omitempty"`
	Position    *floatingWindowPositionDeclaration `json:"position,omitempty"`
	Theme       string                             `json:"theme,omitempty"`
	Title       string                             `json:"title,omitempty"`
	AlwaysOnTop *bool                              `json:"alwaysOnTop,omitempty"`
	Draggable   *bool                              `json:"draggable,omitempty"`
	Placement   *customui.WindowPlacement          `json:"placement,omitempty"`
	Orientation string                             `json:"orientation,omitempty"`
	Toolbar     *floatingToolbarOptionsDeclaration `json:"toolbar,omitempty"`
}

// floatingWindowPositionDeclaration deliberately gives the two initial modes
// a discriminator. The legacy x/y pair is retained below for source
// compatibility, while the retired top-level placement draft is decoded only
// to return a migration error.
type floatingWindowPositionDeclaration struct {
	Mode       string   `json:"mode"`
	X          *float64 `json:"x,omitempty"`
	Y          *float64 `json:"y,omitempty"`
	Horizontal *string  `json:"horizontal,omitempty"`
	Vertical   *string  `json:"vertical,omitempty"`
	Margin     *float64 `json:"margin,omitempty"`
	Display    *string  `json:"display,omitempty"`
}

func (position floatingWindowPositionDeclaration) placement() customui.WindowPlacement {
	value := customui.WindowPlacement{}
	if position.Horizontal != nil {
		value.Horizontal = *position.Horizontal
	}
	if position.Vertical != nil {
		value.Vertical = *position.Vertical
	}
	if position.Margin != nil {
		value.Margin = *position.Margin
	}
	if position.Display != nil {
		value.Display = *position.Display
	}
	return value
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
	ui                    *CustomUIRuntime
	windowID              string
	window                *customui.Window
	starting              bool
	closed                bool
	items                 []floatingToolbarItem
	bounds                customui.Bounds
	theme                 string
	title                 string
	alwaysOnTop           bool
	draggable             bool
	placement             *customui.WindowPlacement
	orientation           string
	layout                floatingToolbarLayout
	revision              uint64
	errorHandler          goja.Callable
	lifecycleListeners    map[uint64]floatingLifecycleListener
	nextLifecycleListener uint64
}

func newDefaultFloatingWindow(ui *CustomUIRuntime) *floatingWindow {
	return newFloatingToolbar(ui, "legacy-floating-window", floatingWindowOptionsDeclaration{})
}

func newFloatingToolbar(ui *CustomUIRuntime, windowID string, options floatingWindowOptionsDeclaration) *floatingWindow {
	value := &floatingWindow{
		ui: ui, windowID: windowID, bounds: customui.Bounds{X: 100, Y: 100},
		theme: "dark", title: "Toolbar", alwaysOnTop: true, draggable: true,
		orientation:        toolbar.OrientationHorizontal,
		lifecycleListeners: map[uint64]floatingLifecycleListener{},
	}
	if options.Position != nil {
		if options.Position.Mode == "absolute" {
			value.bounds.X, value.bounds.Y = *options.Position.X, *options.Position.Y
		} else {
			placement := options.Position.placement()
			value.placement = &placement
		}
	} else if options.X != nil {
		value.bounds.X, value.bounds.Y = *options.X, *options.Y
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
		"addButton", "addSeparator", "addSpacer", "removeButton", "updateButton", "getButtonState", "getState",
		"onButtonClick", "onError", "on", "show", "hide", "close",
		"setPosition", "setPlacement", "setAlwaysOnTop", "setDraggable", "waitUntilClosed", "run",
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
	if options.Position != nil {
		if options.X != nil || options.Y != nil || options.Placement != nil {
			return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "position", Message: "position cannot be combined with legacy x, y, or placement fields"}
		}
		switch options.Position.Mode {
		case "absolute":
			if options.Position.X == nil || options.Position.Y == nil || options.Position.Horizontal != nil || options.Position.Vertical != nil || options.Position.Margin != nil || options.Position.Display != nil || !finiteCustomUINumber(*options.Position.X) || !finiteCustomUINumber(*options.Position.Y) {
				return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "position", Message: `position.mode "absolute" requires only finite position.x and position.y`}
			}
		case "anchor":
			if options.Position.X != nil || options.Position.Y != nil {
				return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "position", Message: `position.mode "anchor" does not accept position.x or position.y`}
			}
			placement, err := customui.NormalizeInitialWindowPlacement(options.Position.placement())
			if err != nil {
				return options, customUIOperationError(err, "FloatingWindow.constructor", "")
			}
			options.Position.Horizontal, options.Position.Vertical = &placement.Horizontal, &placement.Vertical
			options.Position.Margin, options.Position.Display = &placement.Margin, &placement.Display
		default:
			return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "position", Message: `position.mode must be "absolute" or "anchor"`}
		}
	} else {
		if options.Placement != nil {
			return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "position", Message: "top-level placement is a retired draft; use position:{mode:'anchor',horizontal,vertical,...}"}
		}
		if (options.X == nil) != (options.Y == nil) {
			return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "position", Message: "legacy absolute positioning requires both x and y; omit both for the default position"}
		}
		if options.X != nil && (!finiteCustomUINumber(*options.X) || !finiteCustomUINumber(*options.Y)) {
			return options, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.constructor", Capability: "position", Message: "x and y must be finite numbers"}
		}
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
			button, err := f.newFloatingButtonFromValue(id, label, call.Argument(2), "FloatingWindow.addButton")
			if err != nil {
				panic(customUIJSError(f.ui.runtime, err))
			}
			if f.item(id) != nil {
				panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeDuplicateID, Operation: "FloatingWindow.addButton", WindowID: f.windowID, TargetID: id, Capability: "item", Message: "toolbar item id already exists"}))
			}
			if f.buttonCount() >= f.maxButtons() {
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
			f.items = append(f.items, floatingToolbarItem{typeName: toolbar.ItemButton, id: id, button: &button})
			return goja.Undefined()
		},
		"addSeparator": func(call goja.FunctionCall) goja.Value {
			return f.addStructuralItem(call, toolbar.ItemSeparator, "FloatingWindow.addSeparator")
		},
		"addSpacer": func(call goja.FunctionCall) goja.Value {
			return f.addStructuralItem(call, toolbar.ItemSpacer, "FloatingWindow.addSpacer")
		},
		"removeButton": func(call goja.FunctionCall) goja.Value {
			f.requireMutable("removeButton")
			id := f.stringArgument(call, 0, "id", "FloatingWindow.removeButton")
			if f.removeButtonItem(id) {
				return goja.Undefined()
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
		"getState": func(goja.FunctionCall) goja.Value { return f.getState() },
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
		"on":   func(call goja.FunctionCall) goja.Value { return f.on(call) },
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
		"setPosition":  func(call goja.FunctionCall) goja.Value { return f.setPosition(call) },
		"setPlacement": func(call goja.FunctionCall) goja.Value { return f.setPlacement(call) },
		"setAlwaysOnTop": func(call goja.FunctionCall) goja.Value {
			f.alwaysOnTop = call.Argument(0).ToBoolean()
			if f.window == nil {
				return f.resolved(f.alwaysOnTop)
			}
			enabled := f.alwaysOnTop
			return f.ui.startAsync("FloatingWindow.setAlwaysOnTop", func(ctx context.Context) (any, error) { return f.window.SetAlwaysOnTop(ctx, enabled) }, nil)
		},
		"setDraggable":    func(call goja.FunctionCall) goja.Value { return f.setDraggable(call) },
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
	if f.window == nil {
		f.bounds.X, f.bounds.Y = x, y
		f.placement = nil
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
		f.placement = nil
		return f.ui.runtime.ToValue(jsonCompatible(state))
	})
}

func (f *floatingWindow) setPlacement(call goja.FunctionCall) goja.Value {
	var declaration customui.WindowPlacement
	if err := exportCustomUIValue(call.Argument(0), &declaration); err != nil {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.setPlacement", WindowID: f.windowID, Capability: "placement", Message: "placement is invalid", Cause: err}))
	}
	placement, err := customui.NormalizeWindowPlacement(declaration)
	if err != nil {
		panic(customUIJSError(f.ui.runtime, customUIOperationError(err, "FloatingWindow.setPlacement", f.windowID)))
	}
	if f.window == nil && placement.Display == customui.PlacementDisplayCurrent {
		_, err = customui.NormalizeInitialWindowPlacement(placement)
		panic(customUIJSError(f.ui.runtime, customUIOperationError(err, "FloatingWindow.setPlacement", f.windowID)))
	}
	if f.window == nil {
		f.placement = &placement
		return f.resolved(jsonCompatible(placement))
	}
	return f.ui.startAsync("FloatingWindow.setPlacement", func(ctx context.Context) (any, error) {
		state, err := f.window.SetPlacement(ctx, placement)
		return state, customUIOperationError(err, "FloatingWindow.setPlacement", f.windowID)
	}, func(value any) goja.Value {
		state := value.(customui.WindowState)
		f.bounds = state.Bounds
		f.placement = &placement
		return f.ui.runtime.ToValue(jsonCompatible(state))
	})
}

func (f *floatingWindow) declaredState(operation string) (customui.WindowState, error) {
	if err := f.validateStructure(operation); err != nil {
		return customui.WindowState{}, err
	}
	plan, err := toolbar.Plan(f.toolbarSpec())
	if err != nil {
		return customui.WindowState{}, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, Capability: "toolbar", Message: err.Error()}
	}
	bounds := f.bounds
	bounds.Width, bounds.Height = plan.OuterWidth, plan.OuterHeight
	return customui.WindowState{
		ID: f.windowID, SessionID: f.ui.session.ID(), Status: customui.StatusHidden,
		Visible: false, Bounds: bounds, AlwaysOnTop: f.alwaysOnTop, Draggable: f.draggable,
		OnScreen: false, Layer: 0, Alpha: 0, Revision: f.revision,
	}, nil
}

func (f *floatingWindow) getState() goja.Value {
	if f.window == nil {
		state, err := f.declaredState("FloatingWindow.getState")
		if err != nil {
			panic(customUIJSError(f.ui.runtime, err))
		}
		return f.resolved(state)
	}
	return f.ui.startAsync("FloatingWindow.getState", func(ctx context.Context) (any, error) {
		state, err := f.window.State(ctx)
		return state, customUIOperationError(err, "FloatingWindow.getState", f.windowID)
	}, func(value any) goja.Value {
		state := value.(customui.WindowState)
		f.bounds, f.alwaysOnTop, f.draggable = state.Bounds, state.AlwaysOnTop, state.Draggable
		return f.ui.runtime.ToValue(jsonCompatible(state))
	})
}

func (f *floatingWindow) setDraggable(call goja.FunctionCall) goja.Value {
	raw := call.Argument(0)
	enabled, ok := raw.Export().(bool)
	if !ok {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.setDraggable", WindowID: f.windowID, Capability: "draggable", Message: "enabled must be a boolean"}))
	}
	if f.window == nil {
		f.draggable = enabled
		state, err := f.declaredState("FloatingWindow.setDraggable")
		if err != nil {
			panic(customUIJSError(f.ui.runtime, err))
		}
		return f.resolved(state)
	}
	return f.ui.startAsync("FloatingWindow.setDraggable", func(ctx context.Context) (any, error) {
		state, err := f.window.SetDraggable(ctx, enabled)
		return state, customUIOperationError(err, "FloatingWindow.setDraggable", f.windowID)
	}, func(value any) goja.Value {
		state := value.(customui.WindowState)
		f.draggable, f.bounds = state.Draggable, state.Bounds
		return f.ui.runtime.ToValue(jsonCompatible(state))
	})
}

func (f *floatingWindow) on(call goja.FunctionCall) goja.Value {
	typeName := call.Argument(0).String()
	if typeName != "move" && typeName != "close" {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.on", WindowID: f.windowID, Capability: "event", Message: "FloatingWindow supports only move and close lifecycle events"}))
	}
	if f.closed {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidState, Operation: "FloatingWindow.on", WindowID: f.windowID, Capability: "lifecycle", Message: "toolbar is closed"}))
	}
	listener, ok := goja.AssertFunction(call.Argument(1))
	if !ok {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.on", WindowID: f.windowID, Capability: "event", Message: "lifecycle listener must be a function"}))
	}
	f.nextLifecycleListener++
	id := f.nextLifecycleListener
	f.lifecycleListeners[id] = floatingLifecycleListener{typeName: typeName, callback: listener}
	return f.ui.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		delete(f.lifecycleListeners, id)
		return goja.Undefined()
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
			Message: "toolbar structure can be changed only before the first show(); use updateButton() for post-show button state",
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
	if f.buttonCount() < toolbar.MinButtons || f.buttonCount() > f.maxButtons() {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.show", WindowID: f.windowID, Capability: "button", Message: fmt.Sprintf("%s floating toolbar requires between 1 and %d buttons", f.orientation, f.maxButtons())}))
	}
	if err := f.validateStructure("FloatingWindow.show"); err != nil {
		panic(customUIJSError(f.ui.runtime, err))
	}
	f.starting = true
	declaration := f.toolbarSpec()
	if _, err := toolbar.Plan(declaration); err != nil {
		f.starting = false
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.show", WindowID: f.windowID, Capability: "structure", Message: err.Error()}))
	}
	spec := customui.WindowSpec{
		ID: f.windowID, Kind: "floating", Title: f.title, Theme: f.theme,
		Bounds: f.bounds, AlwaysOnTop: f.alwaysOnTop, Draggable: f.draggable,
		Placement: f.placement, Toolbar: &declaration,
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
	items := make([]toolbar.ToolbarItemSpec, 0, len(f.items))
	for _, item := range f.items {
		if item.button == nil {
			items = append(items, toolbar.ToolbarItemSpec{Type: item.typeName, ID: item.id})
			continue
		}
		items = append(items, toolbar.ButtonItem(item.button.spec))
	}
	orientation := f.orientation
	if orientation == "" {
		orientation = toolbar.OrientationHorizontal
	}
	columns := 0
	if orientation == toolbar.OrientationHorizontal && f.layout.configured {
		columns, _ = toolbar.ColumnsForButtonCount(f.buttonCount(), f.layout.columns(), f.layout.maxRows)
	}
	if orientation == toolbar.OrientationVertical {
		columns = 1
	}
	return toolbar.ToolbarSpec{
		SchemaVersion: toolbar.SchemaVersion, Revision: f.revision, Orientation: orientation,
		MaxColumns: columns, MaxRows: f.layout.maxRows, MaxWidth: f.layout.maxWidth, Items: items,
	}
}

func (f *floatingWindow) removeButtonItem(id string) bool {
	for index := range f.items {
		if f.items[index].typeName != toolbar.ItemButton || f.items[index].id != id {
			continue
		}
		start, end := index, index+1
		if start > 0 && toolbar.IsStructuralItemType(f.items[start-1].typeName) {
			start--
		}
		if end < len(f.items) && toolbar.IsStructuralItemType(f.items[end].typeName) {
			end++
		}
		items := make([]floatingToolbarItem, 0, len(f.items)-(end-start))
		items = append(items, f.items[:start]...)
		items = append(items, f.items[end:]...)
		f.items = items
		f.nextRevision()
		return true
	}
	return false
}

func (f *floatingWindow) maxButtons() int {
	return toolbar.MaxButtonsForLayout(f.orientation, f.layout.columns(), f.layout.maxRows)
}

func (f *floatingWindow) maxItems() int {
	return toolbar.MaxItemsForOrientation(f.orientation)
}

func (f *floatingWindow) buttonCount() int {
	count := 0
	for _, item := range f.items {
		if item.button != nil {
			count++
		}
	}
	return count
}

func (f *floatingWindow) item(id string) *floatingToolbarItem {
	for index := range f.items {
		if f.items[index].id == id {
			return &f.items[index]
		}
	}
	return nil
}

func (f *floatingWindow) addStructuralItem(call goja.FunctionCall, typeName, operation string) goja.Value {
	f.requireMutable(strings.TrimPrefix(operation, "FloatingWindow."))
	id := f.stringArgument(call, 0, "id", operation)
	if !floatingButtonIDPattern.MatchString(id) {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "item", Message: "toolbar item id must match [A-Za-z][A-Za-z0-9_-]{0,63}"}))
	}
	if f.item(id) != nil {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeDuplicateID, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "item", Message: "toolbar item id already exists"}))
	}
	if len(f.items) >= f.maxItems() {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "item", Message: fmt.Sprintf("%s floating toolbar supports at most %d items", f.orientation, f.maxItems())}))
	}
	if len(f.items) == 0 {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "structure", Message: "separator and spacer must follow a button"}))
	}
	if previous := f.items[len(f.items)-1]; previous.button == nil {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "structure", Message: "toolbar cannot contain consecutive separator or spacer items"}))
	}
	f.items = append(f.items, floatingToolbarItem{typeName: typeName, id: id})
	f.nextRevision()
	return goja.Undefined()
}

func (f *floatingWindow) validateStructure(operation string) error {
	if len(f.items) == 0 {
		return &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, Capability: "structure", Message: "toolbar requires at least one button"}
	}
	if f.items[0].button == nil {
		return &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: f.items[0].id, Capability: "structure", Message: "toolbar cannot start with a separator or spacer"}
	}
	if f.items[len(f.items)-1].button == nil {
		return &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: f.items[len(f.items)-1].id, Capability: "structure", Message: "toolbar cannot end with a separator or spacer"}
	}
	for index := 1; index < len(f.items); index++ {
		if f.items[index-1].button == nil && f.items[index].button == nil {
			return &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: f.items[index].id, Capability: "structure", Message: "toolbar cannot contain consecutive separator or spacer items"}
		}
	}
	return nil
}

type floatingButtonPublicState struct {
	ID                string         `json:"id"`
	Label             string         `json:"label"`
	Icon              any            `json:"icon"`
	Active            bool           `json:"active"`
	Disabled          bool           `json:"disabled"`
	Busy              bool           `json:"busy"`
	Error             string         `json:"error"`
	Revision          uint64         `json:"revision"`
	RenderedText      string         `json:"renderedText"`
	Tooltip           string         `json:"tooltip"`
	TooltipVisible    bool           `json:"tooltipVisible"`
	IconPresentation  any            `json:"iconPresentation"`
	AccessibilityName string         `json:"accessibilityName"`
	LocalBounds       toolbar.Bounds `json:"localBounds"`
	ScreenBounds      toolbar.Bounds `json:"screenBounds"`
}

func publicFloatingButtonState(spec toolbar.ButtonSpec, native toolbar.ButtonResult) floatingButtonPublicState {
	presentation, _ := toolbar.IconPresentationForButton(spec)
	if native.IconPresentation.Kind != "" || native.IconPresentation.SystemSymbol != "" {
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
		ID: spec.ID, Label: spec.Label, Icon: publicFloatingIcon(spec), Active: spec.State.Active,
		Disabled: spec.State.Disabled, Busy: spec.State.Busy, Error: spec.State.Error,
		Revision: spec.State.Revision, RenderedText: native.RenderedText,
		Tooltip: tooltip, TooltipVisible: native.TooltipVisible,
		IconPresentation: publicFloatingIconPresentation(presentation), AccessibilityName: accessibilityName,
		LocalBounds: native.LocalBounds, ScreenBounds: native.ScreenBounds,
	}
}

func publicFloatingIconPresentation(presentation toolbar.IconPresentation) any {
	if presentation.Kind == toolbar.IconKindImage {
		return map[string]any{
			"kind": presentation.Kind, "mediaType": presentation.MediaType,
			"pixelWidth": presentation.PixelWidth, "pixelHeight": presentation.PixelHeight,
			"renderingMode": presentation.RenderingMode,
		}
	}
	return map[string]any{
		"kind": toolbar.IconKindBuiltIn, "systemSymbol": presentation.SystemSymbol,
		"scale": presentation.Scale, "offsetX": presentation.OffsetX, "offsetY": presentation.OffsetY,
	}
}

func publicFloatingIcon(spec toolbar.ButtonSpec) any {
	if spec.IconImage == nil {
		return spec.Icon
	}
	return map[string]any{
		"path": spec.IconImage.Source, "renderingMode": spec.IconImage.RenderingMode,
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
		candidate.Label = label
		if err := validateFloatingButtonSpec(candidate); err != nil {
			return withFloatingOperation(err, "FloatingWindow.updateButton", f.windowID, button.spec.ID)
		}
	}
	if raw, exists := patch["icon"]; exists {
		icon, iconImage, err := f.resolveFloatingButtonIcon(f.ui.runtime.ToValue(raw), "FloatingWindow.updateButton", button.spec.ID)
		if err != nil {
			return err
		}
		candidate.Icon = icon
		candidate.IconImage = iconImage
		if f.customIconBytesExcept(button.spec.ID)+customIconBytes(candidate) > toolbar.MaxToolbarImageBytes {
			return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.updateButton", WindowID: f.windowID, TargetID: button.spec.ID, Capability: "icon", Message: fmt.Sprintf("custom toolbar icon data exceeds the %d-byte window limit", toolbar.MaxToolbarImageBytes)}
		}
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
	if err := validateFloatingButtonSpec(candidate); err != nil {
		return withFloatingOperation(err, "FloatingWindow.updateButton", f.windowID, button.spec.ID)
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

func withFloatingOperationCapability(err error, operation, windowID, targetID, capability string) error {
	wrapped := withFloatingOperation(err, operation, windowID, targetID)
	var uiErr *customui.Error
	if !errors.As(wrapped, &uiErr) || uiErr.Capability != "" {
		return wrapped
	}
	copy := *uiErr
	copy.Capability = capability
	return &copy
}

func (f *floatingWindow) invalidButtonPatch(id, message string) error {
	return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.updateButton", WindowID: f.windowID, TargetID: id, Capability: "state", Message: message}
}

func newFloatingButton(id, label, icon string) (floatingButton, error) {
	button := toolbar.ButtonSpec{ID: id, Label: label, Icon: icon}
	if err := validateFloatingButtonSpec(button); err != nil {
		return floatingButton{}, err
	}
	return floatingButton{spec: button}, nil
}

func validateFloatingButtonSpec(button toolbar.ButtonSpec) error {
	id, label := button.ID, button.Label
	if !floatingButtonIDPattern.MatchString(id) {
		return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", TargetID: id, Capability: "button", Message: "button id must match [A-Za-z][A-Za-z0-9_-]{0,63}"}
	}
	if strings.TrimSpace(label) == "" {
		return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", TargetID: id, Capability: "label", Message: "button label must not be empty"}
	}
	if utf8.RuneCountInString(label) > floatingMaxLabelRunes {
		return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", TargetID: id, Capability: "label", Message: fmt.Sprintf("button label must contain at most %d Unicode characters", floatingMaxLabelRunes)}
	}
	if _, ok := toolbar.IconPresentationForButton(button); !ok {
		message := "unknown built-in toolbar icon " + button.Icon
		if button.IconImage != nil {
			message = "custom toolbar icon payload is invalid"
		}
		return &customui.Error{Code: customui.CodeInvalidSpec, Operation: "FloatingWindow.addButton", TargetID: id, Capability: "icon", Message: message}
	}
	return nil
}

func (f *floatingWindow) newFloatingButtonFromValue(id, label string, value goja.Value, operation string) (floatingButton, error) {
	icon, iconImage, err := f.resolveFloatingButtonIcon(value, operation, id)
	if err != nil {
		return floatingButton{}, err
	}
	button := toolbar.ButtonSpec{ID: id, Label: label, Icon: icon, IconImage: iconImage}
	if f.customIconBytesExcept("")+customIconBytes(button) > toolbar.MaxToolbarImageBytes {
		return floatingButton{}, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "icon", Message: fmt.Sprintf("custom toolbar icon data exceeds the %d-byte window limit", toolbar.MaxToolbarImageBytes)}
	}
	if err := validateFloatingButtonSpec(button); err != nil {
		return floatingButton{}, withFloatingOperation(err, operation, f.windowID, id)
	}
	return floatingButton{spec: button}, nil
}

func customIconBytes(button toolbar.ButtonSpec) int {
	if button.IconImage == nil {
		return 0
	}
	return button.IconImage.ByteLength
}

func (f *floatingWindow) customIconBytesExcept(buttonID string) int {
	total := 0
	for _, item := range f.items {
		if item.button != nil && item.button.spec.ID != buttonID {
			total += customIconBytes(item.button.spec)
		}
	}
	return total
}

func (f *floatingWindow) resolveFloatingButtonIcon(value goja.Value, operation, targetID string) (string, *toolbar.IconImage, error) {
	if value != nil && !goja.IsUndefined(value) && !goja.IsNull(value) {
		if icon, ok := value.Export().(string); ok {
			if _, trusted := toolbar.IconToken(icon); trusted {
				return icon, nil, nil
			}
			return "", nil, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: targetID, Capability: "icon", Message: "unknown built-in toolbar icon " + icon}
		}
	}
	var declaration floatingImageIconDeclaration
	if err := exportCustomUIValue(value, &declaration); err != nil {
		return "", nil, &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: targetID, Capability: "icon", Message: `icon must be a built-in name or {path, renderingMode?}`, Cause: err}
	}
	image, err := customui.LoadToolbarIconImage(f.ui.baseDir, declaration.Path, declaration.RenderingMode)
	if err != nil {
		return "", nil, withFloatingOperationCapability(err, operation, f.windowID, targetID, "icon")
	}
	return "", image, nil
}

func (f *floatingWindow) dispatch(event customui.Event, argument goja.Value) {
	if event.WindowID != f.windowID {
		return
	}
	if event.Type == "move" || event.Type == "close" {
		f.dispatchLifecycle(event, argument)
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

func (f *floatingWindow) dispatchLifecycle(event customui.Event, argument goja.Value) {
	listenerIDs := make([]int, 0, len(f.lifecycleListeners))
	for id := range f.lifecycleListeners {
		listenerIDs = append(listenerIDs, int(id))
	}
	sort.Ints(listenerIDs)
	for _, rawID := range listenerIDs {
		listener, exists := f.lifecycleListeners[uint64(rawID)]
		if !exists || listener.typeName != event.Type {
			continue
		}
		result, err := listener.callback(goja.Undefined(), argument)
		if err != nil {
			f.ui.reportAsyncError(err)
			continue
		}
		f.ui.observeListenerResult(result)
	}
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
	for index := range f.items {
		if f.items[index].typeName == toolbar.ItemButton && f.items[index].id == id {
			return f.items[index].button
		}
	}
	return nil
}

func (f *floatingWindow) buttonNotFound(operation, id string) error {
	return &customui.Error{Code: customui.CodeNotFound, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "button", Message: "button not found"}
}

func (f *floatingWindow) listenerCount() int {
	count := 0
	for _, item := range f.items {
		if item.button != nil && item.button.callback != nil {
			count++
		}
	}
	if f.errorHandler != nil {
		count++
	}
	count += len(f.lifecycleListeners)
	return count
}

func (f *floatingWindow) release() {
	if f.closed {
		return
	}
	f.closed = true
	f.errorHandler = nil
	f.lifecycleListeners = map[uint64]floatingLifecycleListener{}
	for _, item := range f.items {
		if item.button == nil {
			continue
		}
		item.button.callback = nil
		item.button.inFlight = false
		item.button.spec.State.Busy = false
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
