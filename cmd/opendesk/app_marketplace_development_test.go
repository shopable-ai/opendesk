package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const developmentRootKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

func writeMarketplaceDevelopmentConfig(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "marketplace-development.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil { t.Fatal(err) }
	return path
}

func TestMarketplaceDevelopmentClientAcceptsExplicitStaticLoopbackConfig(t *testing.T) {
	path := writeMarketplaceDevelopmentConfig(t, `{"schemaVersion":2,"resolver":"static","metadataBaseUrl":"http://127.0.0.1:51807/prefix/","artifactBaseUrl":"","rootKeyId":"local-smoke-root","rootPublicKey":"`+developmentRootKey+`"}`)
	if _, err := loadMarketplaceDevelopmentClient(path); err != nil { t.Fatalf("loadMarketplaceDevelopmentClient() error = %v", err) }
}

func TestMarketplaceDevelopmentClientRejectsRemoteDynamicAndMalformedConfig(t *testing.T) {
	tests := []struct { name, content string }{
		{"remote origin", `{"schemaVersion":2,"resolver":"static","metadataBaseUrl":"https://market.example/","artifactBaseUrl":"","rootKeyId":"local-smoke-root","rootPublicKey":"` + developmentRootKey + `"}`},
		{"dynamic resolver", `{"schemaVersion":2,"resolver":"dynamic","metadataBaseUrl":"http://127.0.0.1:51807/","artifactBaseUrl":"","rootKeyId":"local-smoke-root","rootPublicKey":"` + developmentRootKey + `"}`},
		{"missing trailing slash", `{"schemaVersion":2,"resolver":"static","metadataBaseUrl":"http://127.0.0.1:51807/prefix","artifactBaseUrl":"","rootKeyId":"local-smoke-root","rootPublicKey":"` + developmentRootKey + `"}`},
		{"unknown field", `{"schemaVersion":2,"resolver":"static","metadataBaseUrl":"http://127.0.0.1:51807/","artifactBaseUrl":"","rootKeyId":"local-smoke-root","rootPublicKey":"` + developmentRootKey + `","token":"secret"}`},
		{"short root", `{"schemaVersion":2,"resolver":"static","metadataBaseUrl":"http://127.0.0.1:51807/","artifactBaseUrl":"","rootKeyId":"local-smoke-root","rootPublicKey":"00"}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := loadMarketplaceDevelopmentClient(writeMarketplaceDevelopmentConfig(t, test.content)); err == nil { t.Fatal("invalid Marketplace development config was accepted") }
		})
	}
}

func TestMarketplaceDevelopmentConfigRejectsSymlink(t *testing.T) {
	target := writeMarketplaceDevelopmentConfig(t, `{"schemaVersion":2,"resolver":"static","metadataBaseUrl":"http://127.0.0.1:51807/","artifactBaseUrl":"","rootKeyId":"local-smoke-root","rootPublicKey":"`+developmentRootKey+`"}`)
	link := filepath.Join(t.TempDir(), "config-link.json")
	if err := os.Symlink(target, link); err != nil { t.Skipf("cannot create symlink: %v", err) }
	_, err := loadMarketplaceDevelopmentClient(link)
	if err == nil || !strings.Contains(err.Error(), "regular file") { t.Fatalf("symlink error = %v", err) }
}
