package configcli

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"opendesk/pkg/officialconfig"
)

const (
	compileUsage = "usage: opendesk config compile --input <file.json> [--output <file.odcfg>]"
	inspectUsage = "usage: opendesk config inspect --input <file.odcfg>"
	verifyUsage  = "usage: opendesk config verify --input <file.json> --output <file.odcfg>"
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
	Input         string                `json:"input"`
	Output        string                `json:"output"`
	Format        string                `json:"format"`
	SchemaVersion int                   `json:"schemaVersion"`
	Actions       []string              `json:"actions"`
	Config        officialconfig.Config `json:"config"`
}

type inspectResult struct {
	Input         string                `json:"input"`
	Format        string                `json:"format"`
	SchemaVersion int                   `json:"schemaVersion"`
	Actions       []string              `json:"actions"`
	Config        officialconfig.Config `json:"config"`
}

type verifyResult struct {
	Input              string                `json:"input"`
	Output             string                `json:"output"`
	Format             string                `json:"format"`
	SchemaVersion      int                   `json:"schemaVersion"`
	Actions            []string              `json:"actions"`
	InputMatchesOutput bool                  `json:"inputMatchesOutput"`
	Config             officialconfig.Config `json:"config"`
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
		return writeError(stdout, "config", "USAGE", "usage: opendesk config <compile|inspect|verify> [options]")
	}

	switch args[1] {
	case "compile":
		return executeCompile(args[2:], stdout, stderr)
	case "inspect":
		return executeInspect(args[2:], stdout, stderr)
	case "verify":
		return executeVerify(args[2:], stdout, stderr)
	default:
		return writeError(stdout, "config", "UNKNOWN_COMMAND", fmt.Sprintf("unknown config command %q", args[1]))
	}
}

func executeCompile(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("config compile", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() { _, _ = fmt.Fprintln(stderr, compileUsage) }
	var input string
	var output string
	inputSet := false
	outputSet := false
	flags.Func("input", "plaintext config input JSON (required)", func(value string) error {
		if inputSet {
			return fmt.Errorf("--input may be specified only once")
		}
		inputSet = true
		input = value
		return nil
	})
	flags.Func("output", "generated ODCFG output (defaults beside input)", func(value string) error {
		if outputSet {
			return fmt.Errorf("--output may be specified only once")
		}
		outputSet = true
		output = value
		return nil
	})
	if err := flags.Parse(args); err != nil {
		return writeError(stdout, "config.compile", "INVALID_ARGUMENT", err.Error())
	}
	if flags.NArg() != 0 {
		return writeError(stdout, "config.compile", "INVALID_ARGUMENT", "config compile does not accept positional arguments")
	}
	input = strings.TrimSpace(input)
	if !inputSet || input == "" {
		return writeError(stdout, "config.compile", "INVALID_ARGUMENT", "--input is required")
	}
	output = strings.TrimSpace(output)
	if outputSet && output == "" {
		return writeError(stdout, "config.compile", "INVALID_ARGUMENT", "--output requires a value")
	}
	if !outputSet {
		var err error
		output, err = defaultOutputPath(input)
		if err != nil {
			return writeError(stdout, "config.compile", "INVALID_ARGUMENT", err.Error())
		}
	}

	config, err := officialconfig.CompileFile(input, output)
	if err != nil {
		return writeError(stdout, "config.compile", "COMPILE_FAILED", err.Error())
	}
	result := compileResult{
		Input:         filepath.Clean(input),
		Output:        filepath.Clean(output),
		Format:        officialconfig.Magic,
		SchemaVersion: config.SchemaVersion,
		Actions:       officialconfig.ActionNames(),
		Config:        config,
	}
	return writeEnvelope(stdout, envelope{OK: true, Command: "config.compile", Result: result}, 0)
}

func defaultOutputPath(input string) (string, error) {
	cleaned := filepath.Clean(strings.TrimSpace(input))
	extension := filepath.Ext(cleaned)
	if !strings.EqualFold(extension, ".json") {
		return "", fmt.Errorf("--input must name a .json file")
	}
	base := strings.TrimSuffix(filepath.Base(cleaned), extension)
	if base == "" {
		return "", fmt.Errorf("--input filename must have a basename before .json")
	}
	return filepath.Join(filepath.Dir(cleaned), base+".odcfg"), nil
}

func executeInspect(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("config inspect", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() { _, _ = fmt.Fprintln(stderr, inspectUsage) }
	var input string
	inputSet := false
	flags.Func("input", "ODCFG input to decode and validate (required)", func(value string) error {
		if inputSet {
			return fmt.Errorf("--input may be specified only once")
		}
		inputSet = true
		input = value
		return nil
	})
	if err := flags.Parse(args); err != nil {
		return writeError(stdout, "config.inspect", "INVALID_ARGUMENT", err.Error())
	}
	if flags.NArg() != 0 {
		return writeError(stdout, "config.inspect", "INVALID_ARGUMENT", "config inspect does not accept positional arguments")
	}
	input = strings.TrimSpace(input)
	if !inputSet || input == "" {
		return writeError(stdout, "config.inspect", "INVALID_ARGUMENT", "--input is required")
	}

	config, err := officialconfig.InspectFile(input)
	if err != nil {
		return writeError(stdout, "config.inspect", "INSPECT_FAILED", err.Error())
	}
	result := inspectResult{
		Input:         filepath.Clean(input),
		Format:        officialconfig.Magic,
		SchemaVersion: config.SchemaVersion,
		Actions:       officialconfig.ActionNames(),
		Config:        config,
	}
	return writeEnvelope(stdout, envelope{OK: true, Command: "config.inspect", Result: result}, 0)
}

func executeVerify(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("config verify", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() { _, _ = fmt.Fprintln(stderr, verifyUsage) }
	var input string
	var output string
	inputSet := false
	outputSet := false
	flags.Func("input", "plaintext config input JSON (required)", func(value string) error {
		if inputSet {
			return fmt.Errorf("--input may be specified only once")
		}
		inputSet = true
		input = value
		return nil
	})
	flags.Func("output", "generated ODCFG output to compare (required)", func(value string) error {
		if outputSet {
			return fmt.Errorf("--output may be specified only once")
		}
		outputSet = true
		output = value
		return nil
	})
	if err := flags.Parse(args); err != nil {
		return writeError(stdout, "config.verify", "INVALID_ARGUMENT", err.Error())
	}
	if flags.NArg() != 0 {
		return writeError(stdout, "config.verify", "INVALID_ARGUMENT", "config verify does not accept positional arguments")
	}
	input = strings.TrimSpace(input)
	output = strings.TrimSpace(output)
	if !inputSet || input == "" {
		return writeError(stdout, "config.verify", "INVALID_ARGUMENT", "--input is required")
	}
	if !outputSet || output == "" {
		return writeError(stdout, "config.verify", "INVALID_ARGUMENT", "--output is required")
	}

	config, err := officialconfig.VerifyFiles(input, output)
	if err != nil {
		return writeError(stdout, "config.verify", "VERIFY_FAILED", err.Error())
	}
	result := verifyResult{
		Input:              filepath.Clean(input),
		Output:             filepath.Clean(output),
		Format:             officialconfig.Magic,
		SchemaVersion:      config.SchemaVersion,
		Actions:            officialconfig.ActionNames(),
		InputMatchesOutput: true,
		Config:             config,
	}
	return writeEnvelope(stdout, envelope{OK: true, Command: "config.verify", Result: result}, 0)
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
