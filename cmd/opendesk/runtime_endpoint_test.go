package main

import (
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestFrameworkHTTPAutoAllocationAllowsParallelRuntimes(t *testing.T) {
	config := frameworkHTTPConfig(true, "60844")
	if config.Mode != endpointModeAuto || config.Host != "127.0.0.1" || config.RequestedPort != "0" {
		t.Fatalf("unexpected auto framework config: %+v", config)
	}

	first, err := listenRuntimeEndpoint(config)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := listenRuntimeEndpoint(config)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()

	firstInfo := first.Info()
	secondInfo := second.Info()
	if firstInfo.ActualPort <= 0 || secondInfo.ActualPort <= 0 {
		t.Fatalf("auto ports must be concrete: first=%+v second=%+v", firstInfo, secondInfo)
	}
	if firstInfo.ActualPort == secondInfo.ActualPort {
		t.Fatalf("parallel runtime endpoints must not share a port: %+v %+v", firstInfo, secondInfo)
	}
	if firstInfo.Host != "127.0.0.1" || secondInfo.Host != "127.0.0.1" {
		t.Fatalf("auto endpoints must remain loopback-only: %+v %+v", firstInfo, secondInfo)
	}
}

func TestExplicitEndpointUsesRequestedPort(t *testing.T) {
	port := reserveFreeTCPPort(t)
	endpoint, err := listenRuntimeEndpoint(endpointConfig{
		Owner:         "test HTTP server",
		Host:          "127.0.0.1",
		RequestedPort: strconv.Itoa(port),
		Mode:          endpointModeExplicit,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer endpoint.Close()
	if endpoint.Info().ActualPort != port {
		t.Fatalf("actual port=%d want=%d", endpoint.Info().ActualPort, port)
	}
}

func TestExplicitEndpointConflictFailsWithoutFallback(t *testing.T) {
	blocker, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Close()
	port := blocker.Addr().(*net.TCPAddr).Port

	endpoint, err := listenRuntimeEndpoint(endpointConfig{
		Owner:         "HTTP server",
		Host:          "127.0.0.1",
		RequestedPort: strconv.Itoa(port),
		Mode:          endpointModeExplicit,
	})
	if endpoint != nil {
		_ = endpoint.Close()
		t.Fatal("explicit conflict unexpectedly allocated a fallback endpoint")
	}
	if err == nil {
		t.Fatal("expected explicit port conflict")
	}
	message := strings.ToLower(err.Error())
	for _, expected := range []string{"http server", "127.0.0.1", strconv.Itoa(port), "address already in use"} {
		if !strings.Contains(message, strings.ToLower(expected)) {
			t.Fatalf("conflict error %q does not contain %q", err, expected)
		}
	}
}

func TestExplicitEndpointRejectsPortZero(t *testing.T) {
	endpoint, err := listenRuntimeEndpoint(endpointConfig{
		Owner:         "HTTP server",
		Host:          "127.0.0.1",
		RequestedPort: "0",
		Mode:          endpointModeExplicit,
	})
	if endpoint != nil {
		_ = endpoint.Close()
		t.Fatal("explicit port zero must not silently become auto allocation")
	}
	if err == nil || !strings.Contains(err.Error(), "between 1 and 65535") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRuntimeEndpointCloseReleasesListener(t *testing.T) {
	endpoint, err := listenRuntimeEndpoint(endpointConfig{
		Owner:         "cleanup test",
		Host:          "127.0.0.1",
		RequestedPort: "0",
		Mode:          endpointModeAuto,
	})
	if err != nil {
		t.Fatal(err)
	}
	address := net.JoinHostPort(endpoint.Info().Host, endpoint.Info().PortString())
	if err := endpoint.Close(); err != nil {
		t.Fatal(err)
	}
	if err := endpoint.Close(); err != nil {
		t.Fatalf("second close must be harmless: %v", err)
	}
	connection, err := net.DialTimeout("tcp", address, 100*time.Millisecond)
	if err == nil {
		_ = connection.Close()
		t.Fatalf("listener still accepts connections after close: %s", address)
	}
}

func TestFrameworkHTTPExplicitModePreservesFixedPublicPort(t *testing.T) {
	config := frameworkHTTPConfig(false, "60844")
	if config.Mode != endpointModeExplicit || config.Host != "0.0.0.0" || config.RequestedPort != "60844" {
		t.Fatalf("unexpected explicit HTTP config: %+v", config)
	}
}

func reserveFreeTCPPort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	return port
}
