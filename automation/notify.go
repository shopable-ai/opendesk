package automation

import (
	"fmt"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/dop251/goja"
)

// NotifyOptions defines the options for system notifications
type NotifyOptions struct {
	Title   string `json:"title,omitempty"`
	Message string `json:"message"`
	Sound   bool   `json:"sound,omitempty"`
	// Timeout is retained for JavaScript API compatibility. The cross-platform
	// notification backends do not expose a configurable display duration, so
	// it is intentionally not used when dispatching a notification.
	Timeout time.Duration `json:"timeout,omitempty"`
}

// notificationBackend is kept behind the public bridge so platform delivery
// can be tested without making a test depend on the user's Notification
// Center state. A nil error means that the host submitted the request to the
// platform backend; it is not a proof that a banner was rendered.
type notificationBackend func(title, message string, sound bool) error

var notifyBackend notificationBackend = defaultNotificationBackend

// Notify sends a system notification
func Notify(options *NotifyOptions) error {
	if options == nil {
		return fmt.Errorf("notify options cannot be nil")
	}
	if err := validateNotificationText("title", options.Title); err != nil {
		return err
	}
	if err := validateNotificationText("message", options.Message); err != nil {
		return err
	}

	normalized := *options
	if normalized.Title == "" {
		normalized.Title = "OpenDesk Notification"
	}

	err := notifyBackend(normalized.Title, normalized.Message, normalized.Sound)
	if err != nil {
		return fmt.Errorf("notification failed: %w", err)
	}

	return nil
}

func validateNotificationText(field, value string) error {
	if !utf8.ValidString(value) {
		return fmt.Errorf("notify %s must be valid UTF-8", field)
	}
	if strings.ContainsRune(value, '\x00') {
		return fmt.Errorf("notify %s cannot contain NUL", field)
	}
	return nil
}

func notifyBridge(runtime *goja.Runtime, call goja.FunctionCall) goja.Value {
	if len(call.Arguments) != 1 || goja.IsUndefined(call.Argument(0)) || goja.IsNull(call.Argument(0)) {
		panic(runtime.NewTypeError("notify bridge expects one options object"))
	}
	argument := call.Argument(0)
	object := argument.ToObject(runtime)
	if object.ClassName() != "Object" {
		panic(runtime.NewTypeError("notify bridge expects one options object"))
	}

	options := &NotifyOptions{}
	if value := object.Get("title"); value != nil && !goja.IsUndefined(value) {
		title, ok := value.Export().(string)
		if !ok {
			panic(runtime.NewTypeError("notify title must be a string"))
		}
		options.Title = title
	}
	if value := object.Get("message"); value != nil && !goja.IsUndefined(value) {
		message, ok := value.Export().(string)
		if !ok {
			panic(runtime.NewTypeError("notify message must be a string"))
		}
		options.Message = message
	}
	if value := object.Get("sound"); value != nil && !goja.IsUndefined(value) {
		sound, ok := value.Export().(bool)
		if !ok {
			panic(runtime.NewTypeError("notify sound must be a boolean"))
		}
		options.Sound = sound
	}
	if value := object.Get("timeout"); value != nil && !goja.IsUndefined(value) {
		var timeout float64
		switch number := value.Export().(type) {
		case int64:
			timeout = float64(number)
		case float64:
			timeout = number
		default:
			panic(runtime.NewTypeError("notify timeout must be a finite number"))
		}
		if math.IsNaN(timeout) || math.IsInf(timeout, 0) {
			panic(runtime.NewTypeError("notify timeout must be a finite number"))
		}
		// Timeout is contract-only compatibility data and is intentionally not
		// passed to any platform backend.
		options.Timeout = time.Duration(timeout)
	}

	if err := Notify(options); err != nil {
		panic(runtime.NewGoError(err))
	}
	return goja.Undefined()
}
