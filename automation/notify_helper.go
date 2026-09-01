package automation

const internalMacOSNotificationHelperArgument = "--opendesk-internal-macos-notify"

type macOSNotificationHelperRequest struct {
	Operation string `json:"operation,omitempty"`
	Title     string `json:"title"`
	Message   string `json:"message"`
	Sound     bool   `json:"sound"`
	ID        string `json:"id,omitempty"`
}

type macOSNotificationHelperResponse struct {
	OK            bool                 `json:"ok"`
	Error         string               `json:"error,omitempty"`
	Notifications []NotificationRecord `json:"notifications,omitempty"`
	Dismissed     bool                 `json:"dismissed,omitempty"`
}

// MacOSNotificationHelperRequested recognizes the exact private helper mode.
// It is exported only so cmd/opendesk can route the current binary before flag
// parsing; it is not a JavaScript or user-facing CLI API.
func MacOSNotificationHelperRequested(args []string) bool {
	return len(args) == 1 && args[0] == internalMacOSNotificationHelperArgument
}
