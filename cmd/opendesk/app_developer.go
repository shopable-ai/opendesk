package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	pkgHTTP "opendesk/pkg/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	appInspectorEndpointEnv = "OPENDESK_APP_INSPECTOR_ENDPOINT"
	appInspectorTokenEnv    = "OPENDESK_APP_INSPECTOR_CONTROL_TOKEN"
)

type appDeveloperRuntime struct {
	server   *pkgHTTP.Server
	listener net.Listener
	endpoint string
	token    string

	closeOnce sync.Once
	closeErr  error
}

func startAppDeveloperRuntime(ctx context.Context, packageID string, environment map[string]string) (*appDeveloperRuntime, error) {
	dataRoot, err := appModeDataRoot(packageID, environment)
	if err != nil {
		return nil, fmt.Errorf("resolve App developer data root: %w", err)
	}
	frontendRoot, err := accessibilityWorkbenchFrontendRoot()
	if err != nil {
		return nil, fmt.Errorf("resolve App Inspector frontend: %w", err)
	}
	token, err := randomAccessibilityWorkbenchControlToken()
	if err != nil {
		return nil, fmt.Errorf("create App Inspector control token: %w", err)
	}
	server := pkgHTTP.NewAccessibilityWorkbenchServer("0")
	listener, err := server.Listen()
	if err != nil {
		return nil, fmt.Errorf("listen for App Inspector: %w", err)
	}
	_, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("resolve App Inspector port: %w", err)
	}
	server.EnableOnDemandAccessibilityWorkbench(
		filepath.Join(dataRoot, ".runtime", "accessibility-inspector"),
		frontendRoot,
		port,
		token,
	)
	runtime := &appDeveloperRuntime{
		server: server, listener: listener,
		endpoint: "http://" + net.JoinHostPort("127.0.0.1", port), token: token,
	}
	go func() {
		serveErr := server.Serve(listener)
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			terminalPrintf(os.Stderr, "[FRAMEWORK] [WARN] App Inspector stopped: %v\n", serveErr)
		}
	}()
	context.AfterFunc(ctx, func() { _ = runtime.Close() })
	return runtime, nil
}

func (r *appDeveloperRuntime) Environment(base map[string]string) map[string]string {
	result := make(map[string]string, len(base)+2)
	for key, value := range base {
		result[key] = value
	}
	result[appInspectorEndpointEnv] = r.endpoint
	result[appInspectorTokenEnv] = r.token
	return result
}

func (r *appDeveloperRuntime) Endpoint() string {
	if r == nil {
		return ""
	}
	return r.endpoint
}

func (r *appDeveloperRuntime) Close() error {
	if r == nil {
		return nil
	}
	r.closeOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		serverErr := r.server.Shutdown(ctx)
		listenerErr := r.listener.Close()
		if errors.Is(listenerErr, net.ErrClosed) {
			listenerErr = nil
		}
		r.closeErr = errors.Join(serverErr, listenerErr)
	})
	return r.closeErr
}
