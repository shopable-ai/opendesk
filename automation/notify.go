package automation

import (
	"fmt"
	"time"

	"github.com/gen2brain/beeep"
)

// NotifyOptions defines the options for system notifications
type NotifyOptions struct {
	Title   string        `json:"title,omitempty"`
	Message string        `json:"message"`
	Sound   bool          `json:"sound,omitempty"`
	Timeout time.Duration `json:"timeout,omitempty"`
}

// Notify sends a system notification
func Notify(options *NotifyOptions) error {
	if options == nil {
		return fmt.Errorf("notify options cannot be nil")
	}

	// Set default values
	if options.Title == "" {
		options.Title = "TestMonkey Notification"
	}
	if options.Timeout == 0 {
		options.Timeout = 3 * time.Second
	}

	// Use beeep for cross-platform notifications
	err := beeep.Notify(options.Title, options.Message, "")
	if err != nil {
		return fmt.Errorf("notification failed: %v", err)
	}

	return nil
}
