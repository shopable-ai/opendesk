package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const defaultConsoleMode = "normal"

var supportedConsoleModes = map[string]struct{}{
	"normal":  {},
	"full":    {},
	"script":  {},
	"meta":    {},
	"summary": {},
	"quiet":   {},
	"agent":   {},
}

var supportedConsoleCategories = map[string]struct{}{
	"framework": {},
	"meta":      {},
	"script":    {},
	"summary":   {},
	"error":     {},
}

// ConsoleSettings is the resolved terminal-output configuration. It is kept
// separate from Config so init can apply the same setting before flags parse
// and before startup diagnostics would otherwise be written.
type ConsoleSettings struct {
	Mode          string
	Categories    string
	OutputFormat  string
	Environment   string
	EnvironmentAt []string
}

type consoleArgumentOverrides struct {
	Mode            string
	ModeSet         bool
	Categories      string
	CategoriesSet   bool
	OutputFormat    string
	OutputFormatSet bool
	Debug           bool
	DebugSet        bool
	EnvironmentFile string
	EnvironmentSet  bool
}

func consoleOverridesFromVisitedFlags(flags *flag.FlagSet, config *Config) consoleArgumentOverrides {
	var overrides consoleArgumentOverrides
	if flags == nil || config == nil {
		return overrides
	}
	flags.Visit(func(visited *flag.Flag) {
		switch visited.Name {
		case "console-mode":
			overrides.Mode = config.ConsoleMode
			overrides.ModeSet = true
		case "console-categories":
			overrides.Categories = config.ConsoleCategories
			overrides.CategoriesSet = true
		case "output-format":
			overrides.OutputFormat = config.OutputFormat
			overrides.OutputFormatSet = true
		case "debug":
			overrides.Debug = config.Debug
			overrides.DebugSet = true
		case "env-file":
			overrides.EnvironmentFile = config.EnvironmentFile
			overrides.EnvironmentSet = true
		}
	})
	return overrides
}

// resolveConsoleSettingsFromProcess resolves output configuration without
// mutating the process environment. Project files remain scoped defaults.
func resolveConsoleSettingsFromProcess(overrides consoleArgumentOverrides) (ConsoleSettings, error) {
	workingDir, err := os.Getwd()
	if err != nil {
		return ConsoleSettings{}, fmt.Errorf("read working directory for console configuration: %w", err)
	}
	return resolveConsoleSettingsWithOverrides(overrides, workingDir, os.LookupEnv)
}

func resolveConsoleSettings(args []string, workingDir string, lookupEnv func(string) (string, bool)) (ConsoleSettings, error) {
	overrides := parseConsoleArgumentOverrides(args)
	return resolveConsoleSettingsWithOverrides(overrides, workingDir, lookupEnv)
}

func resolveConsoleSettingsWithOverrides(overrides consoleArgumentOverrides, workingDir string, lookupEnv func(string) (string, bool)) (ConsoleSettings, error) {
	paths, err := resolveConsoleEnvironmentPaths(workingDir, overrides)
	if err != nil {
		return ConsoleSettings{}, err
	}

	values, usedPaths, err := readConsoleEnvironmentFiles(paths)
	if err != nil {
		return ConsoleSettings{}, err
	}

	settings := ConsoleSettings{
		Mode:          defaultConsoleMode,
		OutputFormat:  "text",
		EnvironmentAt: usedPaths,
	}
	if len(usedPaths) > 0 {
		settings.Environment = strings.Join(usedPaths, ",")
	}
	applyConsoleEnvironment(&settings, values)
	applyConsoleEnvironment(&settings, processConsoleEnvironment(lookupEnv))

	if overrides.ModeSet {
		settings.Mode = overrides.Mode
	}
	if overrides.CategoriesSet {
		settings.Categories = overrides.Categories
	}
	if overrides.OutputFormatSet {
		settings.OutputFormat = overrides.OutputFormat
	}
	// -debug is deliberately a shorthand for the complete diagnostic profile.
	// A more specific command-line mode/categories selection remains in charge.
	if overrides.DebugSet && overrides.Debug && !overrides.ModeSet && !overrides.CategoriesSet {
		settings.Mode = "full"
		settings.Categories = ""
	}
	if err := validateConsoleSettings(settings); err != nil {
		return ConsoleSettings{}, err
	}
	return settings, nil
}

func parseConsoleArgumentOverrides(args []string) consoleArgumentOverrides {
	var overrides consoleArgumentOverrides
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			break
		}
		// The standard flag package accepts one or two leading dashes. Normalize
		// the long spelling here so environment-file selection and precedence are
		// resolved exactly the same way before flag.Parse.
		if strings.HasPrefix(arg, "--") {
			arg = arg[1:]
		}
		switch arg {
		case "-console-mode":
			if i+1 < len(args) {
				overrides.Mode = args[i+1]
				overrides.ModeSet = true
				i++
			}
			continue
		case "-console-categories":
			if i+1 < len(args) {
				overrides.Categories = args[i+1]
				overrides.CategoriesSet = true
				i++
			}
			continue
		case "-output-format":
			if i+1 < len(args) {
				overrides.OutputFormat = args[i+1]
				overrides.OutputFormatSet = true
				i++
			}
			continue
		case "-env-file":
			if i+1 < len(args) {
				overrides.EnvironmentFile = args[i+1]
				overrides.EnvironmentSet = true
				i++
			}
			continue
		case "-debug":
			overrides.Debug = true
			overrides.DebugSet = true
			continue
		}

		switch {
		case strings.HasPrefix(arg, "-console-mode="):
			overrides.Mode = strings.TrimPrefix(arg, "-console-mode=")
			overrides.ModeSet = true
		case strings.HasPrefix(arg, "-console-categories="):
			overrides.Categories = strings.TrimPrefix(arg, "-console-categories=")
			overrides.CategoriesSet = true
		case strings.HasPrefix(arg, "-output-format="):
			overrides.OutputFormat = strings.TrimPrefix(arg, "-output-format=")
			overrides.OutputFormatSet = true
		case strings.HasPrefix(arg, "-env-file="):
			overrides.EnvironmentFile = strings.TrimPrefix(arg, "-env-file=")
			overrides.EnvironmentSet = true
		case strings.HasPrefix(arg, "-debug="):
			value := strings.TrimSpace(strings.TrimPrefix(arg, "-debug="))
			overrides.DebugSet = true
			overrides.Debug = strings.EqualFold(value, "true") || value == "1"
		}
	}
	return overrides
}

func resolveConsoleEnvironmentPaths(workingDir string, overrides consoleArgumentOverrides) ([]string, error) {
	if strings.TrimSpace(workingDir) == "" {
		return nil, fmt.Errorf("working directory is required for console configuration")
	}
	if overrides.EnvironmentSet {
		path := strings.TrimSpace(overrides.EnvironmentFile)
		if path == "" {
			return nil, fmt.Errorf("-env-file requires a path")
		}
		if !filepath.IsAbs(path) {
			path = filepath.Join(workingDir, path)
		}
		return []string{path}, nil
	}

	// .env is the conventional project file; the product-specific file is read
	// afterwards so it can safely refine a shared project environment.
	paths := make([]string, 0, 2)
	for _, name := range []string{".env", ".opendesk.env"} {
		path := filepath.Join(workingDir, name)
		if _, err := os.Stat(path); err == nil {
			paths = append(paths, path)
		} else if !os.IsNotExist(err) {
			return nil, fmt.Errorf("inspect environment file %s: %w", path, err)
		}
	}
	return paths, nil
}

func readConsoleEnvironmentFiles(paths []string) (map[string]string, []string, error) {
	values := make(map[string]string)
	usedPaths := make([]string, 0, len(paths))
	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			return nil, nil, fmt.Errorf("read environment file %s: %w", path, err)
		}
		parsed, err := parseConsoleEnvironment(file)
		closeErr := file.Close()
		if err != nil {
			return nil, nil, fmt.Errorf("parse environment file %s: %w", path, err)
		}
		if closeErr != nil {
			return nil, nil, fmt.Errorf("close environment file %s: %w", path, closeErr)
		}
		for key, value := range parsed {
			values[key] = value
		}
		usedPaths = append(usedPaths, path)
	}
	return values, usedPaths, nil
}

func parseConsoleEnvironment(file *os.File) (map[string]string, error) {
	values := make(map[string]string)
	scanner := bufio.NewScanner(file)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		if key != "OPENDESK_CONSOLE_MODE" && key != "OPENDESK_CONSOLE_CATEGORIES" {
			continue
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && ((value[0] == '\'' && value[len(value)-1] == '\'') || (value[0] == '"' && value[len(value)-1] == '"')) {
			value = value[1 : len(value)-1]
		}
		if strings.ContainsAny(value, "\r\n") {
			return nil, fmt.Errorf("line %d has an invalid value", lineNumber)
		}
		values[key] = value
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return values, nil
}

func processConsoleEnvironment(lookupEnv func(string) (string, bool)) map[string]string {
	values := make(map[string]string)
	for _, key := range []string{"OPENDESK_CONSOLE_MODE", "OPENDESK_CONSOLE_CATEGORIES"} {
		if value, ok := lookupEnv(key); ok {
			values[key] = value
		}
	}
	return values
}

func applyConsoleEnvironment(settings *ConsoleSettings, values map[string]string) {
	if settings == nil {
		return
	}
	if value, ok := values["OPENDESK_CONSOLE_MODE"]; ok && strings.TrimSpace(value) != "" {
		settings.Mode = value
	}
	if value, ok := values["OPENDESK_CONSOLE_CATEGORIES"]; ok {
		settings.Categories = value
	}
}

func validateConsoleSettings(settings ConsoleSettings) error {
	mode := strings.ToLower(strings.TrimSpace(settings.Mode))
	if _, ok := supportedConsoleModes[mode]; !ok {
		return fmt.Errorf("invalid console mode %q; expected normal, full, script, meta, summary, quiet, or agent", settings.Mode)
	}
	for category := range parseConsoleCategories(settings.Categories) {
		if _, ok := supportedConsoleCategories[category]; !ok {
			return fmt.Errorf("invalid console category %q; expected framework, meta, script, summary, or error", category)
		}
	}
	return nil
}
