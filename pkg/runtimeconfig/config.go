package runtimeconfig

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"opendesk/pkg/customui"
	"os"
	"path/filepath"
	"strings"
)

const (
	FileName               = "clawdesk.runtime.json"
	LegacyFileName         = "opendesk.runtime.json"
	CodeConfigInvalid      = "RUNTIME_CONFIG_INVALID"
	CodeConfigNotFound     = "RUNTIME_CONFIG_NOT_FOUND"
	CodeConfigUnsupported  = "RUNTIME_CONFIG_UNSUPPORTED"
	SupportedSchemaVersion = 1
)

// Error is returned for observable project configuration failures. Cause is
// intentionally excluded from JSON so CLI and HTTP callers can expose a stable
// code without leaking implementation details.
type Error struct {
	Code    string `json:"code"`
	Path    string `json:"path,omitempty"`
	Field   string `json:"field,omitempty"`
	Message string `json:"message"`
	Cause   error  `json:"-"`
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Path != "" {
		return fmt.Sprintf("%s: %s (%s)", e.Code, e.Message, e.Path)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *Error) Unwrap() error { return e.Cause }

type File struct {
	SchemaVersion int     `json:"schemaVersion"`
	Runtime       Runtime `json:"runtime"`
}

type Runtime struct {
	Capabilities []string `json:"capabilities"`
}

type fileWire struct {
	SchemaVersion *int         `json:"schemaVersion"`
	Runtime       *runtimeWire `json:"runtime"`
}

type runtimeWire struct {
	Capabilities *[]string `json:"capabilities"`
}

type UIResolveOptions struct {
	ForceDisable        bool
	ForceEnable         bool
	ExplicitConfigPath  string
	ScriptPath          string
	WorkingDirectory    string
	UseWorkingDirectory bool
}

type UIActivation struct {
	Enabled    bool                      `json:"enabled"`
	Source     customui.ActivationSource `json:"activationSource"`
	ConfigPath string                    `json:"configPath,omitempty"`
}

func Load(path string) (File, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return File{}, configError(CodeConfigNotFound, path, "", "configuration path is empty", nil)
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return File{}, configError(CodeConfigInvalid, path, "", "resolve configuration path", err)
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		code := CodeConfigInvalid
		message := "read runtime configuration"
		if errors.Is(err, os.ErrNotExist) {
			code = CodeConfigNotFound
			message = "runtime configuration does not exist"
		}
		return File{}, configError(code, absPath, "", message, err)
	}
	var wire fileWire
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return File{}, configError(CodeConfigInvalid, absPath, "", "decode strict runtime configuration: "+err.Error(), err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return File{}, configError(CodeConfigInvalid, absPath, "", "runtime configuration must contain one JSON object", err)
	}
	if wire.SchemaVersion == nil {
		return File{}, configError(CodeConfigInvalid, absPath, "schemaVersion", "schemaVersion is required and must be an integer", nil)
	}
	if wire.Runtime == nil {
		return File{}, configError(CodeConfigInvalid, absPath, "runtime", "runtime is required and must be an object", nil)
	}
	if wire.Runtime.Capabilities == nil {
		return File{}, configError(CodeConfigInvalid, absPath, "runtime.capabilities", "runtime.capabilities must be an array", nil)
	}
	config := File{
		SchemaVersion: *wire.SchemaVersion,
		Runtime:       Runtime{Capabilities: *wire.Runtime.Capabilities},
	}
	if config.SchemaVersion != SupportedSchemaVersion {
		return File{}, configError(CodeConfigUnsupported, absPath, "schemaVersion", fmt.Sprintf("schemaVersion must be %d", SupportedSchemaVersion), nil)
	}
	seen := make(map[string]struct{}, len(config.Runtime.Capabilities))
	for index, capability := range config.Runtime.Capabilities {
		field := fmt.Sprintf("runtime.capabilities[%d]", index)
		if capability != "ui" {
			return File{}, configError(CodeConfigUnsupported, absPath, field, fmt.Sprintf("unknown capability %q", capability), nil)
		}
		if _, exists := seen[capability]; exists {
			return File{}, configError(CodeConfigInvalid, absPath, field, fmt.Sprintf("duplicate capability %q", capability), nil)
		}
		seen[capability] = struct{}{}
	}
	return config, nil
}

func ResolveUI(options UIResolveOptions) (UIActivation, error) {
	if options.ForceDisable {
		return disabledActivation(), nil
	}
	if options.ForceEnable {
		return UIActivation{Enabled: true, Source: customui.ActivationCLI}, nil
	}
	if path := strings.TrimSpace(options.ExplicitConfigPath); path != "" {
		return activationFromFile(path)
	}

	path, ok, err := discoveredConfigPath(options)
	if err != nil {
		return UIActivation{}, err
	}
	if !ok {
		return disabledActivation(), nil
	}
	return activationFromFile(path)
}

func activationFromFile(path string) (UIActivation, error) {
	config, err := Load(path)
	if err != nil {
		return UIActivation{}, err
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return UIActivation{}, configError(CodeConfigInvalid, path, "", "resolve configuration path", err)
	}
	for _, capability := range config.Runtime.Capabilities {
		if capability == "ui" {
			return UIActivation{Enabled: true, Source: customui.ActivationProjectConfig, ConfigPath: absPath}, nil
		}
	}
	activation := disabledActivation()
	activation.ConfigPath = absPath
	return activation, nil
}

func discoveredConfigPath(options UIResolveOptions) (string, bool, error) {
	var directory string
	if options.UseWorkingDirectory {
		directory = strings.TrimSpace(options.WorkingDirectory)
		if directory == "" {
			var err error
			directory, err = os.Getwd()
			if err != nil {
				return "", false, configError(CodeConfigInvalid, "", "", "resolve working directory", err)
			}
		}
	} else if scriptPath := strings.TrimSpace(options.ScriptPath); scriptPath != "" {
		absScript, err := filepath.Abs(scriptPath)
		if err != nil {
			return "", false, configError(CodeConfigInvalid, scriptPath, "", "resolve script path", err)
		}
		directory = filepath.Dir(absScript)
	} else {
		return "", false, nil
	}
	// clawdesk.runtime.json is the fixed product configuration requested by the
	// Runtime contract. The renamed OpenDesk filename is accepted only as a
	// discovery fallback for worktrees already in the middle of that migration;
	// when both files exist, the Clawdesk configuration always wins.
	for _, name := range []string{FileName, LegacyFileName} {
		path := filepath.Join(directory, name)
		info, err := os.Stat(path)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return "", false, configError(CodeConfigInvalid, path, "", "inspect runtime configuration", err)
		}
		if info.IsDir() {
			return "", false, configError(CodeConfigInvalid, path, "", "runtime configuration must be a regular file", nil)
		}
		return path, true, nil
	}
	return "", false, nil
}

func disabledActivation() UIActivation {
	return UIActivation{Enabled: false, Source: customui.ActivationDisabled}
}

func configError(code, path, field, message string, cause error) error {
	return &Error{Code: code, Path: path, Field: field, Message: message, Cause: cause}
}

func requireJSONEOF(decoder *json.Decoder) error {
	var extra any
	err := decoder.Decode(&extra)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err == nil {
		return fmt.Errorf("unexpected trailing JSON value")
	}
	return err
}
