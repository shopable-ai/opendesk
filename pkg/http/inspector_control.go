package http

import (
	"context"
	"errors"
	"fmt"
	"net"
	stdhttp "net/http"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	// accessibilityWorkbenchControlPath is the local control route used by the
	// independently served loopback page to ask an already-running OpenDesk
	// service to start the isolated API
	// listener. It never serves frontend assets or Inspector data itself.
	accessibilityWorkbenchControlPath       = "/api/accessibility-workbench/v1/launch"
	accessibilityWorkbenchControlMark       = "X-OpenDesk-Workbench-Control"
	accessibilityWorkbenchPairShutdownGrace = 250 * time.Millisecond
)

type accessibilityWorkbenchLaunchRequest struct {
	FrontendURL string `json:"frontendUrl"`
}

// accessibilityWorkbenchLaunch describes one newly-created, time-bounded
// Workbench API listener. URL targets the caller-owned static frontend and
// contains a one-time pairing secret; it must not be logged or persisted.
type accessibilityWorkbenchLaunch struct {
	URL      string `json:"url"`
	Listener string `json:"listener"`
	Mode     string `json:"mode"`
	Boundary string `json:"boundary"`
}

// accessibilityWorkbenchController owns an optional child API listener inside
// the already-running OpenDesk process. A caller-owned static frontend remains
// independent while the API listener is created and revoked.
type accessibilityWorkbenchController struct {
	operationMu  sync.Mutex
	mu           sync.Mutex
	artifactRoot string
	pairTTL      time.Duration
	clientTTL    time.Duration
	generation   uint64
	server       *Server
	done         chan error
	timer        *time.Timer
}

func newAccessibilityWorkbenchController(artifactRoot string) *accessibilityWorkbenchController {
	return &accessibilityWorkbenchController{
		artifactRoot: strings.TrimSpace(artifactRoot),
		pairTTL:      inspectorPairTTL,
		clientTTL:    inspectorClientTTL,
	}
}

func (c *accessibilityWorkbenchController) launch(frontendURL *url.URL) (accessibilityWorkbenchLaunch, error) {
	if c == nil {
		return accessibilityWorkbenchLaunch{}, errors.New("Accessibility Workbench control is unavailable")
	}
	if frontendURL == nil {
		return accessibilityWorkbenchLaunch{}, errors.New("frontendUrl is required; OpenDesk does not serve Workbench frontend assets")
	}
	c.operationMu.Lock()
	defer c.operationMu.Unlock()

	if c.hasActive() {
		return accessibilityWorkbenchLaunch{}, errors.New("Accessibility Workbench is already active; close its browser page before opening another session")
	}

	// The frontend owns its static-page listener. Reserve an ephemeral port for
	// the authenticated native API so OpenDesk never competes for it.
	server := newAccessibilityWorkbenchServer("0", c.artifactRoot)
	listener, err := server.Listen()
	if err != nil {
		return accessibilityWorkbenchLaunch{}, fmt.Errorf("reserve Accessibility Workbench listener: %w", err)
	}
	launchURL, err := server.accessibilityWorkbenchPairingURL(listener)
	if err != nil {
		_ = listener.Close()
		server.handler.inspector.close()
		return accessibilityWorkbenchLaunch{}, err
	}
	server.handler.inspectorFrontendOrigin = frontendURL.Scheme + "://" + frontendURL.Host
	launchURL, err = externalAccessibilityWorkbenchURL(frontendURL, launchURL)
	if err != nil {
		_ = listener.Close()
		server.handler.inspector.close()
		return accessibilityWorkbenchLaunch{}, err
	}
	c.mu.Lock()
	c.generation++
	generation := c.generation
	done := make(chan error, 1)
	c.server = server
	c.done = done
	c.timer = time.AfterFunc(c.pairTTL+accessibilityWorkbenchPairShutdownGrace, func() { c.stopGeneration(generation) })
	c.mu.Unlock()

	server.handler.inspectorOnPaired = func() { c.extendGeneration(generation, c.clientTTL) }
	server.handler.inspectorOnIdle = func() { c.stopGeneration(generation) }
	go func() {
		done <- server.Serve(listener)
		c.clearGeneration(generation)
	}()

	return accessibilityWorkbenchLaunch{
		URL: launchURL, Listener: listener.Addr().String(), Mode: "loopback", Boundary: "127.0.0.0/8 and ::1",
	}, nil
}

func parseAccessibilityWorkbenchFrontendURL(value string) (*url.URL, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("frontendUrl is required; serve inspector_web independently")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "http" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
		return nil, errors.New("frontendUrl must be an HTTP URL served from a loopback address")
	}
	host := strings.TrimSpace(parsed.Hostname())
	loopback := strings.EqualFold(host, "localhost")
	if address, parseErr := netip.ParseAddr(host); parseErr == nil {
		loopback = address.Unmap().IsLoopback()
	}
	if !loopback {
		return nil, errors.New("frontendUrl must use localhost or a loopback IP address")
	}
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	return parsed, nil
}

func externalAccessibilityWorkbenchURL(frontendURL *url.URL, backendLaunchURL string) (string, error) {
	backend, err := url.Parse(backendLaunchURL)
	if err != nil {
		return "", fmt.Errorf("parse Workbench API launch URL: %w", err)
	}
	backendFragment, err := url.ParseQuery(backend.Fragment)
	if err != nil || backendFragment.Get("pair") == "" {
		return "", errors.New("Workbench API launch URL has no pairing code")
	}
	result := *frontendURL
	// Fragment escaping is handled by url.URL.String. Storing an already
	// query-escaped string here would double-escape the API origin for browsers.
	result.Fragment = "api=" + backend.Scheme + "://" + backend.Host + "&pair=" + backendFragment.Get("pair")
	return result.String(), nil
}

func (c *accessibilityWorkbenchController) hasActive() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.server != nil
}

func (c *accessibilityWorkbenchController) extendGeneration(generation uint64, duration time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.generation == generation && c.server != nil && c.timer != nil {
		c.timer.Reset(duration)
	}
}

func (c *accessibilityWorkbenchController) clearGeneration(generation uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.generation != generation {
		return
	}
	if c.timer != nil {
		c.timer.Stop()
	}
	c.server = nil
	c.done = nil
	c.timer = nil
}

func (c *accessibilityWorkbenchController) stopGeneration(generation uint64) {
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	c.mu.Lock()
	current := c.generation == generation && c.server != nil
	c.mu.Unlock()
	if !current {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = c.stopCurrent(ctx)
}

func (c *accessibilityWorkbenchController) stopCurrent(ctx context.Context) error {
	c.mu.Lock()
	server := c.server
	done := c.done
	if c.timer != nil {
		c.timer.Stop()
	}
	c.server = nil
	c.done = nil
	c.timer = nil
	c.mu.Unlock()
	if server == nil {
		return nil
	}

	err := server.Shutdown(ctx)
	if done != nil {
		select {
		case serveErr := <-done:
			if serveErr != nil && !errors.Is(serveErr, stdhttp.ErrServerClosed) && err == nil {
				err = serveErr
			}
		case <-ctx.Done():
			if err == nil {
				err = ctx.Err()
			}
		}
	}
	return err
}

func (c *accessibilityWorkbenchController) shutdown(ctx context.Context) error {
	if c == nil {
		return nil
	}
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	return c.stopCurrent(ctx)
}

func (h *Handler) handleAccessibilityWorkbenchControl(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	setInspectorSecurityHeaders(w)
	if h.workbench == nil {
		h.sendError(w, stdhttp.StatusNotFound, "Accessibility Workbench control is not enabled")
		return
	}
	browserOrigin, preflight, err := h.authorizeAccessibilityWorkbenchControl(w, r)
	if err != nil {
		h.sendError(w, stdhttp.StatusForbidden, err.Error())
		return
	}
	if preflight {
		w.WriteHeader(stdhttp.StatusNoContent)
		return
	}
	if r.Method != stdhttp.MethodPost {
		h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var input accessibilityWorkbenchLaunchRequest
	if err := decodeInspectorJSON(w, r, &input); err != nil {
		h.sendError(w, stdhttp.StatusBadRequest, err.Error())
		return
	}
	frontendURL, err := parseAccessibilityWorkbenchFrontendURL(input.FrontendURL)
	if err != nil {
		h.sendError(w, stdhttp.StatusBadRequest, err.Error())
		return
	}
	if browserOrigin != "" && (frontendURL == nil || accessibilityWorkbenchOrigin(frontendURL) != browserOrigin) {
		h.sendError(w, stdhttp.StatusBadRequest, "frontendUrl origin must match the requesting loopback page")
		return
	}
	launch, err := h.workbench.launch(frontendURL)
	if err != nil {
		h.sendError(w, stdhttp.StatusConflict, err.Error())
		return
	}
	h.sendSuccess(w, launch)
}

func accessibilityWorkbenchOrigin(value *url.URL) string {
	if value == nil {
		return ""
	}
	return value.Scheme + "://" + value.Host
}

func parseAccessibilityWorkbenchControlOrigin(value string) (string, error) {
	value = strings.TrimSpace(value)
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "http" || parsed.Host == "" || parsed.User != nil ||
		parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("Workbench browser control requires a plain HTTP loopback Origin")
	}
	host := strings.TrimSpace(parsed.Hostname())
	loopback := strings.EqualFold(host, "localhost")
	if address, parseErr := netip.ParseAddr(host); parseErr == nil {
		loopback = address.Unmap().IsLoopback()
	}
	if !loopback || accessibilityWorkbenchOrigin(parsed) != value {
		return "", errors.New("Workbench browser control requires a plain HTTP loopback Origin")
	}
	return value, nil
}

func (h *Handler) authorizeAccessibilityWorkbenchControl(w stdhttp.ResponseWriter, r *stdhttp.Request) (string, bool, error) {
	if r == nil {
		return "", false, errors.New("Workbench control request is required")
	}
	for name := range r.Header {
		if strings.HasPrefix(strings.ToLower(name), "x-forwarded-") || strings.EqualFold(name, "Forwarded") {
			return "", false, errors.New("forwarded Workbench control requests are not allowed")
		}
	}
	remoteHost, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		return "", false, errors.New("Workbench control requires a loopback socket peer")
	}
	remote, err := netip.ParseAddr(strings.Trim(remoteHost, "[]"))
	if err != nil || !remote.Unmap().IsLoopback() {
		return "", false, errors.New("Workbench control requires a loopback socket peer")
	}
	host, port, err := net.SplitHostPort(strings.TrimSpace(r.Host))
	if err != nil || port != h.workbenchControlPort {
		return "", false, errors.New("Workbench control Host does not match the OpenDesk listener")
	}
	address, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err != nil || !address.Unmap().IsLoopback() {
		return "", false, errors.New("Workbench control Host must be a loopback IP address")
	}

	originHeader := strings.TrimSpace(r.Header.Get("Origin"))
	if originHeader == "" {
		return "", false, errors.New("Workbench control requires a loopback page Origin")
	}

	origin, err := parseAccessibilityWorkbenchControlOrigin(originHeader)
	if err != nil {
		return "", false, err
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", stdhttp.MethodPost+", "+stdhttp.MethodOptions)
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, "+accessibilityWorkbenchControlMark)
	w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	w.Header().Add("Vary", "Origin")
	if r.Method == stdhttp.MethodOptions {
		if strings.TrimSpace(r.Header.Get("Access-Control-Request-Method")) != stdhttp.MethodPost {
			return "", false, errors.New("Workbench control CORS preflight method is not allowed")
		}
		allowedHeaders := map[string]bool{
			"content-type": true, strings.ToLower(accessibilityWorkbenchControlMark): true,
		}
		for _, name := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
			name = strings.ToLower(strings.TrimSpace(name))
			if name != "" && !allowedHeaders[name] {
				return "", false, errors.New("Workbench control CORS preflight header is not allowed")
			}
		}
		return origin, true, nil
	}
	if r.Header.Get(accessibilityWorkbenchControlMark) != "1" {
		return "", false, errors.New("explicit OpenDesk control marker is required")
	}
	return origin, false, nil
}
