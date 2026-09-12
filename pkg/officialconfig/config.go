// Package officialconfig owns the source-to-distribution contract for OpenDesk
// first-party product navigation configuration.
package officialconfig

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const (
	Magic         = "ODCFG1"
	SchemaVersion = 1
	obfuscationKey = "OpenDeskOfficialShell/v1"
)

var httpsURLPattern = regexp.MustCompile(`^https://[^\s/?#\\]+(?:[/?#][^\s]*)?$`)

var requiredActions = []string{"help", "customize", "marketplace", "upgrade"}

var coreActions = map[string]bool{
	"help":      true,
	"customize": true,
}

type Action struct {
	Visible bool   `json:"visible"`
	URL     string `json:"url"`
}

type Config struct {
	SchemaVersion int               `json:"schemaVersion"`
	Actions       map[string]Action `json:"actions"`
}

// ParseSource parses the developer-owned plaintext source configuration.
func ParseSource(data []byte) (Config, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var config Config
	if err := decoder.Decode(&config); err != nil {
		return Config{}, fmt.Errorf("parse official config source: %w", err)
	}
	if decoder.More() {
		return Config{}, fmt.Errorf("parse official config source: trailing JSON values are not allowed")
	}
	if err := Validate(config); err != nil {
		return Config{}, err
	}
	return normalize(config), nil
}

// Validate enforces the public ODCFG1 schema. The homepage is deliberately not
// part of this file: it is runtime-owned as System.product.website.
func Validate(config Config) error {
	if config.SchemaVersion != SchemaVersion {
		return fmt.Errorf("official config schemaVersion %d is unsupported", config.SchemaVersion)
	}
	if config.Actions == nil {
		return fmt.Errorf("official config actions are required")
	}

	allowed := make(map[string]bool, len(requiredActions))
	for _, name := range requiredActions {
		allowed[name] = true
	}
	for name := range config.Actions {
		if !allowed[name] {
			if name == "home" {
				return fmt.Errorf("official config action home is runtime-owned by System.product.website")
			}
			return fmt.Errorf("official config contains unknown action %q", name)
		}
	}
	for _, name := range requiredActions {
		action, ok := config.Actions[name]
		if !ok {
			return fmt.Errorf("official config is missing action %q", name)
		}
		url := strings.TrimSpace(action.URL)
		if url != "" && !httpsURLPattern.MatchString(url) {
			return fmt.Errorf("official config action %q only accepts https URL", name)
		}
		if coreActions[name] && !action.Visible {
			return fmt.Errorf("official config core action %q cannot be hidden", name)
		}
	}
	return nil
}

// Encode returns a deterministic ODCFG1 payload. ODCFG1 is intentionally a
// lightweight obfuscation + checksum format, not a cryptographic secret store.
func Encode(config Config) ([]byte, error) {
	if err := Validate(config); err != nil {
		return nil, err
	}
	payload, err := json.Marshal(normalize(config))
	if err != nil {
		return nil, fmt.Errorf("encode official config JSON: %w", err)
	}
	encoded := make([]byte, len(payload))
	key := []byte(obfuscationKey)
	for index, value := range payload {
		encoded[index] = value ^ key[index%len(key)]
	}
	return []byte(fmt.Sprintf("%s:%04x\n%s\n", Magic, checksum16(payload), hex.EncodeToString(encoded))), nil
}

// Decode decodes and validates an ODCFG1 payload. It is used by CLI tests and
// release tooling to guarantee parity with the JavaScript Official Shell loader.
func Decode(data []byte) (Config, error) {
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 {
		return Config{}, fmt.Errorf("official config must contain a header and payload")
	}
	header := strings.Split(lines[0], ":")
	if len(header) != 2 || header[0] != Magic || len(header[1]) != 4 {
		return Config{}, fmt.Errorf("official config header is invalid")
	}
	encoded, err := hex.DecodeString(strings.TrimSpace(lines[1]))
	if err != nil || len(encoded) == 0 {
		return Config{}, fmt.Errorf("official config payload is not valid hex")
	}
	payload := make([]byte, len(encoded))
	key := []byte(obfuscationKey)
	for index, value := range encoded {
		payload[index] = value ^ key[index%len(key)]
	}
	if fmt.Sprintf("%04x", checksum16(payload)) != strings.ToLower(header[1]) {
		return Config{}, fmt.Errorf("official config checksum mismatch")
	}
	return ParseSource(payload)
}

// CompileFile compiles a plaintext JSON source into the protected distribution
// payload. The generated file is deterministic and may be committed as an app
// resource; the plaintext source should not be copied into a release bundle.
func CompileFile(sourcePath, targetPath string) (Config, error) {
	sourcePath = filepath.Clean(strings.TrimSpace(sourcePath))
	targetPath = filepath.Clean(strings.TrimSpace(targetPath))
	if sourcePath == "." || sourcePath == "" {
		return Config{}, fmt.Errorf("official config source path is required")
	}
	if targetPath == "." || targetPath == "" {
		return Config{}, fmt.Errorf("official config target path is required")
	}
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return Config{}, fmt.Errorf("read official config source %q: %w", sourcePath, err)
	}
	config, err := ParseSource(data)
	if err != nil {
		return Config{}, err
	}
	encoded, err := Encode(config)
	if err != nil {
		return Config{}, err
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return Config{}, fmt.Errorf("create official config target directory: %w", err)
	}
	if err := os.WriteFile(targetPath, encoded, 0o644); err != nil {
		return Config{}, fmt.Errorf("write official config target %q: %w", targetPath, err)
	}
	return config, nil
}

func normalize(config Config) Config {
	actions := make(map[string]Action, len(config.Actions))
	for _, name := range requiredActions {
		action := config.Actions[name]
		action.URL = strings.TrimSpace(action.URL)
		actions[name] = action
	}
	return Config{SchemaVersion: SchemaVersion, Actions: actions}
}

func checksum16(payload []byte) uint16 {
	var sum uint16
	for _, value := range payload {
		sum += uint16(value)
	}
	return sum
}

// ActionNames returns the stable source schema action set for diagnostics and
// tests without exposing mutable package state.
func ActionNames() []string {
	names := append([]string(nil), requiredActions...)
	sort.Strings(names)
	return names
}
