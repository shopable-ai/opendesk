package flowmarketplace

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

const (
	InstallScheme = "opendesk"
	InstallHost   = "install"
	maxInstallURL = 2048
)

var marketplaceIdentifierPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type InstallIntentRef struct {
	FlowID          string `json:"flowId"`
	ReleaseID       string `json:"releaseId"`
	InstallIntentID string `json:"installIntentId"`
}

func (ref InstallIntentRef) Validate() error {
	for name, value := range map[string]string{
		"flowId": ref.FlowID, "releaseId": ref.ReleaseID, "installIntentId": ref.InstallIntentID,
	} {
		if !marketplaceIdentifierPattern.MatchString(value) {
			return fmt.Errorf("marketplace %s is invalid", name)
		}
	}
	return nil
}

// ParseInstallURL accepts only the bounded identifier-only Marketplace install
// protocol. A browser cannot provide an artifact URL, file path, command,
// script, key, token, or arbitrary Runtime argument through this contract.
func ParseInstallURL(raw string) (InstallIntentRef, error) {
	var ref InstallIntentRef
	if raw == "" || len(raw) > maxInstallURL || strings.IndexByte(raw, 0) >= 0 {
		return ref, fmt.Errorf("marketplace install URL is empty or too large")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ref, fmt.Errorf("parse marketplace install URL: %w", err)
	}
	if parsed.Scheme != InstallScheme || parsed.Host != InstallHost || parsed.User != nil || parsed.Port() != "" || parsed.Fragment != "" || parsed.Opaque != "" {
		return ref, fmt.Errorf("marketplace install URL origin is invalid")
	}
	if parsed.RawPath != "" && parsed.RawPath != parsed.EscapedPath() {
		return ref, fmt.Errorf("marketplace install URL path is not canonical")
	}
	segments := strings.Split(strings.TrimPrefix(parsed.Path, "/"), "/")
	if len(segments) != 2 || segments[0] != "flow" || !marketplaceIdentifierPattern.MatchString(segments[1]) {
		return ref, fmt.Errorf("marketplace install URL path is invalid")
	}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil {
		return ref, fmt.Errorf("marketplace install URL query is invalid")
	}
	for key := range query {
		if key != "release" && key != "intent" {
			return ref, fmt.Errorf("marketplace install URL contains an unsupported parameter")
		}
	}
	if len(query["release"]) != 1 || len(query["intent"]) != 1 {
		return ref, fmt.Errorf("marketplace install URL requires one release and one intent")
	}
	ref = InstallIntentRef{FlowID: segments[1], ReleaseID: query["release"][0], InstallIntentID: query["intent"][0]}
	if err := ref.Validate(); err != nil {
		return InstallIntentRef{}, err
	}
	return ref, nil
}

func BuildInstallURL(ref InstallIntentRef) (string, error) {
	if err := ref.Validate(); err != nil {
		return "", err
	}
	query := url.Values{}
	query.Set("release", ref.ReleaseID)
	query.Set("intent", ref.InstallIntentID)
	return (&url.URL{Scheme: InstallScheme, Host: InstallHost, Path: "/flow/" + ref.FlowID, RawQuery: query.Encode()}).String(), nil
}
