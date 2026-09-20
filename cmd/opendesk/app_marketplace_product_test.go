package main

import (
	"strings"
	"testing"

	"opendesk/pkg/officialconfig"
)

const testProductReleaseRoot = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

func TestMarketplaceProductClientIsExplicitlyUnconfiguredInCurrentProduct(t *testing.T) {
	client, err := loadMarketplaceProductClient()
	if err != nil { t.Fatalf("loadMarketplaceProductClient() error = %v", err) }
	if client != nil { t.Fatal("current product config unexpectedly enabled a production Marketplace client") }
}

func TestMarketplaceProductClientAcceptsValidatedStaticDistribution(t *testing.T) {
	config := &officialconfig.FlowDistribution{Resolver: "static", MetadataBaseURL: "https://downloads.example.test/opendesk/", ArtifactBaseURL: "https://cdn.example.test/opendesk/", ReleaseRoots: map[string]string{"release-root-1": testProductReleaseRoot}}
	if _, err := marketplaceClientFromDistribution(config); err != nil { t.Fatalf("marketplaceClientFromDistribution() error = %v", err) }
}

func TestMarketplaceProductClientRejectsMalformedRoot(t *testing.T) {
	config := &officialconfig.FlowDistribution{Resolver: "static", MetadataBaseURL: "https://downloads.example.test/opendesk/", ReleaseRoots: map[string]string{"release-root-1": "00"}}
	_, err := marketplaceClientFromDistribution(config)
	if err == nil || !strings.Contains(err.Error(), "decode Marketplace release root") { t.Fatalf("malformed root error = %v", err) }
}
