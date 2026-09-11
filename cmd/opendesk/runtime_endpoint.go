package main

import (
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
)

type endpointMode string

const (
	endpointModeAuto     endpointMode = "auto"
	endpointModeExplicit endpointMode = "explicit"
)

type endpointConfig struct {
	Owner         string
	Host          string
	RequestedPort string
	Mode          endpointMode
}

type endpointInfo struct {
	Host          string
	ActualPort    int
	ActualAddress string
}

func (info endpointInfo) PortString() string {
	return strconv.Itoa(info.ActualPort)
}

type runtimeEndpoint struct {
	listener net.Listener
	info     endpointInfo
	closeMu  sync.Once
	closeErr error
}

func listenRuntimeEndpoint(config endpointConfig) (*runtimeEndpoint, error) {
	owner := strings.TrimSpace(config.Owner)
	if owner == "" {
		owner = "runtime"
	}

	host := strings.TrimSpace(config.Host)
	requestedPort := strings.TrimSpace(config.RequestedPort)
	switch config.Mode {
	case endpointModeAuto:
		if host == "" {
			host = "127.0.0.1"
		}
		requestedPort = "0"
	case endpointModeExplicit:
		if host == "" {
			host = "0.0.0.0"
		}
		port, err := strconv.Atoi(requestedPort)
		if err != nil || port < 1 || port > 65535 {
			return nil, fmt.Errorf("%s endpoint requested port %q is invalid; explicit ports must be between 1 and 65535", owner, requestedPort)
		}
	default:
		return nil, fmt.Errorf("%s endpoint mode %q is invalid", owner, config.Mode)
	}

	requestedAddress := net.JoinHostPort(host, requestedPort)
	listener, err := net.Listen("tcp", requestedAddress)
	if err != nil {
		if config.Mode == endpointModeExplicit && addressInUse(err) {
			return nil, fmt.Errorf("%s endpoint %s:%s: address already in use: %w", owner, host, requestedPort, err)
		}
		return nil, fmt.Errorf("%s endpoint listen %s: %w", owner, requestedAddress, err)
	}

	tcpAddress, ok := listener.Addr().(*net.TCPAddr)
	if !ok || tcpAddress.Port <= 0 {
		_ = listener.Close()
		return nil, fmt.Errorf("%s endpoint returned unsupported listener address %q", owner, listener.Addr())
	}

	return &runtimeEndpoint{
		listener: listener,
		info: endpointInfo{
			Host:          host,
			ActualPort:    tcpAddress.Port,
			ActualAddress: listener.Addr().String(),
		},
	}, nil
}

func (endpoint *runtimeEndpoint) Listener() net.Listener {
	if endpoint == nil {
		return nil
	}
	return endpoint.listener
}

func (endpoint *runtimeEndpoint) Info() endpointInfo {
	if endpoint == nil {
		return endpointInfo{}
	}
	return endpoint.info
}

func (endpoint *runtimeEndpoint) Close() error {
	if endpoint == nil {
		return nil
	}
	endpoint.closeMu.Do(func() {
		if endpoint.listener != nil {
			endpoint.closeErr = endpoint.listener.Close()
		}
	})
	return endpoint.closeErr
}

func frameworkHTTPConfig(autoRuntime bool, requestedPort string) endpointConfig {
	if autoRuntime {
		return endpointConfig{
			Owner:         "framework runtime",
			Host:          "127.0.0.1",
			RequestedPort: "0",
			Mode:          endpointModeAuto,
		}
	}
	return endpointConfig{
		Owner:         "HTTP server",
		Host:          "0.0.0.0",
		RequestedPort: strings.TrimSpace(requestedPort),
		Mode:          endpointModeExplicit,
	}
}
