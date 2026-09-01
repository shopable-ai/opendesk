package automation

import (
	"context"
	"errors"
	"fmt"
	"html"
	"math"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"opendesk/pkg/customui"

	"github.com/dop251/goja"
)

// Dialog is intentionally host-owned. JavaScript supplies only this bounded
// declaration; it cannot provide HTML, CSS, URLs, scripts, a host path, or a
// native window configuration.
const (
	dialogMaxTitleRunes       = 200
	dialogMaxMessageRunes     = 4096
	dialogMaxButtonRunes      = 60
	dialogDefaultInputRunes   = 4096
	dialogHardMaxInputRunes   = 16384
	dialogMaxPlaceholderRunes = 512
	dialogCloseTimeout        = 3 * time.Second
)

type dialogKind string

const (
	dialogAlert   dialogKind = "alert"
	dialogConfirm dialogKind = "confirm"
	dialogPrompt  dialogKind = "prompt"
)

type dialogLevel string

const (
	dialogInfo    dialogLevel = "info"
	dialogSuccess dialogLevel = "success"
	dialogWarning dialogLevel = "warning"
	dialogError   dialogLevel = "error"
)

// DialogError is deliberately separate from customui.Error. The public Dialog
// contract never leaks a WindowSpec, a host path, HTML, message text, default
// values, or prompt input through diagnostics.
type DialogError struct {
	Code       string
	Operation  string
	DialogID   string
	Capability string
	Message    string
}

func (e *DialogError) Error() string {
	if e == nil {
		return ""
	}
	message := e.Message
	if message == "" {
		message = e.Code
	}
	if e.Code != "" {
		message = e.Code + ": " + message
	}
	if e.Operation != "" {
		message = e.Operation + ": " + message
	}
	return message
}

type dialogOptions struct {
	Title         string
	Message       string
	Level         dialogLevel
	OKText        string
	ConfirmText   string
	CancelText    string
	DefaultAction string
	DefaultValue  string
	Placeholder   string
	Secure        bool
	MaxLength     int
}

type dialogResult struct {
	value any
	void  bool
}

type dialogCompletion struct {
	result dialogResult
	err    error
}

type activeDialog struct {
	id      string
	kind    dialogKind
	options dialogOptions

	mu     sync.RWMutex
	window *customui.Window

	completion chan dialogCompletion
	settleOnce sync.Once
	actioning  atomic.Bool
}

func (d *activeDialog) setWindow(window *customui.Window) {
	d.mu.Lock()
	d.window = window
	d.mu.Unlock()
}

func (d *activeDialog) getWindow() *customui.Window {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.window
}

func (d *activeDialog) settle(completion dialogCompletion) {
	d.settleOnce.Do(func() { d.completion <- completion })
}

// DialogRuntime owns one modal dialog for one JavaScript execution. The
// existing CustomUIRuntime owns every asynchronous worker and all Goja access;
// this type only exchanges plain Go data with it.
type DialogRuntime struct {
	runtime *goja.Runtime // EventLoop owner only
	ui      *CustomUIRuntime

	active      *activeDialog // EventLoop owner only
	nextID      uint64        // EventLoop owner only
	unsubscribe func()        // EventLoop owner only
	activation  customui.ActivationSource
	enabled     bool
}

func registerDialog(runtime *goja.Runtime, ui *CustomUIRuntime, opts InitJSOptions) error {
	bridge := &DialogRuntime{
		runtime:    runtime,
		ui:         ui,
		enabled:    ui != nil,
		activation: normalizeCustomUIActivationSource(opts.CustomUIActivationSource, ui != nil),
	}
	return runtime.Set("Dialog", bridge.jsObject())
}

func (d *DialogRuntime) jsObject() map[string]any {
	return map[string]any{
		"alert": func(call goja.FunctionCall) goja.Value {
			return d.invoke(dialogAlert, call.Argument(0))
		},
		"confirm": func(call goja.FunctionCall) goja.Value {
			return d.invoke(dialogConfirm, call.Argument(0))
		},
		"prompt": func(call goja.FunctionCall) goja.Value {
			return d.invoke(dialogPrompt, call.Argument(0))
		},
		"getCapabilities": func() any { return d.capabilities() },
	}
}

func (d *DialogRuntime) capabilities() map[string]any {
	if !d.enabled || d.ui == nil {
		return map[string]any{
			"enabled": false, "available": false, "activationSource": "disabled",
			"platform": runtime.GOOS, "driver": "none", "maxConcurrent": 1,
			"alert": false, "confirm": false, "prompt": false, "securePrompt": false,
			"reason": "Dialog requires the explicitly authorized ui capability",
		}
	}
	capabilities := d.ui.driver.Capabilities(d.ui.context)
	return map[string]any{
		"enabled": true, "available": capabilities.Available,
		"activationSource": string(d.activation), "platform": capabilities.Platform,
		"driver": capabilities.Driver, "maxConcurrent": 1,
		"alert": capabilities.Available, "confirm": capabilities.Available,
		"prompt": capabilities.Available, "securePrompt": capabilities.Available,
		"reason": capabilities.Reason,
	}
}

func (d *DialogRuntime) invoke(kind dialogKind, value goja.Value) goja.Value {
	operation := "Dialog." + string(kind)
	if !d.enabled || d.ui == nil {
		return d.rejected(operation, "", "DIALOG_DISABLED", "Dialog requires the explicitly authorized ui capability")
	}
	if d.active != nil {
		return d.rejected(operation, "", "DIALOG_BUSY", "only one modal dialog may be active in an execution")
	}
	options, err := parseDialogOptions(d.runtime, kind, value)
	if err != nil {
		return d.rejected(operation, "", "DIALOG_INVALID_OPTIONS", err.Error())
	}
	d.nextID++
	active := &activeDialog{
		id: "dialog-" + fmt.Sprint(d.nextID), kind: kind, options: options,
		completion: make(chan dialogCompletion, 1),
	}
	d.active = active
	callback := d.runtime.ToValue(func(call goja.FunctionCall) goja.Value {
		d.handleEvent(active, call.Argument(0))
		return goja.Undefined()
	})
	// The listener is host-owned and never invokes user JavaScript. It is still
	// routed through CustomUIRuntime's bounded event queue and owner EventLoop.
	off := d.ui.addListener(active.id, "", "*", callback)
	d.unsubscribe = func() {
		if callable, ok := goja.AssertFunction(off); ok {
			_, _ = callable(goja.Undefined())
		}
	}
	return d.ui.startAsyncUntilObserved(operation, func(ctx context.Context) (any, error) {
		return d.runDialog(ctx, active)
	}, func(value any) goja.Value {
		result := value.(dialogResult)
		if result.void {
			return goja.Undefined()
		}
		return d.runtime.ToValue(result.value)
	}, func(error) {
		if d.unsubscribe != nil {
			d.unsubscribe()
			d.unsubscribe = nil
		}
		if d.active == active {
			d.active = nil
		}
	})
}

func (d *DialogRuntime) rejected(operation, dialogID, code, message string) goja.Value {
	promise, _, reject := d.runtime.NewPromise()
	_ = reject(dialogJSError(d.runtime, &DialogError{
		Code: code, Operation: operation, DialogID: dialogID, Capability: "ui", Message: message,
	}))
	return d.runtime.ToValue(promise)
}

func (d *DialogRuntime) runDialog(ctx context.Context, active *activeDialog) (dialogResult, error) {
	window, err := d.ui.session.Create(ctx, buildDialogWindowSpec(active))
	if err != nil {
		return dialogResult{}, mapDialogError(err, "Dialog."+string(active.kind), active.id)
	}
	active.setWindow(window)
	if _, err := window.Show(ctx); err != nil {
		_ = closeDialogWindow(window)
		return dialogResult{}, mapDialogError(err, "Dialog."+string(active.kind), active.id)
	}

	// A native host can disappear after show without sending a close event.
	// Probe its state at a bounded cadence so the Promise rejects rather than
	// hanging indefinitely; this only handles Go values on a worker goroutine.
	probe := time.NewTicker(200 * time.Millisecond)
	defer probe.Stop()
	for {
		select {
		case completion := <-active.completion:
			if completion.err != nil {
				return dialogResult{}, mapDialogError(completion.err, "Dialog."+string(active.kind), active.id)
			}
			return completion.result, nil
		case <-ctx.Done():
			_ = closeDialogWindow(window)
			return dialogResult{}, dialogContextError(ctx, "Dialog."+string(active.kind), active.id)
		case <-probe.C:
			if _, err := window.State(ctx); err != nil {
				_ = closeDialogWindow(window)
				return dialogResult{}, mapDialogError(err, "Dialog."+string(active.kind), active.id)
			}
		}
	}
}

func (d *DialogRuntime) handleEvent(active *activeDialog, value goja.Value) {
	if d.active != active {
		return
	}
	var event customui.Event
	if err := exportCustomUIValue(value, &event); err != nil || event.WindowID != active.id {
		return
	}
	if event.Type == "close" {
		// A programmatic close follows a selected action. A user close or Esc
		// reaches here with no action in flight and has the documented fallback.
		if !active.actioning.Load() {
			active.settle(dialogCompletion{result: dialogDismissResult(active.kind)})
		}
		return
	}
	if event.Type != "click" || active.actioning.Load() {
		return
	}
	action := ""
	switch event.TargetID {
	case dialogConfirmControlID:
		action = "confirm"
	case dialogCancelControlID:
		action = "cancel"
	}
	if action == "" || !active.actioning.CompareAndSwap(false, true) {
		return
	}
	go d.commitAction(active, action)
}

func (d *DialogRuntime) commitAction(active *activeDialog, action string) {
	window := active.getWindow()
	if window == nil {
		active.settle(dialogCompletion{err: &DialogError{Code: "DIALOG_HOST_FAILURE", Message: "native dialog window was not created"}})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), dialogCloseTimeout)
	defer cancel()
	result := dialogDismissResult(active.kind)
	if action == "confirm" {
		result = dialogConfirmResult(active.kind)
		if active.kind == dialogPrompt {
			state, err := window.ControlState(ctx, dialogInputControlID)
			if err != nil {
				active.settle(dialogCompletion{err: err})
				return
			}
			text, ok := state.Value.(string)
			if !ok {
				active.settle(dialogCompletion{err: &DialogError{Code: "DIALOG_HOST_FAILURE", Message: "native prompt returned a non-string value"}})
				return
			}
			if utf8.RuneCountInString(text) > active.options.MaxLength {
				active.settle(dialogCompletion{err: &DialogError{Code: "DIALOG_HOST_FAILURE", Message: "native prompt exceeded its configured length"}})
				return
			}
			result = dialogResult{value: text}
		}
	}
	if _, err := window.Close(ctx); err != nil {
		active.settle(dialogCompletion{err: err})
		return
	}
	active.settle(dialogCompletion{result: result})
}

func closeDialogWindow(window *customui.Window) error {
	if window == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), dialogCloseTimeout)
	defer cancel()
	_, err := window.Close(ctx)
	return err
}

func dialogDismissResult(kind dialogKind) dialogResult {
	switch kind {
	case dialogAlert:
		// Alert treats the titlebar close and Esc as acknowledgement. It has one
		// action and Promise<void>, so there is no cancellation value to expose.
		return dialogResult{void: true}
	case dialogConfirm:
		return dialogResult{value: false}
	default:
		return dialogResult{value: nil}
	}
}

func dialogConfirmResult(kind dialogKind) dialogResult {
	switch kind {
	case dialogAlert:
		return dialogResult{void: true}
	case dialogConfirm:
		return dialogResult{value: true}
	default:
		return dialogResult{value: nil}
	}
}

func dialogContextError(ctx context.Context, operation, dialogID string) error {
	code := "DIALOG_CANCELED"
	message := "dialog was canceled"
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		code = "DIALOG_TIMEOUT"
		message = "dialog timed out"
	}
	return &DialogError{Code: code, Operation: operation, DialogID: dialogID, Capability: "ui", Message: message}
}

func mapDialogError(err error, operation, dialogID string) error {
	if err == nil {
		return nil
	}
	var existing *DialogError
	if errors.As(err, &existing) {
		copy := *existing
		if copy.Operation == "" {
			copy.Operation = operation
		}
		if copy.DialogID == "" {
			copy.DialogID = dialogID
		}
		if copy.Capability == "" {
			copy.Capability = "ui"
		}
		return &copy
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return &DialogError{Code: "DIALOG_TIMEOUT", Operation: operation, DialogID: dialogID, Capability: "ui", Message: "dialog timed out"}
	}
	if errors.Is(err, context.Canceled) {
		return &DialogError{Code: "DIALOG_CANCELED", Operation: operation, DialogID: dialogID, Capability: "ui", Message: "dialog was canceled"}
	}
	code := "DIALOG_HOST_FAILURE"
	message := "native dialog host failed"
	var uiErr *customui.Error
	if errors.As(err, &uiErr) {
		switch uiErr.Code {
		case customui.CodeDisabled:
			code, message = "DIALOG_DISABLED", "Dialog requires the explicitly authorized ui capability"
		case customui.CodeBusy:
			code, message = "DIALOG_BUSY", "native dialog host is busy"
		case customui.CodeHostNotFound:
			code, message = "DIALOG_HOST_NOT_FOUND", "native dialog host was not found"
		case customui.CodeUnsupportedPlatform:
			code, message = "DIALOG_UNSUPPORTED_PLATFORM", "Dialog is not supported on this platform"
		case customui.CodeCanceled:
			code, message = "DIALOG_CANCELED", "dialog was canceled"
		}
	}
	return &DialogError{Code: code, Operation: operation, DialogID: dialogID, Capability: "ui", Message: message}
}

func dialogJSError(runtime *goja.Runtime, err *DialogError) *goja.Object {
	object := runtime.NewGoError(err)
	_ = object.Set("code", err.Code)
	_ = object.Set("operation", err.Operation)
	_ = object.Set("dialogId", err.DialogID)
	_ = object.Set("capability", err.Capability)
	return object
}

func parseDialogOptions(runtime *goja.Runtime, kind dialogKind, value goja.Value) (dialogOptions, error) {
	defaults := dialogOptions{Title: "OpenDesk", Level: dialogInfo, OKText: "OK", ConfirmText: "OK", CancelText: "Cancel", DefaultAction: "confirm", MaxLength: dialogDefaultInputRunes}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return dialogOptions{}, fmt.Errorf("message must be a non-empty string")
	}
	if text, ok := value.Export().(string); ok {
		defaults.Message = text
		return validateDialogOptions(kind, defaults)
	}
	object := value.ToObject(runtime)
	if object == nil || object.ClassName() == "Array" {
		return dialogOptions{}, fmt.Errorf("Dialog expects a string or an options object")
	}
	objectPrototype := runtime.Get("Object").ToObject(runtime).Get("prototype").ToObject(runtime)
	if prototype := object.Prototype(); prototype != nil && prototype != objectPrototype {
		return dialogOptions{}, fmt.Errorf("Dialog options must be a plain object")
	}
	allowed := map[string]bool{"title": true, "message": true, "level": true, "okText": kind == dialogAlert, "confirmText": kind != dialogAlert, "cancelText": kind != dialogAlert, "defaultAction": kind != dialogAlert, "defaultValue": kind == dialogPrompt, "placeholder": kind == dialogPrompt, "secure": kind == dialogPrompt, "maxLength": kind == dialogPrompt}
	keys := object.Keys()
	sort.Strings(keys)
	provided := make(map[string]bool, len(keys))
	for _, key := range keys {
		if !allowed[key] {
			return dialogOptions{}, fmt.Errorf("unknown Dialog option %q", key)
		}
		provided[key] = true
	}
	readString := func(name string, target *string) error {
		if !provided[name] {
			return nil
		}
		field := object.Get(name)
		if field == nil || goja.IsUndefined(field) {
			return nil
		}
		text, ok := field.Export().(string)
		if !ok {
			return fmt.Errorf("%s must be a string", name)
		}
		*target = text
		return nil
	}
	for _, field := range []struct {
		name   string
		target *string
	}{
		{"title", &defaults.Title}, {"message", &defaults.Message}, {"level", (*string)(&defaults.Level)},
		{"okText", &defaults.OKText}, {"confirmText", &defaults.ConfirmText}, {"cancelText", &defaults.CancelText},
		{"defaultAction", &defaults.DefaultAction}, {"defaultValue", &defaults.DefaultValue}, {"placeholder", &defaults.Placeholder},
	} {
		if err := readString(field.name, field.target); err != nil {
			return dialogOptions{}, err
		}
	}
	if field := object.Get("secure"); provided["secure"] && field != nil && !goja.IsUndefined(field) {
		secure, ok := field.Export().(bool)
		if !ok {
			return dialogOptions{}, fmt.Errorf("secure must be a boolean")
		}
		defaults.Secure = secure
	}
	if field := object.Get("maxLength"); provided["maxLength"] && field != nil && !goja.IsUndefined(field) {
		var number float64
		switch raw := field.Export().(type) {
		case int:
			number = float64(raw)
		case int64:
			number = float64(raw)
		case float64:
			number = raw
		default:
			return dialogOptions{}, fmt.Errorf("maxLength must be a finite integer")
		}
		if math.IsNaN(number) || math.IsInf(number, 0) || number != math.Trunc(number) || number > float64(math.MaxInt) || number < float64(math.MinInt) {
			return dialogOptions{}, fmt.Errorf("maxLength must be a finite integer")
		}
		defaults.MaxLength = int(number)
	}
	return validateDialogOptions(kind, defaults)
}

func validateDialogOptions(kind dialogKind, options dialogOptions) (dialogOptions, error) {
	if strings.TrimSpace(options.Message) == "" {
		return dialogOptions{}, fmt.Errorf("message must be a non-empty string")
	}
	if err := dialogStringLimit("title", options.Title, dialogMaxTitleRunes, false); err != nil {
		return dialogOptions{}, err
	}
	if err := dialogStringLimit("message", options.Message, dialogMaxMessageRunes, true); err != nil {
		return dialogOptions{}, err
	}
	switch options.Level {
	case dialogInfo, dialogSuccess, dialogWarning, dialogError:
	default:
		return dialogOptions{}, fmt.Errorf("level must be info, success, warning, or error")
	}
	if kind == dialogAlert {
		if err := dialogStringLimit("okText", options.OKText, dialogMaxButtonRunes, true); err != nil {
			return dialogOptions{}, err
		}
		return options, nil
	}
	if err := dialogStringLimit("confirmText", options.ConfirmText, dialogMaxButtonRunes, true); err != nil {
		return dialogOptions{}, err
	}
	if err := dialogStringLimit("cancelText", options.CancelText, dialogMaxButtonRunes, true); err != nil {
		return dialogOptions{}, err
	}
	if options.DefaultAction != "confirm" && options.DefaultAction != "cancel" {
		return dialogOptions{}, fmt.Errorf("defaultAction must be confirm or cancel")
	}
	if kind != dialogPrompt {
		return options, nil
	}
	if options.MaxLength <= 0 || options.MaxLength > dialogHardMaxInputRunes {
		return dialogOptions{}, fmt.Errorf("maxLength must be between 1 and %d", dialogHardMaxInputRunes)
	}
	if err := dialogStringLimit("defaultValue", options.DefaultValue, options.MaxLength, false); err != nil {
		return dialogOptions{}, err
	}
	if err := dialogStringLimit("placeholder", options.Placeholder, dialogMaxPlaceholderRunes, false); err != nil {
		return dialogOptions{}, err
	}
	return options, nil
}

func dialogStringLimit(name, value string, maximum int, required bool) error {
	if required && strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s must not be empty", name)
	}
	if utf8.RuneCountInString(value) > maximum {
		return fmt.Errorf("%s must contain at most %d characters", name, maximum)
	}
	return nil
}

const (
	dialogConfirmControlID = "dialogConfirm"
	dialogCancelControlID  = "dialogCancel"
	dialogInputControlID   = "dialogInput"
	dialogWindowWidth      = 440.0
	// The outer native frame includes the AppKit titlebar. These reviewed
	// heights leave only the explicit 16px action padding plus a small flex
	// remainder between content and the right-aligned button row.
	dialogActionWindowHeight = 146.0
	dialogPromptWindowHeight = 184.0
)

func buildDialogWindowSpec(active *activeDialog) customui.WindowSpec {
	options := active.options
	// These dimensions deliberately include the native titlebar. They leave a
	// compact, balanced content area rather than relying on a large empty panel.
	// The native host centers the completed frame on the active display.
	width, height := dialogWindowWidth, dialogActionWindowHeight
	if active.kind == dialogPrompt {
		height = dialogPromptWindowHeight
	}
	return customui.WindowSpec{
		ID: active.id, Kind: "normal", Title: options.Title,
		// The native host centers this host-owned window on the display containing
		// the current pointer at creation time. This avoids relying on a stale
		// screen snapshot when displays or Spaces change underneath an execution.
		Bounds:                customui.Bounds{Width: width, Height: height},
		CenterOnActiveDisplay: true,
		// Controls stay unset here. customui.Normalize derives them from this
		// fixed host-owned HTML template, rejecting any caller-supplied list.
		// The resulting buttons are therefore both AXPress-visible and bounded
		// to the Dialog action IDs handled below.
		Content: customui.ContentSpec{HTML: dialogHTML(active.kind, options), CSS: dialogCSS()},
	}
}

func dialogHTML(kind dialogKind, options dialogOptions) string {
	escape := html.EscapeString
	icon := map[dialogLevel]string{dialogInfo: "ℹ︎", dialogSuccess: "✓", dialogWarning: "⚠", dialogError: "!"}[options.Level]
	var input, buttons string
	if kind == dialogPrompt {
		inputType := "text"
		if options.Secure {
			inputType = "password"
		}
		// The message is already visible immediately above the field. Keeping the
		// same text as a second visual label wastes scarce dialog space, so retain
		// that association through aria-label instead.
		input = fmt.Sprintf(`<input id="%s" class="dialog-input" type="%s" value="%s" placeholder="%s" maxlength="%d" aria-label="%s" data-opendesk-dialog-private-input data-opendesk-dialog-focus>`, dialogInputControlID, inputType, escape(options.DefaultValue), escape(options.Placeholder), options.MaxLength, escape(options.Message))
	}
	if kind == dialogAlert {
		buttons = fmt.Sprintf(`<button id="%s" data-opendesk-dialog-default>%s</button>`, dialogConfirmControlID, escape(options.OKText))
	} else {
		confirmAttributes, cancelAttributes := "", ""
		if options.DefaultAction == "confirm" {
			confirmAttributes = " data-opendesk-dialog-default"
		} else {
			cancelAttributes = " data-opendesk-dialog-default"
		}
		buttons = fmt.Sprintf(`<button id="%s" data-opendesk-dialog-cancel%s>%s</button><button id="%s"%s>%s</button>`, dialogCancelControlID, cancelAttributes, escape(options.CancelText), dialogConfirmControlID, confirmAttributes, escape(options.ConfirmText))
	}
	return fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>%s</title></head><body><main id="dialogRoot" class="dialog dialog-%s"><div id="dialogIcon" class="dialog-icon" aria-hidden="true">%s</div><div class="dialog-content"><p id="dialogMessage" class="dialog-message">%s</p>%s<div id="dialogButtons" class="dialog-buttons">%s</div></div></main></body></html>`, escape(options.Title), kind, icon, escape(options.Message), input, buttons)
}

func dialogCSS() string {
	return `html,body{width:100%;height:100%;margin:0;overflow:hidden;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1d1d1f;background:#fff}.dialog{box-sizing:border-box;display:grid;grid-template-columns:30px minmax(0,1fr);column-gap:14px;width:100%;height:100%;padding:20px 22px 18px;line-height:1.42}.dialog-icon{display:flex;align-items:center;justify-content:center;width:30px;height:30px;margin-top:-4px;border-radius:15px;background:#e8f1ff;color:#007aff;font-size:18px;font-weight:600}.dialog-warning .dialog-icon{background:#fff2d8;color:#a15c00}.dialog-error .dialog-icon{background:#ffe8e7;color:#d70015}.dialog-success .dialog-icon{background:#e4f7e8;color:#16803c}.dialog-content{display:flex;min-width:0;min-height:0;flex-direction:column}.dialog-message{min-height:0;margin:1px 0 0;color:#1d1d1f;white-space:pre-wrap;overflow:auto;overflow-wrap:anywhere}.dialog-input{box-sizing:border-box;flex:0 0 auto;width:100%;height:30px;margin-top:14px;padding:5px 8px;border:1px solid #8e8e93;border-radius:5px;outline:none;background:#fff;color:#1d1d1f;font:inherit}.dialog-input::placeholder{color:#86868b}.dialog-input:focus{border-color:#007aff;box-shadow:0 0 0 3px rgba(0,122,255,.22)}.dialog-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:auto;padding-top:16px}.dialog-buttons button{min-width:80px;height:30px;padding:0 14px;border:1px solid rgba(0,0,0,.12);border-radius:6px;background:#f5f5f7;color:#1d1d1f;font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.dialog-buttons button:hover{background:#ebebed}.dialog-buttons button:focus-visible{outline:3px solid rgba(0,122,255,.28);outline-offset:2px}.dialog-buttons button#dialogConfirm{border-color:#007aff;background:#007aff;color:#fff}.dialog-buttons button#dialogConfirm:hover{background:#0071e3}`
}
