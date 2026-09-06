//go:build windows

package automation

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync/atomic"
	"time"
)

const (
	windowsAccessibilityBackendName = "windows-uia"
	windowsFiletimeUnixEpoch        = uint64(116444736000000000)
)

type windowsAccessibilityHandle struct {
	element            *uiaElement
	pid                uint32
	processStart       uint64
	runtimeID          []int32
	rootWindow         uintptr
	containerWindow    uintptr
	menuElement        bool
	menuLimits         AccessibilityLimits
	popupBaseline      map[uintptr][]int32
	expansionSubmitted bool
}

type windowsAccessibilityBackend struct {
	client        *uiaAutomation
	walker        *uiaTreeWalker
	coInitialized bool
	closed        bool
	nextHandle    uint64
	handles       map[uint64]*windowsAccessibilityHandle
	activeContext context.Context
	resources     atomic.Int64
}

func newDefaultAccessibilityBackend() AccessibilityBackend {
	return &windowsAccessibilityBackend{handles: make(map[uint64]*windowsAccessibilityHandle)}
}

func (b *windowsAccessibilityBackend) Name() string { return windowsAccessibilityBackendName }

func (b *windowsAccessibilityBackend) Capabilities() AccessibilityBackendCapabilities {
	return AccessibilityBackendCapabilities{
		Platform:    "windows",
		Backend:     windowsAccessibilityBackendName,
		Implemented: true,
		Status:      "experimental",
		Menus:       true,
		Actions: map[string]bool{
			"invoke": true, "setValue": true, "expand": true,
			"collapse": true, "select": true, "setChecked": true,
		},
		Permission: AccessibilityPermissionStatus{
			Required: false, State: "notRequired", Granted: true, Cached: false,
		},
		CoordinateMapping: false,
		Notes:             "Windows 8+ UI Automation is experimental; nativeBounds use physical screen coordinates, logical bounds are unavailable, and in-flight provider calls cannot be hard-canceled",
	}
}

func (b *windowsAccessibilityBackend) Initialize(ctx context.Context) error {
	restore := b.useContext(ctx)
	defer restore()
	if err := windowsAccessibilityContextError(ctx, "initialize", AccessibilityActionNotStarted); err != nil {
		return err
	}
	if b.client != nil && b.walker != nil && !b.closed {
		return nil
	}
	if b.closed {
		return accessibilityError(AccessibilityStaleTarget, "initialize", "accessibility backend is closed", nil)
	}
	if err := uiaCoInitializeMTA(); err != nil {
		return windowsAccessibilityNativeError("initialize", err, AccessibilityActionNotStarted)
	}
	b.coInitialized = true
	b.resources.Add(1)
	client, err := uiaCreateClient()
	if err != nil {
		uiaCoUninitialize()
		b.coInitialized = false
		b.resources.Add(-1)
		return windowsAccessibilityNativeError("initialize", err, AccessibilityActionNotStarted)
	}
	b.client = client
	b.resources.Add(1)
	if err := b.beforeNative("initialize", AccessibilityActionNotStarted); err != nil {
		client.release()
		b.client = nil
		b.resources.Add(-1)
		uiaCoUninitialize()
		b.coInitialized = false
		b.resources.Add(-1)
		return windowsAccessibilityNativeError("initialize", err, AccessibilityActionNotStarted)
	}
	walker, err := client.rawViewWalker()
	if err != nil {
		client.release()
		b.client = nil
		b.resources.Add(-1)
		uiaCoUninitialize()
		b.coInitialized = false
		b.resources.Add(-1)
		return windowsAccessibilityNativeError("initialize", err, AccessibilityActionNotStarted)
	}
	b.walker = walker
	b.resources.Add(1)
	if b.handles == nil {
		b.handles = make(map[uint64]*windowsAccessibilityHandle)
	}
	return nil
}

func (b *windowsAccessibilityBackend) useContext(ctx context.Context) func() {
	previous := b.activeContext
	b.activeContext = ctx
	return func() { b.activeContext = previous }
}

func (b *windowsAccessibilityBackend) beforeNative(phase string, state AccessibilityActionState) error {
	ctx := b.activeContext
	if ctx == nil {
		ctx = context.Background()
	}
	if err := windowsAccessibilityContextError(ctx, phase, state); err != nil {
		return err
	}
	if b.client == nil {
		return nil
	}
	timeout := accessibilityMaximumTimeout
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return windowsAccessibilityContextError(ctx, phase, state)
		}
		timeout = remaining
		if timeout > accessibilityMaximumTimeout {
			timeout = accessibilityMaximumTimeout
		}
	}
	timeoutMS := (timeout + time.Millisecond - 1) / time.Millisecond
	if timeoutMS < 1 {
		timeoutMS = 1
	}
	if err := b.client.configureClient(false, uint32(timeoutMS)); err != nil {
		return windowsAccessibilityNativeError(phase, err, state)
	}
	return nil
}

func (b *windowsAccessibilityBackend) Close() error {
	if b.closed {
		return nil
	}
	b.closed = true
	for id, entry := range b.handles {
		if entry != nil && entry.element != nil {
			entry.element.release()
		}
		delete(b.handles, id)
	}
	if b.walker != nil {
		b.walker.release()
		b.walker = nil
	}
	if b.client != nil {
		b.client.release()
		b.client = nil
	}
	if b.coInitialized {
		uiaCoUninitialize()
		b.coInitialized = false
	}
	b.resources.Store(0)
	return nil
}

func (b *windowsAccessibilityBackend) ResourceCount() int {
	return int(b.resources.Load())
}

func (b *windowsAccessibilityBackend) Release(handle uint64) error {
	entry, ok := b.handles[handle]
	if !ok || entry == nil {
		return accessibilityError(AccessibilityStaleTarget, "release", "native accessibility handle is not active", nil)
	}
	delete(b.handles, handle)
	if entry.element != nil {
		entry.element.release()
	}
	b.resources.Add(-1)
	return nil
}

func (b *windowsAccessibilityBackend) ensureReady() error {
	if b.closed {
		return accessibilityError(AccessibilityStaleTarget, "backend", "accessibility backend is closed", nil)
	}
	if b.client == nil || b.walker == nil {
		return accessibilityError(AccessibilityBackendFailed, "backend", "accessibility backend was not initialized", nil)
	}
	return nil
}

func windowsAccessibilityContextError(ctx context.Context, phase string, state AccessibilityActionState) error {
	if ctx == nil || ctx.Err() == nil {
		return nil
	}
	code := AccessibilityCanceled
	message := "accessibility request was canceled"
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		code = AccessibilityTimeout
		message = "accessibility request timed out"
	}
	return &AccessibilityError{Code: code, Phase: phase, Message: message, Cause: ctx.Err(), ActionState: state}
}

func windowsAccessibilityNativeError(phase string, err error, state AccessibilityActionState) error {
	if err == nil {
		return nil
	}
	var existing *AccessibilityError
	if errors.As(err, &existing) {
		copy := *existing
		if copy.Phase == "" {
			copy.Phase = phase
		}
		if copy.ActionState == "" {
			copy.ActionState = state
		}
		return &copy
	}
	code := AccessibilityBackendFailed
	message := "Windows UI Automation provider failed"
	var result *uiaHRESULT
	if errors.As(err, &result) {
		switch result.value {
		case uiaEAccessDenied:
			code = AccessibilityPermissionDenied
			message = "Windows UI Automation provider denied access"
		case uiaElementNotAvailable:
			code = AccessibilityStaleTarget
			message = "Windows UI Automation element is no longer available"
		case uiaElementNotEnabled:
			code = AccessibilityElementDisabled
			message = "Windows UI Automation element is disabled"
		case uiaNotSupported, 0x80004002:
			if phase == "initialize" {
				code = AccessibilityNotSupported
				message = "Windows 8+ IUIAutomation2 is not available"
			} else if phase == "action" || phase == "menu_expand" {
				code = AccessibilityActionUnsupported
				message = "Windows UI Automation pattern is not supported"
			} else {
				code = AccessibilityNotSupported
				message = "Windows UI Automation property or pattern is not supported"
			}
		case 0x80040154:
			code = AccessibilityNotSupported
			message = "Windows 8+ UI Automation client is not installed"
		case uiaEInvalidArg:
			code = AccessibilityBackendFailed
			message = "Windows UI Automation provider rejected the native request"
		case uiaRPCChangedMode:
			code = AccessibilityNotSupported
			message = "Windows UI Automation worker is not running in an MTA"
		case uiaProviderTimeout:
			code = AccessibilityTimeout
			message = "Windows UI Automation provider timed out"
		}
	}
	return &AccessibilityError{Code: code, Phase: phase, Message: message, Cause: err, ActionState: state}
}

func windowsAccessibilityLimits(limits AccessibilityLimits) AccessibilityLimits {
	if limits.MaxDepth <= 0 {
		limits.MaxDepth = accessibilityDefaultMaxDepth
	}
	if limits.MaxNodes <= 0 {
		limits.MaxNodes = accessibilityDefaultMaxNodes
	}
	return limits
}

func (b *windowsAccessibilityBackend) processIdentity(scope AccessibilityScope) (uint32, uint64, error) {
	pid64 := scope.PID
	if pid64 <= 0 {
		pid64 = scope.Target.PID
	}
	if pid64 <= 0 || pid64 > int64(^uint32(0)) {
		return 0, 0, accessibilityError(AccessibilityInvalidArgument, "scope", "scope has no valid process identity", nil)
	}
	pid := uint32(pid64)
	start, err := uiaProcessStartTime(pid)
	if err != nil {
		return 0, 0, accessibilityError(AccessibilityStaleTarget, "identity", "target process instance is no longer available", err)
	}
	if scope.Target.LaunchTimeMS > 0 {
		actualMS := int64(0)
		if start >= windowsFiletimeUnixEpoch {
			actualMS = int64((start - windowsFiletimeUnixEpoch) / 10000)
		}
		if actualMS != scope.Target.LaunchTimeMS {
			return 0, 0, accessibilityError(AccessibilityStaleTarget, "identity", "target process instance identity changed", nil)
		}
	}
	return pid, start, nil
}

func (b *windowsAccessibilityBackend) scopeRoots(ctx context.Context, scope AccessibilityScope, limits AccessibilityLimits) ([]*uiaElement, uint32, uint64, error) {
	if err := b.ensureReady(); err != nil {
		return nil, 0, 0, err
	}
	if err := windowsAccessibilityContextError(ctx, "scope", AccessibilityActionNotStarted); err != nil {
		return nil, 0, 0, err
	}
	if scope.Kind == AccessibilityScopeElement {
		entry, err := b.validatedHandle(ctx, scope.ElementHandle, false)
		if err != nil {
			return nil, 0, 0, err
		}
		entry.element.addRef()
		return []*uiaElement{entry.element}, entry.pid, entry.processStart, nil
	}
	pid, processStart, err := b.processIdentity(scope)
	if err != nil {
		return nil, 0, 0, err
	}
	if scope.Kind == AccessibilityScopeWindow {
		if scope.Window == nil || scope.Window.Handle == 0 {
			return nil, 0, 0, accessibilityError(AccessibilityInvalidArgument, "scope", "window scope has no native handle", nil)
		}
		windowPID, valid := uiaWindowPID(uintptr(scope.Window.Handle))
		if !valid || windowPID != pid {
			return nil, 0, 0, accessibilityError(AccessibilityStaleTarget, "identity", "window identity is no longer current", nil)
		}
		if err := b.beforeNative("scope", AccessibilityActionNotStarted); err != nil {
			return nil, 0, 0, err
		}
		root, err := b.client.elementFromHandle(uintptr(scope.Window.Handle))
		if err != nil {
			return nil, 0, 0, windowsAccessibilityNativeError("scope", err, AccessibilityActionNotStarted)
		}
		if err := b.validateElementPID(root, pid); err != nil {
			root.release()
			return nil, 0, 0, err
		}
		return []*uiaElement{root}, pid, processStart, nil
	}
	if scope.Kind != AccessibilityScopeApplication && scope.Kind != AccessibilityScopeMenuBar {
		return nil, 0, 0, accessibilityError(AccessibilityInvalidArgument, "scope", "unsupported accessibility scope", nil)
	}

	if err := b.beforeNative("scope", AccessibilityActionNotStarted); err != nil {
		return nil, 0, 0, err
	}
	desktop, err := b.client.rootElement()
	if err != nil {
		return nil, 0, 0, windowsAccessibilityNativeError("scope", err, AccessibilityActionNotStarted)
	}
	defer desktop.release()
	roots := make([]*uiaElement, 0, 2)
	if err := b.beforeNative("scope", AccessibilityActionNotStarted); err != nil {
		return nil, 0, 0, err
	}
	child, err := b.walker.firstChild(desktop)
	if err != nil {
		return nil, 0, 0, windowsAccessibilityNativeError("scope", err, AccessibilityActionNotStarted)
	}
	observed := 0
	for child != nil {
		if err := windowsAccessibilityContextError(ctx, "scope", AccessibilityActionNotStarted); err != nil {
			child.release()
			releaseUIAElements(roots)
			return nil, 0, 0, err
		}
		observed++
		if observed > limits.MaxNodes {
			child.release()
			releaseUIAElements(roots)
			return nil, 0, 0, accessibilityError(AccessibilitySearchIncomplete, "scope", "desktop root discovery reached maxNodes", nil)
		}
		currentPID, propertyErr := b.elementPID(child)
		if propertyErr != nil {
			child.release()
			releaseUIAElements(roots)
			return nil, 0, 0, windowsAccessibilityNativeError("scope", propertyErr, AccessibilityActionNotStarted)
		}
		if err := b.beforeNative("scope", AccessibilityActionNotStarted); err != nil {
			child.release()
			releaseUIAElements(roots)
			return nil, 0, 0, err
		}
		next, nextErr := b.walker.nextSibling(child)
		if currentPID == pid {
			roots = append(roots, child)
		} else {
			child.release()
		}
		if nextErr != nil {
			releaseUIAElements(roots)
			return nil, 0, 0, windowsAccessibilityNativeError("scope", nextErr, AccessibilityActionNotStarted)
		}
		child = next
	}
	if len(roots) == 0 {
		return nil, 0, 0, accessibilityError(AccessibilityTargetNotFound, "scope", "target application has no current UI Automation root", nil)
	}
	return roots, pid, processStart, nil
}

func releaseUIAElements(values []*uiaElement) {
	for _, value := range values {
		if value != nil {
			value.release()
		}
	}
}

func (b *windowsAccessibilityBackend) elementPID(element *uiaElement) (uint32, error) {
	if err := b.beforeNative("identity", AccessibilityActionNotStarted); err != nil {
		return 0, err
	}
	property, err := element.property(uiaProcessIDProperty)
	if err != nil {
		return 0, err
	}
	defer property.clear()
	value, ok := property.int32()
	if !ok || value <= 0 {
		return 0, fmt.Errorf("UIA_ProcessIdPropertyId did not return a valid process id")
	}
	return uint32(value), nil
}

func (b *windowsAccessibilityBackend) validateElementPID(element *uiaElement, expected uint32) error {
	actual, err := b.elementPID(element)
	if err != nil {
		return windowsAccessibilityNativeError("identity", err, AccessibilityActionNotStarted)
	}
	if actual != expected {
		return accessibilityError(AccessibilityStaleTarget, "identity", "native element no longer belongs to the target process", nil)
	}
	return nil
}

func sameRuntimeID(left, right []int32) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func (b *windowsAccessibilityBackend) validatedHandle(ctx context.Context, handle uint64, forAction bool) (*windowsAccessibilityHandle, error) {
	if err := windowsAccessibilityContextError(ctx, "identity", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	entry, ok := b.handles[handle]
	if !ok || entry == nil || entry.element == nil {
		return nil, accessibilityError(AccessibilityStaleTarget, "identity", "native accessibility handle is no longer active", nil)
	}
	start, err := uiaProcessStartTime(entry.pid)
	if err != nil || start != entry.processStart {
		return nil, accessibilityError(AccessibilityStaleTarget, "identity", "target process instance identity changed", err)
	}
	if entry.rootWindow != 0 {
		pid, valid := uiaWindowPID(entry.rootWindow)
		if !valid || pid != entry.pid {
			return nil, accessibilityError(AccessibilityStaleTarget, "identity", "target window identity changed", nil)
		}
	}
	if entry.containerWindow != 0 {
		pid, valid := uiaWindowPID(entry.containerWindow)
		if !valid || pid != entry.pid || (entry.rootWindow != 0 && !uiaWindowOwnedBy(entry.containerWindow, entry.rootWindow)) {
			return nil, accessibilityError(AccessibilityStaleTarget, "identity", "native element container identity changed", nil)
		}
	}
	if err := b.validateElementPID(entry.element, entry.pid); err != nil {
		return nil, err
	}
	if err := b.beforeNative("identity", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	runtimeID, err := entry.element.runtimeID()
	if err != nil {
		return nil, windowsAccessibilityNativeError("identity", err, AccessibilityActionNotStarted)
	}
	if !sameRuntimeID(runtimeID, entry.runtimeID) {
		return nil, accessibilityError(AccessibilityStaleTarget, "identity", "native element identity changed", nil)
	}
	if forAction && entry.menuElement {
		container, err := b.menuElementContainerWindow(entry.element, entry.pid, accessibilityMaximumMaxDepth+4)
		if err != nil {
			return nil, err
		}
		if container == 0 || container != entry.containerWindow {
			return nil, accessibilityError(AccessibilityStaleTarget, "identity", "menu element container identity changed", nil)
		}
		foreground := uiaForegroundWindow()
		if entry.rootWindow == 0 || foreground == 0 || (foreground != entry.rootWindow && foreground != entry.containerWindow) {
			return nil, accessibilityError(AccessibilityStaleTarget, "foreground", "target menu window is no longer foreground", nil)
		}
	}
	return entry, nil
}

func (b *windowsAccessibilityBackend) retainElement(element *uiaElement, pid uint32, processStart uint64, rootWindow, containerWindow uintptr, menu bool) (uint64, error) {
	if err := b.beforeNative("reference", AccessibilityActionNotStarted); err != nil {
		return 0, err
	}
	runtimeID, err := element.runtimeID()
	if err != nil {
		return 0, windowsAccessibilityNativeError("reference", err, AccessibilityActionNotStarted)
	}
	if len(runtimeID) == 0 {
		return 0, accessibilityError(AccessibilityStaleTarget, "reference", "native element has no stable runtime identity", nil)
	}
	b.nextHandle++
	if b.nextHandle == 0 {
		b.nextHandle++
	}
	handle := b.nextHandle
	element.addRef()
	b.handles[handle] = &windowsAccessibilityHandle{
		element: element, pid: pid, processStart: processStart,
		runtimeID: append([]int32(nil), runtimeID...), rootWindow: rootWindow,
		containerWindow: containerWindow, menuElement: menu,
	}
	b.resources.Add(1)
	return handle, nil
}

type windowsAccessibilityWalk struct {
	limits   AccessibilityLimits
	nodes    int
	maxDepth int
	complete bool
	reason   string
}

func newWindowsAccessibilityWalk(limits AccessibilityLimits) *windowsAccessibilityWalk {
	return &windowsAccessibilityWalk{limits: windowsAccessibilityLimits(limits), complete: true}
}

func (state *windowsAccessibilityWalk) truncate(reason string) {
	if state.complete {
		state.complete = false
		state.reason = reason
	}
}

func (b *windowsAccessibilityBackend) walkElements(ctx context.Context, roots []*uiaElement, pid uint32, startDepth int, state *windowsAccessibilityWalk, visit func(*uiaElement, int) error) error {
	for _, root := range roots {
		if state.nodes >= state.limits.MaxNodes {
			state.truncate("maxNodes")
			return nil
		}
		if err := b.walkElement(ctx, root, pid, startDepth, state, visit); err != nil {
			return err
		}
	}
	return nil
}

func (b *windowsAccessibilityBackend) walkElement(ctx context.Context, element *uiaElement, pid uint32, depth int, state *windowsAccessibilityWalk, visit func(*uiaElement, int) error) error {
	if err := windowsAccessibilityContextError(ctx, "search", AccessibilityActionNotStarted); err != nil {
		return err
	}
	actualPID, err := b.elementPID(element)
	if err != nil {
		return windowsAccessibilityNativeError("search", err, AccessibilityActionNotStarted)
	}
	if actualPID != pid {
		return nil
	}
	if state.nodes >= state.limits.MaxNodes {
		state.truncate("maxNodes")
		return nil
	}
	state.nodes++
	if depth > state.maxDepth {
		state.maxDepth = depth
	}
	if visit != nil {
		if err := visit(element, depth); err != nil {
			return err
		}
	}
	if depth >= state.limits.MaxDepth {
		if err := b.beforeNative("search", AccessibilityActionNotStarted); err != nil {
			return err
		}
		child, err := b.walker.firstChild(element)
		if err != nil {
			return windowsAccessibilityNativeError("search", err, AccessibilityActionNotStarted)
		}
		if child != nil {
			child.release()
			state.truncate("maxDepth")
		}
		return nil
	}
	if err := b.beforeNative("search", AccessibilityActionNotStarted); err != nil {
		return err
	}
	child, err := b.walker.firstChild(element)
	if err != nil {
		return windowsAccessibilityNativeError("search", err, AccessibilityActionNotStarted)
	}
	for child != nil {
		if state.nodes >= state.limits.MaxNodes {
			child.release()
			state.truncate("maxNodes")
			return nil
		}
		if err := b.beforeNative("search", AccessibilityActionNotStarted); err != nil {
			child.release()
			return err
		}
		next, nextErr := b.walker.nextSibling(child)
		walkErr := b.walkElement(ctx, child, pid, depth+1, state, visit)
		child.release()
		if walkErr != nil {
			if next != nil {
				next.release()
			}
			return walkErr
		}
		if nextErr != nil {
			if next != nil {
				next.release()
			}
			return windowsAccessibilityNativeError("search", nextErr, AccessibilityActionNotStarted)
		}
		child = next
	}
	return nil
}

func (b *windowsAccessibilityBackend) propertyString(element *uiaElement, propertyID int32) (*string, error) {
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	property, err := element.property(propertyID)
	if err != nil {
		return nil, err
	}
	defer property.clear()
	value, ok := property.string()
	if !ok || value == "" {
		return nil, nil
	}
	return &value, nil
}

func (b *windowsAccessibilityBackend) propertyBool(element *uiaElement, propertyID int32) (*bool, error) {
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	property, err := element.property(propertyID)
	if err != nil {
		return nil, err
	}
	defer property.clear()
	value, ok := property.bool()
	if !ok {
		return nil, nil
	}
	return &value, nil
}

func (b *windowsAccessibilityBackend) propertyInt32(element *uiaElement, propertyID int32) (int32, bool, error) {
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return 0, false, err
	}
	property, err := element.property(propertyID)
	if err != nil {
		return 0, false, err
	}
	defer property.clear()
	value, ok := property.int32()
	return value, ok, nil
}

func (b *windowsAccessibilityBackend) nativeBounds(element *uiaElement) (*AccessibilityNativeBounds, error) {
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	property, err := element.property(uiaBoundingRectangleProperty)
	if err != nil {
		return nil, err
	}
	defer property.clear()
	values, ok := property.float64Array()
	if !ok || len(values) != 4 {
		return nil, nil
	}
	return &AccessibilityNativeBounds{
		X: values[0], Y: values[1], Width: values[2], Height: values[3],
		CoordinateSpace: "windowsPhysicalScreen",
	}, nil
}

func windowsAccessibilityRole(controlType int32) (string, string) {
	type role struct {
		id     int32
		public string
		native string
	}
	roles := [...]role{
		{50000, "button", "UIA_ButtonControlTypeId"},
		{50002, "checkbox", "UIA_CheckBoxControlTypeId"},
		{50003, "comboBox", "UIA_ComboBoxControlTypeId"},
		{50004, "textField", "UIA_EditControlTypeId"},
		{50005, "link", "UIA_HyperlinkControlTypeId"},
		{50007, "listItem", "UIA_ListItemControlTypeId"},
		{50008, "list", "UIA_ListControlTypeId"},
		{50009, "menu", "UIA_MenuControlTypeId"},
		{50010, "menuBar", "UIA_MenuBarControlTypeId"},
		{50011, "menuItem", "UIA_MenuItemControlTypeId"},
		{50013, "radioButton", "UIA_RadioButtonControlTypeId"},
		{50020, "staticText", "UIA_TextControlTypeId"},
		{50026, "group", "UIA_GroupControlTypeId"},
		{50028, "table", "UIA_DataGridControlTypeId"},
		{50032, "window", "UIA_WindowControlTypeId"},
		{50036, "table", "UIA_TableControlTypeId"},
	}
	for _, value := range roles {
		if value.id == controlType {
			return value.public, value.native
		}
	}
	return "unknown", fmt.Sprintf("UIA_ControlTypeId(%d)", controlType)
}

func (b *windowsAccessibilityBackend) elementRole(element *uiaElement) (string, string, error) {
	controlType, ok, err := b.propertyInt32(element, uiaControlTypeProperty)
	if err != nil {
		return "", "", err
	}
	if !ok {
		return "unknown", "UIA_ControlTypeId(unknown)", nil
	}
	role, native := windowsAccessibilityRole(controlType)
	return role, native, nil
}

func appendAction(actions []string, action string) []string {
	for _, existing := range actions {
		if existing == action {
			return actions
		}
	}
	return append(actions, action)
}

func windowsUIAPatternUnavailable(err error) bool {
	var result *uiaHRESULT
	return errors.As(err, &result) && (result.value == uiaNotSupported || result.value == 0x80004002)
}

func (b *windowsAccessibilityBackend) elementActions(element *uiaElement) ([]string, error) {
	actions := make([]string, 0, 6)
	available, err := b.propertyBool(element, uiaIsInvokeAvailableProperty)
	if err != nil {
		return nil, err
	}
	if available != nil && *available {
		actions = appendAction(actions, "invoke")
	}
	available, err = b.propertyBool(element, uiaIsValueAvailableProperty)
	if err != nil {
		return nil, err
	}
	if available != nil && *available {
		if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
			return nil, err
		}
		pattern, patternErr := uiaValueFor(element)
		if patternErr == nil {
			if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
				pattern.release()
				return nil, err
			}
			readOnly, readOnlyErr := pattern.isReadOnly()
			pattern.release()
			if readOnlyErr != nil {
				return nil, readOnlyErr
			}
			if !readOnly {
				actions = appendAction(actions, "setValue")
			}
		} else if !windowsUIAPatternUnavailable(patternErr) {
			return nil, patternErr
		}
	}
	available, err = b.propertyBool(element, uiaIsExpandCollapseAvailableProperty)
	if err != nil {
		return nil, err
	}
	if available != nil && *available {
		if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
			return nil, err
		}
		pattern, patternErr := uiaExpandCollapseFor(element)
		if patternErr == nil {
			if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
				pattern.release()
				return nil, err
			}
			state, stateErr := pattern.state()
			pattern.release()
			if stateErr != nil {
				return nil, stateErr
			}
			switch state {
			case uiaExpandCollapseCollapsed:
				actions = appendAction(actions, "expand")
			case uiaExpandCollapseExpanded:
				actions = appendAction(actions, "collapse")
			case uiaExpandCollapsePartiallyExpanded:
				actions = appendAction(actions, "expand")
				actions = appendAction(actions, "collapse")
			}
		} else if !windowsUIAPatternUnavailable(patternErr) {
			return nil, patternErr
		}
	}
	available, err = b.propertyBool(element, uiaIsSelectionItemAvailableProperty)
	if err != nil {
		return nil, err
	}
	if available != nil && *available {
		actions = appendAction(actions, "select")
	}
	available, err = b.propertyBool(element, uiaIsToggleAvailableProperty)
	if err != nil {
		return nil, err
	}
	if available != nil && *available {
		if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
			return nil, err
		}
		pattern, patternErr := uiaToggleFor(element)
		if patternErr == nil {
			if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
				pattern.release()
				return nil, err
			}
			state, stateErr := pattern.state()
			pattern.release()
			if stateErr != nil {
				return nil, stateErr
			}
			if state == uiaToggleOff || state == uiaToggleOn {
				actions = appendAction(actions, "setChecked")
			}
		} else if !windowsUIAPatternUnavailable(patternErr) {
			return nil, patternErr
		}
	}
	sort.Strings(actions)
	return actions, nil
}

func (b *windowsAccessibilityBackend) selectionState(element *uiaElement) (*bool, error) {
	available, err := b.propertyBool(element, uiaIsSelectionItemAvailableProperty)
	if err != nil || available == nil || !*available {
		return nil, err
	}
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	pattern, err := uiaSelectionItemFor(element)
	if err != nil {
		return nil, err
	}
	defer pattern.release()
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	value, err := pattern.isSelected()
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func (b *windowsAccessibilityBackend) checkedState(element *uiaElement) (*bool, error) {
	available, err := b.propertyBool(element, uiaIsToggleAvailableProperty)
	if err != nil || available == nil || !*available {
		return nil, err
	}
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	pattern, err := uiaToggleFor(element)
	if err != nil {
		return nil, err
	}
	defer pattern.release()
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	value, err := pattern.state()
	if err != nil {
		return nil, err
	}
	if value == uiaToggleIndeterminate {
		return nil, nil
	}
	checked := value == uiaToggleOn
	return &checked, nil
}

func (b *windowsAccessibilityBackend) expandedState(element *uiaElement) (*bool, error) {
	available, err := b.propertyBool(element, uiaIsExpandCollapseAvailableProperty)
	if err != nil || available == nil || !*available {
		return nil, err
	}
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	pattern, err := uiaExpandCollapseFor(element)
	if err != nil {
		return nil, err
	}
	defer pattern.release()
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	value, err := pattern.state()
	if err != nil {
		return nil, err
	}
	if value == uiaExpandCollapseLeafNode {
		return nil, nil
	}
	expanded := value == uiaExpandCollapseExpanded || value == uiaExpandCollapsePartiallyExpanded
	return &expanded, nil
}

func (b *windowsAccessibilityBackend) readValue(element *uiaElement) (interface{}, error) {
	password, err := b.propertyBool(element, uiaIsPasswordProperty)
	if err != nil {
		return nil, err
	}
	if password != nil && *password {
		return nil, accessibilityError(AccessibilityPermissionDenied, "read", "value is protected and cannot be read", nil)
	}
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	pattern, err := uiaValueFor(element)
	if err != nil {
		return nil, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	defer pattern.release()
	if err := b.beforeNative("read", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	value, err := pattern.currentValue()
	if err != nil {
		return nil, err
	}
	return value, nil
}

func (b *windowsAccessibilityBackend) optionalSnapshotValue(element *uiaElement) (interface{}, bool, error) {
	available, err := b.propertyBool(element, uiaIsValueAvailableProperty)
	if err != nil {
		return nil, false, err
	}
	if available == nil || !*available {
		return nil, false, nil
	}
	value, err := b.readValue(element)
	if err != nil {
		return nil, false, err
	}
	return value, true, nil
}

func containsAccessibilityProperty(properties []string, expected string) bool {
	for _, value := range properties {
		if value == expected {
			return true
		}
	}
	return false
}

func (b *windowsAccessibilityBackend) nodeFor(ctx context.Context, element *uiaElement, includeValue bool) (AccessibilityNode, error) {
	if err := windowsAccessibilityContextError(ctx, "read", AccessibilityActionNotStarted); err != nil {
		return AccessibilityNode{}, err
	}
	role, nativeRole, err := b.elementRole(element)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	name, err := b.propertyString(element, uiaNameProperty)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	identifier, err := b.propertyString(element, uiaAutomationIDProperty)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	enabled, err := b.propertyBool(element, uiaIsEnabledProperty)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	focused, err := b.propertyBool(element, uiaHasKeyboardFocusProperty)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	selected, err := b.selectionState(element)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	checked, err := b.checkedState(element)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	expanded, err := b.expandedState(element)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	actions, err := b.elementActions(element)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	bounds, err := b.nativeBounds(element)
	if err != nil {
		return AccessibilityNode{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
	}
	node := AccessibilityNode{
		Role: role, NativeRole: nativeRole, Name: name, Identifier: identifier,
		Enabled: enabled, Focused: focused, Selected: selected, Checked: checked,
		Expanded: expanded, Actions: actions, NativeBounds: bounds, Bounds: nil,
	}
	if includeValue {
		value, included, err := b.optionalSnapshotValue(element)
		if err != nil {
			return AccessibilityNode{}, err
		}
		if included {
			node.Value = value
			node.ValueIncluded = true
		}
	}
	return node, nil
}

func (b *windowsAccessibilityBackend) snapshotElement(ctx context.Context, element *uiaElement, pid uint32, depth int, state *windowsAccessibilityWalk, includeValue bool) (*AccessibilityNode, error) {
	if err := windowsAccessibilityContextError(ctx, "snapshot", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	if state.nodes >= state.limits.MaxNodes {
		state.truncate("maxNodes")
		return nil, nil
	}
	actualPID, err := b.elementPID(element)
	if err != nil {
		return nil, windowsAccessibilityNativeError("snapshot", err, AccessibilityActionNotStarted)
	}
	if actualPID != pid {
		return nil, nil
	}
	node, err := b.nodeFor(ctx, element, includeValue)
	if err != nil {
		return nil, err
	}
	state.nodes++
	if depth > state.maxDepth {
		state.maxDepth = depth
	}
	if depth >= state.limits.MaxDepth {
		if err := b.beforeNative("snapshot", AccessibilityActionNotStarted); err != nil {
			return nil, err
		}
		child, err := b.walker.firstChild(element)
		if err != nil {
			return nil, windowsAccessibilityNativeError("snapshot", err, AccessibilityActionNotStarted)
		}
		if child != nil {
			child.release()
			state.truncate("maxDepth")
		} else if node.Expanded != nil && !*node.Expanded && containsAction(node.Actions, "expand") {
			state.truncate("unmaterializedSubtree")
		}
		return &node, nil
	}
	if err := b.beforeNative("snapshot", AccessibilityActionNotStarted); err != nil {
		return nil, err
	}
	child, err := b.walker.firstChild(element)
	if err != nil {
		return nil, windowsAccessibilityNativeError("snapshot", err, AccessibilityActionNotStarted)
	}
	if child == nil && node.Expanded != nil && !*node.Expanded && containsAction(node.Actions, "expand") {
		state.truncate("unmaterializedSubtree")
	}
	for child != nil {
		if state.nodes >= state.limits.MaxNodes {
			child.release()
			state.truncate("maxNodes")
			break
		}
		if err := b.beforeNative("snapshot", AccessibilityActionNotStarted); err != nil {
			child.release()
			return nil, err
		}
		next, nextErr := b.walker.nextSibling(child)
		childNode, childErr := b.snapshotElement(ctx, child, pid, depth+1, state, includeValue)
		child.release()
		if childErr != nil {
			if next != nil {
				next.release()
			}
			return nil, childErr
		}
		if childNode != nil {
			node.Children = append(node.Children, *childNode)
		}
		if nextErr != nil {
			if next != nil {
				next.release()
			}
			return nil, windowsAccessibilityNativeError("snapshot", nextErr, AccessibilityActionNotStarted)
		}
		child = next
	}
	return &node, nil
}

func containsAction(actions []string, expected string) bool {
	for _, value := range actions {
		if value == expected {
			return true
		}
	}
	return false
}

func (b *windowsAccessibilityBackend) operationRoots(ctx context.Context, scope AccessibilityScope, limits AccessibilityLimits) ([]*uiaElement, uint32, uint64, uintptr, error) {
	if scope.Kind == AccessibilityScopeMenuBar {
		bar, pid, processStart, rootWindow, err := b.menuBar(ctx, scope, limits)
		if err != nil {
			return nil, 0, 0, 0, err
		}
		return []*uiaElement{bar}, pid, processStart, rootWindow, nil
	}
	roots, pid, processStart, err := b.scopeRoots(ctx, scope, limits)
	if err != nil {
		return nil, 0, 0, 0, err
	}
	rootWindow := uintptr(0)
	if scope.Window != nil {
		rootWindow = uintptr(scope.Window.Handle)
	} else if scope.Kind == AccessibilityScopeElement {
		if entry := b.handles[scope.ElementHandle]; entry != nil {
			rootWindow = entry.rootWindow
		}
	} else if len(roots) == 1 {
		rootWindow, err = b.elementWindowHandle(roots[0], 0)
		if err != nil {
			releaseUIAElements(roots)
			return nil, 0, 0, 0, err
		}
	}
	return roots, pid, processStart, rootWindow, nil
}

func (b *windowsAccessibilityBackend) Snapshot(ctx context.Context, scope AccessibilityScope, limits AccessibilityLimits) (AccessibilitySnapshotData, error) {
	restore := b.useContext(ctx)
	defer restore()
	limits = windowsAccessibilityLimits(limits)
	roots, pid, _, _, err := b.operationRoots(ctx, scope, limits)
	if err != nil {
		return AccessibilitySnapshotData{}, err
	}
	defer releaseUIAElements(roots)
	state := newWindowsAccessibilityWalk(limits)
	includeValue := containsAccessibilityProperty(limits.Properties, "value")
	var root *AccessibilityNode
	if scope.Kind == AccessibilityScopeApplication {
		application := AccessibilityNode{Role: "application", NativeRole: "UIA_ProcessScope", Actions: []string{}}
		state.nodes = 1
		for _, nativeRoot := range roots {
			if state.nodes >= limits.MaxNodes {
				state.truncate("maxNodes")
				break
			}
			child, childErr := b.snapshotElement(ctx, nativeRoot, pid, 1, state, includeValue)
			if childErr != nil {
				return AccessibilitySnapshotData{}, childErr
			}
			if child != nil {
				application.Children = append(application.Children, *child)
			}
		}
		root = &application
	} else {
		if len(roots) != 1 {
			return AccessibilitySnapshotData{}, accessibilityError(AccessibilityAmbiguousTarget, "scope", "scope resolves to more than one native root", nil)
		}
		root, err = b.snapshotElement(ctx, roots[0], pid, 0, state, includeValue)
		if err != nil {
			return AccessibilitySnapshotData{}, err
		}
	}
	if err := windowsAccessibilityContextError(ctx, "snapshot", AccessibilityActionNotStarted); err != nil {
		return AccessibilitySnapshotData{}, err
	}
	return AccessibilitySnapshotData{
		Root: root, Complete: state.complete, Truncated: !state.complete,
		Reason: state.reason, Nodes: state.nodes, MaxDepth: state.maxDepth,
	}, nil
}

func (b *windowsAccessibilityBackend) selectorMatches(element *uiaElement, selector AccessibilitySelector) (bool, error) {
	if selector.Role != "" {
		role, _, err := b.elementRole(element)
		if err != nil {
			return false, err
		}
		if role != selector.Role {
			return false, nil
		}
	}
	if selector.Name != nil {
		name, err := b.propertyString(element, uiaNameProperty)
		if err != nil {
			return false, err
		}
		if name == nil || *name != *selector.Name {
			return false, nil
		}
	}
	if selector.Identifier != nil {
		identifier, err := b.propertyString(element, uiaAutomationIDProperty)
		if err != nil {
			return false, err
		}
		if identifier == nil || *identifier != *selector.Identifier {
			return false, nil
		}
	}
	return true, nil
}

func (b *windowsAccessibilityBackend) elementWindowHandle(element *uiaElement, fallback uintptr) (uintptr, error) {
	if err := b.beforeNative("identity", AccessibilityActionNotStarted); err != nil {
		return 0, err
	}
	property, err := element.property(uiaNativeWindowHandleProperty)
	if err != nil {
		return 0, windowsAccessibilityNativeError("identity", err, AccessibilityActionNotStarted)
	}
	defer property.clear()
	value, ok := property.int32()
	if !ok || value == 0 {
		return fallback, nil
	}
	return uintptr(uint32(value)), nil
}

func (b *windowsAccessibilityBackend) menuElementContainerWindow(element *uiaElement, pid uint32, maxDepth int) (uintptr, error) {
	current := element
	current.addRef()
	defer func() { current.release() }()
	for depth := 0; depth <= maxDepth; depth++ {
		window, err := b.elementWindowHandle(current, 0)
		if err != nil {
			return 0, err
		}
		if window != 0 {
			windowPID, valid := uiaWindowPID(window)
			if !valid || windowPID != pid {
				return 0, accessibilityError(AccessibilityStaleTarget, "identity", "menu container window is no longer owned by the target process", nil)
			}
			return window, nil
		}
		if err := b.beforeNative("identity", AccessibilityActionNotStarted); err != nil {
			return 0, err
		}
		parent, err := b.walker.parent(current)
		if err != nil {
			return 0, windowsAccessibilityNativeError("identity", err, AccessibilityActionNotStarted)
		}
		if parent == nil {
			return 0, &AccessibilityError{Code: AccessibilityNotSupported, Phase: "identity", Message: "menu element has no verifiable native window container", ActionState: AccessibilityActionNotStarted}
		}
		parentPID, pidErr := b.elementPID(parent)
		if pidErr != nil {
			parent.release()
			return 0, windowsAccessibilityNativeError("identity", pidErr, AccessibilityActionNotStarted)
		}
		if parentPID != pid {
			parent.release()
			return 0, &AccessibilityError{Code: AccessibilityNotSupported, Phase: "identity", Message: "menu ancestry leaves the verified target process", ActionState: AccessibilityActionNotStarted}
		}
		current.release()
		current = parent
	}
	return 0, &AccessibilityError{Code: AccessibilityNotSupported, Phase: "identity", Message: "menu native window ancestry exceeded the bounded depth", ActionState: AccessibilityActionNotStarted}
}

func (b *windowsAccessibilityBackend) Find(ctx context.Context, scope AccessibilityScope, selector AccessibilitySelector, limits AccessibilityLimits) (AccessibilityFindData, error) {
	restore := b.useContext(ctx)
	defer restore()
	limits = windowsAccessibilityLimits(limits)
	roots, pid, processStart, rootWindow, err := b.operationRoots(ctx, scope, limits)
	if err != nil {
		return AccessibilityFindData{}, err
	}
	defer releaseUIAElements(roots)
	state := newWindowsAccessibilityWalk(limits)
	startDepth := 0
	if scope.Kind == AccessibilityScopeApplication {
		startDepth = 1
	}
	candidates := make([]*uiaElement, 0, 2)
	candidateWindows := make([]uintptr, 0, 2)
	for _, root := range roots {
		candidateWindow := rootWindow
		if candidateWindow == 0 {
			candidateWindow, err = b.elementWindowHandle(root, 0)
			if err != nil {
				releaseUIAElements(candidates)
				return AccessibilityFindData{}, err
			}
		}
		err = b.walkElements(ctx, []*uiaElement{root}, pid, startDepth, state, func(element *uiaElement, _ int) error {
			matches, matchErr := b.selectorMatches(element, selector)
			if matchErr != nil {
				return windowsAccessibilityNativeError("search", matchErr, AccessibilityActionNotStarted)
			}
			if matches {
				element.addRef()
				candidates = append(candidates, element)
				candidateWindows = append(candidateWindows, candidateWindow)
			}
			return nil
		})
		if err != nil {
			releaseUIAElements(candidates)
			return AccessibilityFindData{}, err
		}
	}
	defer releaseUIAElements(candidates)
	if len(candidates) > 1 {
		return AccessibilityFindData{}, accessibilityError(AccessibilityAmbiguousTarget, "search", "selector matches more than one element", nil)
	}
	if !state.complete {
		return AccessibilityFindData{}, accessibilityError(AccessibilitySearchIncomplete, "search", "bounded search could not prove a unique result", nil)
	}
	if len(candidates) == 0 {
		return AccessibilityFindData{Found: false, Complete: true}, nil
	}
	node, err := b.nodeFor(ctx, candidates[0], false)
	if err != nil {
		return AccessibilityFindData{}, err
	}
	handle, err := b.retainElement(candidates[0], pid, processStart, candidateWindows[0], candidateWindows[0], false)
	if err != nil {
		return AccessibilityFindData{}, err
	}
	return AccessibilityFindData{Found: true, Handle: handle, Node: node, Complete: true}, nil
}

func (b *windowsAccessibilityBackend) Read(ctx context.Context, handle uint64, properties []string) (AccessibilityReadData, error) {
	restore := b.useContext(ctx)
	defer restore()
	entry, err := b.validatedHandle(ctx, handle, false)
	if err != nil {
		return AccessibilityReadData{}, err
	}
	result := make(map[string]interface{}, len(properties))
	for _, property := range properties {
		if err := windowsAccessibilityContextError(ctx, "read", AccessibilityActionNotStarted); err != nil {
			return AccessibilityReadData{}, err
		}
		switch property {
		case "role", "nativeRole":
			role, native, roleErr := b.elementRole(entry.element)
			if roleErr != nil {
				return AccessibilityReadData{}, windowsAccessibilityNativeError("read", roleErr, AccessibilityActionNotStarted)
			}
			if property == "role" {
				result[property] = role
			} else {
				result[property] = native
			}
		case "name":
			result[property], err = b.propertyString(entry.element, uiaNameProperty)
		case "identifier":
			result[property], err = b.propertyString(entry.element, uiaAutomationIDProperty)
		case "enabled":
			result[property], err = b.propertyBool(entry.element, uiaIsEnabledProperty)
		case "focused":
			result[property], err = b.propertyBool(entry.element, uiaHasKeyboardFocusProperty)
		case "selected":
			result[property], err = b.selectionState(entry.element)
		case "checked":
			result[property], err = b.checkedState(entry.element)
		case "expanded":
			result[property], err = b.expandedState(entry.element)
		case "actions":
			result[property], err = b.elementActions(entry.element)
		case "nativeBounds":
			result[property], err = b.nativeBounds(entry.element)
		case "bounds":
			result[property] = nil
		case "value":
			result[property], err = b.readValue(entry.element)
		default:
			return AccessibilityReadData{}, accessibilityError(AccessibilityInvalidArgument, "read", "unsupported read property", nil)
		}
		if err != nil {
			var typed *AccessibilityError
			if errors.As(err, &typed) {
				return AccessibilityReadData{}, err
			}
			return AccessibilityReadData{}, windowsAccessibilityNativeError("read", err, AccessibilityActionNotStarted)
		}
		result[property] = accessibilityDereference(result[property])
	}
	if err := windowsAccessibilityContextError(ctx, "read", AccessibilityActionNotStarted); err != nil {
		return AccessibilityReadData{}, err
	}
	return AccessibilityReadData{Properties: result}, nil
}

func accessibilityDereference(value interface{}) interface{} {
	switch typed := value.(type) {
	case *string:
		if typed == nil {
			return nil
		}
		return *typed
	case *bool:
		if typed == nil {
			return nil
		}
		return *typed
	default:
		return value
	}
}

func (b *windowsAccessibilityBackend) actionCompleted(ctx context.Context, err error) (AccessibilityActionData, error) {
	if err != nil {
		return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionUnknown)
	}
	if err := windowsAccessibilityContextError(ctx, "action", AccessibilityActionUnknown); err != nil {
		return AccessibilityActionData{}, err
	}
	return AccessibilityActionData{State: AccessibilityActionAcknowledged}, nil
}

func (b *windowsAccessibilityBackend) Perform(ctx context.Context, handle uint64, action AccessibilityAction) (AccessibilityActionData, error) {
	restore := b.useContext(ctx)
	defer restore()
	entry, err := b.validatedHandle(ctx, handle, true)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	enabled, err := b.propertyBool(entry.element, uiaIsEnabledProperty)
	if err != nil {
		return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
	}
	if enabled == nil {
		return AccessibilityActionData{}, &AccessibilityError{Code: AccessibilityStateUnknown, Phase: "action", Message: "element enabled state is unavailable", ActionState: AccessibilityActionNotStarted}
	}
	if !*enabled {
		return AccessibilityActionData{}, &AccessibilityError{Code: AccessibilityElementDisabled, Phase: "action", Message: "element is disabled", ActionState: AccessibilityActionNotStarted}
	}
	if err := windowsAccessibilityContextError(ctx, "action", AccessibilityActionNotStarted); err != nil {
		return AccessibilityActionData{}, err
	}
	switch action.Action {
	case "invoke":
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		pattern, err := uiaInvokeFor(entry.element)
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		defer pattern.release()
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		return b.actionCompleted(ctx, pattern.invokeOnce())
	case "setValue":
		password, err := b.propertyBool(entry.element, uiaIsPasswordProperty)
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		if password != nil && *password {
			return AccessibilityActionData{}, &AccessibilityError{Code: AccessibilityPermissionDenied, Phase: "action", Message: "protected value cannot be changed through the public accessibility API", ActionState: AccessibilityActionNotStarted}
		}
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		pattern, err := uiaValueFor(entry.element)
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		defer pattern.release()
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		readOnly, err := pattern.isReadOnly()
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		if readOnly {
			return AccessibilityActionData{}, &AccessibilityError{Code: AccessibilityActionUnsupported, Phase: "action", Message: "value is read-only", ActionState: AccessibilityActionNotStarted}
		}
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		attempted, setErr := pattern.setString(action.Value)
		if !attempted {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", setErr, AccessibilityActionNotStarted)
		}
		return b.actionCompleted(ctx, setErr)
	case "expand", "collapse":
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		pattern, err := uiaExpandCollapseFor(entry.element)
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		defer pattern.release()
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		state, err := pattern.state()
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		if state == uiaExpandCollapseLeafNode {
			return AccessibilityActionData{}, &AccessibilityError{Code: AccessibilityActionUnsupported, Phase: "action", Message: "element is not expandable", ActionState: AccessibilityActionNotStarted}
		}
		if action.Action == "expand" {
			if state == uiaExpandCollapseExpanded {
				return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
			}
			if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
				return AccessibilityActionData{}, err
			}
			return b.actionCompleted(ctx, pattern.expandOnce())
		}
		if state == uiaExpandCollapseCollapsed {
			return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
		}
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		return b.actionCompleted(ctx, pattern.collapseOnce())
	case "select":
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		pattern, err := uiaSelectionItemFor(entry.element)
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		defer pattern.release()
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		selected, err := pattern.isSelected()
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		if selected {
			return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
		}
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		return b.actionCompleted(ctx, pattern.selectOnce())
	case "setChecked":
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		pattern, err := uiaToggleFor(entry.element)
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		defer pattern.release()
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		state, err := pattern.state()
		if err != nil {
			return AccessibilityActionData{}, windowsAccessibilityNativeError("action", err, AccessibilityActionNotStarted)
		}
		if state == uiaToggleIndeterminate {
			return AccessibilityActionData{}, &AccessibilityError{Code: AccessibilityStateUnknown, Phase: "action", Message: "three-state toggle cannot be changed safely", ActionState: AccessibilityActionNotStarted}
		}
		checked := state == uiaToggleOn
		if checked == action.Checked {
			return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
		}
		if err := b.beforeNative("action", AccessibilityActionNotStarted); err != nil {
			return AccessibilityActionData{}, err
		}
		return b.actionCompleted(ctx, pattern.toggleOnce())
	default:
		return AccessibilityActionData{}, accessibilityError(AccessibilityInvalidArgument, "action", "unsupported accessibility action", nil)
	}
}

func menuSegmentSelector(segment AccessibilityMenuSegment) AccessibilitySelector {
	return AccessibilitySelector{Name: segment.Name, Identifier: segment.Identifier}
}

func (b *windowsAccessibilityBackend) menuBar(ctx context.Context, scope AccessibilityScope, limits AccessibilityLimits) (*uiaElement, uint32, uint64, uintptr, error) {
	roots, pid, processStart, err := b.scopeRoots(ctx, scope, limits)
	if err != nil {
		return nil, 0, 0, 0, err
	}
	defer releaseUIAElements(roots)
	if len(roots) != 1 {
		return nil, 0, 0, 0, accessibilityError(AccessibilityAmbiguousTarget, "menu_search", "Windows menu scope requires an explicit window when the application has multiple UI roots", nil)
	}
	state := newWindowsAccessibilityWalk(limits)
	bars := make([]*uiaElement, 0, 2)
	err = b.walkElements(ctx, roots, pid, 0, state, func(element *uiaElement, _ int) error {
		role, _, roleErr := b.elementRole(element)
		if roleErr != nil {
			return roleErr
		}
		if role == "menuBar" {
			element.addRef()
			bars = append(bars, element)
		}
		return nil
	})
	if err != nil {
		releaseUIAElements(bars)
		return nil, 0, 0, 0, err
	}
	if len(bars) > 1 {
		releaseUIAElements(bars)
		return nil, 0, 0, 0, accessibilityError(AccessibilityAmbiguousTarget, "menu_search", "scope contains more than one menu bar", nil)
	}
	if !state.complete {
		releaseUIAElements(bars)
		return nil, 0, 0, 0, accessibilityError(AccessibilitySearchIncomplete, "menu_search", "bounded search could not prove a unique menu bar", nil)
	}
	if len(bars) == 0 {
		return nil, 0, 0, 0, accessibilityError(AccessibilityTargetNotFound, "menu_search", "target has no materialized menu bar", nil)
	}
	rootWindow := uintptr(0)
	if scope.Window != nil {
		rootWindow = uintptr(scope.Window.Handle)
	} else if len(roots) == 1 {
		rootWindow, err = b.elementWindowHandle(roots[0], 0)
		if err != nil {
			bars[0].release()
			return nil, 0, 0, 0, err
		}
	}
	return bars[0], pid, processStart, rootWindow, nil
}

func (b *windowsAccessibilityBackend) MenuSnapshot(ctx context.Context, scope AccessibilityScope, limits AccessibilityLimits) (AccessibilityMenuData, error) {
	restore := b.useContext(ctx)
	defer restore()
	limits = windowsAccessibilityLimits(limits)
	bar, pid, _, _, err := b.menuBar(ctx, scope, limits)
	if err != nil {
		return AccessibilityMenuData{}, err
	}
	defer bar.release()
	state := newWindowsAccessibilityWalk(limits)
	root, err := b.snapshotElement(ctx, bar, pid, 0, state, false)
	if err != nil {
		return AccessibilityMenuData{}, err
	}
	items := []AccessibilityNode{}
	if root != nil {
		items = root.Children
	}
	return AccessibilityMenuData{
		Items: items, Complete: state.complete, Truncated: !state.complete,
		Reason: state.reason, Nodes: state.nodes, MaxDepth: state.maxDepth,
	}, nil
}

func (b *windowsAccessibilityBackend) directMenuMatches(ctx context.Context, parent *uiaElement, pid uint32, segment AccessibilityMenuSegment, limits AccessibilityLimits) ([]*uiaElement, bool, int, error) {
	matches := make([]*uiaElement, 0, 2)
	complete := true
	if err := b.beforeNative("menu_search", AccessibilityActionNotStarted); err != nil {
		return nil, false, 0, err
	}
	child, err := b.walker.firstChild(parent)
	if err != nil {
		return nil, false, 0, windowsAccessibilityNativeError("menu_search", err, AccessibilityActionNotStarted)
	}
	observed := 0
	for child != nil {
		if err := windowsAccessibilityContextError(ctx, "menu_search", AccessibilityActionNotStarted); err != nil {
			child.release()
			releaseUIAElements(matches)
			return nil, false, observed, err
		}
		observed++
		if observed > limits.MaxNodes {
			child.release()
			complete = false
			break
		}
		if err := b.beforeNative("menu_search", AccessibilityActionNotStarted); err != nil {
			child.release()
			releaseUIAElements(matches)
			return nil, false, observed, err
		}
		next, nextErr := b.walker.nextSibling(child)
		actualPID, pidErr := b.elementPID(child)
		if pidErr != nil {
			child.release()
			if next != nil {
				next.release()
			}
			releaseUIAElements(matches)
			return nil, false, observed, windowsAccessibilityNativeError("menu_search", pidErr, AccessibilityActionNotStarted)
		}
		if actualPID == pid {
			role, _, roleErr := b.elementRole(child)
			if roleErr != nil {
				child.release()
				if next != nil {
					next.release()
				}
				releaseUIAElements(matches)
				return nil, false, observed, windowsAccessibilityNativeError("menu_search", roleErr, AccessibilityActionNotStarted)
			}
			if role == "menuItem" || role == "menu" {
				matched, matchErr := b.selectorMatches(child, menuSegmentSelector(segment))
				if matchErr != nil {
					child.release()
					if next != nil {
						next.release()
					}
					releaseUIAElements(matches)
					return nil, false, observed, windowsAccessibilityNativeError("menu_search", matchErr, AccessibilityActionNotStarted)
				}
				if matched {
					child.addRef()
					matches = append(matches, child)
				}
			}
		}
		child.release()
		if nextErr != nil {
			if next != nil {
				next.release()
			}
			releaseUIAElements(matches)
			return nil, false, observed, windowsAccessibilityNativeError("menu_search", nextErr, AccessibilityActionNotStarted)
		}
		child = next
	}
	return matches, complete, observed, nil
}

type windowsAccessibilityPopupRoot struct {
	element   *uiaElement
	window    uintptr
	runtimeID []int32
}

func releaseWindowsAccessibilityPopupRoots(values []windowsAccessibilityPopupRoot) {
	for _, value := range values {
		if value.element != nil {
			value.element.release()
		}
	}
}

// Some Win32 providers expose an expanded #32768 menu as a new desktop UIA
// root rather than as a logical child of the menu item. This observer returns
// only roots whose live HWND owner chain contains the explicitly verified
// target window. PID, root-owner apex, title and geometry are never enough.
func (b *windowsAccessibilityBackend) observeOwnedPopupRoots(ctx context.Context, pid uint32, rootWindow uintptr, limits AccessibilityLimits) ([]windowsAccessibilityPopupRoot, bool, error) {
	if rootWindow == 0 {
		return nil, false, &AccessibilityError{Code: AccessibilityNotSupported, Phase: "menu_search", Message: "menu popup ownership cannot be verified without a root window", ActionState: AccessibilityActionNotStarted}
	}
	if err := b.beforeNative("menu_search", AccessibilityActionNotStarted); err != nil {
		return nil, false, err
	}
	desktop, err := b.client.rootElement()
	if err != nil {
		return nil, false, windowsAccessibilityNativeError("menu_search", err, AccessibilityActionNotStarted)
	}
	defer desktop.release()
	if err := b.beforeNative("menu_search", AccessibilityActionNotStarted); err != nil {
		return nil, false, err
	}
	child, err := b.walker.firstChild(desktop)
	if err != nil {
		return nil, false, windowsAccessibilityNativeError("menu_search", err, AccessibilityActionNotStarted)
	}
	roots := make([]windowsAccessibilityPopupRoot, 0, 2)
	complete := true
	observed := 0
	for child != nil {
		if observed >= limits.MaxNodes {
			child.release()
			complete = false
			break
		}
		if err := b.beforeNative("menu_search", AccessibilityActionNotStarted); err != nil {
			child.release()
			releaseWindowsAccessibilityPopupRoots(roots)
			return nil, false, err
		}
		next, nextErr := b.walker.nextSibling(child)
		observed++
		candidatePID, pidErr := b.elementPID(child)
		if pidErr != nil {
			child.release()
			if next != nil {
				next.release()
			}
			releaseWindowsAccessibilityPopupRoots(roots)
			return nil, false, windowsAccessibilityNativeError("menu_search", pidErr, AccessibilityActionNotStarted)
		}
		if candidatePID == pid {
			window, windowErr := b.elementWindowHandle(child, 0)
			if windowErr != nil {
				child.release()
				if next != nil {
					next.release()
				}
				releaseWindowsAccessibilityPopupRoots(roots)
				return nil, false, windowErr
			}
			if window == 0 {
				// A same-process desktop root without a verifiable HWND could be
				// the detached popup. Its omission cannot prove a zero result.
				complete = false
			} else if window != rootWindow && uiaWindowOwnedBy(window, rootWindow) {
				windowPID, valid := uiaWindowPID(window)
				if !valid || windowPID != pid {
					complete = false
				} else {
					if err := b.beforeNative("menu_search", AccessibilityActionNotStarted); err != nil {
						child.release()
						if next != nil {
							next.release()
						}
						releaseWindowsAccessibilityPopupRoots(roots)
						return nil, false, err
					}
					runtimeID, runtimeErr := child.runtimeID()
					if runtimeErr != nil || len(runtimeID) == 0 {
						complete = false
					} else {
						child.addRef()
						roots = append(roots, windowsAccessibilityPopupRoot{element: child, window: window, runtimeID: runtimeID})
					}
				}
			}
		}
		child.release()
		if nextErr != nil {
			if next != nil {
				next.release()
			}
			releaseWindowsAccessibilityPopupRoots(roots)
			return nil, false, windowsAccessibilityNativeError("menu_search", nextErr, AccessibilityActionNotStarted)
		}
		if !complete {
			if next != nil {
				next.release()
			}
			break
		}
		child = next
	}
	return roots, complete, nil
}

func popupBaseline(values []windowsAccessibilityPopupRoot) map[uintptr][]int32 {
	result := make(map[uintptr][]int32, len(values))
	for _, value := range values {
		result[value.window] = append([]int32(nil), value.runtimeID...)
	}
	return result
}

func popupChanged(value windowsAccessibilityPopupRoot, baseline map[uintptr][]int32) bool {
	previous, ok := baseline[value.window]
	return !ok || !sameRuntimeID(previous, value.runtimeID)
}

func (b *windowsAccessibilityBackend) popupMenuContainer(ctx context.Context, root windowsAccessibilityPopupRoot, pid uint32, limits AccessibilityLimits) (*uiaElement, int, error) {
	role, _, err := b.elementRole(root.element)
	if err != nil {
		return nil, 0, windowsAccessibilityNativeError("menu_search", err, AccessibilityActionNotStarted)
	}
	if role == "menu" {
		root.element.addRef()
		return root.element, 1, nil
	}
	if err := b.beforeNative("menu_search", AccessibilityActionNotStarted); err != nil {
		return nil, 0, err
	}
	child, err := b.walker.firstChild(root.element)
	if err != nil {
		return nil, 0, windowsAccessibilityNativeError("menu_search", err, AccessibilityActionNotStarted)
	}
	containers := make([]*uiaElement, 0, 2)
	observed := 1
	for child != nil {
		if observed >= limits.MaxNodes {
			child.release()
			releaseUIAElements(containers)
			return nil, observed, accessibilityError(AccessibilitySearchIncomplete, "menu_search", "popup container search reached maxNodes", nil)
		}
		if err := b.beforeNative("menu_search", AccessibilityActionNotStarted); err != nil {
			child.release()
			releaseUIAElements(containers)
			return nil, observed, err
		}
		next, nextErr := b.walker.nextSibling(child)
		observed++
		actualPID, pidErr := b.elementPID(child)
		if pidErr != nil {
			child.release()
			if next != nil {
				next.release()
			}
			releaseUIAElements(containers)
			return nil, observed, windowsAccessibilityNativeError("menu_search", pidErr, AccessibilityActionNotStarted)
		}
		if actualPID == pid {
			childRole, _, roleErr := b.elementRole(child)
			if roleErr != nil {
				child.release()
				if next != nil {
					next.release()
				}
				releaseUIAElements(containers)
				return nil, observed, windowsAccessibilityNativeError("menu_search", roleErr, AccessibilityActionNotStarted)
			}
			if childRole == "menu" {
				child.addRef()
				containers = append(containers, child)
			}
		}
		child.release()
		if nextErr != nil {
			if next != nil {
				next.release()
			}
			releaseUIAElements(containers)
			return nil, observed, windowsAccessibilityNativeError("menu_search", nextErr, AccessibilityActionNotStarted)
		}
		child = next
	}
	if len(containers) > 1 {
		releaseUIAElements(containers)
		return nil, observed, accessibilityError(AccessibilityAmbiguousTarget, "menu_search", "popup exposes more than one menu container", nil)
	}
	if len(containers) == 0 {
		return nil, observed, &AccessibilityError{Code: AccessibilityNotSupported, Phase: "menu_search", Message: "detached popup does not expose a direct menu container", ActionState: AccessibilityActionNotStarted}
	}
	return containers[0], observed, nil
}

func (b *windowsAccessibilityBackend) FindMenuChild(ctx context.Context, scope AccessibilityScope, parentHandle uint64, segment AccessibilityMenuSegment, limits AccessibilityLimits) (AccessibilityMenuMatch, error) {
	restore := b.useContext(ctx)
	defer restore()
	limits = windowsAccessibilityLimits(limits)
	var parent *uiaElement
	var pid uint32
	var processStart uint64
	var rootWindow uintptr
	var parentEntry *windowsAccessibilityHandle
	containerWindow := uintptr(0)
	if parentHandle == 0 {
		bar, resolvedPID, resolvedStart, resolvedWindow, err := b.menuBar(ctx, scope, limits)
		if err != nil {
			return AccessibilityMenuMatch{}, err
		}
		parent, pid, processStart, rootWindow = bar, resolvedPID, resolvedStart, resolvedWindow
		containerWindow = rootWindow
		defer parent.release()
	} else {
		entry, err := b.validatedHandle(ctx, parentHandle, false)
		if err != nil {
			return AccessibilityMenuMatch{}, err
		}
		parentEntry = entry
		parent, pid, processStart, rootWindow = entry.element, entry.pid, entry.processStart, entry.rootWindow
		containerWindow = entry.containerWindow
	}
	matches, complete, observed, err := b.directMenuMatches(ctx, parent, pid, segment, limits)
	if err != nil {
		return AccessibilityMenuMatch{}, err
	}
	if len(matches) == 0 && complete && parentEntry != nil {
		expanded, expandedErr := b.expandedState(parent)
		if expandedErr != nil {
			releaseUIAElements(matches)
			return AccessibilityMenuMatch{}, windowsAccessibilityNativeError("menu_search", expandedErr, AccessibilityActionNotStarted)
		}
		if expanded == nil {
			releaseUIAElements(matches)
			return AccessibilityMenuMatch{}, &AccessibilityError{Code: AccessibilityNotSupported, Phase: "menu_search", Message: "expanded menu popup ownership cannot be verified for this provider", ActionState: AccessibilityActionNotStarted}
		}
		if *expanded {
			if !parentEntry.expansionSubmitted || parentEntry.popupBaseline == nil {
				releaseUIAElements(matches)
				return AccessibilityMenuMatch{}, &AccessibilityError{Code: AccessibilityNotSupported, Phase: "menu_search", Message: "detached popup was not created by this managed menu expansion", ActionState: AccessibilityActionNotStarted}
			}
			remaining := limits
			remaining.MaxNodes -= observed
			if remaining.MaxNodes <= 0 {
				complete = false
			} else {
				popupRoots, popupComplete, popupErr := b.observeOwnedPopupRoots(ctx, pid, rootWindow, remaining)
				if popupErr != nil {
					releaseUIAElements(matches)
					return AccessibilityMenuMatch{}, popupErr
				}
				defer releaseWindowsAccessibilityPopupRoots(popupRoots)
				if !popupComplete {
					complete = false
				} else {
					fresh := make([]windowsAccessibilityPopupRoot, 0, 2)
					for _, popupRoot := range popupRoots {
						if popupChanged(popupRoot, parentEntry.popupBaseline) {
							fresh = append(fresh, popupRoot)
						}
					}
					if len(fresh) > 1 {
						releaseUIAElements(matches)
						return AccessibilityMenuMatch{}, accessibilityError(AccessibilityAmbiguousTarget, "menu_search", "managed expansion created more than one owned popup root", nil)
					}
					if len(fresh) == 1 {
						container, containerNodes, containerErr := b.popupMenuContainer(ctx, fresh[0], pid, remaining)
						if containerErr != nil {
							releaseUIAElements(matches)
							return AccessibilityMenuMatch{}, containerErr
						}
						remaining.MaxNodes -= containerNodes
						if remaining.MaxNodes <= 0 {
							container.release()
							complete = false
						} else {
							popupMatches, childrenComplete, _, childrenErr := b.directMenuMatches(ctx, container, pid, segment, remaining)
							container.release()
							if childrenErr != nil {
								releaseUIAElements(matches)
								return AccessibilityMenuMatch{}, childrenErr
							}
							matches = append(matches, popupMatches...)
							complete = childrenComplete
							containerWindow = fresh[0].window
						}
					}
				}
			}
		}
	}
	defer releaseUIAElements(matches)
	if len(matches) > 1 {
		return AccessibilityMenuMatch{}, accessibilityError(AccessibilityAmbiguousTarget, "menu_search", "menu segment matches more than one child", nil)
	}
	if !complete {
		return AccessibilityMenuMatch{}, accessibilityError(AccessibilitySearchIncomplete, "menu_search", "bounded menu search could not prove a unique child", nil)
	}
	if len(matches) == 0 {
		return AccessibilityMenuMatch{}, accessibilityError(AccessibilityTargetNotFound, "menu_search", "menu segment was not found in the current observation", nil)
	}
	verifiedContainer, err := b.menuElementContainerWindow(matches[0], pid, limits.MaxDepth+4)
	if err != nil {
		return AccessibilityMenuMatch{}, err
	}
	if containerWindow == 0 || verifiedContainer != containerWindow || !uiaWindowOwnedBy(verifiedContainer, rootWindow) {
		return AccessibilityMenuMatch{}, &AccessibilityError{Code: AccessibilityNotSupported, Phase: "menu_search", Message: "menu element cannot be bound to the verified window ownership chain", ActionState: AccessibilityActionNotStarted}
	}
	node, err := b.nodeFor(ctx, matches[0], false)
	if err != nil {
		return AccessibilityMenuMatch{}, err
	}
	handle, err := b.retainElement(matches[0], pid, processStart, rootWindow, containerWindow, true)
	if err != nil {
		return AccessibilityMenuMatch{}, err
	}
	b.handles[handle].menuLimits = limits
	return AccessibilityMenuMatch{Handle: handle, Node: node}, nil
}

func (b *windowsAccessibilityBackend) ExpandMenu(ctx context.Context, handle uint64) (AccessibilityActionData, error) {
	restore := b.useContext(ctx)
	defer restore()
	entry, err := b.validatedHandle(ctx, handle, true)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	role, _, err := b.elementRole(entry.element)
	if err != nil {
		return AccessibilityActionData{}, windowsAccessibilityNativeError("menu_expand", err, AccessibilityActionNotStarted)
	}
	if role != "menuItem" && role != "menu" {
		return AccessibilityActionData{}, &AccessibilityError{Code: AccessibilityActionUnsupported, Phase: "menu_expand", Message: "element is not a menu container", ActionState: AccessibilityActionNotStarted}
	}
	limits := windowsAccessibilityLimits(entry.menuLimits)
	popupRoots, complete, err := b.observeOwnedPopupRoots(ctx, entry.pid, entry.rootWindow, limits)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	entry.popupBaseline = popupBaseline(popupRoots)
	releaseWindowsAccessibilityPopupRoots(popupRoots)
	entry.expansionSubmitted = false
	if !complete {
		entry.popupBaseline = nil
		return AccessibilityActionData{}, &AccessibilityError{Code: AccessibilitySearchIncomplete, Phase: "menu_expand", Message: "could not establish a complete pre-expansion popup baseline", ActionState: AccessibilityActionNotStarted}
	}
	result, err := b.Perform(ctx, handle, AccessibilityAction{Action: "expand"})
	if err != nil {
		var typed *AccessibilityError
		if errors.As(err, &typed) {
			copy := *typed
			copy.Phase = "menu_expand"
			return AccessibilityActionData{}, &copy
		}
		return AccessibilityActionData{}, err
	}
	entry.expansionSubmitted = result.State == AccessibilityActionAcknowledged
	return result, nil
}
