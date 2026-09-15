package localization

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	PreferenceAuto = "auto"
	LocaleZhCN     = "zh-CN"
	LocaleEnUS     = "en-US"

	ProductDefaultLocale = LocaleZhCN
)

const (
	DiagnosticMissingKey        = "I18N_MISSING_KEY"
	DiagnosticCatalogMissing    = "I18N_CATALOG_MISSING"
	DiagnosticCatalogInvalid    = "I18N_CATALOG_INVALID"
	DiagnosticPreferenceInvalid = "I18N_PREFERENCE_INVALID"
	DiagnosticSystemUnavailable = "I18N_SYSTEM_LOCALE_UNAVAILABLE"
)

type Diagnostic struct {
	Code     string
	Locale   string
	Key      string
	Fallback string
	Path     string
	Error    string
}

type DiagnosticSink func(Diagnostic)

type Options struct {
	CatalogDir     string
	PreferencePath string
	SystemLocale   func() (string, error)
	Diagnostics    DiagnosticSink
}

type catalogState struct {
	loaded bool
	values map[string]string
}

type Manager struct {
	mu             sync.RWMutex
	preference     string
	systemLocale   string
	resolvedLocale string
	catalogDir     string
	preferencePath string
	systemLocaleFn func() (string, error)
	diagnostics    DiagnosticSink
	catalogs       map[string]catalogState
	reported       map[string]struct{}
}

type preferenceDocument struct {
	LocalePreference string `json:"localePreference"`
}

func NewManager(options Options) *Manager {
	manager := &Manager{
		preference:     PreferenceAuto,
		resolvedLocale: ProductDefaultLocale,
		catalogDir:     filepath.Clean(options.CatalogDir),
		preferencePath: options.PreferencePath,
		systemLocaleFn: options.SystemLocale,
		diagnostics:    options.Diagnostics,
		catalogs:       make(map[string]catalogState),
		reported:       make(map[string]struct{}),
	}
	if strings.TrimSpace(options.CatalogDir) == "" {
		manager.catalogDir = ""
	}
	if manager.systemLocaleFn == nil {
		manager.systemLocaleFn = detectSystemLocale
	}
	if manager.diagnostics == nil {
		manager.diagnostics = defaultDiagnosticSink
	}
	if strings.TrimSpace(manager.preferencePath) == "" {
		path, err := DefaultPreferencePath()
		if err != nil {
			manager.report(Diagnostic{
				Code:     DiagnosticPreferenceInvalid,
				Fallback: PreferenceAuto,
				Error:    err.Error(),
			})
		} else {
			manager.preferencePath = path
		}
	}

	manager.preference = manager.loadPreference()
	manager.systemLocale = manager.readSystemLocale()
	manager.resolvedLocale = ResolveLocale(manager.preference, manager.systemLocale)
	return manager
}

func DefaultPreferencePath() (string, error) {
	root, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config directory: %w", err)
	}
	return filepath.Join(root, "OpenDesk", "preferences.json"), nil
}

func ResolveLocale(localePreference, systemLocale string) string {
	preference := strings.TrimSpace(localePreference)
	switch preference {
	case LocaleZhCN, LocaleEnUS:
		return preference
	case PreferenceAuto, "":
		return resolveSupportedSystemLocale(systemLocale)
	default:
		return ProductDefaultLocale
	}
}

func resolveSupportedSystemLocale(value string) string {
	normalized := normalizeSystemLocale(value)
	if normalized == "" {
		return ProductDefaultLocale
	}
	lower := strings.ToLower(normalized)
	switch {
	case lower == "zh", lower == "zh-cn", lower == "zh-hans", strings.HasPrefix(lower, "zh-hans-"):
		return LocaleZhCN
	case lower == "en", strings.HasPrefix(lower, "en-"):
		return LocaleEnUS
	default:
		// The product currently ships Chinese and English catalogs only. Use the
		// broadly understandable English catalog for every unsupported system
		// locale instead of unexpectedly presenting a Chinese interface.
		return LocaleEnUS
	}
}

// IsSupportedSystemLocale reports whether the current product release has a
// first-class locale mapping for the system locale. It deliberately describes
// the shipped locale set, rather than treating an unsupported locale as if its
// language catalog were available.
func IsSupportedSystemLocale(value string) bool {
	normalized := normalizeSystemLocale(value)
	lower := strings.ToLower(normalized)
	return lower == "zh" || lower == "zh-cn" || lower == "zh-hans" || strings.HasPrefix(lower, "zh-hans-") ||
		lower == "en" || strings.HasPrefix(lower, "en-")
}

func normalizeSystemLocale(value string) string {
	value = strings.TrimSpace(value)
	if index := strings.IndexByte(value, '.'); index >= 0 {
		value = value[:index]
	}
	if index := strings.IndexByte(value, '@'); index >= 0 {
		value = value[:index]
	}
	return strings.ReplaceAll(value, "_", "-")
}

func (m *Manager) GetLocalePreference() string {
	if m == nil {
		return PreferenceAuto
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.preference
}

func (m *Manager) GetSystemLocale() string {
	if m == nil {
		return ""
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.systemLocale
}

func (m *Manager) GetResolvedLocale() string {
	if m == nil {
		return ProductDefaultLocale
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.resolvedLocale
}

func (m *Manager) SetLocalePreference(preference string) error {
	if m == nil {
		return errors.New("localization manager is nil")
	}
	preference = strings.TrimSpace(preference)
	if !validPreference(preference) {
		err := fmt.Errorf("unsupported locale preference %q", preference)
		m.report(Diagnostic{
			Code:     DiagnosticPreferenceInvalid,
			Locale:   preference,
			Fallback: PreferenceAuto,
			Path:     m.preferencePath,
			Error:    err.Error(),
		})
		return err
	}
	if err := writePreference(m.preferencePath, preference); err != nil {
		return err
	}

	var detected string
	if preference == PreferenceAuto {
		detected = m.readSystemLocale()
	}
	m.mu.Lock()
	m.preference = preference
	if preference == PreferenceAuto {
		m.systemLocale = detected
	}
	m.resolvedLocale = ResolveLocale(m.preference, m.systemLocale)
	m.mu.Unlock()
	return nil
}

func validPreference(value string) bool {
	switch value {
	case PreferenceAuto, LocaleZhCN, LocaleEnUS:
		return true
	default:
		return false
	}
}

func (m *Manager) Translate(key string, params ...map[string]any) string {
	return m.TranslateWithFallback(key, "", params...)
}

func (m *Manager) TranslateWithFallback(key, legacyLabel string, params ...map[string]any) string {
	key = strings.TrimSpace(key)
	legacyLabel = strings.TrimSpace(legacyLabel)
	if m == nil {
		return interpolate(safeLabel(key, legacyLabel), firstParams(params))
	}
	if key == "" {
		return interpolate(safeLabel(key, legacyLabel), firstParams(params))
	}

	locale := m.GetResolvedLocale()
	if value, ok := m.lookup(locale, key); ok {
		return interpolate(value, firstParams(params))
	}
	if locale != ProductDefaultLocale {
		if value, ok := m.lookup(ProductDefaultLocale, key); ok {
			return interpolate(value, firstParams(params))
		}
	}

	fallback := ProductDefaultLocale
	if legacyLabel != "" {
		fallback = "legacy-label"
	}
	m.report(Diagnostic{
		Code:     DiagnosticMissingKey,
		Locale:   locale,
		Key:      key,
		Fallback: fallback,
		Path:     m.catalogPath(locale),
	})
	return interpolate(safeLabel(key, legacyLabel), firstParams(params))
}

func firstParams(params []map[string]any) map[string]any {
	if len(params) == 0 {
		return nil
	}
	return params[0]
}

func interpolate(value string, params map[string]any) string {
	for key, replacement := range params {
		value = strings.ReplaceAll(value, "{"+key+"}", fmt.Sprint(replacement))
	}
	return value
}

func safeLabel(key, legacyLabel string) string {
	if legacyLabel != "" {
		return legacyLabel
	}
	if key != "" {
		return key
	}
	return "[missing-translation]"
}

func (m *Manager) lookup(locale, key string) (string, bool) {
	values := m.catalog(locale)
	value, ok := values[key]
	return value, ok && strings.TrimSpace(value) != ""
}

func (m *Manager) catalog(locale string) map[string]string {
	m.mu.RLock()
	state, ok := m.catalogs[locale]
	m.mu.RUnlock()
	if ok && state.loaded {
		return state.values
	}

	path := m.catalogPath(locale)
	values := make(map[string]string)
	if path == "" {
		m.report(Diagnostic{Code: DiagnosticCatalogMissing, Locale: locale, Path: path, Fallback: ProductDefaultLocale, Error: "catalog directory is not configured"})
	} else {
		data, err := os.ReadFile(path)
		if err != nil {
			code := DiagnosticCatalogInvalid
			if errors.Is(err, os.ErrNotExist) {
				code = DiagnosticCatalogMissing
			}
			m.report(Diagnostic{Code: code, Locale: locale, Path: path, Fallback: ProductDefaultLocale, Error: err.Error()})
		} else {
			var raw any
			if err := json.Unmarshal(data, &raw); err != nil {
				m.report(Diagnostic{Code: DiagnosticCatalogInvalid, Locale: locale, Path: path, Fallback: ProductDefaultLocale, Error: err.Error()})
			} else if object, ok := raw.(map[string]any); !ok {
				m.report(Diagnostic{Code: DiagnosticCatalogInvalid, Locale: locale, Path: path, Fallback: ProductDefaultLocale, Error: "catalog root must be a JSON object"})
			} else {
				valid := true
				for key, rawValue := range object {
					value, ok := rawValue.(string)
					if !ok {
						valid = false
						m.report(Diagnostic{Code: DiagnosticCatalogInvalid, Locale: locale, Key: key, Path: path, Fallback: ProductDefaultLocale, Error: "catalog value must be a string"})
						break
					}
					values[key] = value
				}
				if !valid {
					values = make(map[string]string)
				}
			}
		}
	}

	m.mu.Lock()
	if current, exists := m.catalogs[locale]; exists && current.loaded {
		values = current.values
	} else {
		m.catalogs[locale] = catalogState{loaded: true, values: values}
	}
	m.mu.Unlock()
	return values
}

func (m *Manager) catalogPath(locale string) string {
	if m == nil || strings.TrimSpace(m.catalogDir) == "" {
		return ""
	}
	return filepath.Join(m.catalogDir, locale+".json")
}

func (m *Manager) loadPreference() string {
	path := strings.TrimSpace(m.preferencePath)
	if path == "" {
		return PreferenceAuto
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return PreferenceAuto
	}
	if err != nil {
		m.report(Diagnostic{Code: DiagnosticPreferenceInvalid, Path: path, Fallback: PreferenceAuto, Error: err.Error()})
		return PreferenceAuto
	}
	var document preferenceDocument
	if err := json.Unmarshal(data, &document); err != nil || !validPreference(strings.TrimSpace(document.LocalePreference)) {
		message := "invalid localePreference"
		if err != nil {
			message = err.Error()
		}
		m.report(Diagnostic{Code: DiagnosticPreferenceInvalid, Locale: document.LocalePreference, Path: path, Fallback: PreferenceAuto, Error: message})
		return PreferenceAuto
	}
	return strings.TrimSpace(document.LocalePreference)
}

func writePreference(path, preference string) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("localization preference path is unavailable")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create localization preference directory: %w", err)
	}
	data, err := json.MarshalIndent(preferenceDocument{LocalePreference: preference}, "", "  ")
	if err != nil {
		return fmt.Errorf("encode localization preference: %w", err)
	}
	data = append(data, '\n')
	temporary, err := os.CreateTemp(filepath.Dir(path), ".preferences-*.tmp")
	if err != nil {
		return fmt.Errorf("create localization preference temp file: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return fmt.Errorf("protect localization preference temp file: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		temporary.Close()
		return fmt.Errorf("write localization preference: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync localization preference: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close localization preference: %w", err)
	}
	if err := os.Rename(temporaryName, path); err != nil {
		return fmt.Errorf("replace localization preference: %w", err)
	}
	return nil
}

func (m *Manager) readSystemLocale() string {
	value, err := m.systemLocaleFn()
	if err != nil {
		m.report(Diagnostic{Code: DiagnosticSystemUnavailable, Fallback: ProductDefaultLocale, Error: err.Error()})
		return ""
	}
	return normalizeSystemLocale(value)
}

func (m *Manager) report(diagnostic Diagnostic) {
	if m == nil || m.diagnostics == nil {
		return
	}
	fingerprint := strings.Join([]string{diagnostic.Code, diagnostic.Locale, diagnostic.Key, diagnostic.Path, diagnostic.Error}, "|")
	m.mu.Lock()
	if _, exists := m.reported[fingerprint]; exists {
		m.mu.Unlock()
		return
	}
	m.reported[fingerprint] = struct{}{}
	sink := m.diagnostics
	m.mu.Unlock()
	sink(diagnostic)
}

func defaultDiagnosticSink(diagnostic Diagnostic) {
	log.Printf("localization code=%s locale=%q key=%q fallback=%q path=%q error=%q", diagnostic.Code, diagnostic.Locale, diagnostic.Key, diagnostic.Fallback, diagnostic.Path, diagnostic.Error)
}

var defaultState struct {
	sync.RWMutex
	manager *Manager
}

func ConfigureDefault(options Options) *Manager {
	manager := NewManager(options)
	defaultState.Lock()
	defaultState.manager = manager
	defaultState.Unlock()
	return manager
}

func Default() *Manager {
	defaultState.RLock()
	defer defaultState.RUnlock()
	return defaultState.manager
}

func GetLocalePreference() string {
	manager := Default()
	if manager == nil {
		return PreferenceAuto
	}
	return manager.GetLocalePreference()
}

func GetSystemLocale() string {
	manager := Default()
	if manager == nil {
		return ""
	}
	return manager.GetSystemLocale()
}

func GetResolvedLocale() string {
	manager := Default()
	if manager == nil {
		return ProductDefaultLocale
	}
	return manager.GetResolvedLocale()
}

func SetLocalePreference(preference string) error {
	manager := Default()
	if manager == nil {
		return errors.New("localization core is not configured")
	}
	return manager.SetLocalePreference(preference)
}

func Translate(key string, params ...map[string]any) string {
	manager := Default()
	if manager == nil {
		return safeLabel(strings.TrimSpace(key), "")
	}
	return manager.Translate(key, params...)
}

func TranslateWithFallback(key, legacyLabel string, params ...map[string]any) string {
	manager := Default()
	if manager == nil {
		return interpolate(safeLabel(strings.TrimSpace(key), strings.TrimSpace(legacyLabel)), firstParams(params))
	}
	return manager.TranslateWithFallback(key, legacyLabel, params...)
}
