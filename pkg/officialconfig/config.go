// Package officialconfig owns the ODCFG1 compile, decode, and validation
// contract for OpenDesk first-party product configuration.
package officialconfig

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
)

const (
	// BaseName is the stable filename stem for the publisher-owned product
	// configuration. The Runtime loader mirrors this value and product
	// integration tests keep the cross-language contract aligned.
	BaseName      = "product"
	Magic         = "ODCFG1"
	SchemaVersion = 1
	// The filename change does not define a new wire format. Keep the existing
	// ODCFG1 key so already-generated payload semantics remain compatible.
	obfuscationKey = "OpenDeskOfficialShell/v1"
)

var httpsURLPattern = regexp.MustCompile(`^https://[^\s/?#\\]+(?:[/?#][^\s]*)?$`)

var requiredActions = []string{"home", "help", "customize", "marketplace", "upgrade"}
var optionalActions = []string{"examples", "apiDocs"}

var coreActions = map[string]bool{
	"home":      true,
	"help":      true,
	"customize": true,
	"examples":  true,
	"apiDocs":   true,
}

type Action struct {
	Visible bool   `json:"visible"`
	URL     string `json:"url"`
}

type AnalyticsQueue struct {
	MaxEvents   int `json:"maxEvents"`
	BatchSize   int `json:"batchSize"`
	MaxRequests int `json:"maxRequests"`
}

type AnalyticsNetwork struct {
	RequestTimeoutMs int `json:"requestTimeoutMs"`
	FlushIntervalMs  int `json:"flushIntervalMs"`
	MaxRetries       int `json:"maxRetries"`
	ShutdownTimeoutMs int `json:"shutdownTimeoutMs"`
}

type AnalyticsSession struct {
	IdleTimeoutMinutes int `json:"idleTimeoutMinutes"`
}

// Analytics is publisher-owned product network configuration. ProjectToken is
// intentionally the public PostHog capture token (phc_), never a Personal API
// Key, Project Secret API Key, license credential, or other management secret.
type Analytics struct {
	Provider      string           `json:"provider"`
	Endpoint      string           `json:"endpoint"`
	ProjectToken  string           `json:"projectToken"`
	Environment   string           `json:"environment"`
	MaxEventBytes int              `json:"maxEventBytes"`
	Queue         AnalyticsQueue   `json:"queue"`
	Network       AnalyticsNetwork `json:"network"`
	Session       AnalyticsSession `json:"session"`
}

type Config struct {
	SchemaVersion int               `json:"schemaVersion"`
	Actions       map[string]Action `json:"actions"`
	Analytics     *Analytics        `json:"analytics,omitempty"`
}

// ParseSource parses the developer-owned plaintext source configuration.
func ParseSource(data []byte) (Config, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var config Config
	if err := decoder.Decode(&config); err != nil {
		return Config{}, fmt.Errorf("parse official config source: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return Config{}, fmt.Errorf("parse official config source: trailing JSON values are not allowed")
		}
		return Config{}, fmt.Errorf("parse official config source trailing data: %w", err)
	}
	if err := Validate(config); err != nil {
		return Config{}, err
	}
	return normalize(config), nil
}

// Validate enforces the public ODCFG1 schema. All publisher-owned network and
// navigation settings share configs/product.json as their one plaintext source.
func Validate(config Config) error {
	if config.SchemaVersion != SchemaVersion {
		return fmt.Errorf("official config schemaVersion %d is unsupported", config.SchemaVersion)
	}
	if config.Actions == nil {
		return fmt.Errorf("official config actions are required")
	}

	allowed := make(map[string]bool, len(requiredActions)+len(optionalActions))
	required := make(map[string]bool, len(requiredActions))
	for _, name := range requiredActions {
		allowed[name] = true
		required[name] = true
	}
	for _, name := range optionalActions {
		allowed[name] = true
	}
	for name := range config.Actions {
		if !allowed[name] {
			return fmt.Errorf("official config contains unknown action %q", name)
		}
	}
	for _, name := range allActionNames() {
		action, ok := config.Actions[name]
		if !ok {
			if required[name] {
				return fmt.Errorf("official config is missing action %q", name)
			}
			continue
		}
		url := strings.TrimSpace(action.URL)
		if url != "" && !httpsURLPattern.MatchString(url) {
			return fmt.Errorf("official config action %q only accepts https URL", name)
		}
		if name == "home" && url == "" {
			return fmt.Errorf("official config action %q requires https URL", name)
		}
		if coreActions[name] && !action.Visible {
			return fmt.Errorf("official config core action %q cannot be hidden", name)
		}
	}
	if config.Analytics != nil {
		if err := validateAnalytics(*config.Analytics); err != nil {
			return err
		}
	}
	return nil
}

func validateAnalytics(config Analytics) error {
	provider := strings.ToLower(strings.TrimSpace(config.Provider))
	if provider != "posthog" && provider != "debug" && provider != "disabled" {
		return fmt.Errorf("official config analytics provider %q is unsupported", config.Provider)
	}
	environment := strings.ToLower(strings.TrimSpace(config.Environment))
	if environment != "production" && environment != "development" && environment != "test" {
		return fmt.Errorf("official config analytics environment %q is unsupported", config.Environment)
	}
	if provider == "debug" && environment == "production" {
		return fmt.Errorf("official config analytics debug provider is not allowed in production")
	}
	endpoint := strings.TrimSpace(config.Endpoint)
	if provider == "posthog" {
		parsed, err := url.Parse(endpoint)
		if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
			return fmt.Errorf("official config analytics endpoint must be an https origin")
		}
	}
	token := strings.TrimSpace(config.ProjectToken)
	if len(token) > 256 || strings.ContainsAny(token, "\r\n\t ") || (token != "" && !strings.HasPrefix(token, "phc_")) {
		return fmt.Errorf("official config analytics projectToken must be an empty or public phc_ capture token")
	}
	if config.MaxEventBytes < 256 || config.MaxEventBytes > 2048 {
		return fmt.Errorf("official config analytics maxEventBytes must be in [256,2048]")
	}
	if config.Queue.MaxEvents < 1 || config.Queue.MaxEvents > 1000 || config.Queue.BatchSize < 1 || config.Queue.BatchSize > 100 || config.Queue.BatchSize > config.Queue.MaxEvents || config.Queue.MaxRequests < 1 || config.Queue.MaxRequests > 16 {
		return fmt.Errorf("official config analytics queue bounds are invalid")
	}
	if config.Network.RequestTimeoutMs < 100 || config.Network.RequestTimeoutMs > 5000 || config.Network.FlushIntervalMs < 100 || config.Network.FlushIntervalMs > 30000 || config.Network.MaxRetries < 0 || config.Network.MaxRetries > 3 || config.Network.ShutdownTimeoutMs < 100 || config.Network.ShutdownTimeoutMs > 1000 {
		return fmt.Errorf("official config analytics network bounds are invalid")
	}
	if config.Session.IdleTimeoutMinutes < 1 || config.Session.IdleTimeoutMinutes > 120 {
		return fmt.Errorf("official config analytics session idleTimeoutMinutes must be in [1,120]")
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

// Decode decodes and validates an ODCFG1 payload. It is used by CLI callers to
// guarantee parity with the JavaScript Official Shell loader.
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

// CompileFile performs one deterministic plaintext JSON input to one ODCFG1
// output conversion. Product-specific source and release paths belong to the
// caller, not this file conversion API.
func CompileFile(inputPath, outputPath string) (Config, error) {
	return compileFile(inputPath, outputPath, replaceConfigFile)
}

func compileFile(inputPath, outputPath string, replace func(string, string) error) (Config, error) {
	inputPath = filepath.Clean(strings.TrimSpace(inputPath))
	outputPath = filepath.Clean(strings.TrimSpace(outputPath))
	if err := validateCompilePaths(inputPath, outputPath); err != nil {
		return Config{}, err
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		return Config{}, fmt.Errorf("read config input %q: %w", inputPath, err)
	}
	config, err := ParseSource(data)
	if err != nil {
		return Config{}, err
	}
	encoded, err := Encode(config)
	if err != nil {
		return Config{}, err
	}
	if err := writeConfigFileAtomically(outputPath, encoded, replace); err != nil {
		return Config{}, err
	}
	return config, nil
}

func validateCompilePaths(inputPath, outputPath string) error {
	if inputPath == "." || inputPath == "" {
		return fmt.Errorf("config input path is required")
	}
	if outputPath == "." || outputPath == "" {
		return fmt.Errorf("config output path is required")
	}
	if sameCleanPath(inputPath, outputPath) {
		return fmt.Errorf("config input and output must be different files")
	}
	if !strings.EqualFold(filepath.Ext(inputPath), ".json") {
		return fmt.Errorf("config input must be a .json file: %q", inputPath)
	}
	if strings.TrimSuffix(filepath.Base(inputPath), filepath.Ext(inputPath)) == "" {
		return fmt.Errorf("config input filename must have a basename before .json")
	}
	if !strings.EqualFold(filepath.Ext(outputPath), ".odcfg") {
		return fmt.Errorf("config output must be a .odcfg file: %q", outputPath)
	}
	if strings.TrimSuffix(filepath.Base(outputPath), filepath.Ext(outputPath)) == "" {
		return fmt.Errorf("config output filename must have a basename before .odcfg")
	}

	inputInfo, inputErr := os.Stat(inputPath)
	outputInfo, outputErr := os.Stat(outputPath)
	if outputErr != nil && !errors.Is(outputErr, os.ErrNotExist) {
		return fmt.Errorf("inspect config output %q: %w", outputPath, outputErr)
	}
	if inputErr == nil && outputErr == nil && os.SameFile(inputInfo, outputInfo) {
		return fmt.Errorf("config input and output must be different files")
	}
	return nil
}

func sameCleanPath(first, second string) bool {
	firstAbsolute, firstErr := filepath.Abs(first)
	secondAbsolute, secondErr := filepath.Abs(second)
	if firstErr != nil || secondErr != nil {
		return first == second
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(firstAbsolute, secondAbsolute)
	}
	return firstAbsolute == secondAbsolute
}

// InspectFile decodes and validates one generated ODCFG1 input.
func InspectFile(inputPath string) (Config, error) {
	inputPath = filepath.Clean(strings.TrimSpace(inputPath))
	if inputPath == "." || inputPath == "" {
		return Config{}, fmt.Errorf("config inspect input path is required")
	}
	if !strings.EqualFold(filepath.Ext(inputPath), ".odcfg") {
		return Config{}, fmt.Errorf("config inspect input must be a .odcfg file: %q", inputPath)
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		return Config{}, fmt.Errorf("read config inspect input %q: %w", inputPath, err)
	}
	config, err := Decode(data)
	if err != nil {
		return Config{}, fmt.Errorf("inspect config input %q: %w", inputPath, err)
	}
	return config, nil
}

// VerifyFiles validates one plaintext JSON input and one generated ODCFG1
// output, then requires the output bytes to match the deterministic encoding
// of the input. This catches a valid but stale output as well as corruption.
func VerifyFiles(inputPath, outputPath string) (Config, error) {
	inputPath = filepath.Clean(strings.TrimSpace(inputPath))
	outputPath = filepath.Clean(strings.TrimSpace(outputPath))
	if err := validateCompilePaths(inputPath, outputPath); err != nil {
		return Config{}, err
	}

	inputData, err := os.ReadFile(inputPath)
	if err != nil {
		return Config{}, fmt.Errorf("read config input %q: %w", inputPath, err)
	}
	inputConfig, err := ParseSource(inputData)
	if err != nil {
		return Config{}, err
	}
	outputData, err := os.ReadFile(outputPath)
	if err != nil {
		return Config{}, fmt.Errorf("read config output %q: %w", outputPath, err)
	}
	if _, err := Decode(outputData); err != nil {
		return Config{}, fmt.Errorf("verify config output %q: %w", outputPath, err)
	}
	expected, err := Encode(inputConfig)
	if err != nil {
		return Config{}, err
	}
	if !bytes.Equal(expected, outputData) {
		return Config{}, fmt.Errorf("config output %q is stale or non-canonical; run `opendesk config compile --input <file.json> --output <file.odcfg>`", outputPath)
	}
	return inputConfig, nil
}

func normalize(config Config) Config {
	actions := make(map[string]Action, len(config.Actions))
	for _, name := range allActionNames() {
		action, ok := config.Actions[name]
		if !ok {
			continue
		}
		action.URL = strings.TrimSpace(action.URL)
		actions[name] = action
	}
	var analytics *Analytics
	if config.Analytics != nil {
		copy := *config.Analytics
		copy.Provider = strings.ToLower(strings.TrimSpace(copy.Provider))
		copy.Endpoint = strings.TrimRight(strings.TrimSpace(copy.Endpoint), "/")
		copy.ProjectToken = strings.TrimSpace(copy.ProjectToken)
		copy.Environment = strings.ToLower(strings.TrimSpace(copy.Environment))
		analytics = &copy
	}
	return Config{SchemaVersion: SchemaVersion, Actions: actions, Analytics: analytics}
}

func checksum16(payload []byte) uint16 {
	var sum uint16
	for _, value := range payload {
		sum += uint16(value)
	}
	return sum
}

func allActionNames() []string {
	names := make([]string, 0, len(requiredActions)+len(optionalActions))
	names = append(names, requiredActions...)
	names = append(names, optionalActions...)
	return names
}

// ActionNames returns the stable source schema action set for diagnostics and
// tests without exposing mutable package state.
func ActionNames() []string {
	names := allActionNames()
	sort.Strings(names)
	return names
}
