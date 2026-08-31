package http

import (
	"clawdesk/pkg/container"
	pkgExecution "clawdesk/pkg/execution"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// Handler 负责处理 HTTP 请求。
type Handler struct {
	container *container.Container
	manager   *pkgExecution.Manager
}

// NewHandler 创建 HTTP 处理器。
func NewHandler(c *container.Container) *Handler {
	return &Handler{container: c, manager: pkgExecution.NewManager()}
}

// ScriptRequest 描述脚本执行请求。
type ScriptRequest struct {
	Script       string `json:"script"`
	Timeout      int    `json:"timeout,omitempty"`
	Stack        string `json:"stack,omitempty"`
	ConsoleMode  string `json:"consoleMode,omitempty"`
	OutputFormat string `json:"outputFormat,omitempty"`
	LogDir       string `json:"logDir,omitempty"`
}

// ScriptResponse 描述统一响应结构。
type ScriptResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// HandleScriptExecution 处理旧版脚本执行接口。
func (h *Handler) HandleScriptExecution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req ScriptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.sendError(w, http.StatusBadRequest, fmt.Sprintf("invalid request: %v", err))
		return
	}

	data, err := h.startExecution(req)
	if err != nil {
		h.sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ScriptResponse{
		Code:    0,
		Message: "script execution started successfully",
		Data:    data,
	})
}

// HandleExecutions 处理新的 execution 创建接口。
func (h *Handler) HandleExecutions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req ScriptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.sendError(w, http.StatusBadRequest, fmt.Sprintf("invalid request: %v", err))
		return
	}

	data, err := h.startExecution(req)
	if err != nil {
		h.sendError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.sendSuccess(w, data)
}

// HandleExecutionRoutes 分发 /executions/{id} 相关请求。
func (h *Handler) HandleExecutionRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/executions/")
	path = strings.Trim(path, "/")
	if path == "" {
		h.sendError(w, http.StatusNotFound, "execution id is required")
		return
	}

	if strings.HasSuffix(path, "/summary") {
		h.handleExecutionSummary(w, r, strings.TrimSuffix(path, "/summary"))
		return
	}
	if strings.HasSuffix(path, "/events") {
		h.handleExecutionEvents(w, r, strings.TrimSuffix(path, "/events"))
		return
	}
	if r.Method == http.MethodDelete {
		h.handleExecutionCancel(w, r, path)
		return
	}
	h.handleExecutionStatus(w, r, path)
}

// HandleStatus 返回服务健康状态和最近一次执行快照。
func (h *Handler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	status := map[string]interface{}{
		"status":             "ok",
		"execution_capacity": h.container.ExecutionCapacity(),
		"vision_enabled":     h.container.Vision() != nil,
		"timestamp":          time.Now().Unix(),
	}
	if latest, ok := h.manager.Latest(); ok {
		status["latestExecution"] = h.currentResult(latest)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// HandleVisionOCR 处理 OCR 请求。
func (h *Handler) HandleVisionOCR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		h.sendError(w, http.StatusBadRequest, fmt.Sprintf("failed to parse form: %v", err))
		return
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		h.sendError(w, http.StatusBadRequest, "image file is required")
		return
	}
	defer file.Close()

	imageData := make([]byte, 0)
	buf := make([]byte, 4096)
	for {
		n, err := file.Read(buf)
		if n > 0 {
			imageData = append(imageData, buf[:n]...)
		}
		if err != nil {
			break
		}
	}

	provider := r.FormValue("provider")
	if provider == "" {
		provider = "paddle"
	}

	lang := r.FormValue("lang")
	if lang == "" {
		lang = "ch"
	}

	opts := map[string]interface{}{
		"image":    imageData,
		"provider": provider,
		"lang":     lang,
	}

	result, err := h.container.Vision().RunOCR(opts)
	if err != nil {
		h.sendError(w, http.StatusInternalServerError, fmt.Sprintf("OCR failed: %v", err))
		return
	}

	h.sendSuccess(w, result)
}

// HandleVisionDetectUI 处理 UI 检测请求。
func (h *Handler) HandleVisionDetectUI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		h.sendError(w, http.StatusBadRequest, fmt.Sprintf("failed to parse form: %v", err))
		return
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		h.sendError(w, http.StatusBadRequest, "image file is required")
		return
	}
	defer file.Close()

	imageData := make([]byte, 0)
	buf := make([]byte, 4096)
	for {
		n, err := file.Read(buf)
		if n > 0 {
			imageData = append(imageData, buf[:n]...)
		}
		if err != nil {
			break
		}
	}

	targetText := r.FormValue("target_text")
	if targetText == "" {
		h.sendError(w, http.StatusBadRequest, "target_text is required")
		return
	}

	opts := map[string]interface{}{
		"image":       imageData,
		"target_text": targetText,
	}

	result, err := h.container.Vision().DetectUI(opts)
	if err != nil {
		h.sendError(w, http.StatusInternalServerError, fmt.Sprintf("UI detection failed: %v", err))
		return
	}

	h.sendSuccess(w, result)
}

// sendSuccess 返回成功响应。
func (h *Handler) sendSuccess(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ScriptResponse{
		Code:    0,
		Message: "success",
		Data:    data,
	})
}

// sendError 返回错误响应。
func (h *Handler) sendError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ScriptResponse{
		Code:    statusCode,
		Message: message,
	})
}

// SetupRoutes 注册 HTTP 路由。
func SetupRoutes(container *container.Container) *http.ServeMux {
	mux := http.NewServeMux()
	handler := NewHandler(container)

	mux.HandleFunc("/SCRIPT_RUN", handler.HandleScriptExecution)
	mux.HandleFunc("/status", handler.HandleStatus)
	mux.HandleFunc("/executions", handler.HandleExecutions)
	mux.HandleFunc("/executions/", handler.HandleExecutionRoutes)
	mux.HandleFunc("/vision/ocr", handler.HandleVisionOCR)
	mux.HandleFunc("/vision/detect-ui", handler.HandleVisionDetectUI)

	return mux
}

// Server 封装 HTTP 服务。
type Server struct {
	server    *http.Server
	container *container.Container
}

// NewServer 创建 HTTP 服务。
func NewServer(container *container.Container, port string) *Server {
	mux := SetupRoutes(container)

	return &Server{
		server: &http.Server{
			Addr:         ":" + port,
			Handler:      mux,
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 0,
		},
		container: container,
	}
}

// Start 启动 HTTP 服务。
func (s *Server) Start() error {
	fmt.Printf("Starting HTTP server on %s\n", s.server.Addr)
	return s.server.ListenAndServe()
}

// Shutdown 优雅关闭 HTTP 服务。
func (s *Server) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

func (h *Handler) startExecution(req ScriptRequest) (map[string]any, error) {
	script := strings.TrimSpace(req.Script)
	if script == "" {
		return nil, fmt.Errorf("script is required")
	}

	executionID := pkgExecution.NewExecutionID("http")
	artifacts, err := pkgExecution.PrepareArtifacts(req.LogDir, executionID, ".js")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(artifacts.ScriptSnapshotPath, []byte(script), 0o644); err != nil {
		return nil, fmt.Errorf("write script snapshot: %w", err)
	}

	selection := pkgExecution.TerminalSelection{
		Mode:       "agent",
		Categories: map[string]bool{"error": true},
	}
	emitter, err := pkgExecution.NewEmitter(executionID, selection, artifacts, time.Now())
	if err != nil {
		return nil, err
	}
	h.manager.Register(executionID, emitter)
	executionContext, cancel := context.WithCancel(context.Background())
	if !h.manager.SetCancel(executionID, cancel) {
		cancel()
		_ = emitter.Close()
		return nil, fmt.Errorf("register execution cancellation")
	}
	emitter.SetStatus(pkgExecution.ExecutionStatusRunning)
	h.manager.UpdateResult(emitter.Result())

	request := pkgExecution.Request{
		Context:       executionContext,
		ExecutionID:   executionID,
		SourceLabel:   "http:inline",
		Ext:           ".js",
		StackMode:     req.Stack,
		ScriptHash:    pkgExecution.ComputeScriptHash([]byte(script)),
		ScriptContent: []byte(script),
		Timeout:       time.Duration(req.Timeout) * time.Second,
		Artifacts:     artifacts,
		Selection:     selection,
	}

	go func() {
		defer cancel()
		defer emitter.Close()
		result, summary, _ := pkgExecution.RunWithEmitter(request, emitter)
		h.manager.Complete(result, summary)
	}()

	return map[string]any{
		"executionId": executionID,
		"status":      string(pkgExecution.ExecutionStatusRunning),
		"statusUrl":   "/executions/" + executionID,
		"summaryUrl":  "/executions/" + executionID + "/summary",
		"streamUrl":   "/executions/" + executionID + "/events",
		"cancelUrl":   "/executions/" + executionID,
		"artifacts":   artifacts,
	}, nil
}

func (h *Handler) handleExecutionCancel(w http.ResponseWriter, r *http.Request, executionID string) {
	if r.Method != http.MethodDelete {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if h.manager.Cancel(executionID) {
		h.sendSuccess(w, map[string]any{"executionId": executionID, "status": "canceling"})
		return
	}
	record, exists := h.manager.Get(executionID)
	if !exists {
		h.sendError(w, http.StatusNotFound, "execution not found")
		return
	}
	h.sendSuccess(w, h.currentResult(record))
}

func (h *Handler) handleExecutionStatus(w http.ResponseWriter, r *http.Request, executionID string) {
	if r.Method != http.MethodGet {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	record, ok := h.manager.Get(executionID)
	if !ok {
		h.sendError(w, http.StatusNotFound, "execution not found")
		return
	}
	h.sendSuccess(w, h.currentResult(record))
}

func (h *Handler) handleExecutionSummary(w http.ResponseWriter, r *http.Request, executionID string) {
	if r.Method != http.MethodGet {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	record, ok := h.manager.Get(executionID)
	if !ok {
		h.sendError(w, http.StatusNotFound, "execution not found")
		return
	}
	summary := record.Summary
	if record.Emitter != nil && summary.ExecutionID == "" {
		summary = record.Emitter.Summary()
	}
	h.sendSuccess(w, summary)
}

func (h *Handler) handleExecutionEvents(w http.ResponseWriter, r *http.Request, executionID string) {
	if r.Method != http.MethodGet {
		h.sendError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	record, ok := h.manager.Get(executionID)
	if !ok {
		h.sendError(w, http.StatusNotFound, "execution not found")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		h.sendError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	allowedCategories := parseSSECategories(r)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	current := h.currentResult(record)
	_ = writeSSE(w, "status", current)
	flusher.Flush()

	if current.Status != pkgExecution.ExecutionStatusPending && current.Status != pkgExecution.ExecutionStatusRunning {
		summary := record.Summary
		if summary.ExecutionID == "" && record.Emitter != nil {
			summary = record.Emitter.Summary()
		}
		_ = writeSSE(w, "done", summary)
		flusher.Flush()
		return
	}
	if record.Emitter == nil {
		return
	}

	subID, ch := record.Emitter.Subscribe(64)
	defer record.Emitter.Unsubscribe(subID)

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-ch:
			if !ok {
				return
			}
			if !shouldStreamSSEEvent(event, allowedCategories) {
				continue
			}
			eventType := "log"
			if event.Kind == "done" {
				eventType = "done"
			} else if event.Kind == "status" {
				eventType = "status"
			} else if event.Kind == "summary" {
				eventType = "summary"
			}
			if err := writeSSE(w, eventType, event); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (h *Handler) currentResult(record *pkgExecution.Record) pkgExecution.ExecutionResult {
	if record == nil {
		return pkgExecution.ExecutionResult{}
	}
	if record.Emitter != nil {
		result := record.Emitter.Result()
		if result.ExecutionID != "" {
			return result
		}
	}
	return record.Result
}

func writeSSE(w http.ResponseWriter, event string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\n", event); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", string(data)); err != nil {
		return err
	}
	return nil
}

func parseSSECategories(r *http.Request) map[string]bool {
	raw := strings.TrimSpace(r.URL.Query().Get("categories"))
	if raw == "" {
		return map[string]bool{
			"meta":    true,
			"script":  true,
			"summary": true,
			"error":   true,
		}
	}
	allowed := map[string]bool{}
	for _, item := range strings.Split(raw, ",") {
		key := strings.ToLower(strings.TrimSpace(item))
		if key == "" {
			continue
		}
		allowed[key] = true
	}
	return allowed
}

func shouldStreamSSEEvent(event pkgExecution.RunEvent, allowed map[string]bool) bool {
	if event.Kind == "done" || event.Kind == "status" || event.Kind == "summary" {
		return true
	}
	return allowed[string(event.Category)]
}
