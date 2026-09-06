package automation

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/dop251/goja"
)

const accessibilityMaximumMenuPath = 32

type accessibilityMenuOptions struct {
	scope       accessibilityScopeSpec
	limits      AccessibilityLimits
	finalAction AccessibilityAction
}

func attachUIMenu(runtimeValue *goja.Runtime, owner *AccessibilityRuntime) error {
	if runtimeValue == nil || owner == nil {
		return fmt.Errorf("Accessibility runtime is required")
	}
	uiValue := runtimeValue.Get("UI")
	ui, ok := uiValue.(*goja.Object)
	if !ok || ui == nil {
		return fmt.Errorf("UI polyfill is not initialized")
	}
	methods := map[string]func(goja.FunctionCall) goja.Value{
		"getMenuItems": owner.getMenuItems,
		"findMenuItem": owner.findMenuItem,
		"tapMenuItem":  owner.tapMenuItem,
	}
	for name, method := range methods {
		if err := ui.Set(name, method); err != nil {
			return fmt.Errorf("register UI.%s: %w", name, err)
		}
	}
	return nil
}

func (a *AccessibilityRuntime) getMenuItems(call goja.FunctionCall) goja.Value {
	const operation = "UI.getMenuItems"
	if len(call.Arguments) != 1 {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "getMenuItems accepts exactly one options object", nil))
	}
	options, err := a.parseMenuOptions(call.Argument(0), operation, false)
	if err != nil {
		return a.rejected(operation, err)
	}
	if !a.enabled {
		return a.rejected(operation, accessibilityError(AccessibilityCapabilityDisabled, "authorization", "native accessibility is disabled for this execution", nil))
	}
	return a.start(operation, options.limits.Timeout, newAccessibilityProgress(true), func(ctx context.Context, backend AccessibilityBackend) (interface{}, error) {
		scope, err := a.resolveScope(ctx, options.scope, false)
		if err != nil {
			return nil, accessibilityMenuFailure(err, 0, 0, false, AccessibilityActionNotStarted)
		}
		data, err := backend.MenuSnapshot(ctx, scope, options.limits)
		if err != nil {
			return nil, accessibilityMenuFailure(err, 0, 0, false, AccessibilityActionNotStarted)
		}
		return data, nil
	}, func(value interface{}, requestID string) (interface{}, error) {
		data, ok := value.(AccessibilityMenuData)
		if !ok {
			return nil, accessibilityMenuFailure(accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned invalid menu observations", nil), 0, 0, false, AccessibilityActionNotStarted)
		}
		return accessibilityMenuProjection(operation, a.backendName(), requestID, data), nil
	}, nil, nil)
}

func (a *AccessibilityRuntime) findMenuItem(call goja.FunctionCall) goja.Value {
	const operation = "UI.findMenuItem"
	if len(call.Arguments) != 2 {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "findMenuItem accepts path and options", nil))
	}
	path, err := parseAccessibilityMenuPath(call.Argument(0))
	if err != nil {
		return a.rejected(operation, err)
	}
	options, err := a.parseMenuOptions(call.Argument(1), operation, false)
	if err != nil {
		return a.rejected(operation, err)
	}
	if len(path) > options.limits.MaxDepth {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "menu path exceeds options.maxDepth", nil))
	}
	if !a.enabled {
		return a.rejected(operation, accessibilityError(AccessibilityCapabilityDisabled, "authorization", "native accessibility is disabled for this execution", nil))
	}
	return a.start(operation, options.limits.Timeout, newAccessibilityProgress(true), func(ctx context.Context, backend AccessibilityBackend) (interface{}, error) {
		scope, err := a.resolveScope(ctx, options.scope, false)
		if err != nil {
			return nil, accessibilityMenuFailure(err, 0, 0, false, AccessibilityActionNotStarted)
		}
		data, err := backend.MenuSnapshot(ctx, scope, options.limits)
		if err != nil {
			return nil, accessibilityMenuFailure(err, 0, 0, false, AccessibilityActionNotStarted)
		}
		allowTopLevelUnmaterialized := len(path) == 1 && !data.Truncated && data.Reason == "unmaterialized"
		if !data.Complete && !allowTopLevelUnmaterialized {
			return nil, accessibilityMenuFailure(accessibilityError(AccessibilitySearchIncomplete, "search", "bounded menu observation is incomplete", nil), 0, 0, false, AccessibilityActionNotStarted)
		}
		node, found, failedLevel, completed, err := findAccessibilityMenuPath(data.Items, path)
		if err != nil {
			return nil, accessibilityMenuFailure(err, failedLevel, completed, false, AccessibilityActionNotStarted)
		}
		if !found {
			return (*AccessibilityNode)(nil), nil
		}
		copy := node
		return &copy, nil
	}, func(value interface{}, _ string) (interface{}, error) {
		if value == nil {
			return goja.Null(), nil
		}
		node, ok := value.(*AccessibilityNode)
		if !ok {
			return nil, accessibilityMenuFailure(accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned an invalid menu item", nil), 0, 0, false, AccessibilityActionNotStarted)
		}
		if node == nil {
			return goja.Null(), nil
		}
		return accessibilityNodeProjection(*node), nil
	}, nil, nil)
}

func (a *AccessibilityRuntime) tapMenuItem(call goja.FunctionCall) goja.Value {
	const operation = "UI.tapMenuItem"
	if len(call.Arguments) != 2 {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "tapMenuItem accepts path and options", nil))
	}
	path, err := parseAccessibilityMenuPath(call.Argument(0))
	if err != nil {
		return a.rejected(operation, err)
	}
	options, err := a.parseMenuOptions(call.Argument(1), operation, true)
	if err != nil {
		return a.rejected(operation, err)
	}
	if len(path) > options.limits.MaxDepth {
		return a.rejected(operation, accessibilityError(AccessibilityInvalidArgument, "arguments", "menu path exceeds options.maxDepth", nil))
	}
	if !a.enabled {
		return a.rejected(operation, accessibilityError(AccessibilityCapabilityDisabled, "authorization", "native accessibility is disabled for this execution", nil))
	}
	progress := newAccessibilityProgress(true)
	return a.start(operation, options.limits.Timeout, progress, func(ctx context.Context, backend AccessibilityBackend) (result interface{}, resultErr error) {
		scope, err := a.resolveScope(ctx, options.scope, true)
		if err != nil {
			return nil, accessibilityMenuFailure(err, 0, 0, false, AccessibilityActionNotStarted)
		}
		handles := make([]uint64, 0, len(path))
		defer func() {
			released := make(map[uint64]bool, len(handles))
			for index := len(handles) - 1; index >= 0; index-- {
				handle := handles[index]
				if handle != 0 && !released[handle] {
					_ = backend.Release(handle)
					released[handle] = true
				}
			}
		}()

		var parent uint64
		expanded := false
		completed := 0
		for level, segment := range path {
			progress.update(func(state *accessibilityProgress) { state.failedLevel = level })
			if err := a.revalidateMenuScope(ctx, options.scope, scope); err != nil {
				return nil, accessibilityMenuFailure(err, level, completed, expanded, AccessibilityActionNotStarted)
			}
			match, err := findMenuChildAfterExpansion(ctx, backend, scope, parent, segment, options.limits, level > 0)
			if err != nil {
				return nil, accessibilityMenuFailure(err, level, completed, expanded, AccessibilityActionNotStarted)
			}
			if match.Handle == 0 {
				return nil, accessibilityMenuFailure(accessibilityError(AccessibilityBackendFailed, "reference", "native backend returned an invalid menu handle", nil), level, completed, expanded, AccessibilityActionNotStarted)
			}
			handles = append(handles, match.Handle)
			completed = level + 1
			progress.update(func(state *accessibilityProgress) {
				state.completedLevels = completed
				state.failedLevel = level
			})
			if level == len(path)-1 {
				if err := a.revalidateMenuScope(ctx, options.scope, scope); err != nil {
					return nil, accessibilityMenuFailure(err, level, completed-1, expanded, AccessibilityActionNotStarted)
				}
				progress.update(func(state *accessibilityProgress) { state.actionState = AccessibilityActionUnknown })
				performed, err := backend.Perform(ctx, match.Handle, options.finalAction)
				if err != nil {
					if state, explicit := accessibilityExplicitActionState(err); explicit {
						progress.update(func(progress *accessibilityProgress) { progress.actionState = state })
					}
					return nil, accessibilityMenuFailure(err, level, completed-1, expanded, AccessibilityActionUnknown)
				}
				if !validAccessibilityCompletionState(performed.State) {
					return nil, accessibilityMenuFailure(accessibilityError(AccessibilityBackendFailed, "action", "native backend omitted the final action state", nil), level, completed-1, expanded, AccessibilityActionUnknown)
				}
				progress.update(func(state *accessibilityProgress) { state.actionState = performed.State })
				return AccessibilityActionData{State: performed.State}, nil
			}

			previouslyExpanded := expanded
			if err := a.revalidateMenuScope(ctx, options.scope, scope); err != nil {
				return nil, accessibilityMenuFailure(err, level, completed, expanded, AccessibilityActionNotStarted)
			}
			expanded = true
			progress.update(func(state *accessibilityProgress) { state.expansionOccurred = true })
			expansion, err := backend.ExpandMenu(ctx, match.Handle)
			if err != nil {
				if state, explicit := accessibilityExplicitActionState(err); explicit && state == AccessibilityActionNotStarted {
					expanded = previouslyExpanded
					progress.update(func(progress *accessibilityProgress) { progress.expansionOccurred = expanded })
				}
				return nil, accessibilityMenuFailure(err, level, completed, expanded, AccessibilityActionNotStarted)
			}
			if !validAccessibilityCompletionState(expansion.State) {
				return nil, accessibilityMenuFailure(accessibilityError(AccessibilityBackendFailed, "menu_expand", "native backend returned an invalid expansion state", nil), level, completed, true, AccessibilityActionNotStarted)
			}
			if expansion.State == AccessibilityActionNotNeeded {
				expanded = previouslyExpanded
				progress.update(func(state *accessibilityProgress) { state.expansionOccurred = expanded })
			}
			parent = match.Handle
		}
		return nil, accessibilityMenuFailure(accessibilityError(AccessibilityBackendFailed, "menu", "menu traversal ended without a final action", nil), len(path)-1, completed, expanded, AccessibilityActionNotStarted)
	}, func(value interface{}, requestID string) (interface{}, error) {
		data, ok := value.(AccessibilityActionData)
		if !ok {
			return nil, accessibilityMenuFailure(accessibilityError(AccessibilityBackendFailed, "projection", "native backend returned an invalid menu action result", nil), len(path)-1, len(path)-1, true, AccessibilityActionUnknown)
		}
		_, completed, expanded, _, _ := progress.snapshot()
		return map[string]interface{}{
			"requestId": requestID, "operation": operation, "backend": a.backendName(),
			"action": options.finalAction.Action, "actionState": string(data.State),
			"completedLevels": completed, "expansionOccurred": expanded,
		}, nil
	}, nil, nil)
}

func (a *AccessibilityRuntime) parseMenuOptions(value goja.Value, operation string, tap bool) (accessibilityMenuOptions, error) {
	object, err := accessibilityPlainObject(value, "options")
	if err != nil {
		return accessibilityMenuOptions{}, err
	}
	allowed := []string{"within", "timeout", "maxDepth", "maxNodes"}
	if tap {
		allowed = append(allowed, "finalAction")
	}
	if err := accessibilityRejectUnknown(object, allowed, "options"); err != nil {
		return accessibilityMenuOptions{}, err
	}
	if !accessibilityHasOwn(object, "within") {
		return accessibilityMenuOptions{}, accessibilityError(AccessibilityInvalidArgument, "scope", "options.within is required", nil)
	}
	scope, err := a.parseWithin(object.Get("within"), operation)
	if err != nil {
		return accessibilityMenuOptions{}, err
	}
	if scope.kind != AccessibilityScopeWindow && scope.kind != AccessibilityScopeMenuBar {
		return accessibilityMenuOptions{}, accessibilityError(AccessibilityInvalidArgument, "scope", "menu within must be a resolved WindowInfo or an app menuBar root", nil)
	}
	limits, err := parseAccessibilityLimits(object, false)
	if err != nil {
		return accessibilityMenuOptions{}, err
	}
	result := accessibilityMenuOptions{scope: scope, limits: limits, finalAction: AccessibilityAction{Action: "invoke"}}
	if accessibilityHasOwn(object, "finalAction") {
		result.finalAction, err = parseAccessibilityAction(object.Get("finalAction"), operation, true)
		if err != nil {
			return accessibilityMenuOptions{}, err
		}
	}
	return result, nil
}

func parseAccessibilityMenuPath(value goja.Value) ([]AccessibilityMenuSegment, error) {
	array, ok := value.(*goja.Object)
	if !ok || array == nil || array.ClassName() != "Array" {
		return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", "menu path must be a non-empty array", nil)
	}
	length := int(array.Get("length").ToInteger())
	if length < 1 || length > accessibilityMaximumMenuPath {
		return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", "menu path must contain 1 to 32 segments", nil)
	}
	segments := make([]AccessibilityMenuSegment, 0, length)
	for index := 0; index < length; index++ {
		value := array.Get(strconv.Itoa(index))
		if name, ok := accessibilityString(value); ok {
			if strings.TrimSpace(name) == "" {
				return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", "menu path strings must be non-empty", nil)
			}
			if len([]rune(name)) > accessibilityMaximumSelectorRunes {
				return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", "menu path segment exceeds the length limit", nil)
			}
			segments = append(segments, AccessibilityMenuSegment{Name: &name})
			continue
		}
		object, err := accessibilityPlainObject(value, "menu path segment")
		if err != nil {
			return nil, err
		}
		if err := accessibilityRejectUnknown(object, []string{"name", "identifier"}, "menu path segment"); err != nil {
			return nil, err
		}
		segment := AccessibilityMenuSegment{}
		if accessibilityHasOwn(object, "name") {
			name, err := accessibilityNonEmptyString(object.Get("name"), "menu path segment.name", accessibilityMaximumSelectorRunes)
			if err != nil {
				return nil, err
			}
			segment.Name = &name
		}
		if accessibilityHasOwn(object, "identifier") {
			identifier, err := accessibilityNonEmptyString(object.Get("identifier"), "menu path segment.identifier", accessibilityMaximumSelectorRunes)
			if err != nil {
				return nil, err
			}
			segment.Identifier = &identifier
		}
		if segment.Name == nil && segment.Identifier == nil {
			return nil, accessibilityError(AccessibilityInvalidArgument, "arguments", "menu path object must contain name or identifier", nil)
		}
		segments = append(segments, segment)
	}
	return segments, nil
}

func findAccessibilityMenuPath(items []AccessibilityNode, path []AccessibilityMenuSegment) (AccessibilityNode, bool, int, int, error) {
	candidates := items
	for level, segment := range path {
		matches := make([]AccessibilityNode, 0, 2)
		for _, candidate := range accessibilitySemanticMenuCandidates(candidates) {
			if accessibilityMenuSegmentMatches(candidate, segment) {
				matches = append(matches, candidate)
			}
		}
		if len(matches) == 0 {
			return AccessibilityNode{}, false, level, level, nil
		}
		if len(matches) > 1 {
			return AccessibilityNode{}, false, level, level, accessibilityError(AccessibilityAmbiguousTarget, "search", "menu path level matched more than one item", nil)
		}
		if level == len(path)-1 {
			return matches[0], true, level, level + 1, nil
		}
		candidates = matches[0].Children
	}
	return AccessibilityNode{}, false, 0, 0, nil
}

func accessibilitySemanticMenuCandidates(items []AccessibilityNode) []AccessibilityNode {
	result := make([]AccessibilityNode, 0, len(items))
	var visit func([]AccessibilityNode)
	visit = func(nodes []AccessibilityNode) {
		for _, node := range nodes {
			switch node.NativeRole {
			case "AXMenuItem", "AXMenuBarItem":
				result = append(result, node)
			case "AXApplication", "AXWindow", "AXMenuBar", "AXMenu", "AXGroup":
				visit(node.Children)
			}
		}
	}
	visit(items)
	return result
}

func accessibilityMenuSegmentMatches(node AccessibilityNode, segment AccessibilityMenuSegment) bool {
	if segment.Name != nil && (node.Name == nil || *node.Name != *segment.Name) {
		return false
	}
	if segment.Identifier != nil && (node.Identifier == nil || *node.Identifier != *segment.Identifier) {
		return false
	}
	return true
}

func findMenuChildAfterExpansion(ctx context.Context, backend AccessibilityBackend, scope AccessibilityScope, parent uint64, segment AccessibilityMenuSegment, limits AccessibilityLimits, mayMaterialize bool) (AccessibilityMenuMatch, error) {
	for {
		match, err := backend.FindMenuChild(ctx, scope, parent, segment, limits)
		if err == nil || !mayMaterialize || !accessibilityIsTargetNotFound(err) {
			return match, err
		}
		timer := time.NewTimer(20 * time.Millisecond)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return AccessibilityMenuMatch{}, ctx.Err()
		case <-timer.C:
		}
	}
}

func accessibilityIsTargetNotFound(err error) bool {
	var typed *AccessibilityError
	return errors.As(err, &typed) && typed.Code == AccessibilityTargetNotFound
}

func (a *AccessibilityRuntime) revalidateMenuScope(ctx context.Context, spec accessibilityScopeSpec, original AccessibilityScope) error {
	current, err := a.resolveScope(ctx, spec, true)
	if err != nil {
		return err
	}
	if current.PID != original.PID || current.Target != original.Target || current.Kind != original.Kind {
		return accessibilityError(AccessibilityStaleTarget, "identity", "menu target identity changed during traversal", nil)
	}
	if (current.Window == nil) != (original.Window == nil) {
		return accessibilityError(AccessibilityStaleTarget, "identity", "menu window identity changed during traversal", nil)
	}
	if current.Window != nil && (current.Window.ID != original.Window.ID || current.Window.PID != original.Window.PID || current.Window.Handle != original.Window.Handle) {
		return accessibilityError(AccessibilityStaleTarget, "identity", "menu window identity changed during traversal", nil)
	}
	return nil
}

func accessibilityMenuFailure(err error, failedLevel, completed int, expanded bool, fallback AccessibilityActionState) error {
	code := AccessibilityBackendFailed
	phase := "backend"
	state := fallback
	message := "native menu operation failed"
	var typed *AccessibilityError
	if errors.As(err, &typed) {
		code = typed.Code
		phase = typed.Phase
		message = typed.Message
		if explicit, ok := accessibilityExplicitActionState(typed); ok {
			state = explicit
		}
	} else if errors.Is(err, context.DeadlineExceeded) {
		code = AccessibilityTimeout
		phase = "deadline"
		message = "menu request timed out"
	} else if errors.Is(err, context.Canceled) {
		code = AccessibilityCanceled
		phase = "canceled"
		message = "menu request was canceled"
	}
	return accessibilityMenuError(code, phase, message, err, failedLevel, completed, expanded, state)
}

func accessibilityMenuProjection(operation, backend, requestID string, data AccessibilityMenuData) map[string]interface{} {
	items := make([]map[string]interface{}, 0, len(data.Items))
	for _, item := range data.Items {
		items = append(items, accessibilityNodeProjection(item))
	}
	return map[string]interface{}{
		"requestId": requestID, "operation": operation, "backend": backend,
		"items": items, "complete": data.Complete, "truncated": data.Truncated,
		"reason": nullableAccessibilityReason(data.Reason),
		"stats":  map[string]interface{}{"nodes": data.Nodes, "maxDepth": data.MaxDepth},
	}
}
