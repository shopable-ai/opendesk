package automation

import (
	"context"
	"fmt"
	"opendesk/pkg/customui"
	"opendesk/pkg/customui/toolbar"
	"strings"
	"unicode/utf8"

	"github.com/dop251/goja"
)

type floatingToggleOptionsDeclaration struct {
	Value    *bool    `json:"value,omitempty"`
	Disabled *bool    `json:"disabled,omitempty"`
	Width    *float64 `json:"width,omitempty"`
}

type floatingInputOptionsDeclaration struct {
	Value       string   `json:"value,omitempty"`
	Placeholder string   `json:"placeholder,omitempty"`
	MaxLength   *float64 `json:"maxLength,omitempty"`
	Disabled    *bool    `json:"disabled,omitempty"`
	Width       *float64 `json:"width,omitempty"`
}

type floatingChoiceOptionsDeclaration struct {
	Options  []toolbar.OptionSpec `json:"options"`
	Value    *string              `json:"value,omitempty"`
	Disabled *bool                `json:"disabled,omitempty"`
	Width    *float64             `json:"width,omitempty"`
}

type floatingSliderOptionsDeclaration struct {
	Min      *float64 `json:"min,omitempty"`
	Max      *float64 `json:"max,omitempty"`
	Value    *float64 `json:"value,omitempty"`
	Step     *float64 `json:"step,omitempty"`
	Disabled *bool    `json:"disabled,omitempty"`
	Width    *float64 `json:"width,omitempty"`
}

type floatingProgressOptionsDeclaration struct {
	Min           *float64 `json:"min,omitempty"`
	Max           *float64 `json:"max,omitempty"`
	Value         *float64 `json:"value,omitempty"`
	Indeterminate *bool    `json:"indeterminate,omitempty"`
	Width         *float64 `json:"width,omitempty"`
}

func (f *floatingWindow) addFloatingToggle(call goja.FunctionCall, kind, operation string) goja.Value {
	var options floatingToggleOptionsDeclaration
	f.exportControlOptions(call.Argument(2), &options, operation, kind)
	control := toolbar.ControlSpec{
		Kind: kind, Label: f.stringArgument(call, 1, "label", operation),
		Width: toolbar.DefaultToggleWidth,
	}
	if options.Value != nil {
		control.Checked = *options.Value
	}
	if options.Disabled != nil {
		control.Disabled = *options.Disabled
	}
	if options.Width != nil {
		control.Width = *options.Width
	}
	return f.addFloatingControl(call, control, operation, 3, true)
}

func (f *floatingWindow) addFloatingInput(call goja.FunctionCall) goja.Value {
	const operation = "FloatingWindow.addInput"
	var options floatingInputOptionsDeclaration
	f.exportControlOptions(call.Argument(2), &options, operation, toolbar.ItemInput)
	maxLength := toolbar.MaxControlTextRunes
	if options.MaxLength != nil {
		if !finiteCustomUINumber(*options.MaxLength) || *options.MaxLength < 1 || *options.MaxLength > toolbar.MaxControlTextRunes || float64(int(*options.MaxLength)) != *options.MaxLength {
			panic(customUIJSError(f.ui.runtime, f.invalidControlSpec(operation, "", toolbar.ItemInput, fmt.Sprintf("maxLength must be an integer between 1 and %d", toolbar.MaxControlTextRunes), nil)))
		}
		maxLength = int(*options.MaxLength)
	}
	control := toolbar.ControlSpec{
		Kind: toolbar.ItemInput, Label: f.stringArgument(call, 1, "label", operation),
		Width: toolbar.DefaultInputWidth, Text: options.Value, Placeholder: options.Placeholder, MaxLength: maxLength,
	}
	if options.Disabled != nil {
		control.Disabled = *options.Disabled
	}
	if options.Width != nil {
		control.Width = *options.Width
	}
	return f.addFloatingControl(call, control, operation, 3, true)
}

func (f *floatingWindow) addFloatingChoice(call goja.FunctionCall, kind, operation string) goja.Value {
	var options floatingChoiceOptionsDeclaration
	f.exportControlOptions(call.Argument(2), &options, operation, kind)
	selected := ""
	if len(options.Options) > 0 {
		selected = options.Options[0].Value
	}
	if options.Value != nil {
		selected = *options.Value
	}
	width := float64(toolbar.DefaultSelectWidth)
	if kind == toolbar.ItemSegmented {
		width = toolbar.DefaultSegmentWidth
	}
	control := toolbar.ControlSpec{
		Kind: kind, Label: f.stringArgument(call, 1, "label", operation), Width: width,
		Selected: selected, Options: append([]toolbar.OptionSpec(nil), options.Options...),
	}
	if options.Disabled != nil {
		control.Disabled = *options.Disabled
	}
	if options.Width != nil {
		control.Width = *options.Width
	}
	return f.addFloatingControl(call, control, operation, 3, true)
}

func (f *floatingWindow) addFloatingSlider(call goja.FunctionCall) goja.Value {
	const operation = "FloatingWindow.addSlider"
	var options floatingSliderOptionsDeclaration
	f.exportControlOptions(call.Argument(2), &options, operation, toolbar.ItemSlider)
	control := toolbar.ControlSpec{Kind: toolbar.ItemSlider, Label: f.stringArgument(call, 1, "label", operation), Width: toolbar.DefaultSliderWidth, Min: 0, Max: 100, Step: 1}
	if options.Min != nil {
		control.Min = *options.Min
	}
	if options.Max != nil {
		control.Max = *options.Max
	}
	if options.Value != nil {
		control.Value = *options.Value
	} else {
		control.Value = control.Min
	}
	if options.Step != nil {
		control.Step = *options.Step
	}
	if options.Disabled != nil {
		control.Disabled = *options.Disabled
	}
	if options.Width != nil {
		control.Width = *options.Width
	}
	return f.addFloatingControl(call, control, operation, 3, true)
}

func (f *floatingWindow) addFloatingProgress(call goja.FunctionCall) goja.Value {
	const operation = "FloatingWindow.addProgress"
	var options floatingProgressOptionsDeclaration
	f.exportControlOptions(call.Argument(2), &options, operation, toolbar.ItemProgress)
	control := toolbar.ControlSpec{Kind: toolbar.ItemProgress, Label: f.stringArgument(call, 1, "label", operation), Width: toolbar.DefaultProgressWidth, Min: 0, Max: 1}
	if options.Min != nil {
		control.Min = *options.Min
	}
	if options.Max != nil {
		control.Max = *options.Max
	}
	if options.Value != nil {
		control.Value = *options.Value
	} else {
		control.Value = control.Min
	}
	if options.Indeterminate != nil {
		control.Indeterminate = *options.Indeterminate
	}
	if options.Width != nil {
		control.Width = *options.Width
	}
	return f.addFloatingControl(call, control, operation, -1, false)
}

func (f *floatingWindow) exportControlOptions(value goja.Value, destination any, operation, capability string) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return
	}
	if err := exportCustomUIValue(value, destination); err != nil {
		panic(customUIJSError(f.ui.runtime, f.invalidControlSpec(operation, "", capability, "control options are invalid", err)))
	}
}

func (f *floatingWindow) addFloatingControl(call goja.FunctionCall, control toolbar.ControlSpec, operation string, callbackIndex int, acceptsCallback bool) goja.Value {
	f.requireMutable(strings.TrimPrefix(operation, "FloatingWindow."))
	control.ID = f.stringArgument(call, 0, "id", operation)
	if !floatingButtonIDPattern.MatchString(control.ID) {
		panic(customUIJSError(f.ui.runtime, f.invalidControlSpec(operation, control.ID, control.Kind, "control id must match [A-Za-z][A-Za-z0-9_-]{0,63}", nil)))
	}
	if f.item(control.ID) != nil {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeDuplicateID, Operation: operation, WindowID: f.windowID, TargetID: control.ID, Capability: "item", Message: "toolbar item id already exists"}))
	}
	if f.contentCount() >= f.maxContentItems() {
		panic(customUIJSError(f.ui.runtime, f.invalidControlSpec(operation, control.ID, control.Kind, fmt.Sprintf("%s floating toolbar supports at most %d content items", f.orientation, f.maxContentItems()), nil)))
	}
	control.Revision = f.revision + 1
	if err := toolbar.ValidateControlSpec(control); err != nil {
		panic(customUIJSError(f.ui.runtime, f.invalidControlSpec(operation, control.ID, control.Kind, err.Error(), err)))
	}
	var callback goja.Callable
	if acceptsCallback && callbackIndex >= 0 {
		callbackValue := call.Argument(callbackIndex)
		if callbackValue != nil && !goja.IsUndefined(callbackValue) && !goja.IsNull(callbackValue) {
			var ok bool
			callback, ok = goja.AssertFunction(callbackValue)
			if !ok {
				panic(customUIJSError(f.ui.runtime, f.invalidControlSpec(operation, control.ID, "callback", "callback must be a function", nil)))
			}
		}
	}
	control.Revision = f.nextRevision()
	f.items = append(f.items, floatingToolbarItem{typeName: control.Kind, id: control.ID, control: &floatingControl{spec: control, callback: callback}})
	return goja.Undefined()
}

func (f *floatingWindow) invalidControlSpec(operation, id, capability, message string, cause error) error {
	return &customui.Error{Code: customui.CodeInvalidSpec, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: capability, Message: message, Cause: cause}
}

func (f *floatingWindow) control(id string) *floatingControl {
	for index := range f.items {
		if f.items[index].id == id && f.items[index].control != nil {
			return f.items[index].control
		}
	}
	return nil
}

func (f *floatingWindow) controlNotFound(operation, id string) error {
	return &customui.Error{Code: customui.CodeNotFound, Operation: operation, WindowID: f.windowID, TargetID: id, Capability: "control", Message: "toolbar control not found"}
}

func (f *floatingWindow) getControlState(call goja.FunctionCall) goja.Value {
	id := f.stringArgument(call, 0, "id", "FloatingWindow.getControlState")
	control := f.control(id)
	if control == nil {
		panic(customUIJSError(f.ui.runtime, f.controlNotFound("FloatingWindow.getControlState", id)))
	}
	if f.window == nil {
		return f.resolved(publicFloatingControlState(control.spec, toolbar.ControlResult{}))
	}
	return f.ui.startAsync("FloatingWindow.getControlState", func(ctx context.Context) (any, error) {
		state, err := f.window.ToolbarControlState(ctx, id)
		return state, customUIOperationError(err, "FloatingWindow.getControlState", f.windowID)
	}, func(value any) goja.Value {
		current := f.control(id)
		if current == nil {
			return goja.Undefined()
		}
		return f.ui.runtime.ToValue(jsonCompatible(publicFloatingControlState(current.spec, value.(toolbar.ControlResult))))
	})
}

func (f *floatingWindow) updateControl(call goja.FunctionCall) goja.Value {
	id := f.stringArgument(call, 0, "id", "FloatingWindow.updateControl")
	control := f.control(id)
	if control == nil {
		panic(customUIJSError(f.ui.runtime, f.controlNotFound("FloatingWindow.updateControl", id)))
	}
	if f.starting {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeBusy, Operation: "FloatingWindow.updateControl", WindowID: f.windowID, TargetID: id, Capability: control.spec.Kind, Message: "toolbar creation is still in progress"}))
	}
	if f.closed {
		panic(customUIJSError(f.ui.runtime, &customui.Error{Code: customui.CodeInvalidState, Operation: "FloatingWindow.updateControl", WindowID: f.windowID, TargetID: id, Capability: control.spec.Kind, Message: "toolbar is closed"}))
	}
	if err := f.applyControlPatch(control, call.Argument(1)); err != nil {
		panic(customUIJSError(f.ui.runtime, err))
	}
	spec := control.spec
	if f.window == nil {
		return f.resolved(publicFloatingControlState(spec, toolbar.ControlResult{}))
	}
	return f.ui.startAsync("FloatingWindow.updateControl", func(ctx context.Context) (any, error) {
		state, err := f.window.ApplyToolbarControl(ctx, spec)
		return state, customUIOperationError(err, "FloatingWindow.updateControl", f.windowID)
	}, func(value any) goja.Value {
		current := f.control(id)
		if current == nil {
			return goja.Undefined()
		}
		return f.ui.runtime.ToValue(jsonCompatible(publicFloatingControlState(current.spec, value.(toolbar.ControlResult))))
	})
}

func (f *floatingWindow) applyControlPatch(control *floatingControl, value goja.Value) error {
	var patch map[string]any
	if err := exportCustomUIValue(value, &patch); err != nil {
		return f.invalidControlSpec("FloatingWindow.updateControl", control.spec.ID, control.spec.Kind, "control patch is invalid", err)
	}
	if len(patch) == 0 {
		return f.invalidControlSpec("FloatingWindow.updateControl", control.spec.ID, control.spec.Kind, "control patch must change at least one property", nil)
	}
	allowed := map[string]bool{}
	switch control.spec.Kind {
	case toolbar.ItemSwitch, toolbar.ItemCheckbox:
		allowed = map[string]bool{"checked": true, "disabled": true}
	case toolbar.ItemInput:
		allowed = map[string]bool{"value": true, "placeholder": true, "disabled": true}
	case toolbar.ItemSelect, toolbar.ItemSegmented:
		allowed = map[string]bool{"value": true, "disabled": true}
	case toolbar.ItemSlider:
		allowed = map[string]bool{"value": true, "disabled": true}
	case toolbar.ItemProgress:
		allowed = map[string]bool{"value": true, "indeterminate": true}
	}
	for key := range patch {
		if !allowed[key] {
			return f.invalidControlSpec("FloatingWindow.updateControl", control.spec.ID, control.spec.Kind, "unknown or immutable control patch field "+key, nil)
		}
	}
	candidate := control.spec
	if raw, exists := patch["disabled"]; exists {
		disabled, ok := raw.(bool)
		if !ok {
			return f.invalidControlSpec("FloatingWindow.updateControl", candidate.ID, candidate.Kind, "disabled must be a boolean", nil)
		}
		candidate.Disabled = disabled
	}
	if raw, exists := patch["checked"]; exists {
		checked, ok := raw.(bool)
		if !ok {
			return f.invalidControlSpec("FloatingWindow.updateControl", candidate.ID, candidate.Kind, "checked must be a boolean", nil)
		}
		candidate.Checked = checked
	}
	if raw, exists := patch["placeholder"]; exists {
		placeholder, ok := raw.(string)
		if !ok {
			return f.invalidControlSpec("FloatingWindow.updateControl", candidate.ID, candidate.Kind, "placeholder must be a string", nil)
		}
		candidate.Placeholder = placeholder
	}
	if raw, exists := patch["value"]; exists {
		switch candidate.Kind {
		case toolbar.ItemInput:
			text, ok := raw.(string)
			if !ok {
				return f.invalidControlSpec("FloatingWindow.updateControl", candidate.ID, candidate.Kind, "value must be a string", nil)
			}
			candidate.Text = text
		case toolbar.ItemSelect, toolbar.ItemSegmented:
			selected, ok := raw.(string)
			if !ok {
				return f.invalidControlSpec("FloatingWindow.updateControl", candidate.ID, candidate.Kind, "value must be a string", nil)
			}
			candidate.Selected = selected
		case toolbar.ItemSlider, toolbar.ItemProgress:
			number, ok := raw.(float64)
			if !ok {
				return f.invalidControlSpec("FloatingWindow.updateControl", candidate.ID, candidate.Kind, "value must be a finite number", nil)
			}
			candidate.Value = number
		}
	}
	if raw, exists := patch["indeterminate"]; exists {
		indeterminate, ok := raw.(bool)
		if !ok {
			return f.invalidControlSpec("FloatingWindow.updateControl", candidate.ID, candidate.Kind, "indeterminate must be a boolean", nil)
		}
		candidate.Indeterminate = indeterminate
	}
	candidate.Revision = f.revision + 1
	if err := toolbar.ValidateControlSpec(candidate); err != nil {
		return f.invalidControlSpec("FloatingWindow.updateControl", candidate.ID, candidate.Kind, err.Error(), err)
	}
	candidate.Revision = f.nextRevision()
	control.spec = candidate
	return nil
}

func publicFloatingControlState(spec toolbar.ControlSpec, native toolbar.ControlResult) map[string]any {
	accessibilityRole, accessibilitySubrole := floatingControlAccessibility(spec.Kind)
	result := map[string]any{
		"id": spec.ID, "type": spec.Kind, "label": spec.Label, "width": spec.Width,
		"disabled": spec.Disabled, "revision": spec.Revision, "focused": native.Focused,
		"accessibilityName": spec.Label, "accessibilityRole": accessibilityRole, "accessibilitySubrole": accessibilitySubrole,
		"localBounds": native.LocalBounds, "screenBounds": native.ScreenBounds,
	}
	if native.AccessibilityName != "" {
		result["accessibilityName"] = native.AccessibilityName
	}
	if native.AccessibilityRole != "" {
		result["accessibilityRole"] = native.AccessibilityRole
	}
	if native.AccessibilitySubrole != "" {
		result["accessibilitySubrole"] = native.AccessibilitySubrole
	}
	switch spec.Kind {
	case toolbar.ItemSwitch, toolbar.ItemCheckbox:
		result["value"], result["renderedValue"], result["accessibilityValue"] = spec.Checked, spec.Checked, spec.Checked
	case toolbar.ItemInput:
		result["value"], result["placeholder"], result["maxLength"] = spec.Text, spec.Placeholder, spec.MaxLength
		result["renderedValue"], result["accessibilityValue"] = spec.Text, spec.Text
	case toolbar.ItemSelect, toolbar.ItemSegmented:
		result["value"], result["options"] = spec.Selected, spec.Options
		result["renderedValue"], result["accessibilityValue"] = spec.Selected, spec.Selected
	case toolbar.ItemSlider:
		result["value"], result["min"], result["max"], result["step"] = spec.Value, spec.Min, spec.Max, spec.Step
		result["renderedValue"], result["accessibilityValue"] = spec.Value, spec.Value
	case toolbar.ItemProgress:
		result["value"], result["min"], result["max"], result["indeterminate"] = spec.Value, spec.Min, spec.Max, spec.Indeterminate
		if spec.Indeterminate {
			result["renderedValue"], result["accessibilityValue"] = nil, "indeterminate"
		} else {
			result["renderedValue"], result["accessibilityValue"] = spec.Value, spec.Value
		}
	}
	if native.ID != "" {
		result["disabled"] = native.Disabled
		result["focused"] = native.Focused
		if native.RenderedValue != nil {
			result["renderedValue"] = native.RenderedValue
		}
		if native.AccessibilityValue != nil {
			result["accessibilityValue"] = native.AccessibilityValue
		}
	}
	return result
}

func floatingControlAccessibility(kind string) (string, string) {
	switch kind {
	case toolbar.ItemSwitch:
		return "AXCheckBox", "AXSwitch"
	case toolbar.ItemCheckbox:
		return "AXCheckBox", ""
	case toolbar.ItemInput:
		return "AXTextField", ""
	case toolbar.ItemSelect:
		return "AXPopUpButton", ""
	case toolbar.ItemSlider:
		return "AXSlider", ""
	case toolbar.ItemSegmented:
		return "AXRadioGroup", ""
	default:
		return "AXProgressIndicator", ""
	}
}

func (f *floatingWindow) applyNativeControlEvent(control *floatingControl, event customui.Event) bool {
	if control == nil || !toolbar.IsInteractiveControlType(control.spec.Kind) {
		return false
	}
	candidate := control.spec
	switch candidate.Kind {
	case toolbar.ItemSwitch, toolbar.ItemCheckbox:
		if event.Checked == nil {
			return false
		}
		candidate.Checked = *event.Checked
	case toolbar.ItemInput:
		value, ok := event.Value.(string)
		if !ok || utf8.RuneCountInString(value) > candidate.MaxLength {
			return false
		}
		candidate.Text = value
	case toolbar.ItemSelect, toolbar.ItemSegmented:
		value, ok := event.Value.(string)
		if !ok {
			return false
		}
		candidate.Selected = value
	case toolbar.ItemSlider:
		value, ok := event.Value.(float64)
		if !ok {
			return false
		}
		candidate.Value = value
	}
	candidate.Revision = f.revision + 1
	if toolbar.ValidateControlSpec(candidate) != nil {
		return false
	}
	candidate.Revision = f.nextRevision()
	control.spec = candidate
	return true
}

func (f *floatingWindow) syncControlState(control *floatingControl) {
	if control == nil {
		return
	}
	if f.window == nil || f.closed || f.ui.closing.Load() {
		return
	}
	spec := control.spec
	if control.syncInFlight {
		pending := spec
		control.pendingSync = &pending
		return
	}
	f.startControlSync(control, spec)
}

func (f *floatingWindow) startControlSync(control *floatingControl, spec toolbar.ControlSpec) {
	if control == nil || f.window == nil || f.closed || f.ui.closing.Load() {
		return
	}
	control.syncInFlight = true
	window := f.window
	f.ui.startBackground(func(ctx context.Context) error {
		_, err := window.ApplyToolbarControl(ctx, spec)
		return customUIOperationError(err, "FloatingWindow.updateControl", f.windowID)
	}, func(err error) {
		current := f.control(spec.ID)
		if current == nil {
			return
		}
		current.syncInFlight = false
		if err != nil {
			f.ui.reportAsyncError(err)
		}
		if current.pendingSync != nil {
			pending := *current.pendingSync
			current.pendingSync = nil
			// The owner may have advanced again while the first native apply was
			// in flight. Keep only the latest immutable snapshot so one control
			// never owns more than one worker plus one bounded pending value.
			f.startControlSync(current, pending)
		}
	})
}
