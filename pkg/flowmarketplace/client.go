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
	HTTPClient                    *http.Client
	MarketplaceRoots              map[string]ed25519.PublicKey
	Authorize                     func(*http.Request) error
	Now                           func() time.Time
	AllowInsecureLoopbackForTests bool
}

type Client struct {
	base      *url.URL
	http      *http.Client
	authorize func(*http.Request) error
	verifier  ReleaseVerifier
}

func NewClient(options ClientOptions) (*Client, error) {
	base, err := url.Parse(strings.TrimSpace(options.BaseURL))
	if err != nil || base.Scheme == "" || base.Host == "" || base.User != nil || base.Fragment != "" || base.RawQuery != "" {
		return nil, fmt.Errorf("marketplace API base URL is invalid")
	}
	if base.Scheme != "https" {
		if !options.AllowInsecureLoopbackForTests || base.Scheme != "http" || !isLoopbackHost(base.Hostname()) {
			return nil, fmt.Errorf("marketplace API base URL must use HTTPS")
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
		base: base, http: &copyClient, authorize: options.Authorize,
		verifier: ReleaseVerifier{Roots: roots, Now: options.Now},
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
	requestURL := client.endpoint("v1", "install-intents", ref.InstallIntentID)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return resolved, err
	}
	request.Header.Set("Accept", "application/json")
	if client.authorize != nil {
		if err := client.authorize(request); err != nil {
			return resolved, fmt.Errorf("authorize marketplace request: %w", err)
		}
	}
	response, err := client.http.Do(request)
	if err != nil {
		return resolved, fmt.Errorf("resolve marketplace install intent: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return resolved, fmt.Errorf("marketplace install intent returned HTTP %d", response.StatusCode)
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, maxReleaseResponseSize+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&resolved); err != nil {
		return ResolvedInstallIntent{}, fmt.Errorf("decode marketplace install intent: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return ResolvedInstallIntent{}, fmt.Errorf("marketplace install intent contains trailing data")
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
	requestURL := client.endpoint("v1", "releases", release.ReleaseID, "artifact")
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

func (client *Client) endpoint(segments ...string) string {
	copyURL := *client.base
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

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	address := net.ParseIP(host)
	return address != nil && address.IsLoopback()
}
