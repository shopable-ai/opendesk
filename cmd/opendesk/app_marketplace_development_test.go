package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const developmentRootKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
const developmentSessionID = "00112233445566778899aabbccddeeff"

func marketplaceDevelopmentConfigText(t *testing.T, mutate func(map[string]any)) string {
	t.Helper()
	value := map[string]any{
		"schemaVersion":   3,
		"sessionId":       developmentSessionID,
		"expiresAt":       time.Now().UTC().Add(time.Hour).Truncate(time.Second).Format(time.RFC3339),
		"resolver":        "static",
		"metadataBaseUrl": "http://127.0.0.1:51807/prefix/",
		"artifactBaseUrl": "",
		"rootKeyId":       "local-smoke-root",
		"rootPublicKey":   developmentRootKey,
	}
	if mutate != nil {
		mutate(value)
	}
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func writeMarketplaceDevelopmentConfig(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "marketplace-development.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestMarketplaceDevelopmentClientAcceptsExplicitStaticLoopbackConfig(t *testing.T) {
	path := writeMarketplaceDevelopmentConfig(t, marketplaceDevelopmentConfigText(t, nil))
	if _, err := loadMarketplaceDevelopmentClient(path); err != nil {
		t.Fatalf("loadMarketplaceDevelopmentClient() error = %v", err)
	}
}

func TestMarketplaceDevelopmentClientRejectsRemoteDynamicExpiredAndMalformedConfig(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"remote origin", func(v map[string]any) { v["metadataBaseUrl"] = "https://market.example/" }},
		{"dynamic resolver", func(v map[string]any) { v["resolver"] = "dynamic" }},
		{"missing trailing slash", func(v map[string]any) { v["metadataBaseUrl"] = "http://127.0.0.1:51807/prefix" }},
		{"unknown field", func(v map[string]any) { v["token"] = "secret" }},
		{"short root", func(v map[string]any) { v["rootPublicKey"] = "00" }},
		{"expired", func(v map[string]any) { v["expiresAt"] = time.Now().UTC().Add(-time.Minute).Truncate(time.Second).Format(time.RFC3339) }},
		{"too long lived", func(v map[string]any) { v["expiresAt"] = time.Now().UTC().Add(24 * time.Hour).Truncate(time.Second).Format(time.RFC3339) }},
		{"invalid session", func(v map[string]any) { v["sessionId"] = "not-a-session" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := writeMarketplaceDevelopmentConfig(t, marketplaceDevelopmentConfigText(t, test.mutate))
			if _, err := loadMarketplaceDevelopmentClient(path); err == nil {
				t.Fatal("invalid Marketplace development config was accepted")
			}
		})
	}
}

func TestMarketplaceDevelopmentConfigRejectsSymlink(t *testing.T) {
	target := writeMarketplaceDevelopmentConfig(t, marketplaceDevelopmentConfigText(t, nil))
	link := filepath.Join(t.TempDir(), "config-link.json")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("cannot create symlink: %v", err)
	}
	_, err := loadMarketplaceDevelopmentClient(link)
	if err == nil || !strings.Contains(err.Error(), "regular file") {
		t.Fatalf("symlink error = %v", err)
	}
}

func TestMarketplaceDevelopmentSessionRoundTripAndTamperRejection(t *testing.T) {
	sessionRoot := filepath.Join(t.TempDir(), "persistent")
	configRoot := t.TempDir()
	configPath := filepath.Join(configRoot, "marketplace-development.json")
	if err := os.WriteFile(configPath, []byte(marketplaceDevelopmentConfigText(t, nil)), 0o600); err != nil {
		t.Fatal(err)
	}
	appData := filepath.Join(configRoot, "app-data")
	if err := os.MkdirAll(appData, 0o700); err != nil {
		t.Fatal(err)
	}
	session, err := registerMarketplaceDevelopmentSessionAt(sessionRoot, configPath, appData, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if session.ConfigPath != configPath || session.AppDataRoot != appData || session.SessionID != developmentSessionID {
		t.Fatalf("unexpected session: %+v", session)
	}
	recovered, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if recovered == nil || recovered.ConfigDigest != session.ConfigDigest {
		t.Fatalf("recovered session = %+v", recovered)
	}

	if err := os.WriteFile(configPath, append([]byte(marketplaceDevelopmentConfigText(t, nil)), ' '), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, time.Now); err == nil || !strings.Contains(err.Error(), "digest") {
		t.Fatalf("tampered config recovery error = %v", err)
	}
}

func TestMarketplaceDevelopmentSessionRejectsExpiredAndSymlinkState(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	configRoot := t.TempDir()
	configPath := filepath.Join(configRoot, "marketplace-development.json")
	value := map[string]any{}
	if err := json.Unmarshal([]byte(marketplaceDevelopmentConfigText(t, nil)), &value); err != nil {
		t.Fatal(err)
	}
	value["expiresAt"] = now.Add(time.Hour).Format(time.RFC3339)
	data, _ := json.Marshal(value)
	if err := os.WriteFile(configPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	appData := filepath.Join(configRoot, "app-data")
	if err := os.MkdirAll(appData, 0o700); err != nil {
		t.Fatal(err)
	}
	sessionRoot := filepath.Join(t.TempDir(), "persistent")
	if _, err := registerMarketplaceDevelopmentSessionAt(sessionRoot, configPath, appData, func() time.Time { return now }); err != nil {
		t.Fatal(err)
	}
	if _, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, func() time.Time { return now.Add(2 * time.Hour) }); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expired session recovery error = %v", err)
	}

	realRoot := t.TempDir()
	target := filepath.Join(realRoot, marketplaceDevelopmentSessionFileName)
	if err := os.WriteFile(target, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	linkRoot := t.TempDir()
	if err := os.Symlink(target, filepath.Join(linkRoot, marketplaceDevelopmentSessionFileName)); err != nil {
		t.Skipf("cannot create session symlink: %v", err)
	}
	if _, err := recoverMarketplaceDevelopmentSessionAt(linkRoot, time.Now); err == nil || !strings.Contains(err.Error(), "regular file") {
		t.Fatalf("symlink session recovery error = %v", err)
	}
}
