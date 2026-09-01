//go:build darwin

package automation

import (
	"bytes"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

var errDarwinNativeNotificationUnavailable = fmt.Errorf("macOS native notification backend unavailable")

func defaultNotificationBackend(title, message string, sound bool) error {
	nativeErr := notifyDarwinNative(title, message, sound)
	if nativeErr == nil {
		return nil
	}

	// Direct JavaScript execution is commonly launched as a plain CLI binary,
	// not from an .app bundle. Keep that path functional through Apple's
	// supported osascript bridge, while returning its real process diagnostics
	// if the fallback also cannot submit the request.
	fallbackErr := notifyDarwinWithAppleScript(title, message, sound)
	if fallbackErr == nil {
		return nil
	}
	if errors.Is(nativeErr, errDarwinNativeNotificationUnavailable) {
		return fallbackErr
	}
	return fmt.Errorf("native backend: %v; osascript fallback: %v", nativeErr, fallbackErr)
}

func notifyDarwinWithAppleScript(title, message string, sound bool) error {
	osa, err := exec.LookPath("osascript")
	if err != nil {
		return fmt.Errorf("osascript lookup failed: %w", err)
	}

	script := fmt.Sprintf("display notification %s with title %s", appleScriptString(message), appleScriptString(title))
	if sound {
		script += ` sound name "default"`
	}

	cmd := exec.Command(osa, "-e", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		details := strings.TrimSpace(stderr.String())
		if output := strings.TrimSpace(stdout.String()); output != "" {
			if details != "" {
				details += "; "
			}
			details += output
		}
		if details == "" {
			details = err.Error()
		}
		return fmt.Errorf("osascript failed: %s", details)
	}
	return nil
}

func appleScriptString(value string) string {
	var builder strings.Builder
	builder.Grow(len(value) + 2)
	builder.WriteByte('"')
	for _, character := range value {
		switch character {
		case '\\':
			builder.WriteString(`\\`)
		case '"':
			builder.WriteString(`\"`)
		case '\n':
			builder.WriteString(`\n`)
		case '\r':
			builder.WriteString(`\r`)
		case '\t':
			builder.WriteString(`\t`)
		default:
			builder.WriteRune(character)
		}
	}
	builder.WriteByte('"')
	return builder.String()
}
