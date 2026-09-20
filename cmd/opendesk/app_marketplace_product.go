package main

import (
	"crypto/ed25519"
	"encoding/hex"
	"fmt"

	"opendesk/internal/officialassets"
	"opendesk/pkg/flowmarketplace"
	"opendesk/pkg/officialconfig"
)

func loadMarketplaceProductClient() (*flowmarketplace.Client, error) {
	config, err := officialassets.Config()
	if err != nil {
		return nil, err
	}
	return marketplaceClientFromDistribution(config.FlowDistribution)
}

func marketplaceClientFromDistribution(distribution *officialconfig.FlowDistribution) (*flowmarketplace.Client, error) {
	if distribution == nil {
		return nil, nil
	}
	roots := make(map[string]ed25519.PublicKey, len(distribution.ReleaseRoots))
	for keyID, encoded := range distribution.ReleaseRoots {
		decoded, err := hex.DecodeString(encoded)
		if err != nil || len(decoded) != ed25519.PublicKeySize {
			return nil, fmt.Errorf("decode Marketplace release root %q", keyID)
		}
		roots[keyID] = append(ed25519.PublicKey(nil), decoded...)
	}
	return flowmarketplace.NewClient(flowmarketplace.ClientOptions{
		BaseURL:          distribution.MetadataBaseURL,
		ArtifactBaseURL:  distribution.ArtifactBaseURL,
		Resolver:         flowmarketplace.ResolverMode(distribution.Resolver),
		MarketplaceRoots: roots,
	})
}
