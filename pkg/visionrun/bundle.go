package visionrun

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const schemaVersion = "0.1.0"

var invalidRunIDChars = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

type InitOptions struct {
	RepoRoot       string
	RunID          string
	Goal           string
	TargetApp      string
	TargetChatName string
	WindowHint     string
	CaptureMode    string
	OCRProvider    string
	LayoutEngine   string
	Source         string
	PreflightPath  string
}

type Bundle struct {
	RunID              string
	BaseDir            string
	Requirement        string
	Preflight          string
	RuntimePreflight   string
	CaptureDir         string
	DetectDir          string
	InferDir           string
	VerifyDir          string
	CheckpointsDir     string
	ReplayDir          string
	EvidenceDir        string
	EvidenceActionsDir string
	EvidenceAnchorsDir string
	EvidenceOCRDir     string
	MirrorDir          string
	CompareDir         string
	RealAppDir         string
	AuditLog           string
	Decision           string
	RunReport          string
	PreflightState     string
}

type preflightReport struct {
	Status string `json:"status"`
}

func InitBundle(opts InitOptions) (*Bundle, error) {
	repoRoot, err := resolveRepoRoot(opts.RepoRoot)
	if err != nil {
		return nil, err
	}

	runID := sanitizeRunID(opts.RunID)
	if runID == "" {
		runID = generateRunID()
	}

	baseDir := filepath.Join(repoRoot, ".runtime", "runs", runID)
	bundle := &Bundle{
		RunID:              runID,
		BaseDir:            baseDir,
		Requirement:        filepath.Join(baseDir, "requirement.json"),
		Preflight:          filepath.Join(baseDir, "preflight.json"),
		RuntimePreflight:   filepath.Join(baseDir, "preflight_runtime.json"),
		CaptureDir:         filepath.Join(baseDir, "capture"),
		DetectDir:          filepath.Join(baseDir, "detect"),
		InferDir:           filepath.Join(baseDir, "infer"),
		VerifyDir:          filepath.Join(baseDir, "verify"),
		CheckpointsDir:     filepath.Join(baseDir, "checkpoints"),
		ReplayDir:          filepath.Join(baseDir, "replay"),
		EvidenceDir:        filepath.Join(baseDir, "evidence"),
		EvidenceActionsDir: filepath.Join(baseDir, "evidence", "actions"),
		EvidenceAnchorsDir: filepath.Join(baseDir, "evidence", "anchors"),
		EvidenceOCRDir:     filepath.Join(baseDir, "evidence", "ocr"),
		MirrorDir:          filepath.Join(baseDir, "mirror"),
		CompareDir:         filepath.Join(baseDir, "compare"),
		RealAppDir:         filepath.Join(baseDir, "realapp"),
		AuditLog:           filepath.Join(baseDir, "audit.ndjson"),
		Decision:           filepath.Join(baseDir, "decision.json"),
		RunReport:          filepath.Join(baseDir, "run_report.json"),
	}

	for _, dir := range []string{
		baseDir,
		bundle.CaptureDir,
		bundle.DetectDir,
		bundle.InferDir,
		bundle.VerifyDir,
		bundle.CheckpointsDir,
		bundle.ReplayDir,
		bundle.EvidenceDir,
		bundle.EvidenceActionsDir,
		bundle.EvidenceAnchorsDir,
		bundle.EvidenceOCRDir,
		bundle.MirrorDir,
		bundle.CompareDir,
		bundle.RealAppDir,
	} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("create bundle dir %s: %w", dir, err)
		}
	}

	preflightPath := opts.PreflightPath
	if strings.TrimSpace(preflightPath) == "" {
		preflightPath = filepath.Join(repoRoot, ".runtime", "preflight", "current", "latest.json")
	}
	preflightStatus, err := copyPreflight(preflightPath, bundle.Preflight)
	if err != nil {
		return nil, err
	}
	bundle.PreflightState = preflightStatus

	if err := writeJSON(bundle.Requirement, buildRequirement(runID, opts)); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":        time.Now().Format(time.RFC3339),
		"stage":     "bundle.init",
		"status":    "pass",
		"runId":     runID,
		"detail":    "initialized run artifact bundle",
		"preflight": preflightStatus,
	}); err != nil {
		return nil, err
	}
	if err := writeJSON(bundle.Decision, buildDecision(runID, preflightStatus)); err != nil {
		return nil, err
	}
	if err := writeJSON(bundle.RunReport, buildRunReport(runID, preflightStatus)); err != nil {
		return nil, err
	}

	return bundle, nil
}

func buildRequirement(runID string, opts InitOptions) map[string]any {
	goal := strings.TrimSpace(opts.Goal)
	if goal == "" {
		goal = "structure-first -> app/page inference -> semantic zones -> action targets -> OCR assist -> send/reply"
	}

	targetApp := strings.TrimSpace(opts.TargetApp)
	if targetApp == "" {
		targetApp = "WeChat Desktop"
	}

	windowHint := strings.TrimSpace(opts.WindowHint)
	if windowHint == "" {
		windowHint = "微信 / WeChat"
	}

	targetChatName := strings.TrimSpace(opts.TargetChatName)

	captureMode := strings.TrimSpace(opts.CaptureMode)
	if captureMode == "" {
		captureMode = "single-window screenshot"
	}

	ocrProvider := strings.TrimSpace(opts.OCRProvider)
	if ocrProvider == "" {
		ocrProvider = "paddle|local"
	}

	layoutEngine := strings.TrimSpace(opts.LayoutEngine)
	if layoutEngine == "" {
		layoutEngine = "automation/image_layout.go"
	}

	source := strings.TrimSpace(opts.Source)
	if source == "" {
		source = "visionrun-init"
	}

	return map[string]any{
		"schemaVersion":  schemaVersion,
		"createdAt":      time.Now().Format(time.RFC3339),
		"runId":          runID,
		"goal":           goal,
		"targetApp":      targetApp,
		"targetChatName": targetChatName,
		"windowHint":     windowHint,
		"captureMode":    captureMode,
		"ocrProvider":    ocrProvider,
		"layoutEngine":   layoutEngine,
		"source":         source,
	}
}

func buildDecision(runID, preflightStatus string) map[string]any {
	status := "pending"
	summary := "run bundle initialized; ready for capture"
	canProceed := preflightStatus == "pass" || preflightStatus == "warn"
	stopCondition := ""
	if !canProceed {
		status = "blocked"
		summary = "preflight failed; stop before capture/detect"
		stopCondition = "preflight fail"
	}

	return map[string]any{
		"schemaVersion":  schemaVersion,
		"createdAt":      time.Now().Format(time.RFC3339),
		"runId":          runID,
		"status":         status,
		"canProceed":     canProceed,
		"nextStep":       "capture",
		"summary":        summary,
		"preflightState": preflightStatus,
		"stopCondition":  stopCondition,
	}
}

func copyPreflight(srcPath, dstPath string) (string, error) {
	srcAbs, err := filepath.Abs(srcPath)
	if err != nil {
		return "", fmt.Errorf("resolve preflight path: %w", err)
	}
	data, err := os.ReadFile(srcAbs)
	if err != nil {
		return "", fmt.Errorf("read preflight report %s: %w", srcAbs, err)
	}

	var report preflightReport
	if err := json.Unmarshal(data, &report); err != nil {
		return "", fmt.Errorf("decode preflight report %s: %w", srcAbs, err)
	}
	if strings.TrimSpace(report.Status) == "" {
		return "", fmt.Errorf("preflight report %s missing status", srcAbs)
	}
	if err := os.WriteFile(dstPath, data, 0644); err != nil {
		return "", fmt.Errorf("write copied preflight report %s: %w", dstPath, err)
	}
	return report.Status, nil
}

func appendAuditEvent(path string, event map[string]any) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("open audit log %s: %w", path, err)
	}
	defer file.Close()

	writer := bufio.NewWriter(file)
	defer writer.Flush()

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal audit event: %w", err)
	}
	if _, err := writer.Write(payload); err != nil {
		return fmt.Errorf("write audit event: %w", err)
	}
	if err := writer.WriteByte('\n'); err != nil {
		return fmt.Errorf("terminate audit event: %w", err)
	}
	return nil
}

func writeJSON(path string, payload any) error {
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", path, err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

func resolveRepoRoot(root string) (string, error) {
	if strings.TrimSpace(root) == "" {
		root = "."
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve repo root: %w", err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("stat repo root %s: %w", abs, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("repo root is not a directory: %s", abs)
	}
	return abs, nil
}

func generateRunID() string {
	return "run-" + time.Now().Format("20060102-150405")
}

func sanitizeRunID(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}
	sanitized := invalidRunIDChars.ReplaceAllString(trimmed, "-")
	sanitized = strings.Trim(sanitized, "-.")
	for strings.Contains(sanitized, "--") {
		sanitized = strings.ReplaceAll(sanitized, "--", "-")
	}
	return sanitized
}
