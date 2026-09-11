// Package entitlement defines the authenticated HTTPS boundary between the
// customer-side license CLI and an online entitlement service. It is not used
// by pkg/execution or pkg/scriptloader.
package entitlement

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/licensing"
)

const (
	MaxResponseSize = licensing.MaxOnlineCacheSize
	MaxTokenSize    = 16 * 1024
	DefaultTimeout  = 15 * time.Second
)

var activationIdentifier = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type PackageBinding struct {
	PublisherID    string `json:"publisherId"`
	PublisherKeyID string `json:"publisherKeyId"`
	ProductID      string `json:"productId"`
	PackageID      string `json:"packageId"`
	ContentKeyID   string `json:"contentKeyId"`
}

type ActivateRequest struct {
	RequestNonce string                        `json:"requestNonce"`
	Device       deviceidentity.PublicIdentity `json:"device"`
	Package      PackageBinding                `json:"package"`
}

type RefreshRequest struct {
	RequestNonce string `json:"requestNonce"`
	ActivationID string `json:"activationId"`
	Sequence     uint64 `json:"sequence"`
	DeviceID     string `json:"deviceId"`
}

type DeactivateRequest struct {
	RequestNonce string `json:"requestNonce"`
	ActivationID string `json:"activationId"`
	Sequence     uint64 `json:"sequence"`
	DeviceID     string `json:"deviceId"`
}

type Client interface {
	Activate(ctx context.Context, token []byte, request ActivateRequest) ([]byte, error)
	Refresh(ctx context.Context, token []byte, request RefreshRequest) ([]byte, error)
	Deactivate(ctx context.Context, token []byte, request DeactivateRequest) ([]byte, error)
}

type HTTPClient struct {
	Endpoint string
	Client   *http.Client
}

// NewHTTPClient builds a hardened HTTPS client. AdditionalRoots is optional
// PEM for a private/on-premises CA; it extends the system pool and never
// disables certificate or hostname verification.
func NewHTTPClient(endpoint string, additionalRoots []byte) (HTTPClient, error) {
	if _, err := validateEndpoint(endpoint); err != nil {
		return HTTPClient{}, err
	}
	transport, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return HTTPClient{}, licensing.NewError(licensing.CodeServiceUnavailable, "default HTTP transport is unavailable", nil)
	}
	transportCopy := transport.Clone()
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}
	if len(additionalRoots) > 0 {
		roots, err := x509.SystemCertPool()
		if err != nil {
			return HTTPClient{}, licensing.NewError(licensing.CodeServiceUnavailable, "load system entitlement service trust roots", err)
		}
		if roots == nil {
			roots = x509.NewCertPool()
		}
		if !roots.AppendCertsFromPEM(additionalRoots) {
			return HTTPClient{}, licensing.NewError(licensing.CodeServiceUnavailable, "entitlement service CA file contains no certificates", nil)
		}
		tlsConfig.RootCAs = roots
	}
	transportCopy.TLSClientConfig = tlsConfig
	return HTTPClient{Endpoint: endpoint, Client: &http.Client{Transport: transportCopy, Timeout: DefaultTimeout}}, nil
}

func NewRequestNonce() (string, error) {
	value := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, value); err != nil {
		return "", fmt.Errorf("generate entitlement request nonce: %w", err)
	}
	return base64.StdEncoding.EncodeToString(value), nil
}

func (client HTTPClient) Activate(ctx context.Context, token []byte, request ActivateRequest) ([]byte, error) {
	return client.post(ctx, token, "/v1/activations", request)
}

func (client HTTPClient) Refresh(ctx context.Context, token []byte, request RefreshRequest) ([]byte, error) {
	if !activationIdentifier.MatchString(request.ActivationID) {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "activationId is invalid", nil)
	}
	return client.post(ctx, token, "/v1/activations/"+url.PathEscape(request.ActivationID)+"/refresh", request)
}

func (client HTTPClient) Deactivate(ctx context.Context, token []byte, request DeactivateRequest) ([]byte, error) {
	if !activationIdentifier.MatchString(request.ActivationID) {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "activationId is invalid", nil)
	}
	return client.post(ctx, token, "/v1/activations/"+url.PathEscape(request.ActivationID)+"/deactivate", request)
}

func (client HTTPClient) post(ctx context.Context, token []byte, suffix string, payload any) ([]byte, error) {
	endpoint, err := validateEndpoint(client.Endpoint)
	if err != nil {
		return nil, err
	}
	credential, err := validateToken(token)
	if err != nil {
		return nil, err
	}
	defer zero(credential)
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "encode entitlement request", err)
	}
	target := *endpoint
	target.Path = strings.TrimRight(target.Path, "/") + suffix
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), bytes.NewReader(body))
	if err != nil {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "create entitlement request", err)
	}
	request.Header.Set("Authorization", "Bearer "+string(credential))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	httpClient := hardenedHTTPClient(client.Client)
	response, err := httpClient.Do(request)
	if err != nil {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "entitlement service request failed", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, statusError(response.StatusCode)
	}
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "entitlement service returned an invalid content type", err)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseSize+1))
	if err != nil {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "read entitlement service response", err)
	}
	if len(data) == 0 || len(data) > MaxResponseSize {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "entitlement service response size is invalid", nil)
	}
	return data, nil
}

func validateEndpoint(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "entitlement service endpoint must be an HTTPS URL without credentials, query, or fragment", err)
	}
	return parsed, nil
}

func validateToken(value []byte) ([]byte, error) {
	trimmed := bytes.TrimSpace(value)
	if len(trimmed) == 0 || len(trimmed) > MaxTokenSize {
		return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement credential is missing or too large", nil)
	}
	for _, character := range trimmed {
		if character < 0x21 || character == 0x7f {
			return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement credential contains invalid characters", nil)
		}
	}
	return append([]byte(nil), trimmed...), nil
}

func hardenedHTTPClient(base *http.Client) *http.Client {
	if base == nil {
		base = http.DefaultClient
	}
	copy := *base
	if copy.Timeout <= 0 {
		copy.Timeout = DefaultTimeout
	}
	copy.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &copy
}

func statusError(status int) error {
	switch status {
	case http.StatusUnauthorized:
		return licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement service authentication failed", nil)
	case http.StatusForbidden, http.StatusNotFound:
		return licensing.NewError(licensing.CodeLicenseDenied, "product entitlement was denied", nil)
	case http.StatusConflict:
		return licensing.NewError(licensing.CodeDeviceLimitExceeded, "product device limit was exceeded", nil)
	case http.StatusGone:
		return licensing.NewError(licensing.CodeLicenseRevoked, "online entitlement has been revoked", nil)
	default:
		return licensing.NewError(licensing.CodeServiceUnavailable, "entitlement service is unavailable", nil)
	}
}

func zero(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
