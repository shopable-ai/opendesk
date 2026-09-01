package http

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	stdhttp "net/http"
	"net/url"
	"strconv"
	"strings"

	pkgScheduler "opendesk/pkg/scheduler"
)

//go:embed scheduler_ui.html
var schedulerUI []byte

const schedulerRequestBodyLimit = 2 << 20

func (h *Handler) HandleSchedulerPage(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if r.URL.Path != "/scheduler" && r.URL.Path != "/scheduler/" {
		h.sendError(w, stdhttp.StatusNotFound, "not found")
		return
	}
	if r.Method != stdhttp.MethodGet {
		h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(schedulerUI)
}

func (h *Handler) HandleSchedulerJobs(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	switch r.Method {
	case stdhttp.MethodGet:
		jobs, err := h.scheduler.ListJobs(r.Context())
		if err != nil {
			h.sendError(w, stdhttp.StatusInternalServerError, err.Error())
			return
		}
		h.sendSuccess(w, jobs)
	case stdhttp.MethodPost:
		var input pkgScheduler.CreateJobInput
		if err := decodeSchedulerJSON(r, &input); err != nil {
			h.sendError(w, stdhttp.StatusBadRequest, err.Error())
			return
		}
		job, err := h.scheduler.CreateJob(r.Context(), input)
		if err != nil {
			h.sendError(w, schedulerErrorStatus(err), err.Error())
			return
		}
		h.sendSuccess(w, job)
	default:
		h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleSchedulerJobRoutes(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/scheduler/jobs/"), "/")
	parts := strings.Split(path, "/")
	if path == "" || len(parts) > 2 || strings.TrimSpace(parts[0]) == "" {
		h.sendError(w, stdhttp.StatusNotFound, "scheduled job not found")
		return
	}
	jobID := parts[0]
	if len(parts) == 1 {
		if r.Method != stdhttp.MethodDelete {
			h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if err := h.scheduler.Delete(r.Context(), jobID); err != nil {
			h.sendError(w, schedulerErrorStatus(err), err.Error())
			return
		}
		h.sendSuccess(w, map[string]any{"id": jobID, "deleted": true})
		return
	}

	switch parts[1] {
	case "pause":
		h.handleSchedulerMutation(w, r, func() (any, error) {
			return h.scheduler.Pause(r.Context(), jobID)
		})
	case "resume":
		h.handleSchedulerMutation(w, r, func() (any, error) {
			return h.scheduler.Resume(r.Context(), jobID)
		})
	case "run":
		h.handleSchedulerMutation(w, r, func() (any, error) {
			return h.scheduler.RunNow(r.Context(), jobID)
		})
	case "runs":
		if r.Method != stdhttp.MethodGet {
			h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
			return
		}
		limit := 50
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil || parsed < 1 || parsed > 100 {
				h.sendError(w, stdhttp.StatusBadRequest, "limit must be between 1 and 100")
				return
			}
			limit = parsed
		}
		runs, err := h.scheduler.ListRuns(r.Context(), jobID, limit)
		if err != nil {
			h.sendError(w, schedulerErrorStatus(err), err.Error())
			return
		}
		h.sendSuccess(w, runs)
	default:
		h.sendError(w, stdhttp.StatusNotFound, "scheduler action not found")
	}
}

func (h *Handler) handleSchedulerMutation(w stdhttp.ResponseWriter, r *stdhttp.Request, mutate func() (any, error)) {
	if r.Method != stdhttp.MethodPost {
		h.sendError(w, stdhttp.StatusMethodNotAllowed, "method not allowed")
		return
	}
	value, err := mutate()
	if err != nil {
		h.sendError(w, schedulerErrorStatus(err), err.Error())
		return
	}
	h.sendSuccess(w, value)
}

func (h *Handler) schedulerLocalOnly(next stdhttp.HandlerFunc) stdhttp.HandlerFunc {
	return func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if !isLoopbackRequest(r) || !schedulerHostAllowed(r.Host) {
			h.sendError(w, stdhttp.StatusForbidden, "scheduler is available only from this computer via localhost")
			return
		}
		if err := validateSchedulerOrigin(r); err != nil {
			h.sendError(w, stdhttp.StatusForbidden, err.Error())
			return
		}
		next(w, r)
	}
}

func schedulerHostAllowed(value string) bool {
	host := strings.TrimSpace(value)
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		host = parsedHost
	}
	host = strings.Trim(host, "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func validateSchedulerOrigin(r *stdhttp.Request) error {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return nil
	}
	parsed, err := url.Parse(origin)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.Host == "" {
		return fmt.Errorf("invalid scheduler request origin")
	}
	if !strings.EqualFold(parsed.Host, r.Host) {
		return fmt.Errorf("cross-origin scheduler requests are not allowed")
	}
	return nil
}

func decodeSchedulerJSON(r *stdhttp.Request, destination any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, schedulerRequestBodyLimit+1))
	if err != nil {
		return fmt.Errorf("read request body: %w", err)
	}
	if len(body) > schedulerRequestBodyLimit {
		return fmt.Errorf("request body exceeds the %d-byte limit", schedulerRequestBodyLimit)
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("invalid request body: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("request body must contain one JSON object")
	}
	return nil
}

func schedulerErrorStatus(err error) int {
	if errors.Is(err, pkgScheduler.ErrNotFound) {
		return stdhttp.StatusNotFound
	}
	return stdhttp.StatusBadRequest
}
