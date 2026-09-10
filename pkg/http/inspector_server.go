package http

import (
	"errors"
	"net"
	stdhttp "net/http"
	"strings"
	"time"

	"opendesk/pkg/inspector"
)

// newAccessibilityWorkbenchServer creates the Inspector-only HTTP API
// server. Its mux intentionally has no script, status, scheduler, vision,
// event, or file routes, and its socket is always bound to IPv4 loopback.
func newAccessibilityWorkbenchServer(port, artifactRoot string) *Server {
	port = strings.TrimSpace(port)
	if port == "" {
		port = "0"
	}
	host := net.JoinHostPort("127.0.0.1", port)
	handler := &Handler{
		inspector:     newInspectorService(inspector.NewRuntimeRunner(), artifactRoot),
		inspectorHost: host,
	}
	return &Server{
		server: &stdhttp.Server{
			Addr:              host,
			Handler:           setupInspectorRoutes(handler),
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       15 * time.Second,
			WriteTimeout:      20 * time.Second,
			IdleTimeout:       30 * time.Second,
		},
		handler: handler,
	}
}

// accessibilityWorkbenchPairingURL creates an internal one-time pairing URL.
// The controller transfers its fragment to the independent frontend URL.
func (s *Server) accessibilityWorkbenchPairingURL(listener net.Listener) (string, error) {
	if s == nil || s.handler == nil || s.handler.inspector == nil {
		return "", errors.New("accessibility workbench is not enabled")
	}
	if listener == nil {
		return "", errors.New("accessibility workbench listener is required")
	}
	authority := listener.Addr().String()
	if !s.handler.inspectorHostAllowed(authority) {
		return "", errors.New("accessibility workbench listener does not match its Host policy")
	}
	return s.handler.inspector.pairingURL(authority)
}
