package automation

const internalMacOSNotificationHelperArgument = "--opendesk-internal-macos-notify"

type macOSNotificationHelperRequest struct {
	Title   string `json:"title"`
	Message string `json:"message"`
	Sound   bool   `json:"sound"`
}

type macOSNotificationHelperResponse struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// MacOSNotificationHelperRequested recognizes the exact private helper mode.
// It is exported only so cmd/opendesk can route the current binary before flag
// parsing; it is not a JavaScript or user-facing CLI API.
func MacOSNotificationHelperRequested(args []string) bool {
	return len(args) == 1 && args[0] == internalMacOSNotificationHelperArgument
}
