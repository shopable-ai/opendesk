// Package terminalstyle renders semantic CLI prefixes without changing the
// underlying log/event payloads.
package terminalstyle

import (
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"sync"

	"github.com/mattn/go-colorable"
	"github.com/mattn/go-isatty"
)

// Mode controls when ANSI styling is emitted.
type Mode string

const (
	ModeAuto   Mode = "auto"
	ModeAlways Mode = "always"
	ModeNever  Mode = "never"
)

const ansiReset = "\x1b[0m"

// terminalWriteMu keeps a rendered line intact across concurrent executions.
// This is especially important on legacy Windows consoles, where go-colorable
// translates one ANSI-bearing Write into several console operations.
var terminalWriteMu sync.Mutex

var prefixStyles = map[string]string{
	"[FRAMEWORK]": "\x1b[90m",   // gray: useful, but intentionally recessed
	"[SCRIPT]":    "\x1b[1;96m", // bright cyan: user-authored output
	"[META]":      "\x1b[35m",   // magenta: execution lifecycle/context
	"[SUMMARY]":   "\x1b[1;32m", // bold green: successful completion summary
	"[ERROR]":     "\x1b[1;31m",
	"[WARN]":      "\x1b[1;33m",
	"[DEBUG]":     "\x1b[2;90m",
	"[INFO]":      "\x1b[36m",
	"[LOG]":       "\x1b[1;96m",
	"[TABLE]":     "\x1b[34m",
	"[GROUP]":     "\x1b[35m",
	"[TIME]":      "\x1b[2;36m",
}

// ParseMode validates a terminal color mode.
func ParseMode(raw string) (Mode, error) {
	mode := Mode(strings.ToLower(strings.TrimSpace(raw)))
	if mode == "" {
		mode = ModeAuto
	}
	switch mode {
	case ModeAuto, ModeAlways, ModeNever:
		return mode, nil
	default:
		return "", fmt.Errorf("invalid color mode %q; expected auto, always, or never", raw)
	}
}

// Enabled reports whether styling should be emitted to writer. Auto mode is
// evaluated per stream so a TTY stderr can remain colored when stdout is piped.
func Enabled(mode Mode, writer io.Writer) bool {
	return enabled(mode, writer, os.LookupEnv, IsTerminal)
}

func enabled(mode Mode, writer io.Writer, lookupEnv func(string) (string, bool), isTerminal func(io.Writer) bool) bool {
	normalized, err := ParseMode(string(mode))
	if err != nil {
		normalized = ModeAuto
	}
	switch normalized {
	case ModeAlways:
		return true
	case ModeNever:
		return false
	}

	if value, ok := lookupEnv("NO_COLOR"); ok && value != "" {
		return false
	}
	if value, ok := lookupEnv("FORCE_COLOR"); ok && value != "" {
		return strings.TrimSpace(value) != "0"
	}
	if strings.EqualFold(strings.TrimSpace(environmentValue(lookupEnv, "TERM")), "dumb") {
		return false
	}
	return isTerminal(writer)
}

func environmentValue(lookupEnv func(string) (string, bool), key string) string {
	value, _ := lookupEnv(key)
	return value
}

// IsTerminal reports whether writer is an interactive terminal, including
// Cygwin/MSYS terminals on Windows.
func IsTerminal(writer io.Writer) bool {
	file, ok := writer.(*os.File)
	if !ok || file == nil {
		return false
	}
	return isatty.IsTerminal(file.Fd()) || isatty.IsCygwinTerminal(file.Fd())
}

// SupportsControl reports whether cursor-control sequences are safe to emit.
// Unlike color, cursor control can never be forced into a redirected stream.
func SupportsControl(writer io.Writer) bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("TERM")), "dumb") {
		return false
	}
	return IsTerminal(writer)
}

// ClearScreen clears only a real interactive terminal. Redirected streams are
// deliberately untouched because cursor-control sequences are not log data.
func ClearScreen(writer io.Writer) {
	if !SupportsControl(writer) {
		return
	}
	sequence := "\x1b[H\x1b[2J\x1b[3J"
	if runtime.GOOS == "windows" {
		sequence = "\x1b[H\x1b[2J"
	}
	_, _ = WriteString(writer, sequence)
}

// ColorizeTaggedLine styles a recognized textual prefix and resets before the
// message. Keeping the message byte-for-byte unchanged protects JSON markers
// and makes copied paths clean.
func ColorizeTaggedLine(line string, mode Mode, writer io.Writer) string {
	if !Enabled(mode, writer) {
		return line
	}
	prefix := taggedPrefix(line)
	style := prefixStyles[prefix]
	if prefix == "[SUMMARY]" {
		style = summaryStyle(line)
	}
	if style == "" {
		return line
	}
	rest := line[len(prefix):]
	styled := style + prefix + ansiReset
	if strings.HasPrefix(rest, " ") {
		secondary := taggedPrefix(rest[1:])
		if secondaryStyle := prefixStyles[secondary]; secondary != "" && secondary != prefix && secondaryStyle != "" {
			return styled + " " + secondaryStyle + secondary + ansiReset + rest[len(secondary)+1:]
		}
	}
	return styled + rest
}

// ColorizeEventLine applies level-aware styling to a structured event's
// terminal-only representation.
func ColorizeEventLine(line, _, _ string, mode Mode, writer io.Writer) string {
	if !Enabled(mode, writer) {
		return line
	}
	prefix := taggedPrefix(line)
	if prefix == "" {
		return line
	}

	style := prefixStyles[prefix]
	if style == "" {
		return line
	}
	rest := line[len(prefix):]
	styled := style + prefix + ansiReset
	if strings.HasPrefix(rest, " ") {
		secondary := taggedPrefix(rest[1:])
		if secondaryStyle := prefixStyles[secondary]; secondary != "" && secondary != prefix && secondaryStyle != "" {
			return styled + " " + secondaryStyle + secondary + ansiReset + rest[len(secondary)+1:]
		}
	}
	return styled + rest
}

func taggedPrefix(line string) string {
	if !strings.HasPrefix(line, "[") {
		return ""
	}
	end := strings.IndexByte(line, ']')
	if end < 0 {
		return ""
	}
	prefix := line[:end+1]
	if _, ok := prefixStyles[prefix]; !ok {
		return ""
	}
	return prefix
}

func summaryStyle(line string) string {
	rest := strings.TrimSpace(strings.TrimPrefix(line, "[SUMMARY]"))
	fields := strings.Fields(rest)
	if len(fields) == 0 || !strings.HasPrefix(strings.ToLower(fields[0]), "status=") {
		return prefixStyles["[SUMMARY]"]
	}
	status := strings.TrimPrefix(strings.ToLower(fields[0]), "status=")
	switch status {
	case "failed", "timed_out":
		return prefixStyles["[ERROR]"]
	case "canceled":
		return prefixStyles["[WARN]"]
	default:
		return prefixStyles["[SUMMARY]"]
	}
}

// WriteString writes ANSI through a Windows-compatible console adapter while
// preserving literal ANSI when the caller explicitly forces color to a pipe.
func WriteString(writer io.Writer, text string) (int, error) {
	terminalWriteMu.Lock()
	defer terminalWriteMu.Unlock()

	// Plain output needs no console adapter. Keeping it as one underlying write
	// both reduces overhead and prevents unnecessary byte-wise Windows handling.
	if !strings.Contains(text, "\x1b[") {
		return io.WriteString(writer, text)
	}
	if file, ok := writer.(*os.File); ok && file != nil {
		return io.WriteString(colorable.NewColorable(file), text)
	}
	return io.WriteString(writer, text)
}
