package main

import (
	"fmt"
	"io"
	"opendesk/pkg/terminalstyle"
)

var terminalOutputMode = terminalstyle.ModeAuto

func configureTerminalOutput(config *Config) {
	terminalOutputMode = terminalstyle.ModeAuto
	if config == nil {
		return
	}
	if shouldUseJSONOutput(config) {
		terminalOutputMode = terminalstyle.ModeNever
		return
	}
	if mode, err := terminalstyle.ParseMode(config.ConsoleColor); err == nil {
		terminalOutputMode = mode
	}
}

func terminalPrintf(writer io.Writer, format string, args ...any) {
	text := fmt.Sprintf(format, args...)
	text = terminalstyle.ColorizeTaggedLine(text, terminalOutputMode, writer)
	_, _ = terminalstyle.WriteString(writer, text)
}

func terminalPrintln(writer io.Writer, args ...any) {
	text := fmt.Sprintln(args...)
	text = terminalstyle.ColorizeTaggedLine(text, terminalOutputMode, writer)
	_, _ = terminalstyle.WriteString(writer, text)
}
