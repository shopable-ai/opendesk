package flowmarketplace

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"opendesk/pkg/flowpackage"
)

const maxReleaseResponseSize int64 = 256 << 10

type ResolverMode string

const (
	ResolverDynamic ResolverMode = "dynamic"
	ResolverStatic  ResolverMode = "static"
)

type SignedReleaseDocument struct {
	SchemaVersion int                `json:"schemaVersion"`
	Release       Release            `json:"release"`
	Attestation   ReleaseAttestation `json:"attestation"`
}

type ResolvedInstallIntent struct {
	SchemaVersion   int                `json:"schemaVersion"`
	InstallIntentID string             `json:"installIntentId"`
	FlowID          string             `json:"flowId"`
	ReleaseID       string             `json:"releaseId"`
	Release         Release            `json:"release"`
	Attestation     ReleaseAttestation `json:"attestation"`
}

type ClientOptions struct {
	BaseURL                       string
	ArtifactBaseURL               string
	Resolver                      ResolverMode
	HTTPClient                    *http.Client
	MarketplaceRoots              map[string]ed25519.PublicKey
	Authorize                     func(*http.Request) error
	Now                           func() time.Time
	AllowInsecureLoopbackForTests bool
}

type Client struct {
	resolver      ResolverMode
	base          *url.URL
	artifactBase  *url.URL
	http          *http.Client
	authorize     func(*http.Request) error
	verifier      ReleaseVerifier
	allowLoopback bool
}

func NewClient(options ClientOptions) (*Client, error) {
	resolver := options.Resolver
	if resolver == "" {
		resolver = ResolverDynamic
	}
	if resolver != ResolverDynamic && resolver != ResolverStatic {
		return nil, fmt.Errorf("marketplace resolver is invalid")
	}
	base, err := parseDistributionBaseURL(options.BaseURL, options.AllowInsecureLoopbackForTests)
	if err != nil {
		return nil, fmt.Errorf("marketplace metadata base URL is invalid: %w", err)
	}
	artifactBase := base
	if strings.TrimSpace(options.ArtifactBaseURL) != "" {
		artifactBase, err = parseDistributionBaseURL(options.ArtifactBaseURL, options.AllowInsecureLoopbackForTests)
		if err != nil {
			return nil, fmt.Errorf("marketplace artifact base URL is invalid: %w", err)
		}
	}
	client := options.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	copyClient := *client
	copyClient.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	roots := make(map[string]ed25519.PublicKey, len(options.MarketplaceRoots))
	for keyID, key := range options.MarketplaceRoots {
		roots[keyID] = append(ed25519.PublicKey(nil), key...)
	}
	return &Client{
		resolver: resolver, base: base, artifactBase: artifactBase, http: &copyClient, authorize: options.Authorize,
		verifier: ReleaseVerifier{Roots: roots, Now: options.Now}, allowLoopback: options.AllowInsecureLoopbackForTests,
	}, nil
}
func (client *Client) ResolveInstallIntent(ctx context.Context, ref InstallIntentRef) (ResolvedInstallIntent, error) {
	var resolved ResolvedInstallIntent
	if client == nil {
		return resolved, fmt.Errorf("marketplace client is unavailable")
	}
	if err := ref.Validate(); err != nil {
		return resolved, err
	}
	if client.resolver == ResolverStatic {
		requestURL := endpointFrom(client.base, "flows", ref.FlowID, ref.ReleaseID, "release.json")
		request, err := client.newGET(ctx, requestURL, "application/json")
		if err != nil {
			return resolved, err
		}
		response, err := client.http.Do(request)
		if err != nil {
			return resolved, fmt.Errorf("resolve marketplace static release: %w", err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return resolved, fmt.Errorf("marketplace static release returned HTTP %d", response.StatusCode)
		}
		var document SignedReleaseDocument
		if err := decodeBoundedJSON(response.Body, &document); err != nil {
			return resolved, fmt.Errorf("decode marketplace static release: %w", err)
		}
		if document.SchemaVersion != 1 || document.Release.SchemaVersion != 2 {
			return resolved, fmt.Errorf("marketplace static release schema is unsupported")
		}
		if document.Release.FlowID != ref.FlowID || document.Release.ReleaseID != ref.ReleaseID {
			return resolved, fmt.Errorf("marketplace static release identity does not match the deep link")
		}
		if err := client.verifier.Verify(document.Release, document.Attestation); err != nil {
			return resolved, err
		}
		return ResolvedInstallIntent{
			SchemaVersion: 1, InstallIntentID: ref.InstallIntentID, FlowID: ref.FlowID, ReleaseID: ref.ReleaseID,
			Release: document.Release, Attestation: document.Attestation,
		}, nil
	}

	requestURL := endpointFrom(client.base, "v1", "install-intents", ref.InstallIntentID)
	request, err := client.newGET(ctx, requestURL, "application/json")
	if err != nil {
		return resolved, err
	}
	response, err := client.http.Do(request)
	if err != nil {
		return resolved, fmt.Errorf("resolve marketplace install intent: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return resolved, fmt.Errorf("marketplace install intent returned HTTP %d", response.StatusCode)
	}
	if err := decodeBoundedJSON(response.Body, &resolved); err != nil {
		return ResolvedInstallIntent{}, fmt.Errorf("decode marketplace install intent: %w", err)
	}
	if resolved.SchemaVersion != 1 || resolved.InstallIntentID != ref.InstallIntentID || resolved.FlowID != ref.FlowID || resolved.ReleaseID != ref.ReleaseID {
		return ResolvedInstallIntent{}, fmt.Errorf("marketplace install intent identity does not match the deep link")
	}
	if resolved.Release.FlowID != resolved.FlowID || resolved.Release.ReleaseID != resolved.ReleaseID {
		return ResolvedInstallIntent{}, fmt.Errorf("marketplace release identity does not match the install intent")
	}
	if err := client.verifier.Verify(resolved.Release, resolved.Attestation); err != nil {
		return ResolvedInstallIntent{}, err
	}
	return resolved, nil
}
func (client *Client) DownloadArtifact(ctx context.Context, release Release, tempRoot string) (string, func(), error) {
	if client == nil {
		return "", nil, fmt.Errorf("marketplace client is unavailable")
	}
	if err := release.ValidateInstallable(); err != nil {
		return "", nil, err
	}
	requestURL, err := client.artifactURL(release)
	if err != nil {
		return "", nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return "", nil, err
	}
	request.Header.Set("Accept", "application/vnd.opendesk.flow")
	if client.authorize != nil {
		if err := client.authorize(request); err != nil {
			return "", nil, fmt.Errorf("authorize marketplace artifact request: %w", err)
		}
	}
	response, err := client.http.Do(request)
	if err != nil {
		return "", nil, fmt.Errorf("download marketplace artifact: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("marketplace artifact returned HTTP %d", response.StatusCode)
	}
	if response.ContentLength >= 0 && response.ContentLength != release.ArtifactSize {
		return "", nil, fmt.Errorf("marketplace artifact content length does not match release metadata")
	}
	if strings.TrimSpace(tempRoot) == "" {
		tempRoot = os.TempDir()
	}
	if err := os.MkdirAll(tempRoot, 0o700); err != nil {
		return "", nil, err
	}
	file, err := os.CreateTemp(tempRoot, ".opendesk-marketplace-*.odflow")
	if err != nil {
		return "", nil, err
	}
	filePath := file.Name()
	cleanup := func() { _ = os.Remove(filePath) }
	fail := func(err error) (string, func(), error) {
		_ = file.Close()
		cleanup()
		return "", nil, err
	}
	if err := file.Chmod(0o600); err != nil {
		return fail(err)
	}
	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(file, hasher), io.LimitReader(response.Body, flowpackage.MaxArchiveSize+1))
	if err != nil {
		return fail(fmt.Errorf("download marketplace artifact: %w", err))
	}
	if written > flowpackage.MaxArchiveSize || written != release.ArtifactSize {
		return fail(fmt.Errorf("marketplace artifact size does not match release metadata"))
	}
	if digest := hex.EncodeToString(hasher.Sum(nil)); digest != release.ArtifactDigest {
		return fail(fmt.Errorf("marketplace artifact digest does not match release metadata"))
	}
	if err := file.Sync(); err != nil {
		return fail(err)
	}
	if err := file.Close(); err != nil {
		cleanup()
		return "", nil, err
	}
	return filePath, cleanup, nil
}

func (client *Client) newGET(ctx context.Context, requestURL, accept string) (*http.Request, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", accept)
	if client.authorize != nil {
		if err := client.authorize(request); err != nil {
			return nil, fmt.Errorf("authorize marketplace request: %w", err)
		}
	}
	return request, nil
}

func decodeBoundedJSON(reader io.Reader, target any) error {
	decoder := json.NewDecoder(io.LimitReader(reader, maxReleaseResponseSize+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("marketplace response contains trailing data")
	}
	return nil
}

func parseDistributionBaseURL(raw string, allowLoopback bool) (*url.URL, error) {
	base, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || base.Scheme == "" || base.Host == "" || base.User != nil || base.Fragment != "" || base.RawQuery != "" {
		return nil, fmt.Errorf("URL must be an absolute origin or path prefix")
	}
	if base.Scheme != "https" {
		if !allowLoopback || base.Scheme != "http" || !isLoopbackHost(base.Hostname()) {
			return nil, fmt.Errorf("URL must use HTTPS")
		}
	}
	if strings.Contains(base.EscapedPath(), "\\") {
		return nil, fmt.Errorf("URL path is invalid")
	}
	return base, nil
}

func endpointFrom(base *url.URL, segments ...string) string {
	copyURL := *base
	parts := append([]string{strings.TrimSuffix(copyURL.Path, "/")}, segments...)
	copyURL.Path = path.Join(parts...)
	if !strings.HasPrefix(copyURL.Path, "/") {
		copyURL.Path = "/" + copyURL.Path
	}
	copyURL.RawPath = ""
	copyURL.RawQuery = ""
	copyURL.Fragment = ""
	return copyURL.String()
}

func (client *Client) artifactURL(release Release) (string, error) {
	if release.SchemaVersion == 1 {
		if client.resolver != ResolverDynamic {
			return "", fmt.Errorf("marketplace static resolver requires a v2 signed artifact location")
		}
		return endpointFrom(client.base, "v1", "releases", release.ReleaseID, "artifact"), nil
	}
	location := strings.TrimSpace(release.ArtifactLocation)
	parsed, err := url.Parse(location)
	if err != nil {
		return "", fmt.Errorf("marketplace artifact location is invalid")
	}
	if parsed.IsAbs() {
		absolute, err := parseDistributionBaseURL(location, client.allowLoopback)
		if err != nil {
			return "", fmt.Errorf("marketplace artifact location is not an approved network URL: %w", err)
		}
		return absolute.String(), nil
	}
	if location == "" || strings.HasPrefix(location, "/") || strings.Contains(location, "\\") || parsed.Host != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path != location {
		return "", fmt.Errorf("marketplace artifact location must be a canonical relative path or absolute approved URL")
	}
	clean := path.Clean(location)
	if clean != location || clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("marketplace artifact location escapes its configured prefix")
	}
	return endpointFrom(client.artifactBase, strings.Split(clean, "/")...), nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	address := net.ParseIP(host)
	return address != nil && address.IsLoopback()
}
