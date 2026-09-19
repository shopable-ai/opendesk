package main

import (
	"bytes"
	"crypto/ed25519"
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

	"opendesk/pkg/flowmarketplace"
)

const maxMarketplaceDevelopmentConfigSize int64 = 16 << 10

var marketplaceDevelopmentKeyIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type marketplaceDevelopmentConfig struct {
	SchemaVersion int    `json:"schemaVersion"`
	BaseURL       string `json:"baseUrl"`
	RootKeyID     string `json:"rootKeyId"`
	RootPublicKey string `json:"rootPublicKey"`
	LogFile       string `json:"logFile,omitempty"`
}

// configureMarketplaceDevelopmentLog mirrors only development receiver
// diagnostics into a file beside its explicit, local config. Production never
// constructs this configuration and continues to use the normal logger.
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
		BaseURL: config.BaseURL,
		MarketplaceRoots: map[string]ed25519.PublicKey{
			config.RootKeyID: append(ed25519.PublicKey(nil), root...),
		},
		AllowInsecureLoopbackForTests: true,
	})
}

func readMarketplaceDevelopmentConfig(configPath string) (marketplaceDevelopmentConfig, error) {
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
	if config.SchemaVersion != 1 || !marketplaceDevelopmentKeyIDPattern.MatchString(config.RootKeyID) {
		return marketplaceDevelopmentConfig{}, fmt.Errorf("Marketplace development config metadata is invalid")
	}
	base, err := url.Parse(config.BaseURL)
	if err != nil || base.Scheme != "http" || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return marketplaceDevelopmentConfig{}, fmt.Errorf("Marketplace development baseUrl must be an HTTP loopback origin")
	}
	host := base.Hostname()
	address := net.ParseIP(host)
	if !strings.EqualFold(host, "localhost") && (address == nil || !address.IsLoopback()) {
		return marketplaceDevelopmentConfig{}, fmt.Errorf("Marketplace development baseUrl must be an HTTP loopback origin")
	}
	return config, nil
}
