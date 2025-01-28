// automation/notify.go

package automation

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
)

type NotifyOptions struct {
	Title   string `json:"title,omitempty"`
	Message string `json:"message"`
	Sound   bool   `json:"sound,omitempty"`
	Timeout int    `json:"timeout,omitempty"`
}

// Notify is a global function for system notifications
func Notify(options *NotifyOptions) error {
	if options == nil {
		return fmt.Errorf("notify options cannot be nil")
	}

	if options.Title == "" {
		options.Title = "TestMonkey Notification"
	}

	if options.Timeout == 0 {
		options.Timeout = 3000
	}

	switch runtime.GOOS {
	case "darwin":
		script := fmt.Sprintf(`display notification "%s" with title "%s"`,
			options.Message, options.Title)
		if options.Sound {
			script += ` sound name "default"`
		}
		cmd := exec.Command("osascript", "-e", script)
		return cmd.Run()

	case "windows":
		flags := 0x0
		if options.Sound {
			flags = 0x40 // 添加声音
		}
		script := fmt.Sprintf(`(New-Object -ComObject Wscript.Shell).Popup("%s", %d, "%s", %d)`,
			options.Message, options.Timeout/1000, options.Title, flags)
		cmd := exec.Command("powershell", "-Command", script)
		return cmd.Run()

	default: // Linux
		args := []string{
			"--expire-time", strconv.Itoa(options.Timeout),
		}
		if options.Sound {
			args = append(args, "--urgency=normal")
		}
		args = append(args, options.Title, options.Message)
		cmd := exec.Command("notify-send", args...)
		return cmd.Run()
	}
}
