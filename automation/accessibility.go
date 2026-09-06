package automation

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/dop251/goja"
)

const (
	accessibilityMaximumSelectorRunes = 1024
	accessibilityMaximumValueBytes    = 1024 * 1024
)

var accessibilityPropertySet = map[string]bool{
	"role": true, "nativeRole": true, "name": true, "identifier": true,
	"enabled": true, "focused": true, "selected": true, "checked": true,
	"expanded": true, "actions": true, "nativeBounds": true, "bounds": true,
	"value": true,
}

var accessibilityDefaultProperties = []string{
	"role", "nativeRole", "name", "identifier", "enabled", "focused",
	"selected", "checked", "expanded", "actions", "nativeBounds", "bounds",
}

var accessibilityRoles = map[string]bool{
	"application": true, "window": true, "button": true, "checkbox": true,
	"radioButton": true, "textField": true, "staticText": true, "menuBar": true,
	"menu": true, "menuItem": true, "group": true, "list": true,
	"listItem": true, "table": true, "row": true, "cell": true,
	"unknown": true,
}

func registerAccessibility(runtimeValue *goja.Runtime, opts InitJSOptions, app *AppRuntime, windows *WindowManager) (*AccessibilityRuntime, error) {
	if runtimeValue == nil {
		return nil, fmt.Errorf("runtime is required")
	}
	manager := newAccessibilityRuntime(runtimeValue, opts, app, windows)
	object := runtimeValue.NewObject()
	methods := map[string]func(goja.FunctionCall) goja.Value{
		"getCapabilities": manager.getCapabilities,
		"snapshot":        manager.snapshot,
		"find":            manager.find,
		"read":            manager.read,
		"perform":         manager.perform,
		"release":         manager.release,
	}
	for name, method := range methods {
		if err := object.Set(name, method); err != nil {
			return manager, fmt.Errorf("register Accessibility.%s: %w", name, err)
		}
	}
	if err := runtimeValue.Set("Accessibility", object); err != nil {
		return manager, err
	}
	return manager, nil
}

func (a *AccessibilityRuntime) getCapabilities(call goja.FunctionCall) goja.Value {
	if len(call.Arguments) != 0 {
		_, requestID := a.nextRequestIdentity("Accessibility.getCapabilities")
		panic(structuredGoError(a.runtime, normalizeAccessibilityError("Accessibility.getCapabilities", a.backendName(), requestID, accessibilityError(AccessibilityInvalidArgument, "arguments", "getCapabilities does not accept arguments", nil))))
	}
	return a.runtime.ToValue(a.capabilities())
}

func (a *AccessibilityRuntime) snapshot(call goja.FunctionCall) goja.Value {
	const operation = "Accessibility.snapshot"
	if len(call.Arguments) != 1 {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "snapshot accepts exactly one options object", nil))
	}
	options, err := a.parseLocateOptions(call.Argument(0), operation, true, true)
	if err != nil {
		return a.rejected(operation, err)
	}
	if !a.enabled {
		return a.rejected(operation, accessibilityError(AccessibilityCapabilityDisabled, "authorization", "native accessibility is disabled for this execution", nil))
	}
	return a.start(operation, options.limits.Timeout, newAccessibilityProgress(false), func(ctx context.Context, backend AccessibilityBackend) (interface{}, error) {
		scope, err := a.resolveScope(ctx, options.scope, false)
		if err != nil {
			return nil, err
		}
		return backend.Snapshot(ctx, scope, options.limits)
	}, func(value interface{}, requestID string) (interface{}, error) {
		data, ok := value.(AccessibilitySnapshotData)
		if !ok {
			return nil, accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned an invalid snapshot", nil)
		}
		if data.Root == nil {
			return nil, accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned a snapshot without a root", nil)
		}
		return accessibilitySnapshotProjection(operation, a.backendName(), requestID, data), nil
	}, nil, nil)
}

func (a *AccessibilityRuntime) find(call goja.FunctionCall) goja.Value {
	const operation = "Accessibility.find"
	if len(call.Arguments) != 2 {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "find accepts selector and options", nil))
	}
	selector, err := parseAccessibilitySelector(call.Argument(0), operation)
	if err != nil {
		return a.rejected(operation, err)
	}
	options, err := a.parseLocateOptions(call.Argument(1), operation, false, false)
	if err != nil {
		return a.rejected(operation, err)
	}
	if !a.enabled {
		return a.rejected(operation, accessibilityError(AccessibilityCapabilityDisabled, "authorization", "native accessibility is disabled for this execution", nil))
	}
	if err := a.reserveRef(); err != nil {
		return a.rejected(operation, err)
	}
	type completion struct {
		data  AccessibilityFindData
		scope AccessibilityScope
	}
	finish := func(interface{}, error) { a.finishRefReservation() }
	discard := func(backend AccessibilityBackend, value interface{}) {
		if result, ok := value.(completion); ok && result.data.Found && result.data.Handle != 0 {
			_ = backend.Release(result.data.Handle)
		}
	}
	return a.start(operation, options.limits.Timeout, newAccessibilityProgress(false), func(ctx context.Context, backend AccessibilityBackend) (interface{}, error) {
		scope, err := a.resolveScope(ctx, options.scope, false)
		if err != nil {
			return nil, err
		}
		data, err := backend.Find(ctx, scope, selector, options.limits)
		if err != nil {
			return nil, err
		}
		if !data.Complete {
			if data.Found && data.Handle != 0 {
				_ = backend.Release(data.Handle)
			}
			return nil, accessibilityError(AccessibilitySearchIncomplete, "search", "bounded search could not prove a complete result", nil)
		}
		return completion{data: data, scope: scope}, nil
	}, func(value interface{}, _ string) (interface{}, error) {
		result, ok := value.(completion)
		if !ok {
			return nil, accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned an invalid find result", nil)
		}
		return a.materializeRef(result.data, result.scope)
	}, finish, discard)
}

func (a *AccessibilityRuntime) read(call goja.FunctionCall) goja.Value {
	const operation = "Accessibility.read"
	if len(call.Arguments) < 1 || len(call.Arguments) > 2 {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "read accepts ref and optional options", nil))
	}
	ref, err := a.lookupRef(call.Argument(0), operation, false)
	if err != nil {
		return a.rejected(operation, err)
	}
	options, err := parseAccessibilityReadOptions(call.Argument(1), operation)
	if err != nil {
		return a.rejected(operation, err)
	}
	if !a.enabled {
		return a.rejected(operation, accessibilityError(AccessibilityCapabilityDisabled, "authorization", "native accessibility is disabled for this execution", nil))
	}
	spec := accessibilityScopeSpec{kind: AccessibilityScopeElement, ref: ref}
	return a.start(operation, options.timeout, newAccessibilityProgress(false), func(ctx context.Context, backend AccessibilityBackend) (interface{}, error) {
		scope, err := a.resolveScope(ctx, spec, false)
		if err != nil {
			return nil, err
		}
		data, err := backend.Read(ctx, scope.ElementHandle, options.properties)
		if err != nil {
			return nil, err
		}
		return data, nil
	}, func(value interface{}, requestID string) (interface{}, error) {
		data, ok := value.(AccessibilityReadData)
		if !ok {
			return nil, accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned invalid element properties", nil)
		}
		properties, err := validateAccessibilityReadProjection(data.Properties, options.properties)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"requestId": requestID, "operation": operation, "backend": a.backendName(),
			"ref": ref.object, "properties": properties,
		}, nil
	}, nil, nil)
}

func validateAccessibilityReadProjection(properties map[string]interface{}, requested []string) (map[string]interface{}, error) {
	if properties == nil {
		return nil, accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned no element properties", nil)
	}
	allowed := make(map[string]bool, len(requested))
	for _, property := range requested {
		allowed[property] = true
	}
	result := make(map[string]interface{}, len(requested))
	for key, value := range properties {
		if !allowed[key] {
			return nil, accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned an unrequested element property", nil)
		}
		if key == "value" {
			if text, ok := value.(string); ok && len([]byte(text)) > accessibilityMaximumValueBytes {
				return nil, accessibilityError(AccessibilityResourceLimit, "projection", "native accessibility value exceeds the size limit", nil)
			}
		}
		result[key] = value
	}
	for _, property := range requested {
		if _, exists := result[property]; !exists {
			return nil, accessibilityError(AccessibilityBackendFailed, "projection", "native backend omitted a requested element property", nil)
		}
	}
	return result, nil
}

func (a *AccessibilityRuntime) perform(call goja.FunctionCall) goja.Value {
	const operation = "Accessibility.perform"
	if len(call.Arguments) < 2 || len(call.Arguments) > 3 {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "perform accepts ref, action, and optional options", nil))
	}
	ref, err := a.lookupRef(call.Argument(0), operation, false)
	if err != nil {
		return a.rejected(operation, err)
	}
	action, err := parseAccessibilityAction(call.Argument(1), operation, false)
	if err != nil {
		return a.rejected(operation, err)
	}
	timeout, err := parseAccessibilityTimeoutOnly(call.Argument(2), operation)
	if err != nil {
		return a.rejected(operation, err)
	}
	if !a.enabled {
		return a.rejected(operation, accessibilityError(AccessibilityCapabilityDisabled, "authorization", "native accessibility is disabled for this execution", nil))
	}
	progress := newAccessibilityProgress(false)
	spec := accessibilityScopeSpec{kind: AccessibilityScopeElement, ref: ref}
	return a.start(operation, timeout, progress, func(ctx context.Context, backend AccessibilityBackend) (interface{}, error) {
		scope, err := a.resolveScope(ctx, spec, false)
		if err != nil {
			return nil, err
		}
		progress.update(func(p *accessibilityProgress) { p.actionState = AccessibilityActionUnknown })
		data, err := backend.Perform(ctx, scope.ElementHandle, action)
		if err != nil {
			if state, explicit := accessibilityExplicitActionState(err); explicit {
				progress.update(func(p *accessibilityProgress) { p.actionState = state })
			}
			return nil, err
		}
		if !validAccessibilityCompletionState(data.State) {
			return nil, accessibilityError(AccessibilityBackendFailed, "action", "native backend returned an invalid action state", nil)
		}
		progress.update(func(p *accessibilityProgress) { p.actionState = data.State })
		return data, nil
	}, func(value interface{}, requestID string) (interface{}, error) {
		data, ok := value.(AccessibilityActionData)
		if !ok {
			return nil, accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned an invalid action result", nil)
		}
		return map[string]interface{}{
			"requestId": requestID, "operation": operation, "action": action.Action,
			"backend": a.backendName(), "actionState": string(data.State),
		}, nil
	}, nil, nil)
}

func validAccessibilityCompletionState(state AccessibilityActionState) bool {
	switch state {
	case AccessibilityActionNotNeeded, AccessibilityActionAcknowledged, AccessibilityActionUnknown:
		return true
	default:
		return false
	}
}

func (a *AccessibilityRuntime) release(call goja.FunctionCall) goja.Value {
	const operation = "Accessibility.release"
	if len(call.Arguments) != 1 {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "release accepts exactly one managed ref", nil))
	}
	ref, err := a.lookupRef(call.Argument(0), operation, true)
	if err != nil {
		return a.rejected(operation, err)
	}
	a.mu.Lock()
	if ref.state == accessibilityRefReleased {
		a.mu.Unlock()
		return a.resolved(false)
	}
	if ref.state == accessibilityRefReleasing {
		a.mu.Unlock()
		return a.rejected(operation, accessibilityError(AccessibilityStaleTarget, "reference", "accessibility element reference release is already in progress", nil))
	}
	ref.state = accessibilityRefReleasing
	a.mu.Unlock()
	if !a.enabled {
		a.mu.Lock()
		ref.state = accessibilityRefActive
		a.mu.Unlock()
		return a.rejected(operation, accessibilityError(AccessibilityCapabilityDisabled, "authorization", "native accessibility is disabled for this execution", nil))
	}
	finish := func(value interface{}, releaseErr error) {
		a.mu.Lock()
		defer a.mu.Unlock()
		released, _ := value.(bool)
		if a.closing.Load() || released {
			ref.state = accessibilityRefReleased
		} else if releaseErr != nil {
			ref.state = accessibilityRefActive
		} else {
			ref.state = accessibilityRefReleased
		}
	}
	return a.start(operation, accessibilityDefaultTimeout, newAccessibilityProgress(false), func(ctx context.Context, backend AccessibilityBackend) (interface{}, error) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if err := backend.Release(ref.handle); err != nil {
			return nil, err
		}
		return true, nil
	}, func(value interface{}, _ string) (interface{}, error) {
		released, ok := value.(bool)
		if !ok || !released {
			return nil, accessibilityError(AccessibilityBackendFailed, "reference", "native backend did not confirm reference release", nil)
		}
		return true, nil
	}, finish, nil)
}

type accessibilityLocateOptions struct {
	scope  accessibilityScopeSpec
	limits AccessibilityLimits
}

func (a *AccessibilityRuntime) parseLocateOptions(value goja.Value, operation string, propertiesAllowed, requireOptions bool) (accessibilityLocateOptions, error) {
	if (value == nil || goja.IsUndefined(value)) && requireOptions {
		return accessibilityLocateOptions{}, accessibilityError(AccessibilityInvalidArgument, "arguments", "options.within is required", nil)
	}
	object, err := accessibilityPlainObject(value, "options")
	if err != nil {
		return accessibilityLocateOptions{}, err
	}
	allowed := []string{"within", "timeout", "maxDepth", "maxNodes"}
	if propertiesAllowed {
		allowed = append(allowed, "properties")
	}
	if err := accessibilityRejectUnknown(object, allowed, "options"); err != nil {
		return accessibilityLocateOptions{}, err
	}
	if !accessibilityHasOwn(object, "within") {
		return accessibilityLocateOptions{}, accessibilityError(AccessibilityInvalidArgument, "scope", "options.within is required", nil)
	}
	scope, err := a.parseWithin(object.Get("within"), operation)
	if err != nil {
		return accessibilityLocateOptions{}, err
	}
	limits, err := parseAccessibilityLimits(object, propertiesAllowed)
	if err != nil {
		return accessibilityLocateOptions{}, err
	}
	return accessibilityLocateOptions{scope: scope, limits: limits}, nil
}

func parseAccessibilityLimits(object *goja.Object, propertiesAllowed bool) (AccessibilityLimits, error) {
	limits := AccessibilityLimits{Timeout: accessibilityDefaultTimeout, MaxDepth: accessibilityDefaultMaxDepth, MaxNodes: accessibilityDefaultMaxNodes, Properties: append([]string(nil), accessibilityDefaultProperties...)}
	var err error
	if accessibilityHasOwn(object, "timeout") {
		limits.Timeout, err = accessibilityDuration(object.Get("timeout"), "options.timeout")
		if err != nil {
			return limits, err
		}
	}
	if accessibilityHasOwn(object, "maxDepth") {
		limits.MaxDepth, err = accessibilityBoundedInteger(object.Get("maxDepth"), "options.maxDepth", 1, accessibilityMaximumMaxDepth)
		if err != nil {
			return limits, err
		}
	}
	if accessibilityHasOwn(object, "maxNodes") {
		limits.MaxNodes, err = accessibilityBoundedInteger(object.Get("maxNodes"), "options.maxNodes", 1, accessibilityMaximumMaxNodes)
		if err != nil {
			return limits, err
		}
	}
	if accessibilityHasOwn(object, "properties") {
		if !propertiesAllowed {
			return limits, accessibilityError(AccessibilityInvalidArgument, "arguments", "options.properties is not supported by this method", nil)
		}
		limits.Properties, err = parseAccessibilityProperties(object.Get("properties"), "options.properties")
		if err != nil {
			return limits, err
		}
	}
	return limits, nil
}

func parseAccessibilityReadOptions(value goja.Value, operation string) (struct {
	timeout    time.Duration
	properties []string
}, error) {
	result := struct {
		timeout    time.Duration
		properties []string
	}{timeout: accessibilityDefaultTimeout, properties: append([]string(nil), accessibilityDefaultProperties...)}
	if value == nil || goja.IsUndefined(value) {
		return result, nil
	}
	object, err := accessibilityPlainObject(value, "options")
	if err != nil {
		return result, err
	}
	if err := accessibilityRejectUnknown(object, []string{"timeout", "properties"}, "options"); err != nil {
		return result, err
	}
	if accessibilityHasOwn(object, "timeout") {
		result.timeout, err = accessibilityDuration(object.Get("timeout"), "options.timeout")
		if err != nil {
			return result, err
		}
	}
	if accessibilityHasOwn(object, "properties") {
		result.properties, err = parseAccessibilityProperties(object.Get("properties"), "options.properties")
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

func parseAccessibilityTimeoutOnly(value goja.Value, operation string) (time.Duration, error) {
	if value == nil || goja.IsUndefined(value) {
		return accessibilityDefaultTimeout, nil
	}
	object, err := accessibilityPlainObject(value, "options")
	if err != nil {
		return 0, err
	}
	if err := accessibilityRejectUnknown(object, []string{"timeout"}, "options"); err != nil {
		return 0, err
	}
	if !accessibilityHasOwn(object, "timeout") {
		return accessibilityDefaultTimeout, nil
	}
	return accessibilityDuration(object.Get("timeout"), "options.timeout")
}

func parseAccessibilitySelector(value goja.Value, operation string) (AccessibilitySelector, error) {
	object, err := accessibilityPlainObject(value, "selector")
	if err != nil {
		return AccessibilitySelector{}, err
	}
	if err := accessibilityRejectUnknown(object, []string{"role", "name", "identifier"}, "selector"); err != nil {
		return AccessibilitySelector{}, err
	}
	selector := AccessibilitySelector{}
	fields := 0
	if accessibilityHasOwn(object, "role") {
		role, err := accessibilityNonEmptyString(object.Get("role"), "selector.role", accessibilityMaximumSelectorRunes)
		if err != nil {
			return selector, err
		}
		if !accessibilityRoles[role] {
			return selector, accessibilityError(AccessibilityInvalidArgument, "selector", "selector.role is not a normalized Accessibility role", nil)
		}
		selector.Role = role
		fields++
	}
	if accessibilityHasOwn(object, "name") {
		name, err := accessibilityNonEmptyString(object.Get("name"), "selector.name", accessibilityMaximumSelectorRunes)
		if err != nil {
			return selector, err
		}
		selector.Name = &name
		fields++
	}
	if accessibilityHasOwn(object, "identifier") {
		identifier, err := accessibilityNonEmptyString(object.Get("identifier"), "selector.identifier", accessibilityMaximumSelectorRunes)
		if err != nil {
			return selector, err
		}
		selector.Identifier = &identifier
		fields++
	}
	if fields == 0 {
		return selector, accessibilityError(AccessibilityInvalidArgument, "selector", "selector must contain at least one of role, name, or identifier", nil)
	}
	_ = operation
	return selector, nil
}

func parseAccessibilityAction(value goja.Value, operation string, menuFinal bool) (AccessibilityAction, error) {
	object, err := accessibilityPlainObject(value, "action")
	if err != nil {
		return AccessibilityAction{}, err
	}
	if !accessibilityHasOwn(object, "action") {
		return AccessibilityAction{}, accessibilityError(AccessibilityInvalidArgument, "action", "action.action is required", nil)
	}
	name, err := accessibilityNonEmptyString(object.Get("action"), "action.action", 64)
	if err != nil {
		return AccessibilityAction{}, err
	}
	action := AccessibilityAction{Action: name}
	allowed := []string{"action"}
	switch name {
	case "invoke", "expand", "collapse", "select":
		if menuFinal && name != "invoke" && name != "select" {
			return action, accessibilityError(AccessibilityInvalidArgument, "action", "menu finalAction supports only invoke, select, or setChecked", nil)
		}
	case "setValue":
		if menuFinal {
			return action, accessibilityError(AccessibilityInvalidArgument, "action", "menu finalAction does not support setValue", nil)
		}
		allowed = append(allowed, "value")
		if !accessibilityHasOwn(object, "value") {
			return action, accessibilityError(AccessibilityInvalidArgument, "action", "setValue requires action.value", nil)
		}
		text, ok := accessibilityString(object.Get("value"))
		if !ok {
			return action, accessibilityError(AccessibilityInvalidArgument, "action", "action.value must be a string", nil)
		}
		if len([]byte(text)) > accessibilityMaximumValueBytes {
			return action, accessibilityError(AccessibilityInvalidArgument, "action", "action.value exceeds the size limit", nil)
		}
		action.Value = text
	case "setChecked":
		allowed = append(allowed, "checked")
		if !accessibilityHasOwn(object, "checked") {
			return action, accessibilityError(AccessibilityInvalidArgument, "action", "setChecked requires action.checked", nil)
		}
		checked, ok := object.Get("checked").Export().(bool)
		if !ok {
			return action, accessibilityError(AccessibilityInvalidArgument, "action", "action.checked must be a boolean", nil)
		}
		action.Checked = checked
	default:
		return action, accessibilityError(AccessibilityInvalidArgument, "action", "action.action is not supported", nil)
	}
	if err := accessibilityRejectUnknown(object, allowed, "action"); err != nil {
		return action, err
	}
	_ = operation
	return action, nil
}

func parseAccessibilityProperties(value goja.Value, name string) ([]string, error) {
	array, ok := value.(*goja.Object)
	if !ok || array.ClassName() != "Array" {
		return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", name+" must be a non-empty string array", nil)
	}
	length := int(array.Get("length").ToInteger())
	if length <= 0 || length > len(accessibilityPropertySet) {
		return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", name+" must contain 1 to 13 properties", nil)
	}
	result := make([]string, 0, length)
	seen := map[string]bool{}
	for index := 0; index < length; index++ {
		property, ok := accessibilityString(array.Get(strconv.Itoa(index)))
		if !ok || !accessibilityPropertySet[property] || seen[property] {
			return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", name+" contains an invalid or duplicate property", nil)
		}
		seen[property] = true
		result = append(result, property)
	}
	return result, nil
}

func (a *AccessibilityRuntime) parseWithin(value goja.Value, operation string) (accessibilityScopeSpec, error) {
	if object, ok := value.(*goja.Object); ok {
		a.mu.Lock()
		ref := a.refs[object]
		a.mu.Unlock()
		if ref != nil {
			if ref.state != accessibilityRefActive {
				return accessibilityScopeSpec{}, accessibilityError(AccessibilityStaleTarget, "reference", "within AccessibilityElementRef is not active", nil)
			}
			return accessibilityScopeSpec{kind: AccessibilityScopeElement, ref: ref}, nil
		}
		if accessibilityHasOwn(object, "kind") && object.Get("kind").String() == "AccessibilityElementRef" {
			return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "reference", "within ref is forged or belongs to another execution", nil)
		}
		if accessibilityHasOwn(object, "app") || accessibilityHasOwn(object, "root") {
			if err := accessibilityRejectUnknown(object, []string{"app", "root"}, "within"); err != nil {
				return accessibilityScopeSpec{}, err
			}
			if !accessibilityHasOwn(object, "app") || !accessibilityHasOwn(object, "root") {
				return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "app scope requires both app and root", nil)
			}
			target, err := parseAppTarget(object.Get("app"), operation, false)
			if err != nil {
				return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within.app is not a valid App target", err)
			}
			root, err := accessibilityNonEmptyString(object.Get("root"), "within.root", 32)
			if err != nil {
				return accessibilityScopeSpec{}, err
			}
			kind := AccessibilityScopeApplication
			if root == "menuBar" {
				kind = AccessibilityScopeMenuBar
			} else if root != "application" {
				return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within.root must be application or menuBar", nil)
			}
			return accessibilityScopeSpec{kind: kind, appTarget: target}, nil
		}
		return parseAccessibilityWindowScope(object)
	}
	return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within must be a WindowInfo, managed ref, or app root", nil)
}

func parseAccessibilityWindowScope(object *goja.Object) (accessibilityScopeSpec, error) {
	allowed := []string{"id", "title", "pid", "processId", "processID", "x", "y", "width", "height", "exeName", "exePath", "isForeground", "hasFocus", "handle", "isPopup", "index"}
	if err := accessibilityRejectUnknown(object, allowed, "within"); err != nil {
		return accessibilityScopeSpec{}, err
	}
	for _, required := range []string{"id", "title", "pid", "x", "y", "width", "height", "exeName", "exePath", "isForeground", "hasFocus", "handle", "isPopup", "index"} {
		if !accessibilityHasOwn(object, required) {
			return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within is not a complete OpenDeskWindowInfo", nil)
		}
	}
	id, ok := accessibilityString(object.Get("id"))
	if !ok || id == "" || strings.HasSuffix(id, ":unresolved") {
		return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within window must have a resolved id", nil)
	}
	pid, err := accessibilityBoundedInteger64(object.Get("pid"), "within.pid", 1, math.MaxInt32)
	if err != nil {
		return accessibilityScopeSpec{}, err
	}
	handle, err := accessibilityBoundedInteger64(object.Get("handle"), "within.handle", 1, 1<<53-1)
	if err != nil {
		return accessibilityScopeSpec{}, err
	}
	if id != makeWindowID(uint32(pid), uint64(handle)) {
		return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within window id does not match pid and native handle", nil)
	}
	for _, alias := range []string{"processId", "processID"} {
		if accessibilityHasOwn(object, alias) {
			value, err := accessibilityBoundedInteger64(object.Get(alias), "within."+alias, 1, math.MaxInt32)
			if err != nil || value != pid {
				return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within window PID aliases must agree", err)
			}
		}
	}
	for _, name := range []string{"title", "exeName", "exePath"} {
		if _, ok := accessibilityString(object.Get(name)); !ok {
			return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within."+name+" must be a string", nil)
		}
	}
	for _, name := range []string{"x", "y", "width", "height", "index"} {
		minimum := int64(math.MinInt32)
		if name == "width" || name == "height" {
			minimum = 1
		}
		if name == "index" {
			minimum = 0
		}
		if _, err := accessibilityBoundedInteger64(object.Get(name), "within."+name, minimum, math.MaxInt32); err != nil {
			return accessibilityScopeSpec{}, err
		}
	}
	for _, name := range []string{"isForeground", "hasFocus", "isPopup"} {
		if _, ok := object.Get(name).Export().(bool); !ok {
			return accessibilityScopeSpec{}, accessibilityError(AccessibilityInvalidArgument, "scope", "within."+name+" must be a boolean", nil)
		}
	}
	return accessibilityScopeSpec{kind: AccessibilityScopeWindow, window: &AccessibilityWindowIdentity{ID: id, PID: pid, Handle: uint64(handle)}}, nil
}

func accessibilityPlainObject(value goja.Value, name string) (*goja.Object, error) {
	object, ok := value.(*goja.Object)
	if !ok || object == nil || object.ClassName() != "Object" {
		return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", name+" must be an object", nil)
	}
	return object, nil
}

func accessibilityRejectUnknown(object *goja.Object, allowed []string, name string) error {
	set := make(map[string]bool, len(allowed))
	for _, key := range allowed {
		set[key] = true
	}
	for _, key := range object.Keys() {
		if !set[key] {
			return accessibilityError(AccessibilityInvalidArgument, "arguments", name+" contains unknown field: "+key, nil)
		}
	}
	return nil
}

func accessibilityHasOwn(object *goja.Object, key string) bool {
	for _, candidate := range object.Keys() {
		if candidate == key {
			return true
		}
	}
	return false
}

func accessibilityString(value goja.Value) (string, bool) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return "", false
	}
	text, ok := value.Export().(string)
	return text, ok
}

func accessibilityNonEmptyString(value goja.Value, name string, maxRunes int) (string, error) {
	text, ok := accessibilityString(value)
	if !ok || strings.TrimSpace(text) == "" {
		return "", accessibilityError(AccessibilityInvalidArgument, "arguments", name+" must be a non-empty string", nil)
	}
	if utf8.RuneCountInString(text) > maxRunes {
		return "", accessibilityError(AccessibilityInvalidArgument, "arguments", name+" exceeds the length limit", nil)
	}
	return text, nil
}

func accessibilityBoundedInteger(value goja.Value, name string, minimum, maximum int) (int, error) {
	result, err := accessibilityBoundedInteger64(value, name, int64(minimum), int64(maximum))
	return int(result), err
}

func accessibilityBoundedInteger64(value goja.Value, name string, minimum, maximum int64) (int64, error) {
	var number float64
	switch typed := value.Export().(type) {
	case int:
		number = float64(typed)
	case int32:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case uint32:
		number = float64(typed)
	case uint64:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, accessibilityError(AccessibilityInvalidArgument, "arguments", name+" must be an integer", nil)
	}
	if math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number || number < float64(minimum) || number > float64(maximum) {
		return 0, accessibilityError(AccessibilityInvalidArgument, "arguments", name+" is outside the supported range", nil)
	}
	return int64(number), nil
}

func accessibilityDuration(value goja.Value, name string) (time.Duration, error) {
	milliseconds, err := accessibilityBoundedInteger64(value, name, 1, accessibilityMaximumTimeout.Milliseconds())
	if err != nil {
		return 0, err
	}
	return time.Duration(milliseconds) * time.Millisecond, nil
}

func accessibilityNodeProjection(node AccessibilityNode) map[string]interface{} {
	result := map[string]interface{}{
		"role": node.Role, "nativeRole": node.NativeRole,
		"name": nullableAccessibilityString(node.Name), "identifier": nullableAccessibilityString(node.Identifier),
		"enabled": nullableAccessibilityBool(node.Enabled), "focused": nullableAccessibilityBool(node.Focused),
		"selected": nullableAccessibilityBool(node.Selected), "checked": nullableAccessibilityBool(node.Checked),
		"expanded": nullableAccessibilityBool(node.Expanded), "actions": append([]string(nil), node.Actions...),
		"nativeBounds": accessibilityNativeBoundsProjection(node.NativeBounds),
		"bounds":       accessibilityScreenBoundsProjection(node.Bounds),
	}
	if node.ValueIncluded {
		result["value"] = node.Value
	}
	children := make([]map[string]interface{}, 0, len(node.Children))
	for _, child := range node.Children {
		children = append(children, accessibilityNodeProjection(child))
	}
	result["children"] = children
	return result
}

func accessibilitySnapshotProjection(operation, backend, requestID string, data AccessibilitySnapshotData) map[string]interface{} {
	var root interface{}
	if data.Root != nil {
		root = accessibilityNodeProjection(*data.Root)
	}
	return map[string]interface{}{
		"requestId": requestID, "operation": operation, "backend": backend,
		"root": root, "complete": data.Complete, "truncated": data.Truncated,
		"reason": nullableAccessibilityReason(data.Reason),
		"stats":  map[string]interface{}{"nodes": data.Nodes, "maxDepth": data.MaxDepth},
	}
}

func nullableAccessibilityString(value *string) interface{} {
	if value == nil {
		return nil
	}
	return *value
}

func nullableAccessibilityBool(value *bool) interface{} {
	if value == nil {
		return nil
	}
	return *value
}

func nullableAccessibilityReason(value string) interface{} {
	if value == "" {
		return nil
	}
	return value
}

func accessibilityNativeBoundsProjection(value *AccessibilityNativeBounds) interface{} {
	if value == nil {
		return nil
	}
	return map[string]interface{}{"x": value.X, "y": value.Y, "width": value.Width, "height": value.Height, "coordinateSpace": value.CoordinateSpace}
}

func accessibilityScreenBoundsProjection(value *AccessibilityScreenBounds) interface{} {
	if value == nil {
		return nil
	}
	return map[string]interface{}{"x": value.X, "y": value.Y, "width": value.Width, "height": value.Height, "coordinateSpace": value.CoordinateSpace}
}

func normalizeAccessibilityRole(native string) string {
	switch strings.ToLower(strings.TrimSpace(native)) {
	case "axapplication", "application":
		return "application"
	case "axwindow", "window":
		return "window"
	case "axbutton", "button":
		return "button"
	case "axcheckbox", "checkbox", "check box":
		return "checkbox"
	case "axradiobutton", "radiobutton", "radio button":
		return "radioButton"
	case "axtextfield", "edit":
		return "textField"
	case "axstatictext", "text":
		return "staticText"
	case "axmenubar", "menubar", "menu bar":
		return "menuBar"
	case "axmenu", "menu":
		return "menu"
	case "axmenuitem", "axmenubaritem", "menuitem", "menu item":
		return "menuItem"
	case "axgroup", "group":
		return "group"
	case "axlist", "list":
		return "list"
	case "listitem", "list item":
		return "listItem"
	case "axtable", "table", "datagrid":
		return "table"
	case "axrow", "row", "dataitem":
		return "row"
	case "axcell", "cell":
		return "cell"
	default:
		return "unknown"
	}
}

func accessibilitySelectorMatches(node AccessibilityNode, selector AccessibilitySelector) bool {
	if selector.Role != "" && node.Role != selector.Role {
		return false
	}
	if selector.Name != nil && (node.Name == nil || *node.Name != *selector.Name) {
		return false
	}
	if selector.Identifier != nil && (node.Identifier == nil || *node.Identifier != *selector.Identifier) {
		return false
	}
	return true
}
