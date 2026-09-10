package http

import (
	_ "embed"
	"net/http"
)

//go:embed inspector_ui/index.html
var inspectorHTML []byte

//go:embed inspector_ui/app.css
var inspectorCSS []byte

//go:embed inspector_ui/model.js
var inspectorModelJS []byte

//go:embed inspector_ui/app.js
var inspectorAppJS []byte

func (h *Handler) HandleInspectorPage(w http.ResponseWriter, r *http.Request) {
	if !h.inspectorEnabled() {
		h.sendError(w, http.StatusNotFound, "accessibility workbench is not enabled")
		return
	}
	if r.URL.Path != "/accessibility-workbench" && r.URL.Path != "/accessibility-workbench/" {
		h.sendError(w, http.StatusNotFound, "not found")
		return
	}
	if r.Method != http.MethodGet {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !isLoopbackRequest(r) || !schedulerHostAllowed(r.Host) {
		h.sendError(w, http.StatusForbidden, "accessibility workbench is available only on loopback")
		return
	}
	setInspectorPageHeaders(w)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(inspectorHTML)
}

func (h *Handler) HandleInspectorAsset(w http.ResponseWriter, r *http.Request) {
	if !h.inspectorEnabled() {
		h.sendError(w, http.StatusNotFound, "accessibility workbench is not enabled")
		return
	}
	if r.Method != http.MethodGet {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !isLoopbackRequest(r) || !schedulerHostAllowed(r.Host) {
		h.sendError(w, http.StatusForbidden, "accessibility workbench is available only on loopback")
		return
	}
	setInspectorPageHeaders(w)
	switch r.URL.Path {
	case "/accessibility-workbench/assets/app.css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		_, _ = w.Write(inspectorCSS)
	case "/accessibility-workbench/assets/model.js":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		_, _ = w.Write(inspectorModelJS)
	case "/accessibility-workbench/assets/app.js":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		_, _ = w.Write(inspectorAppJS)
	default:
		h.sendError(w, http.StatusNotFound, "asset not found")
	}
}

func setInspectorPageHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
}
