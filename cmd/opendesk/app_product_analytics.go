package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	officialassets "opendesk/internal/officialassets"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/productanalytics"
)

type appProductAnalyticsRuntime struct {
	service *productanalytics.Service
	token   string
}

var appProductAnalyticsRegistry sync.Map

func registerAppProductAnalytics(owner *appSchedulerRuntime, packageID, appRoot, dataRoot string, environment map[string]string, mux *http.ServeMux) error {
	if owner == nil || mux == nil || strings.TrimSpace(packageID) != appInspectorProductID {
		return nil
	}
	productConfig, err := officialassets.Config()
	if err != nil {
		return fmt.Errorf("load Product Analytics config: %w", err)
	}
	if productConfig.Analytics == nil {
		return nil
	}
	analyticsConfig := productConfig.Analytics
	service, err := productanalytics.New(productanalytics.Options{
		DataRoot: dataRoot,
		Config: productanalytics.Config{
			Provider:            strings.ToLower(strings.TrimSpace(analyticsConfig.Provider)),
			Endpoint:            strings.TrimSpace(analyticsConfig.Endpoint),
			ProjectToken:        strings.TrimSpace(analyticsConfig.ProjectToken),
			Environment:         strings.ToLower(strings.TrimSpace(analyticsConfig.Environment)),
			MaxEventBytes:       analyticsConfig.MaxEventBytes,
			MaxQueueSize:        analyticsConfig.Queue.MaxEvents,
			BatchSize:           analyticsConfig.Queue.BatchSize,
			MaxEnqueuedRequests: analyticsConfig.Queue.MaxRequests,
			RequestTimeout:      time.Duration(analyticsConfig.Network.RequestTimeoutMs) * time.Millisecond,
			FlushInterval:       time.Duration(analyticsConfig.Network.FlushIntervalMs) * time.Millisecond,
			MaxRetries:          analyticsConfig.Network.MaxRetries,
			ShutdownTimeout:     time.Duration(analyticsConfig.Network.ShutdownTimeoutMs) * time.Millisecond,
			SessionTimeout:      time.Duration(analyticsConfig.Session.IdleTimeoutMinutes) * time.Minute,
		},
		Runtime: productanalytics.RuntimeInfo{
			AppVersion: appProductVersion(appRoot),
			Platform:   runtime.GOOS,
			Arch:       runtime.GOARCH,
		},
	})
	if err != nil {
		return fmt.Errorf("initialize Product Analytics: %w", err)
	}
	token, err := randomAppSchedulerToken()
	if err != nil {
		closeCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		_ = service.Close(closeCtx)
		cancel()
		return fmt.Errorf("create Product Analytics bridge token: %w", err)
	}
	analyticsRuntime := &appProductAnalyticsRuntime{service: service, token: token}
	appProductAnalyticsRegistry.Store(owner, analyticsRuntime)
	service.Start()

	mux.HandleFunc("/api/product/analytics/status", analyticsRuntime.authorize(analyticsRuntime.handleStatus))
	mux.HandleFunc("/api/product/analytics/diagnostics", analyticsRuntime.authorize(analyticsRuntime.handleDiagnostics))
	mux.HandleFunc("/api/product/analytics/enabled", analyticsRuntime.authorize(analyticsRuntime.handleEnabled))
	mux.HandleFunc("/api/product/analytics/screen", analyticsRuntime.authorize(analyticsRuntime.handleScreen))
	mux.HandleFunc("/api/product/analytics/action", analyticsRuntime.authorize(analyticsRuntime.handleAction))
	mux.HandleFunc("/api/product/analytics/run/start", analyticsRuntime.authorize(analyticsRuntime.handleRunStart))
	mux.HandleFunc("/api/product/analytics/run/finish", analyticsRuntime.authorize(analyticsRuntime.handleRunFinish))
	injectAppProductAnalyticsEnvironment(owner, environment)
	return nil
}

func appProductVersion(appRoot string) string {
	data, err := os.ReadFile(filepath.Join(appRoot, "opendesk.app.json"))
	if err == nil {
		var manifest struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(data, &manifest) == nil {
			if version := strings.TrimSpace(manifest.Version); version != "" && len(version) <= 64 {
				return version
			}
		}
	}
	if info, ok := debug.ReadBuildInfo(); ok {
		version := strings.TrimSpace(info.Main.Version)
		if version != "" && version != "(devel)" && len(version) <= 64 {
			return version
		}
	}
	return "development"
}

func appProductAnalyticsFor(owner *appSchedulerRuntime) *appProductAnalyticsRuntime {
	if owner == nil {
		return nil
	}
	value, ok := appProductAnalyticsRegistry.Load(owner)
	if !ok {
		return nil
	}
	runtime, _ := value.(*appProductAnalyticsRuntime)
	return runtime
}

func appProductAnalyticsService(owner *appSchedulerRuntime) *productanalytics.Service {
	runtime := appProductAnalyticsFor(owner)
	if runtime == nil {
		return nil
	}
	return runtime.service
}

func appProductAnalyticsServiceFromEnvironment(environment map[string]string) *productanalytics.Service {
	if environment == nil {
		return nil
	}
	token := strings.TrimSpace(environment[productanalytics.LocalTokenEnv])
	endpoint := strings.TrimSpace(environment[productanalytics.LocalEndpointEnv])
	if token == "" || endpoint == "" {
		return nil
	}
	var service *productanalytics.Service
	appProductAnalyticsRegistry.Range(func(key, value any) bool {
		owner, ownerOK := key.(*appSchedulerRuntime)
		runtime, runtimeOK := value.(*appProductAnalyticsRuntime)
		if !ownerOK || !runtimeOK || owner == nil || runtime == nil {
			return true
		}
		if runtime.token == token && owner.endpoint == endpoint {
			service = runtime.service
			return false
		}
		return true
	})
	return service
}

func injectAppProductAnalyticsEnvironment(owner *appSchedulerRuntime, environment map[string]string) {
	runtime := appProductAnalyticsFor(owner)
	if runtime == nil || environment == nil || owner == nil {
		return
	}
	environment[productanalytics.LocalEndpointEnv] = owner.endpoint
	environment[productanalytics.LocalTokenEnv] = runtime.token
	environment[productanalytics.RunSourceEnv] = "foreground"
}

func closeAppProductAnalytics(owner *appSchedulerRuntime) error {
	runtime := appProductAnalyticsFor(owner)
	if runtime == nil {
		return nil
	}
	appProductAnalyticsRegistry.Delete(owner)
	if runtime.service == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	return runtime.service.Close(ctx)
}

func runAppRecipeWithProductAnalytics(service *productanalytics.Service, request pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
	if service == nil {
		return pkgExecution.Run(request)
	}
	runID := productanalytics.NewRunID()
	return productanalytics.RunObserved(request, productanalytics.ExecutionLifecycle{
		Started: func() bool {
			return service.FlowRunStarted("local", "foreground", runID)
		},
		Finished: func(status pkgExecution.ExecutionStatus) {
			finishProductAnalyticsRun(service, runID, status)
		},
	})
}

func finishProductAnalyticsRun(service *productanalytics.Service, runID string, status pkgExecution.ExecutionStatus) {
	if service == nil {
		return
	}
	switch status {
	case pkgExecution.ExecutionStatusSucceeded:
		service.FlowRunFinished(runID, "success", "")
	case pkgExecution.ExecutionStatusFailed:
		service.FlowRunFinished(runID, "failure", "execution_failed")
	case pkgExecution.ExecutionStatusTimedOut:
		service.FlowRunFinished(runID, "failure", "timeout")
	case pkgExecution.ExecutionStatusCanceled:
		service.FlowRunFinished(runID, "cancelled", "")
	}
}

func (r *appProductAnalyticsRuntime) authorize(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		remoteHost, _, err := net.SplitHostPort(request.RemoteAddr)
		if err != nil {
			http.Error(w, "product analytics bridge is loopback-only", http.StatusForbidden)
			return
		}
		remoteIP := net.ParseIP(remoteHost)
		if remoteIP == nil || !remoteIP.IsLoopback() {
			http.Error(w, "product analytics bridge is loopback-only", http.StatusForbidden)
			return
		}
		if request.Header.Get(productanalytics.LocalHeader) != r.token {
			http.Error(w, "product analytics bridge token is invalid", http.StatusForbidden)
			return
		}
		next(w, request)
	}
}

func (r *appProductAnalyticsRuntime) handleStatus(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.writeStatus(w, true, nil)
}

func (r *appProductAnalyticsRuntime) handleDiagnostics(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if r == nil || r.service == nil {
		http.Error(w, "product analytics unavailable", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code": 0, "message": "success", "data": r.service.Diagnostics(),
	})
}

func (r *appProductAnalyticsRuntime) handleEnabled(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if !decodeAnalyticsBody(w, request, &body) {
		return
	}
	status, err := r.service.SetConsent(body.Enabled)
	if err != nil {
		r.writeStatus(w, false, err)
		return
	}
	r.writeStatusValue(w, status, true, nil)
}

func (r *appProductAnalyticsRuntime) handleScreen(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Surface string `json:"surface"`
	}
	if !decodeAnalyticsBody(w, request, &body) {
		return
	}
	writeAnalyticsAccepted(w, r.service.ScreenViewed(strings.TrimSpace(body.Surface)))
}

func (r *appProductAnalyticsRuntime) handleAction(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Surface     string `json:"surface"`
		ActionID    string `json:"actionId"`
		InputMethod string `json:"inputMethod"`
	}
	if !decodeAnalyticsBody(w, request, &body) {
		return
	}
	accepted := r.service.UIAction(
		strings.TrimSpace(body.Surface),
		strings.TrimSpace(body.ActionID),
		strings.TrimSpace(body.InputMethod),
	)
	writeAnalyticsAccepted(w, accepted)
}

func (r *appProductAnalyticsRuntime) handleRunStart(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		FlowOrigin string `json:"flowOrigin"`
		RunSource  string `json:"runSource"`
		RunID      string `json:"runId"`
	}
	if !decodeAnalyticsBody(w, request, &body) {
		return
	}
	accepted := r.service.FlowRunStarted(
		strings.TrimSpace(body.FlowOrigin),
		strings.TrimSpace(body.RunSource),
		strings.TrimSpace(body.RunID),
	)
	writeAnalyticsAccepted(w, accepted)
}

func (r *appProductAnalyticsRuntime) handleRunFinish(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RunID     string `json:"runId"`
		Outcome   string `json:"outcome"`
		ErrorCode string `json:"errorCode"`
	}
	if !decodeAnalyticsBody(w, request, &body) {
		return
	}
	accepted := r.service.FlowRunFinished(
		strings.TrimSpace(body.RunID),
		strings.TrimSpace(body.Outcome),
		strings.TrimSpace(body.ErrorCode),
	)
	writeAnalyticsAccepted(w, accepted)
}

func decodeAnalyticsBody(w http.ResponseWriter, request *http.Request, target any) bool {
	request.Body = http.MaxBytesReader(w, request.Body, 4096)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		http.Error(w, "invalid product analytics request", http.StatusBadRequest)
		return false
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		http.Error(w, "invalid product analytics request", http.StatusBadRequest)
		return false
	}
	return true
}

func (r *appProductAnalyticsRuntime) writeStatus(w http.ResponseWriter, accepted bool, err error) {
	if r == nil || r.service == nil {
		http.Error(w, "product analytics unavailable", http.StatusServiceUnavailable)
		return
	}
	r.writeStatusValue(w, r.service.Status(), accepted, err)
}

func (r *appProductAnalyticsRuntime) writeStatusValue(w http.ResponseWriter, status productanalytics.Status, accepted bool, err error) {
	w.Header().Set("Content-Type", "application/json")
	code := 0
	message := "success"
	if err != nil {
		code = 1
		message = "product analytics preference update failed"
		w.WriteHeader(http.StatusInternalServerError)
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":    code,
		"message": message,
		"data": map[string]any{
			"available":      true,
			"accepted":       accepted,
			"consent":        status.Consent,
			"provider":       status.Provider,
			"configured":     status.Configured,
			"captureEnabled": status.CaptureEnabled,
			"installIdSet":   status.InstallIDSet,
			"droppedEvents":  status.DroppedEvents,
			"lastErrorCode":  status.LastErrorCode,
		},
	})
}

func writeAnalyticsAccepted(w http.ResponseWriter, accepted bool) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":    0,
		"message": "success",
		"data": map[string]any{"accepted": accepted},
	})
}
