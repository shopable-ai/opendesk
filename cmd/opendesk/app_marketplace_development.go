package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"opendesk/pkg/appdata"
	"opendesk/pkg/flowmarketplace"
)

const (
	maxMarketplaceDevelopmentConfigSize  int64 = 16 << 10
	maxMarketplaceDevelopmentSessionSize int64 = 8 << 10
	marketplaceDevelopmentSessionFileName      = "marketplace-development-session.json"
	marketplaceDevelopmentMaxLifetime           = 4 * time.Hour
)

var (
	marketplaceDevelopmentKeyIDPattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	marketplaceDevelopmentSessionPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)
)

type marketplaceDevelopmentConfig struct {
	SchemaVersion   int    `json:"schemaVersion"`
	SessionID       string `json:"sessionId"`
	ExpiresAt       string `json:"expiresAt"`
	Resolver        string `json:"resolver"`
	MetadataBaseURL string `json:"metadataBaseUrl"`
	ArtifactBaseURL string `json:"artifactBaseUrl,omitempty"`
	AppDataRoot     string `json:"appDataRoot"`
	RootKeyID       string `json:"rootKeyId"`
	RootPublicKey   string `json:"rootPublicKey"`
	LogFile         string `json:"logFile,omitempty"`
}

type marketplaceDevelopmentSession struct {
	SchemaVersion int    `json:"schemaVersion"`
	SessionID     string `json:"sessionId"`
	ConfigPath    string `json:"configPath"`
	ConfigDigest  string `json:"configDigest"`
	AppDataRoot   string `json:"appDataRoot"`
	ExpiresAt     string `json:"expiresAt"`
}

func configureMarketplaceDevelopmentLog(configPath string) (io.Closer, error) {
	config, err := readMarketplaceDevelopmentConfig(configPath)
	if err != nil || strings.TrimSpace(config.LogFile) == "" {
		return nil, err
	}
	configDir := filepath.Dir(configPath)
	logPath, err := filepath.Abs(config.LogFile)
	if err != nil {
		return nil, fmt.Errorf("resolve Marketplace development logFile: %w", err)
	}
	relative, err := filepath.Rel(configDir, logPath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return nil, fmt.Errorf("Marketplace development logFile must be inside the config directory")
	}
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open Marketplace development logFile: %w", err)
	}
	log.SetOutput(io.MultiWriter(os.Stderr, file))
	return file, nil
}

func loadMarketplaceDevelopmentClient(configPath string) (*flowmarketplace.Client, error) {
	config, err := readMarketplaceDevelopmentConfig(configPath)
	if err != nil {
		return nil, err
	}
	root, err := hex.DecodeString(config.RootPublicKey)
	if err != nil || len(root) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("Marketplace development rootPublicKey must be a 32-byte lowercase hex Ed25519 key")
	}
	if strings.ToLower(config.RootPublicKey) != config.RootPublicKey {
		return nil, fmt.Errorf("Marketplace development rootPublicKey must use lowercase hex")
	}
	return flowmarketplace.NewClient(flowmarketplace.ClientOptions{
		BaseURL:         config.MetadataBaseURL,
		ArtifactBaseURL: config.ArtifactBaseURL,
		Resolver:        flowmarketplace.ResolverStatic,
		MarketplaceRoots: map[string]ed25519.PublicKey{
			config.RootKeyID: append(ed25519.PublicKey(nil), root...),
		},
		AllowInsecureLoopbackForTests: true,
	})
}

func readMarketplaceDevelopmentConfig(configPath string) (marketplaceDevelopmentConfig, error) {
	return readMarketplaceDevelopmentConfigAt(configPath, time.Now)
}

func readMarketplaceDevelopmentConfigAt(configPath string, now func() time.Time) (marketplaceDevelopmentConfig, error) {
	var config marketplaceDevelopmentConfig
	path := strings.TrimSpace(configPath)
	if path == "" {
		return config, fmt.Errorf("Marketplace development config path is empty")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return config, fmt.Errorf("resolve Marketplace development config: %w", err)
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return config, fmt.Errorf("inspect Marketplace development config: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() < 1 || info.Size() > maxMarketplaceDevelopmentConfigSize {
		return config, fmt.Errorf("Marketplace development config must be a bounded regular file")
	}
	data, err := os.ReadFile(absolute)
	if err != nil {
		return config, fmt.Errorf("read Marketplace development config: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&config); err != nil {
		return marketplaceDevelopmentConfig{}, fmt.Errorf("decode Marketplace development config: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return marketplaceDevelopmentConfig{}, fmt.Errorf("Marketplace development config contains trailing data")
	}
	if config.SchemaVersion != 3 ||
		config.Resolver != string(flowmarketplace.ResolverStatic) ||
		!marketplaceDevelopmentKeyIDPattern.MatchString(config.RootKeyID) ||
		!marketplaceDevelopmentSessionPattern.MatchString(config.SessionID) {
		return marketplaceDevelopmentConfig{}, fmt.Errorf("Marketplace development config metadata is invalid")
	}
	if _, err := validateMarketplaceDevelopmentExpiry(config.ExpiresAt, now()); err != nil {
		return marketplaceDevelopmentConfig{}, err
	}
	if err := validateMarketplaceDevelopmentBaseURL(config.MetadataBaseURL, "metadataBaseUrl", true); err != nil {
		return marketplaceDevelopmentConfig{}, err
	}
	if err := validateMarketplaceDevelopmentBaseURL(config.ArtifactBaseURL, "artifactBaseUrl", false); err != nil {
		return marketplaceDevelopmentConfig{}, err
	}
	appDataRoot, err := validateMarketplaceDevelopmentAppDataRoot(absolute, config.AppDataRoot)
	if err != nil {
		return marketplaceDevelopmentConfig{}, err
	}
	config.AppDataRoot = appDataRoot
	return config, nil
}

func validateMarketplaceDevelopmentExpiry(value string, now time.Time) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err != nil || parsed.Location() != time.UTC || parsed.Format(time.RFC3339) != value {
		return time.Time{}, fmt.Errorf("Marketplace development expiresAt must be canonical UTC RFC3339")
	}
	now = now.UTC()
	if !now.Before(parsed) {
		return time.Time{}, fmt.Errorf("Marketplace development config has expired")
	}
	if parsed.Sub(now) > marketplaceDevelopmentMaxLifetime {
		return time.Time{}, fmt.Errorf("Marketplace development config lifetime is too long")
	}
	return parsed, nil
}

func validateMarketplaceDevelopmentAppDataRoot(configPath, raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" || !filepath.IsAbs(value) {
		return "", fmt.Errorf("Marketplace development appDataRoot must be an absolute path")
	}
	root := filepath.Clean(value)
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("Marketplace development appDataRoot must be a real directory")
	}
	configDir := filepath.Dir(filepath.Clean(configPath))
	siteRoot := filepath.Join(configDir, "site")
	siteInfo, err := os.Lstat(siteRoot)
	if err != nil || !siteInfo.IsDir() || siteInfo.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("Marketplace development config must be beside a real public site directory")
	}
	relative, err := filepath.Rel(configDir, root)
	if err != nil || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("Marketplace development appDataRoot must be a private child of the config directory")
	}
	publicRelative, err := filepath.Rel(siteRoot, root)
	if err == nil && (publicRelative == "." || (publicRelative != ".." && !strings.HasPrefix(publicRelative, ".."+string(os.PathSeparator)) && !filepath.IsAbs(publicRelative))) {
		return "", fmt.Errorf("Marketplace development appDataRoot must remain outside the public site directory")
	}
	return root, nil
}

func validateMarketplaceDevelopmentBaseURL(raw, field string, required bool) error {
	value := strings.TrimSpace(raw)
	if value == "" {
		if required {
			return fmt.Errorf("Marketplace development %s is required", field)
		}
		return nil
	}
	base, err := url.Parse(value)
	if err != nil || base.Scheme != "http" || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" || !strings.HasSuffix(base.Path, "/") {
		return fmt.Errorf("Marketplace development %s must be an HTTP loopback URL prefix ending in /", field)
	}
	for _, segment := range strings.Split(base.Path, "/") {
		if segment == "." || segment == ".." {
			return fmt.Errorf("Marketplace development %s path is invalid", field)
		}
	}
	host := base.Hostname()
	address := net.ParseIP(host)
	if !strings.EqualFold(host, "localhost") && (address == nil || !address.IsLoopback()) {
		return fmt.Errorf("Marketplace development %s must be an HTTP loopback URL prefix ending in /", field)
	}
	return nil
}

func marketplaceDevelopmentSessionPath() (string, error) {
	root, err := appdata.DefaultRoot(appdata.DesktopPackageID)
	if err != nil {
		return "", err
	}
	return filepath.Join(root, marketplaceDevelopmentSessionFileName), nil
}

func registerMarketplaceDevelopmentSession(configPath, appDataRoot string) (marketplaceDevelopmentSession, string, error) {
	sessionPath, err := marketplaceDevelopmentSessionPath()
	if err != nil {
		return marketplaceDevelopmentSession{}, "", err
	}
	session, err := registerMarketplaceDevelopmentSessionAt(filepath.Dir(sessionPath), configPath, appDataRoot, time.Now)
	return session, sessionPath, err
}

func registerMarketplaceDevelopmentSessionAt(sessionRoot, configPath, appDataRoot string, now func() time.Time) (marketplaceDevelopmentSession, error) {
	var session marketplaceDevelopmentSession
	config, err := readMarketplaceDevelopmentConfigAt(configPath, now)
	if err != nil {
		return session, err
	}
	configPath, err = filepath.Abs(configPath)
	if err != nil {
		return session, fmt.Errorf("resolve Marketplace development session config path: %w", err)
	}
	appDataRoot, err = filepath.Abs(appDataRoot)
	if err != nil {
		return session, fmt.Errorf("resolve Marketplace development session app data root: %w", err)
	}
	appDataRoot = filepath.Clean(appDataRoot)
	if appDataRoot != config.AppDataRoot {
		return session, fmt.Errorf("Marketplace development session app data root does not match its config")
	}
	if info, err := os.Lstat(appDataRoot); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return session, fmt.Errorf("Marketplace development session app data root must be a real directory")
	}
	data, err := os.ReadFile(configPath)
	if err != nil {
		return session, fmt.Errorf("read Marketplace development session config: %w", err)
	}
	digest := sha256.Sum256(data)
	session = marketplaceDevelopmentSession{
		SchemaVersion: 1,
		SessionID:     config.SessionID,
		ConfigPath:    filepath.Clean(configPath),
		ConfigDigest:  hex.EncodeToString(digest[:]),
		AppDataRoot:   filepath.Clean(appDataRoot),
		ExpiresAt:     config.ExpiresAt,
	}
	if err := os.MkdirAll(sessionRoot, 0o700); err != nil {
		return marketplaceDevelopmentSession{}, fmt.Errorf("create Marketplace development session root: %w", err)
	}
	info, err := os.Lstat(sessionRoot)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return marketplaceDevelopmentSession{}, fmt.Errorf("Marketplace development session root must be a real directory")
	}
	encoded, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return marketplaceDevelopmentSession{}, err
	}
	sessionPath := filepath.Join(sessionRoot, marketplaceDevelopmentSessionFileName)
	if current, statErr := os.Lstat(sessionPath); statErr == nil {
		if current.Mode()&os.ModeSymlink != 0 || !current.Mode().IsRegular() {
			return marketplaceDevelopmentSession{}, fmt.Errorf("Marketplace development session path must be a real regular file")
		}
		if err := os.Remove(sessionPath); err != nil {
			return marketplaceDevelopmentSession{}, fmt.Errorf("replace Marketplace development session: %w", err)
		}
	} else if !os.IsNotExist(statErr) {
		return marketplaceDevelopmentSession{}, fmt.Errorf("inspect Marketplace development session: %w", statErr)
	}
	if err := os.WriteFile(sessionPath, append(encoded, '\n'), 0o600); err != nil {
		return marketplaceDevelopmentSession{}, fmt.Errorf("write Marketplace development session: %w", err)
	}
	return session, nil
}

func recoverMarketplaceDevelopmentSession() (*marketplaceDevelopmentSession, string, error) {
	sessionPath, err := marketplaceDevelopmentSessionPath()
	if err != nil {
		return nil, "", err
	}
	session, err := recoverMarketplaceDevelopmentSessionAt(filepath.Dir(sessionPath), time.Now)
	return session, sessionPath, err
}

func recoverMarketplaceDevelopmentSessionAt(sessionRoot string, now func() time.Time) (*marketplaceDevelopmentSession, error) {
	sessionPath := filepath.Join(sessionRoot, marketplaceDevelopmentSessionFileName)
	info, err := os.Lstat(sessionPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("inspect Marketplace development session: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() < 1 || info.Size() > maxMarketplaceDevelopmentSessionSize {
		return nil, fmt.Errorf("Marketplace development session must be a bounded regular file")
	}
	data, err := os.ReadFile(sessionPath)
	if err != nil {
		return nil, fmt.Errorf("read Marketplace development session: %w", err)
	}
	var session marketplaceDevelopmentSession
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&session); err != nil {
		return nil, fmt.Errorf("decode Marketplace development session: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return nil, fmt.Errorf("Marketplace development session contains trailing data")
	}
	if session.SchemaVersion != 1 ||
		!marketplaceDevelopmentSessionPattern.MatchString(session.SessionID) ||
		!validLowerSHA256(session.ConfigDigest) ||
		!filepath.IsAbs(session.ConfigPath) ||
		!filepath.IsAbs(session.AppDataRoot) {
		return nil, fmt.Errorf("Marketplace development session metadata is invalid")
	}
	if _, err := validateMarketplaceDevelopmentExpiry(session.ExpiresAt, now()); err != nil {
		return nil, err
	}
	config, err := readMarketplaceDevelopmentConfigAt(session.ConfigPath, now)
	if err != nil {
		return nil, err
	}
	if config.SessionID != session.SessionID || config.ExpiresAt != session.ExpiresAt || config.AppDataRoot != session.AppDataRoot {
		return nil, fmt.Errorf("Marketplace development session does not match its config")
	}
	configBytes, err := os.ReadFile(session.ConfigPath)
	if err != nil {
		return nil, fmt.Errorf("read Marketplace development session config: %w", err)
	}
	digest := sha256.Sum256(configBytes)
	if hex.EncodeToString(digest[:]) != session.ConfigDigest {
		return nil, fmt.Errorf("Marketplace development session config digest does not match")
	}
	appDataInfo, err := os.Lstat(session.AppDataRoot)
	if err != nil || !appDataInfo.IsDir() || appDataInfo.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("Marketplace development session app data root is unavailable")
	}
	copy := session
	return &copy, nil
}

func validLowerSHA256(value string) bool {
	if len(value) != sha256.Size*2 || strings.ToLower(value) != value {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size
}
