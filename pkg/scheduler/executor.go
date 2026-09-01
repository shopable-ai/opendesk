package scheduler

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	pkgExecution "opendesk/pkg/execution"
)

type Executor interface {
	Execute(context.Context, Job) (pkgExecution.ExecutionResult, error)
}

type ScriptExecutor struct {
	scriptRoot   string
	artifactRoot string
	timeout      time.Duration
}

func NewScriptExecutor(scriptRoot string, timeout time.Duration) (*ScriptExecutor, error) {
	return NewScriptExecutorWithArtifacts(scriptRoot, "", timeout)
}

func NewScriptExecutorWithArtifacts(scriptRoot, artifactRoot string, timeout time.Duration) (*ScriptExecutor, error) {
	root, err := canonicalRoot(scriptRoot)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(artifactRoot) != "" {
		artifactRoot, err = filepath.Abs(artifactRoot)
		if err != nil {
			return nil, fmt.Errorf("resolve Scheduler artifact root: %w", err)
		}
	}
	if timeout <= 0 {
		timeout = 30 * time.Minute
	}
	return &ScriptExecutor{scriptRoot: root, artifactRoot: artifactRoot, timeout: timeout}, nil
}

func (e *ScriptExecutor) Execute(ctx context.Context, job Job) (pkgExecution.ExecutionResult, error) {
	sourceType := job.SourceType
	if sourceType == "" {
		sourceType = SourceFile
	}
	var content []byte
	var sourceLabel string
	switch sourceType {
	case SourceFile:
		path, _, err := resolveScriptPath(e.scriptRoot, job.ScriptPath)
		if err != nil {
			return pkgExecution.ExecutionResult{}, err
		}
		content, err = os.ReadFile(path)
		if err != nil {
			return pkgExecution.ExecutionResult{}, fmt.Errorf("read scheduled script: %w", err)
		}
		sourceLabel = "scheduler:file:" + job.ScriptPath
	case SourceInline:
		if strings.TrimSpace(job.InlineScript) == "" {
			return pkgExecution.ExecutionResult{}, fmt.Errorf("scheduled inline script is unavailable")
		}
		if len([]byte(job.InlineScript)) > MaxInlineScriptBytes {
			return pkgExecution.ExecutionResult{}, fmt.Errorf("scheduled inline script exceeds the size limit")
		}
		content = []byte(job.InlineScript)
		sourceLabel = "scheduler:inline:" + job.ID
	default:
		return pkgExecution.ExecutionResult{}, fmt.Errorf("unsupported scheduled source type %q", sourceType)
	}
	executionID := pkgExecution.NewExecutionID("scheduler")
	logDir := ""
	if e.artifactRoot != "" {
		logDir = filepath.Join(e.artifactRoot, executionID)
	}
	artifacts, err := pkgExecution.PrepareArtifacts(logDir, executionID, ".js")
	if err != nil {
		return pkgExecution.ExecutionResult{ExecutionID: executionID}, err
	}
	if err := os.WriteFile(artifacts.ScriptSnapshotPath, content, 0o644); err != nil {
		return pkgExecution.ExecutionResult{ExecutionID: executionID, Artifacts: artifacts}, fmt.Errorf("write scheduled script snapshot: %w", err)
	}
	selection := pkgExecution.TerminalSelection{
		Mode:       "agent",
		Categories: map[string]bool{"error": true},
	}
	request := pkgExecution.Request{
		Context:       ctx,
		ExecutionID:   executionID,
		SourceLabel:   sourceLabel,
		Ext:           ".js",
		StackMode:     "legacy",
		ScriptHash:    pkgExecution.ComputeScriptHash(content),
		ScriptContent: content,
		Timeout:       e.timeout,
		Artifacts:     artifacts,
		Selection:     selection,
	}
	result, _, execErr := pkgExecution.Run(request)
	return result, execErr
}

func NormalizeScriptPath(root, requested string) (string, error) {
	_, relative, err := resolveScriptPath(root, requested)
	return relative, err
}

func resolveScriptPath(root, requested string) (string, string, error) {
	canonical, err := canonicalRoot(root)
	if err != nil {
		return "", "", err
	}
	requested = strings.TrimSpace(requested)
	if requested == "" {
		return "", "", fmt.Errorf("script path is required")
	}
	candidate := requested
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(canonical, candidate)
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return "", "", fmt.Errorf("resolve script path: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absCandidate)
	if err != nil {
		return "", "", fmt.Errorf("resolve scheduled script %q: %w", requested, err)
	}
	relative, err := filepath.Rel(canonical, resolved)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", "", fmt.Errorf("script path must stay within %s", canonical)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", "", fmt.Errorf("stat scheduled script: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", "", fmt.Errorf("script path must reference a regular file")
	}
	if !strings.EqualFold(filepath.Ext(resolved), ".js") {
		return "", "", fmt.Errorf("scheduler only supports .js scripts")
	}
	return resolved, filepath.ToSlash(relative), nil
}

func canonicalRoot(root string) (string, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		var err error
		root, err = os.Getwd()
		if err != nil {
			return "", fmt.Errorf("locate script root: %w", err)
		}
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve script root: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absRoot)
	if err != nil {
		return "", fmt.Errorf("resolve script root: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("script root must be a directory")
	}
	return resolved, nil
}
