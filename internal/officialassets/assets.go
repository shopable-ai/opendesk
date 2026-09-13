// Package officialassets exposes the generated OpenDesk product navigation
// resource to the generic JavaScript Runtime. The maintained plaintext source
// remains configs/official-actions.json.
package officialassets

import (
	"fmt"
	"strings"

	"opendesk/pkg/officialconfig"
)

//go:generate go run ./cmd/sync

// Config decodes the generated ODCFG1 resource embedded in generated Go source.
// The generator reads only apps/opendesk/assets/official-actions.odcfg so the
// Runtime does not acquire a second plaintext configuration source.
func Config() (officialconfig.Config, error) {
	config, err := officialconfig.Decode([]byte(generatedOfficialActions))
	if err != nil {
		return officialconfig.Config{}, fmt.Errorf("decode embedded official actions: %w", err)
	}
	return config, nil
}

// ProductWebsite returns the configured home action used for the frozen
// System.product.website compatibility property.
func ProductWebsite() (string, error) {
	config, err := Config()
	if err != nil {
		return "", err
	}
	website := strings.TrimSpace(config.Actions["home"].URL)
	if !strings.HasPrefix(website, "https://") {
		return "", fmt.Errorf("embedded official actions home URL must use HTTPS")
	}
	return website, nil
}
