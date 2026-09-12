package automation

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

// PermissionID is a stable OpenDesk permission-domain identifier. It describes
// operating-system consent or process constraints, not Runtime capabilities.
type PermissionID string

const (
	PermissionAccessibility   PermissionID = "accessibility"
	PermissionScreenCapture   PermissionID = "screen-capture"
	PermissionInputMonitoring PermissionID = "input-monitoring"
	PermissionAutomation      PermissionID = "automation"
)

type PermissionRequirement string

const (
	PermissionRequired PermissionRequirement = "required"
	PermissionOptional PermissionRequirement = "optional"
	PermissionOnDemand PermissionRequirement = "on-demand"
)

type PermissionStatus string

const (
	PermissionGranted       PermissionStatus = "granted"
	PermissionDenied        PermissionStatus = "denied"
	PermissionNotDetermined PermissionStatus = "not_determined"
	PermissionRestricted    PermissionStatus = "restricted"
	PermissionUnsupported   PermissionStatus = "unsupported"
	PermissionUnavailable   PermissionStatus = "unavailable"
	PermissionUnknown       PermissionStatus = "unknown"
	PermissionNotRequired   PermissionStatus = "not_required"
)

type PermissionOverall string

const (
	PermissionReady          PermissionOverall = "READY"
	PermissionLimited        PermissionOverall = "LIMITED"
	PermissionBlocked        PermissionOverall = "BLOCKED"
	PermissionUnknownOverall PermissionOverall = "UNKNOWN"
)

// PermissionRequestOptions controls an explicit permission request. Force only
// bypasses the short retry cooldown; it never bypasses an already-ready check
// or the per-permission single-flight guard.
type PermissionRequestOptions struct {
	Force bool `json:"force"`
}

// PermissionSettingsResult reports how Settings navigation completed. Fallback
// is true when OpenDesk could only open the general privacy/security pane and
// the product UI should show Guidance for manual navigation.
type PermissionSettingsResult struct {
	Opened   bool   `json:"opened"`
	ID       string `json:"id"`
	Fallback bool   `json:"fallback"`
	Guidance string `json:"guidance,omitempty"`
}

// RuntimePermission is the shared App/CLI contract for one permission. Status
// always describes the identity of the process performing this query.
type RuntimePermission struct {
	ID              string                `json:"id"`
	Platform        string                `json:"platform"`
	DisplayName     string                `json:"displayName"`
	Description     string                `json:"description"`
	Requirement     PermissionRequirement `json:"requirement"`
	Status          PermissionStatus      `json:"status"`
	CanRequest      bool                  `json:"canRequest"`
	CanOpenSettings bool                  `json:"canOpenSettings"`
	SettingsTarget  string                `json:"settingsTarget,omitempty"`
	Remediation     string                `json:"remediation,omitempty"`
	Evidence        map[string]any        `json:"evidence,omitempty"`
}

// RuntimePermissionIdentity makes App-vs-CLI identity explicit instead of
// assuming that TCC consent granted to one launch identity applies to another.
type RuntimePermissionIdentity struct {
	ProcessID  int    `json:"processId"`
	Executable string `json:"executable"`
	BundlePath string `json:"bundlePath,omitempty"`
	LaunchKind string `json:"launchKind"`
}

type RuntimePermissionReport struct {
	Platform    string                    `json:"platform"`
	Feature     string                    `json:"feature"`
	Overall     PermissionOverall         `json:"overall"`
	Identity    RuntimePermissionIdentity `json:"identity"`
	Permissions []RuntimePermission       `json:"permissions"`
	CheckedAt   string                    `json:"checkedAt"`
}

type permissionDefinition struct {
	ID             PermissionID
	DisplayName    string
	Description    string
	SettingsTarget string
}

type permissionProbe struct {
	Status      PermissionStatus
	Remediation string
	Evidence    map[string]any
}

type permissionProvider interface {
	Check(id PermissionID, target string) permissionProbe
	Request(id PermissionID, target string) (permissionProbe, error)
	OpenSettings(id PermissionID) (PermissionSettingsResult, error)
}

var permissionCatalog = []permissionDefinition{
	{PermissionAccessibility, "Accessibility", "Allows desktop UI inspection and interaction.", "Privacy & Security > Accessibility"},
	{PermissionScreenCapture, "Screen Recording", "Allows screenshots, visual location and OCR/image automation.", "Privacy & Security > Screen & System Audio Recording"},
	{PermissionInputMonitoring, "Input Monitoring", "Allows recorder features that listen to global keyboard/input events.", "Privacy & Security > Input Monitoring"},
	{PermissionAutomation, "Automation", "Controls another macOS application with Apple Events only when a feature explicitly requests it.", "Privacy & Security > Automation"},
}

const defaultPermissionRequestCooldown = 2 * time.Second

type permissionRequestFlight struct {
	done  chan struct{}
	probe permissionProbe
	err   error
}

type permissionRequestCoordinator struct {
	mu              sync.Mutex
	inFlight        map[string]*permissionRequestFlight
	lastRequestedAt map[string]time.Time
	cooldown        time.Duration
	now             func() time.Time
}

var defaultPermissionRequestCoordinator = newPermissionRequestCoordinator(defaultPermissionRequestCooldown)

func newPermissionRequestCoordinator(cooldown time.Duration) *permissionRequestCoordinator {
	return &permissionRequestCoordinator{
		inFlight:        map[string]*permissionRequestFlight{},
		lastRequestedAt: map[string]time.Time{},
		cooldown:        cooldown,
		now:             time.Now,
	}
}

func permissionRequestKey(id PermissionID, target string) string {
	key := string(id)
	if target != "" {
		key += ":" + target
	}
	return key
}

func permissionReady(status PermissionStatus) bool {
	return status == PermissionGranted || status == PermissionNotRequired
}

func withPermissionEvidence(probe permissionProbe, key string, value any) permissionProbe {
	if probe.Evidence == nil {
		probe.Evidence = map[string]any{}
	}
	probe.Evidence[key] = value
	return probe
}

// request serializes native prompts per permission while allowing unrelated
// permission requests to proceed independently. A completed native request is
// guarded only for a short cooldown; it is never permanently remembered.
func (c *permissionRequestCoordinator) request(provider permissionProvider, id PermissionID, target string, options PermissionRequestOptions) (permissionProbe, error) {
	probe := provider.Check(id, target)
	if permissionReady(probe.Status) {
		return withPermissionEvidence(probe, "requestSkipped", "already_ready"), nil
	}

	key := permissionRequestKey(id, target)
	c.mu.Lock()
	if flight := c.inFlight[key]; flight != nil {
		c.mu.Unlock()
		<-flight.done
		return flight.probe, flight.err
	}
	now := c.now()
	if !options.Force {
		if last, ok := c.lastRequestedAt[key]; ok && now.Sub(last) < c.cooldown {
			c.mu.Unlock()
			return withPermissionEvidence(probe, "requestSkipped", "retry_cooldown"), nil
		}
	}
	flight := &permissionRequestFlight{done: make(chan struct{})}
	c.inFlight[key] = flight
	c.mu.Unlock()

	result, err, dispatched := c.performRequest(provider, id, target)

	c.mu.Lock()
	flight.probe = result
	flight.err = err
	if dispatched {
		c.lastRequestedAt[key] = c.now()
	}
	delete(c.inFlight, key)
	close(flight.done)
	c.mu.Unlock()
	return result, err
}

func (c *permissionRequestCoordinator) performRequest(provider permissionProvider, id PermissionID, target string) (permissionProbe, error, bool) {
	// Recheck after becoming the request owner so a grant that landed between
	// the optimistic check and single-flight reservation cannot prompt again.
	probe := provider.Check(id, target)
	if permissionReady(probe.Status) {
		return withPermissionEvidence(probe, "requestSkipped", "already_ready"), nil, false
	}

	requestProbe, requestErr := provider.Request(id, target)
	post := provider.Check(id, target)
	if requestErr != nil {
		return post, requestErr, true
	}
	// Some target-scoped APIs (notably macOS Apple Events) cannot be probed
	// without side effects. Preserve a successful request result when the pure
	// post-check must remain unknown, while still performing that pure check.
	if post.Status == PermissionUnknown && requestProbe.Status == PermissionGranted {
		requestProbe = withPermissionEvidence(requestProbe, "postCheckStatus", string(post.Status))
		return requestProbe, nil, true
	}
	return post, nil, true
}

// GetPermissionReport is the single aggregate status entry point used by
// product App Mode and CLI. It is side-effect free and never requests consent.
func GetPermissionReport(feature string) RuntimePermissionReport {
	feature = normalizePermissionFeature(feature)
	provider := newPermissionProvider()
	requirements := permissionRequirements(feature)
	permissions := make([]RuntimePermission, 0, len(permissionCatalog))
	for _, definition := range permissionCatalog {
		probe := provider.Check(definition.ID, "")
		permissions = append(permissions, runtimePermission(definition, requirements[definition.ID], "", probe))
	}
	return RuntimePermissionReport{
		Platform:    runtime.GOOS,
		Feature:     feature,
		Overall:     aggregatePermissionOverall(permissions),
		Identity:    currentPermissionIdentity(),
		Permissions: permissions,
		CheckedAt:   time.Now().UTC().Format(time.RFC3339),
	}
}

func CheckPermission(id string) (RuntimePermission, error) {
	return checkPermissionWithProvider(newPermissionProvider(), id)
}

func checkPermissionWithProvider(provider permissionProvider, id string) (RuntimePermission, error) {
	baseID, target, err := parsePermissionID(id)
	if err != nil {
		return RuntimePermission{}, err
	}
	definition, ok := findPermissionDefinition(baseID)
	if !ok {
		return RuntimePermission{}, fmt.Errorf("unknown permission id %q", id)
	}
	probe := provider.Check(baseID, target)
	return runtimePermission(definition, PermissionOnDemand, target, probe), nil
}

// RequestPermission preserves the existing Go call shape and uses the default
// non-forced request contract.
func RequestPermission(id string) (RuntimePermission, error) {
	return RequestPermissionWithOptions(id, PermissionRequestOptions{})
}

// RequestPermissionWithOptions may trigger a platform consent prompt and must
// be called only from an explicit user action or the first real protected use.
func RequestPermissionWithOptions(id string, options PermissionRequestOptions) (RuntimePermission, error) {
	return requestPermissionWithProvider(defaultPermissionRequestCoordinator, newPermissionProvider(), id, options)
}

func requestPermissionWithProvider(coordinator *permissionRequestCoordinator, provider permissionProvider, id string, options PermissionRequestOptions) (RuntimePermission, error) {
	baseID, target, err := parsePermissionID(id)
	if err != nil {
		return RuntimePermission{}, err
	}
	definition, ok := findPermissionDefinition(baseID)
	if !ok {
		return RuntimePermission{}, fmt.Errorf("unknown permission id %q", id)
	}
	probe, err := coordinator.request(provider, baseID, target, options)
	if err != nil {
		return RuntimePermission{}, err
	}
	return runtimePermission(definition, PermissionOnDemand, target, probe), nil
}

func OpenPermissionSettings(id string) error {
	_, err := OpenPermissionSettingsDetailed(id)
	return err
}

func OpenPermissionSettingsDetailed(id string) (PermissionSettingsResult, error) {
	baseID, _, err := parsePermissionID(id)
	if err != nil {
		return PermissionSettingsResult{}, err
	}
	if _, ok := findPermissionDefinition(baseID); !ok {
		return PermissionSettingsResult{}, fmt.Errorf("unknown permission id %q", id)
	}
	result, err := newPermissionProvider().OpenSettings(baseID)
	if result.ID == "" {
		result.ID = string(baseID)
	}
	return result, err
}

func runtimePermission(definition permissionDefinition, requirement PermissionRequirement, target string, probe permissionProbe) RuntimePermission {
	if requirement == "" {
		requirement = PermissionOnDemand
	}
	permission := RuntimePermission{
		ID:              string(definition.ID),
		Platform:        runtime.GOOS,
		DisplayName:     definition.DisplayName,
		Description:     definition.Description,
		Requirement:     requirement,
		Status:          probe.Status,
		SettingsTarget:  definition.SettingsTarget,
		Remediation:     probe.Remediation,
		Evidence:        clonePermissionEvidence(probe.Evidence),
	}
	if target != "" {
		permission.ID += ":" + target
		if permission.Evidence == nil {
			permission.Evidence = map[string]any{}
		}
		permission.Evidence["targetApp"] = target
	}
	if runtime.GOOS == "darwin" {
		permission.CanOpenSettings = true
		permission.CanRequest = definition.ID != PermissionAutomation || target != ""
	}
	return permission
}

func permissionRequirements(feature string) map[PermissionID]PermissionRequirement {
	result := map[PermissionID]PermissionRequirement{
		PermissionAccessibility:   PermissionOnDemand,
		PermissionScreenCapture:   PermissionOnDemand,
		PermissionInputMonitoring: PermissionOnDemand,
		PermissionAutomation:      PermissionOnDemand,
	}
	switch feature {
	case "desktop-automation":
		result[PermissionAccessibility] = PermissionRequired
		result[PermissionScreenCapture] = PermissionRequired
		result[PermissionInputMonitoring] = PermissionOptional
	case "recorder":
		result[PermissionAccessibility] = PermissionRequired
		result[PermissionScreenCapture] = PermissionRequired
		result[PermissionInputMonitoring] = PermissionOptional
	case "screenshot":
		result[PermissionScreenCapture] = PermissionRequired
	case "ui-automation":
		result[PermissionAccessibility] = PermissionRequired
	case "script-runner", "scheduler", "inspector":
		// Product surfaces do not require desktop consent by themselves.
	}
	return result
}

func normalizePermissionFeature(feature string) string {
	feature = strings.ToLower(strings.TrimSpace(feature))
	switch feature {
	case "", "desktop", "automation":
		return "desktop-automation"
	case "desktop-automation", "recorder", "screenshot", "ui-automation", "script-runner", "scheduler", "inspector":
		return feature
	default:
		return feature
	}
}

func aggregatePermissionOverall(permissions []RuntimePermission) PermissionOverall {
	blocked := false
	unknownRequired := false
	limited := false
	for _, permission := range permissions {
		ready := permission.Status == PermissionGranted || permission.Status == PermissionNotRequired
		switch permission.Requirement {
		case PermissionRequired:
			if ready {
				continue
			}
			switch permission.Status {
			case PermissionUnknown, PermissionNotDetermined:
				unknownRequired = true
			default:
				blocked = true
			}
		case PermissionOptional:
			if !ready {
				limited = true
			}
		}
	}
	if blocked {
		return PermissionBlocked
	}
	if unknownRequired {
		return PermissionUnknownOverall
	}
	if limited {
		return PermissionLimited
	}
	return PermissionReady
}

func parsePermissionID(value string) (PermissionID, string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", "", fmt.Errorf("permission id is required")
	}
	parts := strings.SplitN(value, ":", 2)
	base := PermissionID(strings.ToLower(strings.TrimSpace(parts[0])))
	if _, ok := findPermissionDefinition(base); !ok {
		return "", "", fmt.Errorf("unknown permission id %q", value)
	}
	target := ""
	if len(parts) == 2 {
		target = strings.TrimSpace(parts[1])
		if base != PermissionAutomation {
			return "", "", fmt.Errorf("permission %q does not accept a target application", base)
		}
		if target == "" {
			return "", "", fmt.Errorf("automation permission target application is required")
		}
	}
	return base, target, nil
}

func findPermissionDefinition(id PermissionID) (permissionDefinition, bool) {
	for _, definition := range permissionCatalog {
		if definition.ID == id {
			return definition, true
		}
	}
	return permissionDefinition{}, false
}

func currentPermissionIdentity() RuntimePermissionIdentity {
	executable, _ := os.Executable()
	if resolved, err := filepath.EvalSymlinks(executable); err == nil && resolved != "" {
		executable = resolved
	}
	if absolute, err := filepath.Abs(executable); err == nil {
		executable = absolute
	}
	identity := RuntimePermissionIdentity{ProcessID: os.Getpid(), Executable: executable, LaunchKind: "process"}
	clean := filepath.ToSlash(executable)
	if runtime.GOOS == "darwin" {
		const marker = ".app/Contents/MacOS/"
		if index := strings.Index(clean, marker); index >= 0 {
			identity.BundlePath = clean[:index+len(".app")]
			identity.LaunchKind = "app-bundle"
		} else {
			identity.LaunchKind = "cli-or-child"
		}
	} else if runtime.GOOS == "windows" {
		identity.LaunchKind = "windows-process"
	}
	return identity
}

func clonePermissionEvidence(input map[string]any) map[string]any {
	if len(input) == 0 {
		return nil
	}
	output := make(map[string]any, len(input))
	keys := make([]string, 0, len(input))
	for key := range input {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		output[key] = input[key]
	}
	return output
}

// windowsPermissionProvider deliberately does not invent TCC-like Windows
// permissions. P0 desktop APIs require no equivalent consent; elevated target
// processes remain constrained by Windows integrity/UAC rules.
type windowsPermissionProvider struct{}

func (windowsPermissionProvider) Check(id PermissionID, target string) permissionProbe {
	_ = target
	return permissionProbe{
		Status:      PermissionNotRequired,
		Remediation: "No Windows consent is required for this capability. A non-elevated OpenDesk process may still be unable to automate a higher-integrity elevated application.",
		Evidence:    map[string]any{"securityModel": "windows-integrity-uac", "permission": string(id)},
	}
}

func (windowsPermissionProvider) Request(id PermissionID, target string) (permissionProbe, error) {
	return windowsPermissionProvider{}.Check(id, target), nil
}

func (windowsPermissionProvider) OpenSettings(id PermissionID) (PermissionSettingsResult, error) {
	return PermissionSettingsResult{ID: string(id)}, fmt.Errorf("permission %q has no Windows consent settings page", id)
}

type unsupportedPermissionProvider struct{ platform string }

func (p unsupportedPermissionProvider) Check(id PermissionID, target string) permissionProbe {
	_ = target
	return permissionProbe{Status: PermissionUnsupported, Remediation: fmt.Sprintf("OpenDesk permission management is not implemented for %s.", p.platform), Evidence: map[string]any{"permission": string(id)}}
}
func (p unsupportedPermissionProvider) Request(id PermissionID, target string) (permissionProbe, error) {
	return p.Check(id, target), fmt.Errorf("permission %q request is unsupported on %s", id, p.platform)
}
func (p unsupportedPermissionProvider) OpenSettings(id PermissionID) (PermissionSettingsResult, error) {
	return PermissionSettingsResult{ID: string(id)}, fmt.Errorf("permission %q settings are unsupported on %s", id, p.platform)
}
