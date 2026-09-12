package http

import (
	"context"
	stdhttp "net/http"
)

// AppInspectorRoutes mounts the existing read-only Inspector/Workbench surface
// onto an owner-provided App Mode loopback listener. It does not create a
// listener, expose general Runtime routes, or enable trusted-LAN control.
type AppInspectorRoutes struct {
	handler *Handler
}

// NewAppInspectorRoutes prepares Inspector routes for one App Mode local
// services endpoint. controlPort must be the already-bound listener port.
func NewAppInspectorRoutes(artifactRoot, frontendRoot, controlPort string) *AppInspectorRoutes {
	handler := NewHandler(nil)
	handler.inspector = newAccessibilityWorkbenchInspectorService(artifactRoot)
	handler.inspectorPolicy = newInspectorNetworkPolicy(controlPort)
	handler.workbench = newAccessibilityWorkbenchController(
		handler.inspector,
		handler.inspectorPolicy,
		frontendRoot,
		"",
	)
	handler.inspectorOnPaired = handler.workbench.onPaired
	handler.inspectorOnIdle = handler.workbench.onIdle
	return &AppInspectorRoutes{handler: handler}
}

// Register adds only the Workbench page/control and Inspector read-only API to
// mux. Scheduler authentication and every other App local route stay owned by
// the caller.
func (r *AppInspectorRoutes) Register(mux *stdhttp.ServeMux) {
	if r == nil || r.handler == nil || mux == nil {
		return
	}
	mux.HandleFunc(accessibilityWorkbenchPagePath, r.handler.handleAccessibilityWorkbenchPage)
	mux.HandleFunc(accessibilityWorkbenchPagePath+"/", r.handler.handleAccessibilityWorkbenchPage)
	mux.HandleFunc(accessibilityWorkbenchControlPath, r.handler.handleAccessibilityWorkbenchControl)
	mux.HandleFunc(inspectorAPIPrefix+"/", r.handler.HandleInspectorAPI)
}

// Shutdown invalidates any active pairing/session and releases Inspector-owned
// resources after the owner listener has stopped accepting requests.
func (r *AppInspectorRoutes) Shutdown(ctx context.Context) error {
	if r == nil || r.handler == nil {
		return nil
	}
	var workbenchErr error
	if r.handler.workbench != nil {
		workbenchErr = r.handler.workbench.shutdown(ctx)
	}
	if r.handler.inspector != nil {
		r.handler.inspector.close()
	}
	return workbenchErr
}
