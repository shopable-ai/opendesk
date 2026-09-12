package configcli

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"path/filepath"

	"opendesk/pkg/officialconfig"
)

const (
	DefaultSource = "configs/official-shell.json"
	DefaultTarget = "apps/opendesk/assets/official-shell.odcfg"
)

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type envelope struct {
	OK      bool       `json:"ok"`
	Command string     `json:"command"`
	Result  any        `json:"result,omitempty"`
	Error   *errorBody `json:"error,omitempty"`
}

type compileResult struct {
	Source        string   `json:"source"`
	Target        string   `json:"target"`
	Format        string   `json:"format"`
	SchemaVersion int      `json:"schemaVersion"`
	Actions       []string `json:"actions"`
}

func IsCommand(args []string) bool {
	return len(args) > 0 && args[0] == "config"
}

func Execute(args []string, stdout, stderr io.Writer) int {
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}
	if len(args) < 2 {
		return writeError(stdout, "config", "USAGE", "usage: opendesk config compile [--source path] [--target path]")
	}

	switch args[1] {
	case "compile":
		return executeCompile(args[2:], stdout, stderr)
	default:
		return writeError(stdout, "config", "UNKNOWN_COMMAND", fmt.Sprintf("unknown config command %q", args[1]))
	}
}

func executeCompile(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("config compile", flag.ContinueOnError)
	flags.SetOutput(stderr)
	source := flags.String("source", DefaultSource, "plaintext official config source JSON")
	target := flags.String("target", DefaultTarget, "generated ODCFG target")
	if err := flags.Parse(args); err != nil {
		return writeError(stdout, "config.compile", "INVALID_ARGUMENT", err.Error())
	}
	if flags.NArg() != 0 {
		return writeError(stdout, "config.compile", "INVALID_ARGUMENT", "config compile does not accept positional arguments")
	}

	config, err := officialconfig.CompileFile(*source, *target)
	if err != nil {
		return writeError(stdout, "config.compile", "COMPILE_FAILED", err.Error())
	}
	result := compileResult{
		Source:        filepath.Clean(*source),
		Target:        filepath.Clean(*target),
		Format:        officialconfig.Magic,
		SchemaVersion: config.SchemaVersion,
		Actions:       officialconfig.ActionNames(),
	}
	return writeEnvelope(stdout, envelope{OK: true, Command: "config.compile", Result: result}, 0)
}

func writeError(writer io.Writer, command, code, message string) int {
	return writeEnvelope(writer, envelope{
		OK:      false,
		Command: command,
		Error:   &errorBody{Code: code, Message: message},
	}, 2)
}

func writeEnvelope(writer io.Writer, value envelope, code int) int {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return 1
	}
	return code
}
