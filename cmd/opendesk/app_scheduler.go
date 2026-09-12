package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	pkgHTTP "opendesk/pkg/http"
	pkgScheduler "opendesk/pkg/scheduler"
)

const (
	appSchedulerEndpointEnv = "OPENDESK_APP_SCHEDULER_ENDPOINT"
	appSchedulerTokenEnv    = "OPENDESK_APP_SCHEDULER_TOKEN"
	appLocalEndpointEnv     = "OPENDESK_APP_LOCAL_ENDPOINT"
	appInspectorURLEnv      = "OPENDESK_APP_INSPECTOR_URL"
	appInspectorProductID   = "com.opendesk.desktop"
	appInspectorPagePath    = "/accessibility-workbench/"
	appInspectorArtifactDir = "inspector"
)

// appSchedulerRuntime historically owned only the Scheduler bridge. It now
// owns the App Mode local-services listener: Scheduler keeps its token-protected
// routes, while the official OpenDesk package can mount the existing read-only
// Inspector on the same loopback endpoint.
type appSchedulerRuntime struct {
	service      *pkgScheduler.Service
	store        *pkgScheduler.Store
	server       *http.Server
	listener     net.Listener
	inspector    *pkgHTTP.AppInspectorRoutes
	endpoint     string
	inspectorURL string
	token        string
	root         string

	closeOnce sync.Once
	closeErr  error
}

func startAppScheduler(ctx context.Context, config *Config, packageID, appRoot string, environment map[string]string) (*appSchedulerRuntime, error) {
	scriptRoot, err := resolveAppSchedulerScriptRoot(packageID, appRoot, environment)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(scriptRoot, 0o755); err != nil {
		return nil, fmt.Errorf("create App Scheduler script root: %w", err)
	}

	databasePath := ""
	if config != nil {
		databasePath = config.SchedulerDBPath
	}
	store, err := pkgScheduler.OpenStore(databasePath)
	if err != nil {
		return nil, fmt.Errorf("open App Scheduler database: %w", err)
	}
	cleanupStore := true
	defer func() {
		if cleanupStore {
			_ = store.Close()
		}
	}()

	executor, err := pkgScheduler.NewScriptExecutor(scriptRoot, 30*time.Minute)
	if err != nil {
		return nil, fmt.Errorf("initialize App Scheduler executor: %w", err)
	}
	service, err := pkgScheduler.NewService(store, executor, pkgScheduler.Options{ScriptRoot: scriptRoot})
	if err != nil {
		return nil, fmt.Errorf("initialize App Scheduler: %w", err)
	}
	if err := service.Start(ctx); err != nil {
		return nil, fmt.Errorf("start App Scheduler: %w", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = service.Close(closeCtx)
		return nil, fmt.Errorf("listen for App local services: %w", err)
	}
	token, err := randomAppSchedulerToken()
	if err != nil {
		_ = listener.Close()
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = service.Close(closeCtx)
		return nil, err
	}

	runtime := &appSchedulerRuntime{
		service:  service,
		store:    store,
		listener: listener,
		endpoint: "http://" + listener.Addr().String(),
		token:    token,
		root:     scriptRoot,
	}
	handler := pkgHTTP.NewHandlerWithScheduler(nil, service)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/scheduler/status", runtime.authorize(runtime.handleStatus))
	mux.HandleFunc("/api/scheduler/jobs", runtime.authorize(handler.HandleSchedulerJobs))
	mux.HandleFunc("/api/scheduler/jobs/", runtime.authorize(handler.HandleSchedulerJobRoutes))
	if err := runtime.attachInspector(packageID, appRoot, scriptRoot, mux); err != nil {
		_ = listener.Close()
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = service.Close(closeCtx)
		return nil, err
	}
	runtime.server = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}
	go func() {
		serveErr := runtime.server.Serve(listener)
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			terminalPrintf(os.Stderr, "[FRAMEWORK] [WARN] App local services stopped: %v\n", serveErr)
		}
	}()
	// App Mode owns this environment snapshot. Publish only runtime-assigned
	// addresses; never persist them into the package manifest. The existing
	// Scheduler endpoint remains as a compatibility alias for scheduler-client.
	if environment != nil {
		environment[appLocalEndpointEnv] = runtime.endpoint
		if runtime.inspectorURL != "" {
			environment[appInspectorURLEnv] = runtime.inspectorURL
		}
	}
	cleanupStore = false
	return runtime, nil
}

func (r *appSchedulerRuntime) attachInspector(packageID, appRoot, scriptRoot string, mux *http.ServeMux) error {
	if r == nil || mux == nil || strings.TrimSpace(packageID) != appInspectorProductID {
		return nil
	}
	frontendRoot, available, err := resolveAppInspectorFrontendRoot(appRoot)
	if err != nil {
		return fmt.Errorf("resolve App Inspector frontend root: %w", err)
	}
	if !available {
		return nil
	}
	_, controlPort, err := net.SplitHostPort(r.listener.Addr().String())
	if err != nil {
		return fmt.Errorf("resolve App Inspector listener port: %w", err)
	}
	artifactRoot := filepath.Join(filepath.Dir(scriptRoot), appInspectorArtifactDir)
	if err := os.MkdirAll(artifactRoot, 0o700); err != nil {
		return fmt.Errorf("create App Inspector artifact root: %w", err)
	}
	r.inspector = pkgHTTP.NewAppInspectorRoutes(artifactRoot, frontendRoot, controlPort)
	r.inspector.Register(mux)
	r.inspectorURL = r.endpoint + appInspectorPagePath
	return nil
}

func resolveAppInspectorFrontendRoot(appRoot string) (string, bool, error) {
	root, err := filepath.Abs(strings.TrimSpace(appRoot))
	if err != nil {
		return "", false, err
	}
	candidates := []string{
		filepath.Join(filepath.Dir(root), "inspector_web"),
		filepath.Join(root, "inspector_web"),
	}
	seen := map[string]bool{}
	for _, candidate := range candidates {
		candidate = filepath.Clean(candidate)
		if seen[candidate] {
			continue
		}
		seen[candidate] = true
		info, statErr := os.Stat(candidate)
		if errors.Is(statErr, os.ErrNotExist) {
			continue
		}
		if statErr != nil {
			return "", false, statErr
		}
		if !info.IsDir() {
			continue
		}
		validated, validateErr := validateAccessibilityWorkbenchFrontendRoot(candidate)
		if validateErr != nil {
			return "", false, validateErr
		}
		return validated, true, nil
	}
	return "", false, nil
}

func (r *appSchedulerRuntime) authorize(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		remoteHost, _, err := net.SplitHostPort(request.RemoteAddr)
		if err != nil {
			http.Error(w, "scheduler bridge is loopback-only", http.StatusForbidden)
			return
		}
		remoteIP := net.ParseIP(remoteHost)
		if remoteIP == nil || !remoteIP.IsLoopback() {
			http.Error(w, "scheduler bridge is loopback-only", http.StatusForbidden)
			return
		}
		if request.Header.Get("X-OpenDesk-App-Token") != r.token {
			http.Error(w, "scheduler bridge token is invalid", http.StatusForbidden)
			return
		}
		next(w, request)
	}
}

func (r *appSchedulerRuntime) handleStatus(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":    0,
		"message": "success",
		"data": map[string]any{
			"available":     true,
			"runnerState":   r.service.RunnerState(),
			"scriptRoot":    r.root,
			"localEndpoint": r.endpoint,
			"inspectorUrl":  r.inspectorURL,
		},
	})
}

func (r *appSchedulerRuntime) Environment(base map[string]string) map[string]string {
	result := make(map[string]string, len(base)+4)
	for key, value := range base {
		result[key] = value
	}
	result[appSchedulerEndpointEnv] = r.endpoint
	result[appSchedulerTokenEnv] = r.token
	result[appLocalEndpointEnv] = r.endpoint
	if r.inspectorURL != "" {
		result[appInspectorURLEnv] = r.inspectorURL
	}
	return result
}

func (r *appSchedulerRuntime) Endpoint() string {
	if r == nil {
		return ""
	}
	return r.endpoint
}

func (r *appSchedulerRuntime) Token() string {
	if r == nil {
		return ""
	}
	return r.token
}

func (r *appSchedulerRuntime) InspectorURL() string {
	if r == nil {
		return ""
	}
	return r.inspectorURL
}

func (r *appSchedulerRuntime) Close() error {
	if r == nil {
		return nil
	}
	closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return r.close(closeCtx)
}

func (r *appSchedulerRuntime) close(ctx context.Context) error {
	r.closeOnce.Do(func() {
		if ctx == nil {
			ctx = context.Background()
		}
		var serverErr error
		if r.server != nil {
			serverErr = r.server.Shutdown(ctx)
		}
		var inspectorErr error
		if r.inspector != nil {
			inspectorErr = r.inspector.Shutdown(ctx)
		}
		var schedulerErr error
		if r.service != nil {
			schedulerErr = r.service.Close(ctx)
		}
		var listenerErr error
		if r.listener != nil {
			listenerErr = r.listener.Close()
			if errors.Is(listenerErr, net.ErrClosed) {
				listenerErr = nil
			}
		}
		var storeErr error
		if r.store != nil {
			storeErr = r.store.Close()
		}
		r.closeErr = errors.Join(serverErr, inspectorErr, schedulerErr, listenerErr, storeErr)
	})
	return r.closeErr
}

func resolveAppSchedulerScriptRoot(packageID, appRoot string, environment map[string]string) (string, error) {
	configured := strings.TrimSpace(environment["OPENDESK_SCRIPT_RUNNER_DIR"])
	if configured != "" {
		return normalizeAppSchedulerRoot(configured, appRoot)
	}

	appDataRoot := strings.TrimSpace(environment["OPENDESK_APP_DATA_DIR"])
	if appDataRoot == "" {
		home := strings.TrimSpace(environment["HOME"])
		if home == "" {
			home = strings.TrimSpace(environment["USERPROFILE"])
		}
		if home == "" {
			return "", fmt.Errorf("resolve App Scheduler script root: HOME/USERPROFILE is unavailable; set OPENDESK_APP_DATA_DIR")
		}
		appDataRoot = filepath.Join(home, ".opendesk", "apps", packageID)
	}
	if !filepath.IsAbs(appDataRoot) {
		appDataRoot = filepath.Join(appRoot, appDataRoot)
	}
	return normalizeAppSchedulerRoot(filepath.Join(appDataRoot, "recipes"), appRoot)
}

func normalizeAppSchedulerRoot(root, appRoot string) (string, error) {
	if !filepath.IsAbs(root) {
		root = filepath.Join(appRoot, root)
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve App Scheduler script root: %w", err)
	}
	return filepath.Clean(absolute), nil
}

func randomAppSchedulerToken() (string, error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("create App Scheduler bridge token: %w", err)
	}
	return hex.EncodeToString(buffer), nil
}
