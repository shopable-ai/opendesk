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

func writeMarketplaceDevelopmentConfig(t *testing.T, mutate func(map[string]any)) (string, string) {
	t.Helper()
	root := t.TempDir()
	appData := filepath.Join(root, "app-data")
	if err := os.MkdirAll(appData, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "site"), 0o700); err != nil {
		t.Fatal(err)
	}
	value := map[string]any{
		"schemaVersion":   3,
		"sessionId":       developmentSessionID,
		"expiresAt":       time.Now().UTC().Add(time.Hour).Truncate(time.Second).Format(time.RFC3339),
		"resolver":        "static",
		"metadataBaseUrl": "http://127.0.0.1:51807/prefix/",
		"artifactBaseUrl": "",
		"appDataRoot":     appData,
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
	path := filepath.Join(root, "marketplace-development.json")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return path, appData
}

func TestMarketplaceDevelopmentClientAcceptsExplicitStaticLoopbackConfig(t *testing.T) {
	path, _ := writeMarketplaceDevelopmentConfig(t, nil)
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
		{"relative app data", func(v map[string]any) { v["appDataRoot"] = "app-data" }},
		{"config dir as app data", func(v map[string]any) { v["appDataRoot"] = filepath.Dir(v["appDataRoot"].(string)) }},
		{"outside config dir", func(v map[string]any) { v["appDataRoot"] = t.TempDir() }},
		{"inside public site", func(v map[string]any) {
			publicData := filepath.Join(filepath.Dir(v["appDataRoot"].(string)), "site", "app-data")
			if err := os.MkdirAll(publicData, 0o700); err != nil { t.Fatal(err) }
			v["appDataRoot"] = publicData
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path, _ := writeMarketplaceDevelopmentConfig(t, tc.mutate)
			if _, err := loadMarketplaceDevelopmentClient(path); err == nil {
				t.Fatal("invalid Marketplace development config was accepted")
			}
		})
	}
}

func TestMarketplaceDevelopmentConfigRejectsSymlink(t *testing.T) {
	target, _ := writeMarketplaceDevelopmentConfig(t, nil)
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
	configPath, appData := writeMarketplaceDevelopmentConfig(t, nil)
	session, err := registerMarketplaceDevelopmentSessionAt(sessionRoot, configPath, appData, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	canonicalConfigPath, err := filepath.EvalSymlinks(configPath)
	if err != nil { t.Fatal(err) }
	canonicalConfigPath, err = filepath.Abs(canonicalConfigPath)
	if err != nil { t.Fatal(err) }
	canonicalAppData, err := filepath.EvalSymlinks(appData)
	if err != nil { t.Fatal(err) }
	canonicalAppData, err = filepath.Abs(canonicalAppData)
	if err != nil { t.Fatal(err) }
	if session.ConfigPath != filepath.Clean(canonicalConfigPath) || session.AppDataRoot != filepath.Clean(canonicalAppData) || session.SessionID != developmentSessionID {
		t.Fatalf("unexpected session: %+v", session)
	}
	recovered, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if recovered == nil || recovered.ConfigDigest != session.ConfigDigest {
		t.Fatalf("recovered session = %+v", recovered)
	}

	if _, err := registerMarketplaceDevelopmentSessionAt(sessionRoot, configPath, t.TempDir(), time.Now); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("mismatched appDataRoot registration error = %v", err)
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, append(data, ' '), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, time.Now); err == nil || !strings.Contains(err.Error(), "digest") {
		t.Fatalf("tampered config recovery error = %v", err)
	}
}

func TestMarketplaceDevelopmentSessionCanonicalizesSymlinkedParentPaths(t *testing.T) {
	realRoot := t.TempDir()
	realRun := filepath.Join(realRoot, "run")
	if err := os.MkdirAll(filepath.Join(realRun, "app-data"), 0o700); err != nil { t.Fatal(err) }
	if err := os.MkdirAll(filepath.Join(realRun, "site"), 0o700); err != nil { t.Fatal(err) }
	configValue := map[string]any{
		"schemaVersion":   3,
		"sessionId":       developmentSessionID,
		"expiresAt":       time.Now().UTC().Add(time.Hour).Truncate(time.Second).Format(time.RFC3339),
		"resolver":        "static",
		"metadataBaseUrl": "http://127.0.0.1:51807/",
		"artifactBaseUrl": "",
		"appDataRoot":     filepath.Join(realRun, "app-data"),
		"rootKeyId":       "local-smoke-root",
		"rootPublicKey":   developmentRootKey,
	}
	encoded, err := json.Marshal(configValue)
	if err != nil { t.Fatal(err) }
	realConfig := filepath.Join(realRun, "marketplace-development.json")
	if err := os.WriteFile(realConfig, encoded, 0o600); err != nil { t.Fatal(err) }

	aliasParent := t.TempDir()
	aliasRun := filepath.Join(aliasParent, "current")
	if err := os.Symlink(realRun, aliasRun); err != nil {
		t.Skipf("cannot create parent symlink: %v", err)
	}
	aliasConfig := filepath.Join(aliasRun, "marketplace-development.json")
	aliasAppData := filepath.Join(aliasRun, "app-data")
	sessionRoot := filepath.Join(t.TempDir(), "persistent")
	session, err := registerMarketplaceDevelopmentSessionAt(sessionRoot, aliasConfig, aliasAppData, time.Now)
	if err != nil { t.Fatal(err) }
	if session.ConfigPath != filepath.Clean(realConfig) || session.AppDataRoot != filepath.Clean(filepath.Join(realRun, "app-data")) {
		t.Fatalf("session did not bind canonical targets: %+v", session)
	}

	evilRun := filepath.Join(realRoot, "evil")
	if err := os.MkdirAll(filepath.Join(evilRun, "app-data"), 0o700); err != nil { t.Fatal(err) }
	if err := os.MkdirAll(filepath.Join(evilRun, "site"), 0o700); err != nil { t.Fatal(err) }
	if err := os.Remove(aliasRun); err != nil { t.Fatal(err) }
	if err := os.Symlink(evilRun, aliasRun); err != nil { t.Fatal(err) }

	recovered, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, time.Now)
	if err != nil { t.Fatal(err) }
	if recovered == nil || recovered.ConfigPath != filepath.Clean(realConfig) || recovered.AppDataRoot != filepath.Clean(filepath.Join(realRun, "app-data")) {
		t.Fatalf("recovery followed a replaced parent symlink: %+v", recovered)
	}
}

func TestMarketplaceDevelopmentSessionRejectsIdentityAppDataAndPathTampering(t *testing.T) {
	sessionRoot := filepath.Join(t.TempDir(), "persistent")
	configPath, appData := writeMarketplaceDevelopmentConfig(t, nil)
	if _, err := registerMarketplaceDevelopmentSessionAt(sessionRoot, configPath, appData, time.Now); err != nil {
		t.Fatal(err)
	}
	sessionPath := filepath.Join(sessionRoot, marketplaceDevelopmentSessionFileName)

	rewrite := func(mutate func(map[string]any)) {
		t.Helper()
		data, err := os.ReadFile(sessionPath)
		if err != nil { t.Fatal(err) }
		var value map[string]any
		if err := json.Unmarshal(data, &value); err != nil { t.Fatal(err) }
		mutate(value)
		encoded, err := json.Marshal(value)
		if err != nil { t.Fatal(err) }
		if err := os.WriteFile(sessionPath, encoded, 0o600); err != nil { t.Fatal(err) }
	}

	rewrite(func(value map[string]any) { value["sessionId"] = "ffeeddccbbaa99887766554433221100" })
	if _, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, time.Now); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("sessionId tamper recovery error = %v", err)
	}
	if _, err := registerMarketplaceDevelopmentSessionAt(sessionRoot, configPath, appData, time.Now); err != nil { t.Fatal(err) }

	rewrite(func(value map[string]any) {
		value["appDataRoot"] = filepath.Join(filepath.Dir(appData), "site", "app-data")
	})
	if _, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, time.Now); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("appDataRoot tamper recovery error = %v", err)
	}
	if _, err := registerMarketplaceDevelopmentSessionAt(sessionRoot, configPath, appData, time.Now); err != nil { t.Fatal(err) }

	realData := filepath.Join(t.TempDir(), "replacement")
	if err := os.MkdirAll(realData, 0o700); err != nil { t.Fatal(err) }
	if err := os.RemoveAll(appData); err != nil { t.Fatal(err) }
	if err := os.Symlink(realData, appData); err != nil {
		t.Skipf("cannot replace appDataRoot with symlink: %v", err)
	}
	if _, err := recoverMarketplaceDevelopmentSessionAt(sessionRoot, time.Now); err == nil || !strings.Contains(err.Error(), "real directory") {
		t.Fatalf("appDataRoot symlink replacement recovery error = %v", err)
	}
}

func TestMarketplaceDevelopmentSessionRejectsExpiredAndSymlinkState(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	configPath, appData := writeMarketplaceDevelopmentConfig(t, func(v map[string]any) {
		v["expiresAt"] = now.Add(time.Hour).Format(time.RFC3339)
	})
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
