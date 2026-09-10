package protectedcli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"opendesk/pkg/runtimeenv"
	"opendesk/pkg/scriptloader"
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

func IsProtectedInvocation(args []string) bool {
	_, _, ok := detectInvocation(args)
	return ok
}

// Execute handles only .odpkg invocations. Plain .js commands deliberately
// fall through to the existing CLI without any packaging or license behavior.
func Execute(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	kind, packagePath, ok := detectInvocation(args)
	if !ok {
		return 2
	}
	if kind == "ai.run" {
		return executeAIRun(args, packagePath, stdin, stdout)
	}
	return executeDirect(args, packagePath, stdout, stderr)
}

func detectInvocation(args []string) (kind, packagePath string, ok bool) {
	if len(args) >= 3 && args[0] == "ai" && args[1] == "run" && strings.EqualFold(filepath.Ext(args[2]), ".odpkg") {
		return "ai.run", args[2], true
	}
	for index := 0; index < len(args); index++ {
		arg := args[index]
		if arg == "-script" || arg == "--script" {
			if index+1 < len(args) && strings.EqualFold(filepath.Ext(args[index+1]), ".odpkg") {
				return "direct", args[index+1], true
			}
			continue
		}
		for _, prefix := range []string{"-script=", "--script="} {
			if strings.HasPrefix(arg, prefix) {
				candidate := strings.TrimPrefix(arg, prefix)
				if strings.EqualFold(filepath.Ext(candidate), ".odpkg") {
					return "direct", candidate, true
				}
			}
		}
	}
	return "", "", false
}

func executeAIRun(args []string, packagePath string, stdin io.Reader, stdout io.Writer) int {
	fs := flag.NewFlagSet("ai run", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	inputRaw := fs.String("input", "", "")
	inputFile := fs.String("input-file", "", "")
	inputStdin := fs.Bool("input-stdin", false, "")
	environmentFile := fs.String("env-file", "", "")
	timeout := fs.Duration("timeout", 0, "")
	if err := fs.Parse(args[3:]); err != nil || fs.NArg() != 0 {
		return writeAIError(stdout, "invalid_argument", "invalid ai run arguments")
	}
	if *timeout < 0 {
		return writeAIError(stdout, "invalid_argument", "timeout cannot be negative")
	}
	if flagWasSet(fs, "env-file") && strings.TrimSpace(*environmentFile) == "" {
		return writeAIError(stdout, "invalid_argument", "env-file requires a path")
	}
	input, code, err := readInput(stdin, *inputRaw, *inputFile, *inputStdin, flagWasSet(fs, "input"), flagWasSet(fs, "input-file"))
	if err != nil {
		return writeAIError(stdout, code, err.Error())
	}
	workingDir, err := os.Getwd()
	if err != nil {
		return writeAIError(stdout, "internal_error", "cannot read working directory")
	}
	environment, err := runtimeenv.Resolve(runtimeenv.Options{WorkingDirectory: workingDir, File: *environmentFile, Inherited: os.Environ()})
	if err != nil {
		return writeAIError(stdout, "invalid_argument", err.Error())
	}
	absolutePath, err := filepath.Abs(packagePath)
	if err != nil {
		return writeAIError(stdout, "invalid_argument", "invalid protected package path")
	}
	loader := scriptloader.NewProductionFileLoader()
	result, _, protection, runErr := RunProtectedFile(context.Background(), loader, absolutePath, RunOptions{
		ExecutionIDPrefix:       "ai-protected",
		LogDir:                  filepath.Join(".runtime", "ai"),
		LogDirIsRoot:            true,
		WorkDir:                 workingDir,
		Environment:             environment.Values,
		Input:                   input,
		Timeout:                 *timeout,
		TimeoutMinutes:          30,
		EnableNativeExtensions:  true,
		EnableCommand:           true,
		EnableDownload:          true,
		EnableAccessibility:     true,
		EnableSQLite:            true,
	}, nil)
	if runErr != nil {
		return writeAIError(stdout, ErrorCodeOf(runErr), safeMessage(runErr))
	}
	_ = json.NewEncoder(stdout).Encode(envelope{OK: true, Command: "run", Result: map[string]any{
		"executionId": result.ExecutionID,
		"status":      result.Status,
		"durationMs":  result.DurationMs,
		"artifacts":   result.Artifacts,
		"protection":  protection,
	}})
	return 0
}

func executeDirect(args []string, packagePath string, stdout, stderr io.Writer) int {
	workingDir, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(stderr, "internal_error: cannot read working directory")
		return 1
	}
	envFile, _ := flagValue(args, "-env-file", "--env-file")
	environment, err := runtimeenv.Resolve(runtimeenv.Options{WorkingDirectory: workingDir, File: envFile, Inherited: os.Environ()})
	if err != nil {
		fmt.Fprintf(stderr, "invalid_argument: %v\n", err)
		return 1
	}
	logDir, _ := flagValue(args, "-log-dir", "--log-dir")
	saveLast, _ := flagValue(args, "-save-last-script", "--save-last-script")
	timeoutMinutes := 30
	if raw, found := flagValue(args, "-timeout", "--timeout"); found {
		parsed, parseErr := strconv.Atoi(raw)
		if parseErr != nil || parsed < 0 {
			fmt.Fprintln(stderr, "invalid_argument: timeout must be a non-negative integer number of minutes")
			return 1
		}
		timeoutMinutes = parsed
	}
	absolutePath, err := filepath.Abs(packagePath)
	if err != nil {
		fmt.Fprintln(stderr, "invalid_argument: invalid protected package path")
		return 1
	}
	loader := scriptloader.NewProductionFileLoader()
	result, _, protection, runErr := RunProtectedFile(context.Background(), loader, absolutePath, RunOptions{
		ExecutionIDPrefix:       "direct-protected",
		LogDir:                  logDir,
		WorkDir:                 workingDir,
		Environment:             environment.Values,
		TimeoutMinutes:          timeoutMinutes,
		SaveLastScript:          saveLast,
		EnableNativeExtensions:  true,
		EnableCommand:           true,
		EnableDownload:          true,
		EnableAccessibility:     true,
		EnableSQLite:            true,
		EnableRecorderCapture:   hasFlag(args, "-allow-recorder-capture", "--allow-recorder-capture"),
	}, nil)
	if runErr != nil {
		fmt.Fprintf(stderr, "%s: %s\n", ErrorCodeOf(runErr), safeMessage(runErr))
		return 1
	}
	fmt.Fprintf(stdout, "[SUMMARY] status=%s duration=%dms source=%s hash=%s\n", result.Status, result.DurationMs, result.Source, result.ScriptHash)
	fmt.Fprintf(stdout, "[SUMMARY] protection=protected packageId=%s productId=%s publisherId=%s\n", protection.PackageID, protection.ProductID, protection.PublisherID)
	return 0
}

func readInput(stdin io.Reader, inputRaw, inputFile string, inputStdin, inputFlagSet, inputFileFlagSet bool) (any, string, error) {
	sources := 0
	if inputFlagSet {
		sources++
	}
	if inputFileFlagSet {
		sources++
	}
	if inputStdin {
		sources++
	}
	if sources > 1 {
		return nil, "invalid_argument", fmt.Errorf("--input, --input-file, and --input-stdin are mutually exclusive")
	}
	if inputFileFlagSet && strings.TrimSpace(inputFile) == "" {
		return nil, "invalid_argument", fmt.Errorf("input-file requires a path")
	}
	if sources == 0 {
		return nil, "", nil
	}
	var data []byte
	var err error
	switch {
	case inputFlagSet:
		data = []byte(inputRaw)
	case inputFileFlagSet:
		data, err = os.ReadFile(inputFile)
	case inputStdin:
		data, err = io.ReadAll(stdin)
	}
	if err != nil {
		return nil, "invalid_argument", fmt.Errorf("read input: %w", err)
	}
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, "invalid_json", fmt.Errorf("invalid input JSON")
	}
	return value, "", nil
}

func writeAIError(stdout io.Writer, code, message string) int {
	_ = json.NewEncoder(stdout).Encode(envelope{OK: false, Command: "run", Error: &errorBody{Code: code, Message: message}})
	if code == "invalid_argument" || code == "invalid_json" {
		return 2
	}
	return 1
}

func safeMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func flagWasSet(fs *flag.FlagSet, name string) bool {
	found := false
	fs.Visit(func(item *flag.Flag) {
		if item.Name == name {
			found = true
		}
	})
	return found
}

func flagValue(args []string, names ...string) (string, bool) {
	for index := 0; index < len(args); index++ {
		for _, name := range names {
			if args[index] == name && index+1 < len(args) {
				return args[index+1], true
			}
			prefix := name + "="
			if strings.HasPrefix(args[index], prefix) {
				return strings.TrimPrefix(args[index], prefix), true
			}
		}
	}
	return "", false
}

func hasFlag(args []string, names ...string) bool {
	for _, arg := range args {
		for _, name := range names {
			if arg == name || arg == name+"=true" {
				return true
			}
		}
	}
	return false
}
