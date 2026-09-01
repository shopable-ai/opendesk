package automation

import (
	"context"
	"errors"
	"math"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
)

const (
	defaultNotificationWaitTimeout  = 30 * time.Second
	defaultNotificationPollInterval = 200 * time.Millisecond
)

type NotificationInteractionErrorCode string

const (
	NotificationInvalidArgument NotificationInteractionErrorCode = "INVALID_ARGUMENT"
	NotificationNotSupported    NotificationInteractionErrorCode = "NOT_SUPPORTED"
	NotificationNotFound        NotificationInteractionErrorCode = "NOT_FOUND"
	NotificationTimeout         NotificationInteractionErrorCode = "TIMEOUT"
	NotificationCanceled        NotificationInteractionErrorCode = "CANCELED"
	NotificationBackendFailed   NotificationInteractionErrorCode = "BACKEND_FAILED"
)

type NotificationInteractionError struct {
	Code      NotificationInteractionErrorCode
	Operation string
	Message   string
	Cause     error
}

func (e *NotificationInteractionError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" {
		message = "notification interaction failed"
	}
	return string(e.Code) + ": " + message
}

func (e *NotificationInteractionError) Unwrap() error { return e.Cause }

type NotificationOperationCapability struct {
	Supported bool   `json:"supported"`
	Verified  bool   `json:"verified"`
	Notes     string `json:"notes,omitempty"`
}

type NotificationInteractionCapabilities struct {
	SchemaVersion int                             `json:"schemaVersion"`
	Platform      string                          `json:"platform"`
	Backend       string                          `json:"backend"`
	Scope         string                          `json:"scope"`
	List          NotificationOperationCapability `json:"list"`
	WaitFor       NotificationOperationCapability `json:"waitFor"`
	Dismiss       NotificationOperationCapability `json:"dismiss"`
	Activate      NotificationOperationCapability `json:"activate"`
	Events        NotificationOperationCapability `json:"events"`
}

// NotificationRecord is backend-only data. Content is retained long enough to
// apply an explicit match but is redacted from JavaScript unless the caller
// opts into includeContent.
type NotificationRecord struct {
	ID          string `json:"id"`
	AppID       string `json:"appId"`
	DeliveredAt string `json:"deliveredAt"`
	Title       string `json:"title"`
	Message     string `json:"message"`
}

type NotificationInteractionBackend interface {
	Capabilities() NotificationInteractionCapabilities
	List(context.Context) ([]NotificationRecord, error)
	Dismiss(context.Context, string) (bool, error)
}

type NotificationInteractionBackendFactory func() NotificationInteractionBackend

type notificationListOptions struct {
	includeContent bool
}

type notificationWaitOptions struct {
	notificationListOptions
	id              string
	title           string
	message         string
	includeExisting bool
	timeout         time.Duration
	pollInterval    time.Duration
	startedAt       time.Time
}

type pendingNotificationOperation struct {
	resolve func(interface{}) error
	reject  func(interface{}) error
	convert func(interface{}) goja.Value
}

// NotificationsRuntime owns execution-scoped wait workers and Promise
// callbacks. Native backends return Go data only and never access Goja.
type NotificationsRuntime struct {
	runtime *goja.Runtime
	loop    interface {
		RunOnLoop(func(*goja.Runtime)) bool
	}
	context context.Context
	cancel  context.CancelFunc
	backend NotificationInteractionBackend

	onAsyncError func(error)
	closing      atomic.Bool
	workers      atomic.Int64
	wg           sync.WaitGroup
	mu           sync.Mutex
	nextID       uint64
	pending      map[uint64]pendingNotificationOperation
}

func registerNotifications(runtimeValue *goja.Runtime, opts InitJSOptions) *NotificationsRuntime {
	var backend NotificationInteractionBackend
	if opts.NotificationInteractionBackendFactory != nil {
		backend = opts.NotificationInteractionBackendFactory()
	} else {
		backend = newDefaultNotificationInteractionBackend()
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	manager := &NotificationsRuntime{
		runtime: runtimeValue, context: ctx, cancel: cancel, backend: backend,
		onAsyncError: opts.OnAsyncError, pending: map[uint64]pendingNotificationOperation{},
	}
	if manager.backend == nil {
		manager.backend = newDefaultNotificationInteractionBackend()
	}
	if opts.EventLoop != nil {
		manager.loop = opts.EventLoop
	}

	object := runtimeValue.NewObject()
	_ = object.Set("list", func(call goja.FunctionCall) goja.Value { return manager.list(call) })
	_ = object.Set("waitFor", func(call goja.FunctionCall) goja.Value { return manager.waitFor(call) })
	_ = object.Set("dismiss", func(call goja.FunctionCall) goja.Value { return manager.dismiss(call) })
	_ = object.Set("getCapabilities", func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(projectNotificationCapabilities(manager.backend.Capabilities()))
	})
	_ = runtimeValue.Set("Notifications", object)
	return manager
}

func projectNotificationCapabilities(capabilities NotificationInteractionCapabilities) map[string]interface{} {
	operation := func(value NotificationOperationCapability) map[string]interface{} {
		return map[string]interface{}{"supported": value.Supported, "verified": value.Verified, "notes": value.Notes}
	}
	return map[string]interface{}{
		"schemaVersion": capabilities.SchemaVersion,
		"platform":      capabilities.Platform,
		"backend":       capabilities.Backend,
		"scope":         capabilities.Scope,
		"list":          operation(capabilities.List),
		"waitFor":       operation(capabilities.WaitFor),
		"dismiss":       operation(capabilities.Dismiss),
		"activate":      operation(capabilities.Activate),
		"events":        operation(capabilities.Events),
	}
}

func (n *NotificationsRuntime) list(call goja.FunctionCall) goja.Value {
	options, err := parseNotificationListOptions(call.Argument(0), "Notifications.list")
	if err != nil {
		return n.rejected(err)
	}
	if !n.backend.Capabilities().List.Supported {
		return n.rejected(notificationOperationError("Notifications.list", NotificationNotSupported, "listing notifications is unavailable on this platform/backend", nil))
	}
	return n.startAsync("Notifications.list", func(ctx context.Context) (interface{}, error) {
		return n.backend.List(ctx)
	}, func(value interface{}) goja.Value {
		return n.runtime.ToValue(projectNotifications(value.([]NotificationRecord), options.includeContent))
	})
}

func (n *NotificationsRuntime) waitFor(call goja.FunctionCall) goja.Value {
	options, err := parseNotificationWaitOptions(call.Argument(0))
	if err != nil {
		return n.rejected(err)
	}
	if !n.backend.Capabilities().WaitFor.Supported {
		return n.rejected(notificationOperationError("Notifications.waitFor", NotificationNotSupported, "waiting for notifications is unavailable on this platform/backend", nil))
	}
	options.startedAt = time.Now()
	return n.startAsync("Notifications.waitFor", func(parent context.Context) (interface{}, error) {
		ctx, cancel := context.WithTimeout(parent, options.timeout)
		defer cancel()

		baseline := map[string]bool{}
		if !options.includeExisting {
			existing, err := n.backend.List(ctx)
			if err != nil {
				return nil, err
			}
			for _, record := range existing {
				baseline[record.ID] = true
			}
		}

		ticker := time.NewTicker(options.pollInterval)
		defer ticker.Stop()
		for {
			records, err := n.backend.List(ctx)
			if err != nil {
				return nil, err
			}
			if match, ok := findNotificationMatch(records, baseline, options); ok {
				return match, nil
			}
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-ticker.C:
			}
		}
	}, func(value interface{}) goja.Value {
		return n.runtime.ToValue(projectNotification(value.(NotificationRecord), options.includeContent))
	})
}

func (n *NotificationsRuntime) dismiss(call goja.FunctionCall) goja.Value {
	id, err := parseNotificationTarget(call.Argument(0))
	if err != nil {
		return n.rejected(err)
	}
	if !n.backend.Capabilities().Dismiss.Supported {
		return n.rejected(notificationOperationError("Notifications.dismiss", NotificationNotSupported, "dismissing notifications is unavailable on this platform/backend", nil))
	}
	return n.startAsync("Notifications.dismiss", func(ctx context.Context) (interface{}, error) {
		dismissed, err := n.backend.Dismiss(ctx, id)
		if err != nil {
			return nil, err
		}
		if !dismissed {
			return nil, notificationOperationError("", NotificationNotFound, "notification is no longer present", nil)
		}
		return map[string]interface{}{"id": id, "dismissed": true}, nil
	}, nil)
}

func findNotificationMatch(records []NotificationRecord, baseline map[string]bool, options notificationWaitOptions) (NotificationRecord, bool) {
	sortNotificationRecords(records)
	for _, record := range records {
		if baseline[record.ID] && !notificationDeliveredAfter(record, options.startedAt) {
			continue
		}
		if options.id != "" && record.ID != options.id {
			continue
		}
		if options.title != "" && record.Title != options.title {
			continue
		}
		if options.message != "" && record.Message != options.message {
			continue
		}
		return record, true
	}
	return NotificationRecord{}, false
}

func notificationDeliveredAfter(record NotificationRecord, startedAt time.Time) bool {
	if startedAt.IsZero() {
		return false
	}
	deliveredAt, err := time.Parse(time.RFC3339Nano, record.DeliveredAt)
	return err == nil && !deliveredAt.Before(startedAt)
}

func projectNotifications(records []NotificationRecord, includeContent bool) []map[string]interface{} {
	sortNotificationRecords(records)
	result := make([]map[string]interface{}, 0, len(records))
	for _, record := range records {
		result = append(result, projectNotification(record, includeContent))
	}
	return result
}

func projectNotification(record NotificationRecord, includeContent bool) map[string]interface{} {
	result := map[string]interface{}{
		"schemaVersion": 1,
		"id":            record.ID, "appId": record.AppID, "deliveredAt": record.DeliveredAt,
		"contentRedacted": !includeContent,
	}
	if includeContent {
		result["title"] = record.Title
		result["message"] = record.Message
	}
	return result
}

func sortNotificationRecords(records []NotificationRecord) {
	sort.SliceStable(records, func(i, j int) bool {
		if records[i].DeliveredAt != records[j].DeliveredAt {
			return records[i].DeliveredAt > records[j].DeliveredAt
		}
		return records[i].ID < records[j].ID
	})
}

func parseNotificationListOptions(value goja.Value, operation string) (notificationListOptions, error) {
	result := notificationListOptions{}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, notificationOperationError(operation, NotificationInvalidArgument, "options must be an object", nil)
	}
	for key, raw := range options {
		if key != "includeContent" {
			return result, notificationOperationError(operation, NotificationInvalidArgument, "options contains an unknown field", nil)
		}
		include, valid := raw.(bool)
		if !valid {
			return result, notificationOperationError(operation, NotificationInvalidArgument, "includeContent must be a boolean", nil)
		}
		result.includeContent = include
	}
	return result, nil
}

func parseNotificationWaitOptions(value goja.Value) (notificationWaitOptions, error) {
	result := notificationWaitOptions{timeout: defaultNotificationWaitTimeout, pollInterval: defaultNotificationPollInterval}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, "options must be an object", nil)
	}
	for key, raw := range options {
		switch key {
		case "id", "title", "message":
			text, valid := raw.(string)
			if !valid || strings.TrimSpace(text) == "" {
				return result, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, key+" must be a non-empty string", nil)
			}
			if err := validateNotificationText(key, text); err != nil {
				return result, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, err.Error(), err)
			}
			switch key {
			case "id":
				result.id = text
			case "title":
				result.title = text
			case "message":
				result.message = text
			}
		case "includeContent", "includeExisting":
			boolean, valid := raw.(bool)
			if !valid {
				return result, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, key+" must be a boolean", nil)
			}
			if key == "includeContent" {
				result.includeContent = boolean
			} else {
				result.includeExisting = boolean
			}
		case "timeout", "pollInterval":
			milliseconds, err := notificationMilliseconds(raw, key)
			if err != nil {
				return result, err
			}
			if key == "timeout" {
				if milliseconds > 600000 {
					return result, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, "timeout must be at most 600000 milliseconds", nil)
				}
				result.timeout = time.Duration(milliseconds * float64(time.Millisecond))
			} else {
				if milliseconds < 50 || milliseconds > 5000 {
					return result, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, "pollInterval must be between 50 and 5000 milliseconds", nil)
				}
				result.pollInterval = time.Duration(milliseconds * float64(time.Millisecond))
			}
		default:
			return result, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, "options contains an unknown field", nil)
		}
	}
	return result, nil
}

func notificationMilliseconds(value interface{}, field string) (float64, error) {
	var milliseconds float64
	switch typed := value.(type) {
	case int:
		milliseconds = float64(typed)
	case int64:
		milliseconds = float64(typed)
	case float64:
		milliseconds = typed
	default:
		return 0, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, field+" must be a finite number of milliseconds", nil)
	}
	if milliseconds <= 0 || math.IsNaN(milliseconds) || math.IsInf(milliseconds, 0) {
		return 0, notificationOperationError("Notifications.waitFor", NotificationInvalidArgument, field+" must be greater than zero", nil)
	}
	return milliseconds, nil
}

func parseNotificationTarget(value goja.Value) (string, error) {
	operation := "Notifications.dismiss"
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return "", notificationOperationError(operation, NotificationInvalidArgument, "target is required", nil)
	}
	if id, ok := value.Export().(string); ok {
		if strings.TrimSpace(id) == "" || strings.ContainsRune(id, '\x00') {
			return "", notificationOperationError(operation, NotificationInvalidArgument, "target id must be a non-empty string without NUL", nil)
		}
		return id, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok || len(options) != 1 {
		return "", notificationOperationError(operation, NotificationInvalidArgument, "target must be an id string or {id}", nil)
	}
	id, ok := options["id"].(string)
	if !ok || strings.TrimSpace(id) == "" || strings.ContainsRune(id, '\x00') {
		return "", notificationOperationError(operation, NotificationInvalidArgument, "target.id must be a non-empty string without NUL", nil)
	}
	return id, nil
}

func (n *NotificationsRuntime) startAsync(operation string, worker func(context.Context) (interface{}, error), convert func(interface{}) goja.Value) goja.Value {
	if n.loop == nil {
		return n.rejected(notificationOperationError(operation, NotificationNotSupported, "Notifications methods require the execution EventLoop", nil))
	}
	if n.closing.Load() {
		return n.rejected(notificationOperationError(operation, NotificationCanceled, "Notifications runtime is closing", nil))
	}
	promise, resolve, reject := n.runtime.NewPromise()
	n.mu.Lock()
	n.nextID++
	id := n.nextID
	n.pending[id] = pendingNotificationOperation{resolve: resolve, reject: reject, convert: convert}
	n.mu.Unlock()
	n.workers.Add(1)
	n.wg.Add(1)
	go func() {
		defer n.workers.Add(-1)
		defer n.wg.Done()
		value, err := worker(n.context)
		err = wrapNotificationInteractionError(operation, err)
		if n.closing.Load() {
			return
		}
		if !n.loop.RunOnLoop(func(*goja.Runtime) { n.finishAsync(id, value, err) }) && err != nil {
			n.reportAsync(err)
		}
	}()
	return n.runtime.ToValue(promise)
}

func (n *NotificationsRuntime) finishAsync(id uint64, value interface{}, err error) {
	n.mu.Lock()
	pending, ok := n.pending[id]
	if ok {
		delete(n.pending, id)
	}
	n.mu.Unlock()
	if !ok {
		return
	}
	if err != nil {
		_ = pending.reject(notificationJSError(n.runtime, err))
		return
	}
	if pending.convert != nil {
		_ = pending.resolve(pending.convert(value))
		return
	}
	_ = pending.resolve(value)
}

func (n *NotificationsRuntime) rejected(err error) goja.Value {
	promise, _, reject := n.runtime.NewPromise()
	_ = reject(notificationJSError(n.runtime, err))
	return n.runtime.ToValue(promise)
}

func (n *NotificationsRuntime) Close() {
	if n == nil || !n.closing.CompareAndSwap(false, true) {
		return
	}
	n.cancel()
	n.mu.Lock()
	pending := n.pending
	n.pending = map[uint64]pendingNotificationOperation{}
	n.mu.Unlock()
	for _, item := range pending {
		_ = item.reject(notificationJSError(n.runtime, notificationOperationError("Notifications.cleanup", NotificationCanceled, "notification operation canceled during execution teardown", nil)))
	}
}

func (n *NotificationsRuntime) Wait() {
	if n != nil {
		n.wg.Wait()
	}
}

func (n *NotificationsRuntime) ResourceCounts() (int64, int) {
	if n == nil {
		return 0, 0
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.workers.Load(), len(n.pending)
}

func (n *NotificationsRuntime) reportAsync(err error) {
	if err != nil && n.onAsyncError != nil {
		n.onAsyncError(err)
	}
}

func notificationOperationError(operation string, code NotificationInteractionErrorCode, message string, cause error) error {
	return &NotificationInteractionError{Code: code, Operation: operation, Message: message, Cause: cause}
}

func wrapNotificationInteractionError(operation string, err error) error {
	if err == nil {
		return nil
	}
	var typed *NotificationInteractionError
	if errors.As(err, &typed) {
		copy := *typed
		if copy.Operation == "" {
			copy.Operation = operation
		}
		return &copy
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return notificationOperationError(operation, NotificationTimeout, "notification operation timed out", err)
	}
	if errors.Is(err, context.Canceled) {
		return notificationOperationError(operation, NotificationCanceled, "notification operation was canceled", err)
	}
	return notificationOperationError(operation, NotificationBackendFailed, "notification interaction backend failed", err)
}

func notificationJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	object := runtimeValue.NewGoError(err)
	var typed *NotificationInteractionError
	if errors.As(err, &typed) {
		_ = object.Set("code", string(typed.Code))
		_ = object.Set("operation", typed.Operation)
	}
	return object
}

func unsupportedNotificationCapabilities(notes string) NotificationInteractionCapabilities {
	unsupported := NotificationOperationCapability{Supported: false, Verified: false, Notes: notes}
	return NotificationInteractionCapabilities{
		SchemaVersion: 1, Platform: runtime.GOOS, Backend: "unsupported", Scope: "none",
		List: unsupported, WaitFor: unsupported, Dismiss: unsupported,
		Activate: NotificationOperationCapability{Supported: false, Verified: false, Notes: "programmatic notification activation is not exposed"},
		Events:   NotificationOperationCapability{Supported: false, Verified: false, Notes: "Events does not advertise a notification event source"},
	}
}
