package entitlement

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/licensing"
)

func TestHTTPClientUsesAuthenticatedTLSAndTransportsActivationNonce(t *testing.T) {
	type capturedRequest struct {
		method        string
		path          string
		authorization string
		contentType   string
		accept        string
		body          ActivateRequest
	}
	captured := make(chan capturedRequest, 1)
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var body ActivateRequest
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		captured <- capturedRequest{
			method:        request.Method,
			path:          request.URL.Path,
			authorization: request.Header.Get("Authorization"),
			contentType:   request.Header.Get("Content-Type"),
			accept:        request.Header.Get("Accept"),
			body:          body,
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"signed":"cache"}`))
	}))
	defer server.Close()

	nonce := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x5a}, 32))
	request := ActivateRequest{
		RequestNonce: nonce,
		Device: deviceidentity.PublicIdentity{
			Format:        deviceidentity.FormatName,
			FormatVersion: deviceidentity.FormatVersion,
			DeviceID:      "device-public-test",
			KeyAlgorithm:  deviceidentity.KeyAlgorithmP256,
			PublicKey:     "public-key-test",
		},
		Package: PackageBinding{
			PublisherID:    "publisher-test",
			PublisherKeyID: "publisher-key-test",
			ProductID:      "product-test",
			PackageID:      "package-test",
			ContentKeyID:   "content-test",
		},
	}
	client := HTTPClient{Endpoint: server.URL, Client: server.Client()}
	response, err := client.Activate(context.Background(), []byte("activation-token"), request)
	if err != nil {
		t.Fatal(err)
	}
	if string(response) != `{"signed":"cache"}` {
		t.Fatalf("response = %q", response)
	}
	seen := <-captured
	if seen.method != http.MethodPost || seen.path != "/v1/activations" {
		t.Fatalf("request = %s %s", seen.method, seen.path)
	}
	if seen.authorization != "Bearer activation-token" || seen.contentType != "application/json" || seen.accept != "application/json" {
		t.Fatalf("headers = authorization %q content-type %q accept %q", seen.authorization, seen.contentType, seen.accept)
	}
	if seen.body.RequestNonce != nonce || seen.body.Package != request.Package || seen.body.Device != request.Device {
		t.Fatalf("body = %#v", seen.body)
	}
}

func TestHTTPClientRejectsNonTLSUntrustedTLSAndEndpointCredentials(t *testing.T) {
	var plainRequests atomic.Int32
	plain := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		plainRequests.Add(1)
	}))
	defer plain.Close()
	client := HTTPClient{Endpoint: plain.URL, Client: plain.Client()}
	if _, err := client.Activate(context.Background(), []byte("token"), ActivateRequest{}); licensing.CodeOf(err) != licensing.CodeServiceUnavailable {
		t.Fatalf("plain HTTP error = %v", err)
	}
	if plainRequests.Load() != 0 {
		t.Fatalf("plain HTTP server received %d requests", plainRequests.Load())
	}

	untrusted := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{}`))
	}))
	defer untrusted.Close()
	if _, err := (HTTPClient{Endpoint: untrusted.URL, Client: &http.Client{Timeout: time.Second}}).Activate(context.Background(), []byte("token"), ActivateRequest{}); licensing.CodeOf(err) != licensing.CodeServiceUnavailable {
		t.Fatalf("untrusted TLS error = %v", err)
	}

	for _, endpoint := range []string{
		"https://user:password@example.com",
		"https://example.com?token=secret",
		"https://example.com/#fragment",
	} {
		t.Run(endpoint, func(t *testing.T) {
			if _, err := (HTTPClient{Endpoint: endpoint}).Activate(context.Background(), []byte("token"), ActivateRequest{}); licensing.CodeOf(err) != licensing.CodeServiceUnavailable {
				t.Fatalf("endpoint error = %v", err)
			}
		})
	}
}

func TestNewHTTPClientExtendsSystemRootsWithoutDisablingTLSVerification(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"signed":"cache"}`))
	}))
	defer server.Close()
	certificate := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw})
	client, err := NewHTTPClient(server.URL, certificate)
	if err != nil {
		t.Fatal(err)
	}
	transport, ok := client.Client.Transport.(*http.Transport)
	if !ok || transport.TLSClientConfig == nil {
		t.Fatalf("transport = %#v", client.Client.Transport)
	}
	if transport.TLSClientConfig.MinVersion != tls.VersionTLS12 || transport.TLSClientConfig.InsecureSkipVerify {
		t.Fatalf("TLS config = %#v", transport.TLSClientConfig)
	}
	response, err := client.Activate(context.Background(), []byte("token"), ActivateRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if string(response) != `{"signed":"cache"}` {
		t.Fatalf("response = %q", response)
	}
	if _, err := NewHTTPClient(server.URL, []byte("not a certificate")); licensing.CodeOf(err) != licensing.CodeServiceUnavailable {
		t.Fatalf("invalid CA error = %v", err)
	}
	if _, err := NewHTTPClient("http://example.com", nil); licensing.CodeOf(err) != licensing.CodeServiceUnavailable {
		t.Fatalf("plain endpoint error = %v", err)
	}
}

func TestHTTPClientDoesNotFollowRedirectOrForwardAuthorization(t *testing.T) {
	var redirectedRequests atomic.Int32
	destination := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		redirectedRequests.Add(1)
	}))
	defer destination.Close()
	origin := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Location", destination.URL+"/credential-target")
		writer.WriteHeader(http.StatusTemporaryRedirect)
	}))
	defer origin.Close()
	client := HTTPClient{Endpoint: origin.URL, Client: origin.Client()}
	if _, err := client.Activate(context.Background(), []byte("redirect-secret"), ActivateRequest{}); licensing.CodeOf(err) != licensing.CodeServiceUnavailable {
		t.Fatalf("redirect error = %v", err)
	}
	if redirectedRequests.Load() != 0 {
		t.Fatalf("redirect destination received %d requests", redirectedRequests.Load())
	}
}

func TestHTTPClientRejectsBadCredentialsBeforeTransport(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		requests.Add(1)
	}))
	defer server.Close()
	client := HTTPClient{Endpoint: server.URL, Client: server.Client()}
	credentials := [][]byte{
		nil,
		[]byte("   \n"),
		[]byte("token\ninside"),
		bytes.Repeat([]byte{'x'}, MaxTokenSize+1),
	}
	for index, credential := range credentials {
		if _, err := client.Activate(context.Background(), credential, ActivateRequest{}); licensing.CodeOf(err) != licensing.CodeAuthenticationRequired {
			t.Fatalf("credential %d error = %v", index, err)
		}
	}
	if requests.Load() != 0 {
		t.Fatalf("server received %d requests for invalid credentials", requests.Load())
	}
}

func TestHTTPClientMapsAuthenticatedServiceStatuses(t *testing.T) {
	for _, test := range []struct {
		name   string
		status int
		code   licensing.ErrorCode
	}{
		{name: "unauthorized", status: http.StatusUnauthorized, code: licensing.CodeAuthenticationRequired},
		{name: "forbidden", status: http.StatusForbidden, code: licensing.CodeLicenseDenied},
		{name: "not found", status: http.StatusNotFound, code: licensing.CodeLicenseDenied},
		{name: "device limit", status: http.StatusConflict, code: licensing.CodeDeviceLimitExceeded},
		{name: "revoked", status: http.StatusGone, code: licensing.CodeLicenseRevoked},
		{name: "rate limited", status: http.StatusTooManyRequests, code: licensing.CodeServiceUnavailable},
		{name: "server failure", status: http.StatusInternalServerError, code: licensing.CodeServiceUnavailable},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				writer.WriteHeader(test.status)
				_, _ = writer.Write([]byte(`{"error":"must not be reflected"}`))
			}))
			defer server.Close()
			_, err := (HTTPClient{Endpoint: server.URL, Client: server.Client()}).Activate(context.Background(), []byte("token"), ActivateRequest{})
			if licensing.CodeOf(err) != test.code {
				t.Fatalf("status %d error = %v", test.status, err)
			}
			if err != nil && bytes.Contains([]byte(err.Error()), []byte("must not be reflected")) {
				t.Fatalf("service response leaked through error: %v", err)
			}
		})
	}
}

func TestHTTPClientRejectsOversizedAndInvalidResponseMetadata(t *testing.T) {
	for _, test := range []struct {
		name        string
		contentType string
		body        []byte
	}{
		{name: "oversized", contentType: "application/json", body: bytes.Repeat([]byte{'x'}, MaxResponseSize+1)},
		{name: "wrong content type", contentType: "text/plain", body: []byte(`{}`)},
		{name: "empty", contentType: "application/json", body: nil},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				writer.Header().Set("Content-Type", test.contentType)
				_, _ = writer.Write(test.body)
			}))
			defer server.Close()
			_, err := (HTTPClient{Endpoint: server.URL, Client: server.Client()}).Activate(context.Background(), []byte("token"), ActivateRequest{})
			if licensing.CodeOf(err) != licensing.CodeInvalidOnlineCache {
				t.Fatalf("response error = %v", err)
			}
		})
	}
}

func TestHTTPClientTransportsRefreshAndDeactivateNonceWithoutMutation(t *testing.T) {
	for _, test := range []struct {
		name string
		path string
		call func(HTTPClient, string) ([]byte, error)
	}{
		{
			name: "refresh",
			path: "/v1/activations/activation-test/refresh",
			call: func(client HTTPClient, nonce string) ([]byte, error) {
				return client.Refresh(context.Background(), []byte("refresh-token"), RefreshRequest{
					RequestNonce: nonce, ActivationID: "activation-test", Sequence: 7, DeviceID: "device-test",
				})
			},
		},
		{
			name: "deactivate",
			path: "/v1/activations/activation-test/deactivate",
			call: func(client HTTPClient, nonce string) ([]byte, error) {
				return client.Deactivate(context.Background(), []byte("refresh-token"), DeactivateRequest{
					RequestNonce: nonce, ActivationID: "activation-test", Sequence: 8, DeviceID: "device-test",
				})
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			nonce := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0xa5}, 32))
			captured := make(chan map[string]any, 1)
			server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				var body map[string]any
				if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
					writer.WriteHeader(http.StatusBadRequest)
					return
				}
				body["observedPath"] = request.URL.Path
				captured <- body
				writer.Header().Set("Content-Type", "application/json")
				_, _ = writer.Write([]byte(`{}`))
			}))
			defer server.Close()
			if _, err := test.call(HTTPClient{Endpoint: server.URL, Client: server.Client()}, nonce); err != nil {
				t.Fatal(err)
			}
			seen := <-captured
			if seen["observedPath"] != test.path || seen["requestNonce"] != nonce {
				t.Fatalf("request = %#v", seen)
			}
		})
	}
}

func TestNewRequestNonceIsFreshCanonicalAndThirtyTwoBytes(t *testing.T) {
	first, err := NewRequestNonce()
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewRequestNonce()
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("two request nonces were equal")
	}
	for _, nonce := range []string{first, second} {
		decoded, err := base64.StdEncoding.DecodeString(nonce)
		if err != nil || len(decoded) != 32 || base64.StdEncoding.EncodeToString(decoded) != nonce {
			t.Fatalf("invalid nonce %q: length=%d err=%v", nonce, len(decoded), err)
		}
	}
}

func TestHTTPClientRejectsInvalidActivationIdentifierBeforeTransport(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		requests.Add(1)
	}))
	defer server.Close()
	client := HTTPClient{Endpoint: server.URL, Client: server.Client()}
	if _, err := client.Refresh(context.Background(), []byte("token"), RefreshRequest{ActivationID: "../other"}); licensing.CodeOf(err) != licensing.CodeInvalidOnlineCache {
		t.Fatalf("refresh identifier error = %v", err)
	}
	if _, err := client.Deactivate(context.Background(), []byte("token"), DeactivateRequest{ActivationID: "a/b"}); licensing.CodeOf(err) != licensing.CodeInvalidOnlineCache {
		t.Fatalf("deactivate identifier error = %v", err)
	}
	if requests.Load() != 0 {
		t.Fatalf("server received %d invalid identifier requests", requests.Load())
	}
}
