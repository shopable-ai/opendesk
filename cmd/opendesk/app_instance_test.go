package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestRunningOpenDeskOnLocalPortAcceptsOnlyOpenDeskHealth(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		body       string
		want       bool
	}{
		{name: "current service marker", statusCode: http.StatusOK, body: `{"service":"opendesk","status":"ok"}`, want: true},
		{name: "compatible older OpenDesk", statusCode: http.StatusOK, body: `{"status":"ok","execution_capacity":10,"vision_enabled":true,"scheduler":true}`, want: true},
		{name: "unmarked unrelated status", statusCode: http.StatusOK, body: `{"status":"ok"}`, want: false},
		{name: "wrong service marker", statusCode: http.StatusOK, body: `{"service":"other","status":"ok"}`, want: false},
		{name: "unhealthy OpenDesk", statusCode: http.StatusOK, body: `{"service":"opendesk","status":"failed"}`, want: false},
		{name: "redirect is not followed", statusCode: http.StatusFound, body: `{"service":"opendesk","status":"ok"}`, want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/status" {
					t.Fatalf("path = %q, want /status", r.URL.Path)
				}
				w.WriteHeader(test.statusCode)
				_, _ = w.Write([]byte(test.body))
			}))
			defer server.Close()
			parsed, err := url.Parse(server.URL)
			if err != nil {
				t.Fatal(err)
			}
			if got := runningOpenDeskOnLocalPort(parsed.Port()); got != test.want {
				t.Fatalf("runningOpenDeskOnLocalPort() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestRunningOpenDeskOnLocalPortRejectsInvalidPort(t *testing.T) {
	for _, port := range []string{"", "0", "-1", "65536", "not-a-port"} {
		if runningOpenDeskOnLocalPort(port) {
			t.Fatalf("runningOpenDeskOnLocalPort(%q) = true", port)
		}
	}
}

func TestAddressInUse(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	_, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	conflict, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", port))
	if err == nil {
		conflict.Close()
		t.Fatal("second listener unexpectedly succeeded")
	}
	if !addressInUse(err) {
		t.Fatalf("addressInUse(%v) = false", err)
	}
}
