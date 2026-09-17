package productanalytics

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	SchemaVersion        = 1
	ConsentUnknown       = "unknown"
	ConsentDenied        = "denied"
	ConsentGranted       = "granted"
	ProviderDisabled     = "disabled"
	ProviderDebug        = "debug"
	ProviderPostHog      = "posthog"
	defaultMaxEventBytes = 2 * 1024
	defaultSessionIdle   = 30 * time.Minute
	defaultShutdown      = 750 * time.Millisecond
	defaultDebugCapacity = 100
)

var (
	allowedSurfaces = map[string]bool{
		"flow_runner": true, "flow_list": true, "assistant": true, "scheduler": true,
		"permissions": true, "runtime_log": true, "about": true, "analytics_settings": true,
	}
	allowedActions = map[string]bool{
		"flow.run": true, "flow.stop": true, "flow.previous": true, "flow.next": true,
		"flow.list": true, "flow.manage": true, "app.open": true, "analytics.open": true,
	}
	allowedInputMethods = map[string]bool{"pointer": true, "keyboard": true, "menu": true}
	allowedFlowOrigins  = map[string]bool{"local": true, "installed": true, "marketplace": true}
	allowedRunSources   = map[string]bool{"foreground": true, "background": true}
	allowedOutcomes     = map[string]bool{"success": true, "failure": true, "cancelled": true}
	allowedErrorCodes   = map[string]bool{
		"": true, "permission_denied": true, "execution_failed": true,
		"startup_failed": true, "timeout": true, "unknown": true,
	}
	allowedPlatforms = map[string]bool{"macos": true, "windows": true, "linux": true}
	allowedArch      = map[string]bool{"amd64": true, "arm64": true, "386": true, "arm": true}
)

type Config struct {
	Provider            string
	Endpoint            string
	ProjectToken        string
	Environment         string
	MaxEventBytes       int
	MaxQueueSize        int
	BatchSize           int
	MaxEnqueuedRequests int
	RequestTimeout      time.Duration
	FlushInterval       time.Duration
	MaxRetries          int
	ShutdownTimeout     time.Duration
	SessionTimeout      time.Duration
}

type RuntimeInfo struct {
	AppVersion string
	Platform   string
	Arch       string
}

type Options struct {
	DataRoot      string
	Config        Config
	Runtime       RuntimeInfo
	Now           func() time.Time
	Transport     http.RoundTripper
	ProviderMaker func(Config, http.RoundTripper) (Provider, error)
	DebugCapacity int
}

type Provider interface {
	Enqueue(Event) error
	Disable()
	Close(context.Context, bool) error
}

type Event struct {
	Name       string         `json:"event"`
	DistinctID string         `json:"distinct_id"`
	EventID    string         `json:"event_id"`
	OccurredAt time.Time      `json:"occurred_at"`
	Properties map[string]any `json:"properties"`
}

type Status struct {
	Consent        string `json:"consent"`
	Provider       string `json:"provider"`
	Configured     bool   `json:"configured"`
	CaptureEnabled bool   `json:"captureEnabled"`
	InstallIDSet   bool   `json:"installIdSet"`
	DebugEvents    int    `json:"debugEvents"`
	DroppedEvents  uint64 `json:"droppedEvents"`
	LastErrorCode  string `json:"lastErrorCode"`
}

type runContext struct {
	SessionID string
	StartedAt time.Time
	Origin    string
	Source    string
}

type persistedConsent struct {
	SchemaVersion int    `json:"schemaVersion"`
	State         string `json:"state"`
	InstallID     string `json:"installId,omitempty"`
}

type Service struct {
	mu sync.Mutex

	config       Config
	runtime      RuntimeInfo
	dataRoot     string
	now          func() time.Time
	transport    http.RoundTripper
	makeProvider func(Config, http.RoundTripper) (Provider, error)

	consent        string
	installID      string
	processID      string
	sessionID      string
	lastForeground time.Time
	provider       Provider
	started        bool
	closed         bool

	runs          map[string]runContext
	debugCapacity int
	debug         []Event
	dropped       uint64
	lastErrorCode string
}

func New(options Options) (*Service, error) {
	config := normalizeConfig(options.Config)
	if err := validateConfig(config); err != nil {
		return nil, err
	}
	runtimeInfo, err := normalizeRuntime(options.Runtime)
	if err != nil {
		return nil, err
	}
	root := filepath.Clean(strings.TrimSpace(options.DataRoot))
	if root == "." || root == "" {
		return nil, errors.New("product analytics data root is required")
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.DebugCapacity <= 0 || options.DebugCapacity > 1000 {
		options.DebugCapacity = defaultDebugCapacity
	}
	maker := options.ProviderMaker
	if maker == nil {
		maker = newPostHogProvider
	}
	service := &Service{
		config: config, runtime: runtimeInfo, dataRoot: root, now: options.Now,
		transport: options.Transport, makeProvider: maker, consent: ConsentUnknown,
		runs: map[string]runContext{}, debugCapacity: options.DebugCapacity,
	}
	persisted, readErr := readConsent(service.consentPath())
	if readErr != nil {
		// Corrupt or unreadable consent fails closed. Do not manufacture an identity.
		service.lastErrorCode = "consent_read_failed"
		return service, nil
	}
	switch persisted.State {
	case ConsentGranted:
		if !validID(persisted.InstallID) {
			// Consent exists, so a new random analytics identity is allowed, but it
			// must be durably saved before capture can start.
			persisted.InstallID = randomID()
			if persisted.InstallID == "" {
				service.lastErrorCode = "identity_generation_failed"
				return service, nil
			}
			if writeErr := writeConsent(service.consentPath(), persistedConsent{
				SchemaVersion: SchemaVersion, State: ConsentGranted, InstallID: persisted.InstallID,
			}); writeErr != nil {
				service.lastErrorCode = "consent_write_failed"
				return service, nil
			}
		}
		service.consent = ConsentGranted
		service.installID = persisted.InstallID
	case ConsentDenied:
		service.consent = ConsentDenied
	}
	if service.consent == ConsentGranted && service.captureConfiguredLocked() {
		if err := service.ensureProviderLocked(); err != nil {
			service.lastErrorCode = "provider_init_failed"
		}
	}
	return service, nil
}

func normalizeConfig(config Config) Config {
	config.Provider = strings.ToLower(strings.TrimSpace(config.Provider))
	if config.Provider == "" {
		config.Provider = ProviderDisabled
	}
	config.Endpoint = strings.TrimRight(strings.TrimSpace(config.Endpoint), "/")
	config.ProjectToken = strings.TrimSpace(config.ProjectToken)
	config.Environment = strings.ToLower(strings.TrimSpace(config.Environment))
	if config.Environment == "" {
		config.Environment = "production"
	}
	if config.MaxEventBytes <= 0 || config.MaxEventBytes > defaultMaxEventBytes {
		config.MaxEventBytes = defaultMaxEventBytes
	}
	if config.MaxQueueSize <= 0 || config.MaxQueueSize > 1000 {
		config.MaxQueueSize = 1000
	}
	if config.BatchSize <= 0 || config.BatchSize > 100 {
		config.BatchSize = 20
	}
	if config.BatchSize > config.MaxQueueSize {
		config.BatchSize = config.MaxQueueSize
	}
	if config.MaxEnqueuedRequests <= 0 || config.MaxEnqueuedRequests > 16 {
		config.MaxEnqueuedRequests = 4
	}
	if config.RequestTimeout <= 0 || config.RequestTimeout > 5*time.Second {
		config.RequestTimeout = 3 * time.Second
	}
	if config.FlushInterval <= 0 || config.FlushInterval > 30*time.Second {
		config.FlushInterval = 5 * time.Second
	}
	if config.MaxRetries < 0 || config.MaxRetries > 3 {
		config.MaxRetries = 1
	}
	if config.ShutdownTimeout <= 0 || config.ShutdownTimeout > time.Second {
		config.ShutdownTimeout = defaultShutdown
	}
	if config.SessionTimeout <= 0 || config.SessionTimeout > 2*time.Hour {
		config.SessionTimeout = defaultSessionIdle
	}
	return config
}

func validateConfig(config Config) error {
	if config.Provider != ProviderDisabled && config.Provider != ProviderDebug && config.Provider != ProviderPostHog {
		return fmt.Errorf("unsupported product analytics provider %q", config.Provider)
	}
	if config.Environment != "production" && config.Environment != "development" && config.Environment != "test" {
		return fmt.Errorf("unsupported product analytics environment %q", config.Environment)
	}
	if config.Provider == ProviderDebug && config.Environment == "production" {
		return errors.New("debug product analytics cannot run in production environment")
	}
	if config.Provider == ProviderPostHog && config.Endpoint != "" {
		parsed, err := url.Parse(config.Endpoint)
		if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
			return errors.New("product analytics endpoint must be a PostHog HTTPS origin")
		}
	}
	if len(config.ProjectToken) > 256 || strings.ContainsAny(config.ProjectToken, "\r\n\t ") {
		return errors.New("product analytics project token is invalid")
	}
	if config.ProjectToken != "" && !strings.HasPrefix(config.ProjectToken, "phc_") {
		return errors.New("product analytics project token must be a public PostHog capture token")
	}
	return nil
}

func normalizeRuntime(runtimeInfo RuntimeInfo) (RuntimeInfo, error) {
	runtimeInfo.AppVersion = strings.TrimSpace(runtimeInfo.AppVersion)
	if runtimeInfo.AppVersion == "" || len(runtimeInfo.AppVersion) > 64 {
		return RuntimeInfo{}, errors.New("product analytics app version is invalid")
	}
	runtimeInfo.Platform = normalizePlatform(runtimeInfo.Platform)
	if !allowedPlatforms[runtimeInfo.Platform] {
		return RuntimeInfo{}, fmt.Errorf("unsupported product analytics platform %q", runtimeInfo.Platform)
	}
	runtimeInfo.Arch = strings.ToLower(strings.TrimSpace(runtimeInfo.Arch))
	if !allowedArch[runtimeInfo.Arch] {
		return RuntimeInfo{}, fmt.Errorf("unsupported product analytics architecture %q", runtimeInfo.Arch)
	}
	return runtimeInfo, nil
}
