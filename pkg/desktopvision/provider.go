package desktopvision

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	DefaultPromptVersion = "ui-parser-v1"
	DefaultExecTimeout   = 90 * time.Second
)

type ProviderOptions struct {
	Executable    string
	WorkingDir    string
	Provider      string
	DefaultModel  string
	PromptVersion string
	Timeout       time.Duration
}

type ParseOptions struct {
	ImagePath      string
	Model          string
	Provider       string
	PromptVersion  string
	TargetText     string
	TargetRole     string
	Purpose        string
	WorkingDir     string
	Timeout        time.Duration
	BasePerception Perception
}

type ParseResult struct {
	Perception Perception
	Model      ModelRef
	Command    []string
	RawMessage string
	Stdout     string
	Stderr     string
}

type CodexProvider struct {
	executable    string
	workingDir    string
	provider      string
	defaultModel  string
	promptVersion string
	timeout       time.Duration
}

type ExecError struct {
	Command  []string
	Model    ModelRef
	Stdout   string
	Stderr   string
	Message  string
	ExitCode int
	Cause    error
}

func (e *ExecError) Error() string {
	if e == nil {
		return ""
	}
	parts := []string{strings.TrimSpace(e.Message)}
	if e.Model.Provider != "" || e.Model.Model != "" {
		parts = append(parts, fmt.Sprintf("provider=%s model=%s", e.Model.Provider, e.Model.Model))
	}
	if e.ExitCode != 0 {
		parts = append(parts, fmt.Sprintf("exit=%d", e.ExitCode))
	}
	if e.Cause != nil {
		parts = append(parts, e.Cause.Error())
	}
	return strings.TrimSpace(strings.Join(parts, " "))
}

func (e *ExecError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func NewCodexProvider(opts ProviderOptions) *CodexProvider {
	return &CodexProvider{
		executable:    strings.TrimSpace(opts.Executable),
		workingDir:    strings.TrimSpace(opts.WorkingDir),
		provider:      strings.TrimSpace(opts.Provider),
		defaultModel:  strings.TrimSpace(opts.DefaultModel),
		promptVersion: firstNonEmpty(strings.TrimSpace(opts.PromptVersion), DefaultPromptVersion),
		timeout:       positiveDuration(opts.Timeout, DefaultExecTimeout),
	}
}

func (p *CodexProvider) Parse(ctx context.Context, opts ParseOptions) (*ParseResult, error) {
	if strings.TrimSpace(opts.ImagePath) == "" {
		return nil, fmt.Errorf("image path is required")
	}
	if err := validateBasePerception(opts.BasePerception); err != nil {
		return nil, err
	}

	executable := strings.TrimSpace(p.executable)
	if executable == "" {
		executable = "codex"
	}
	resolvedExecutable, err := exec.LookPath(executable)
	if err != nil {
		return nil, fmt.Errorf("resolve codex executable %q: %w", executable, err)
	}

	timeout := positiveDuration(opts.Timeout, p.timeout)
	if timeout <= 0 {
		timeout = DefaultExecTimeout
	}
	runCtx := ctx
	if runCtx == nil {
		runCtx = context.Background()
	}
	runCtx, cancel := context.WithTimeout(runCtx, timeout)
	defer cancel()

	tempDir, err := os.MkdirTemp("", "desktopvision-codex-*")
	if err != nil {
		return nil, fmt.Errorf("create provider temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	schemaPath := filepath.Join(tempDir, "schema.json")
	outputPath := filepath.Join(tempDir, "perception.json")
	if err := writeSchema(schemaPath); err != nil {
		return nil, err
	}

	model := firstNonEmpty(strings.TrimSpace(opts.Model), p.defaultModel)
	provider := firstNonEmpty(strings.TrimSpace(opts.Provider), p.provider)
	promptVersion := firstNonEmpty(strings.TrimSpace(opts.PromptVersion), p.promptVersion)
	command := buildCommandArgs(schemaPath, outputPath, opts.ImagePath, model, provider, promptVersion, opts.TargetText, opts.TargetRole, opts.Purpose, opts.BasePerception)

	cmd := exec.Command(resolvedExecutable, command...)
	cmd.Dir = firstNonEmpty(strings.TrimSpace(opts.WorkingDir), p.workingDir)
	configureProviderCommand(cmd)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := runProviderCommand(runCtx, cmd)
	modelRef := extractModelRef(stdout.String(), stderr.String())
	if modelRef.Provider == "" {
		modelRef.Provider = provider
	}
	if modelRef.Model == "" {
		modelRef.Model = model
	}
	if modelRef.PromptVersion == "" {
		modelRef.PromptVersion = promptVersion
	}

	result := &ParseResult{
		Model:   modelRef,
		Command: append([]string{resolvedExecutable}, command...),
		Stdout:  stdout.String(),
		Stderr:  stderr.String(),
	}

	if runErr != nil {
		if runCtx.Err() != nil {
			runErr = runCtx.Err()
		}
		return result, newExecError(result, runErr, "codex exec failed")
	}

	rawMessage, err := os.ReadFile(outputPath)
	if err != nil {
		return result, &ExecError{
			Command: result.Command,
			Model:   result.Model,
			Stdout:  result.Stdout,
			Stderr:  result.Stderr,
			Message: "read codex output",
			Cause:   err,
		}
	}
	result.RawMessage = strings.TrimSpace(string(rawMessage))
	if result.RawMessage == "" {
		return result, &ExecError{
			Command: result.Command,
			Model:   result.Model,
			Stdout:  result.Stdout,
			Stderr:  result.Stderr,
			Message: "codex output was empty",
		}
	}

	perception, err := parsePerception(result.RawMessage)
	if err != nil {
		return result, &ExecError{
			Command: result.Command,
			Model:   result.Model,
			Stdout:  result.Stdout,
			Stderr:  result.Stderr,
			Message: "decode perception",
			Cause:   err,
		}
	}
	result.Perception = perception
	if err := validateModelProvenance(opts.BasePerception, perception); err != nil {
		return result, &ExecError{
			Command: result.Command,
			Model:   result.Model,
			Stdout:  result.Stdout,
			Stderr:  result.Stderr,
			Message: "validate model screenshot provenance",
			Cause:   err,
		}
	}
	perception = mergePerception(opts.BasePerception, perception)
	perception, err = resolvePerceptionCoordinates(perception)
	if err != nil {
		return result, &ExecError{
			Command: result.Command,
			Model:   result.Model,
			Stdout:  result.Stdout,
			Stderr:  result.Stderr,
			Message: "resolve perception coordinates",
			Cause:   err,
		}
	}
	result.Perception = perception
	return result, nil
}

func runProviderCommand(ctx context.Context, cmd *exec.Cmd) error {
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		terminateProviderCommand(cmd)
		select {
		case <-done:
		case <-time.After(2 * time.Second):
		}
		return ctx.Err()
	}
}

func buildCommandArgs(schemaPath, outputPath, imagePath, model, provider, promptVersion, targetText, targetRole, purpose string, base Perception) []string {
	args := []string{
		"exec",
		"--skip-git-repo-check",
		"--ephemeral",
		"--ignore-user-config",
		"--sandbox", "read-only",
		"-c", `model_reasoning_effort="low"`,
		"--output-schema", schemaPath,
		"--output-last-message", outputPath,
		"--image", imagePath,
	}
	if provider != "" {
		args = append(args, "-c", fmt.Sprintf("model_provider=%q", provider))
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	args = append(args, buildPrompt(base, promptVersion, targetText, targetRole, purpose))
	return args
}

func validateModelProvenance(base, parsed Perception) error {
	if parsed.Image.Hash != base.Image.Hash {
		return fmt.Errorf("screenshot SHA mismatch: got %q, want %q", parsed.Image.Hash, base.Image.Hash)
	}
	if parsed.Image.Size != base.Image.Size {
		return fmt.Errorf("screenshot size mismatch: got %#v, want %#v", parsed.Image.Size, base.Image.Size)
	}
	if !parsed.Image.CapturedAt.Equal(base.Image.CapturedAt) {
		return fmt.Errorf("screenshot capture time mismatch: got %s, want %s", parsed.Image.CapturedAt.Format(time.RFC3339Nano), base.Image.CapturedAt.Format(time.RFC3339Nano))
	}
	if parsed.App != base.App {
		return fmt.Errorf("application identity mismatch: got %q, want %q", parsed.App, base.App)
	}
	if parsed.Window != base.Window {
		return fmt.Errorf("window identity mismatch: got %#v, want %#v", parsed.Window, base.Window)
	}
	if parsed.Display != base.Display {
		return fmt.Errorf("display identity mismatch: got %#v, want %#v", parsed.Display, base.Display)
	}
	return nil
}

func buildPrompt(base Perception, promptVersion, targetText, targetRole, purpose string) string {
	payload, _ := json.MarshalIndent(base, "", "  ")
	task, _ := json.Marshal(map[string]string{
		"text": strings.TrimSpace(targetText), "role": strings.TrimSpace(targetRole), "purpose": strings.TrimSpace(purpose),
	})
	return strings.TrimSpace(fmt.Sprintf(`You are analyzing a desktop application window screenshot.

Return JSON only, and it must satisfy the supplied schema exactly.

Requirements:
- Keep the top-level app/window/image/display metadata aligned with the provided base snapshot.
- Use the provided metadata values exactly unless the screenshot clearly contradicts the app or title.
- Return every visible element matching both the exact requested text and requested role, so the host can enforce uniqueness.
- Do not return unrelated elements. If nothing matches, return an empty elements array and explain the uncertainty.
- Each element must use normalized screenshot coordinates in bbox_norm: [left, top, right, bottom].
- Omit bbox_px, bbox_window, center_window, and center_screen; the host will derive them after validation.
- Set confidence to a number between 0 and 1.
- Set risk to one of: low, medium, high.
- Use uncertainties for anything visually ambiguous.

Prompt version: %s

Requested target:
%s

Base snapshot:
%s`, promptVersion, string(task), string(payload)))
}

func validateBasePerception(base Perception) error {
	if base.Image.Size.Width <= 0 || base.Image.Size.Height <= 0 {
		return fmt.Errorf("base perception image size must be positive")
	}
	if base.Window.BoundsScreen.Width() <= 0 || base.Window.BoundsScreen.Height() <= 0 {
		return fmt.Errorf("base perception window bounds must be positive")
	}
	return nil
}

func writeSchema(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create schema dir: %w", err)
	}
	raw, err := json.MarshalIndent(perceptionSchema(), "", "  ")
	if err != nil {
		return fmt.Errorf("marshal schema: %w", err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		return fmt.Errorf("write schema: %w", err)
	}
	return nil
}

func perceptionSchema() map[string]any {
	numberArray := func(minItems, maxItems int) map[string]any {
		return map[string]any{
			"type":     "array",
			"items":    map[string]any{"type": "number"},
			"minItems": minItems,
			"maxItems": maxItems,
		}
	}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"app", "window", "image", "display", "elements", "uncertainties"},
		"properties": map[string]any{
			"app": map[string]any{"type": "string"},
			"window": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"title", "bounds_screen"},
				"properties": map[string]any{
					"title":         map[string]any{"type": "string"},
					"bounds_screen": numberArray(4, 4),
				},
			},
			"image": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"size", "hash", "captured_at"},
				"properties": map[string]any{
					"size": map[string]any{
						"type":                 "object",
						"additionalProperties": false,
						"required":             []string{"width", "height"},
						"properties": map[string]any{
							"width":  map[string]any{"type": "integer"},
							"height": map[string]any{"type": "integer"},
						},
					},
					"hash":        map[string]any{"type": "string"},
					"captured_at": map[string]any{"type": "string"},
				},
			},
			"display": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"id", "scale", "bounds"},
				"properties": map[string]any{
					"id":     map[string]any{"type": "string"},
					"scale":  map[string]any{"type": "number"},
					"bounds": numberArray(4, 4),
				},
			},
			"elements": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"required":             []string{"id", "role", "text", "bbox_norm", "confidence", "risk", "actionable"},
					"properties": map[string]any{
						"id":         map[string]any{"type": "string"},
						"role":       map[string]any{"type": "string"},
						"text":       map[string]any{"type": "string"},
						"bbox_norm":  numberArray(4, 4),
						"confidence": map[string]any{"type": "number"},
						"risk":       map[string]any{"type": "string", "enum": []string{string(RiskLow), string(RiskMedium), string(RiskHigh)}},
						"actionable": map[string]any{"type": "boolean"},
					},
				},
			},
			"uncertainties": map[string]any{
				"type":  "array",
				"items": map[string]any{"type": "string"},
			},
		},
	}
}

func parsePerception(raw string) (Perception, error) {
	var perception Perception
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&perception); err != nil {
		return Perception{}, err
	}
	return perception, nil
}

func mergePerception(base, parsed Perception) Perception {
	result := parsed
	if result.App == "" {
		result.App = base.App
	}
	if result.Window.Title == "" {
		result.Window.Title = base.Window.Title
	}
	if result.Window.BoundsScreen == (ScreenBBox{}) {
		result.Window.BoundsScreen = base.Window.BoundsScreen
	}
	if result.Image.Size == (ImageSize{}) {
		result.Image.Size = base.Image.Size
	}
	if result.Image.Hash == "" {
		result.Image.Hash = base.Image.Hash
	}
	if result.Image.CapturedAt.IsZero() {
		result.Image.CapturedAt = base.Image.CapturedAt
	}
	if result.Display.ID == "" {
		result.Display.ID = base.Display.ID
	}
	if result.Display.Scale == 0 {
		result.Display.Scale = base.Display.Scale
	}
	if result.Display.Bounds == (ScreenBBox{}) {
		result.Display.Bounds = base.Display.Bounds
	}
	if len(result.Uncertainties) == 0 && len(base.Uncertainties) > 0 {
		result.Uncertainties = append([]string(nil), base.Uncertainties...)
	}
	return result
}

func resolvePerceptionCoordinates(perception Perception) (Perception, error) {
	ctx := TransformContext{
		Image:   perception.Image,
		Window:  perception.Window,
		Display: perception.Display,
	}
	out := perception
	out.Elements = make([]Element, 0, len(perception.Elements))
	for _, element := range perception.Elements {
		resolved, err := ResolveElementCoordinates(element, ctx)
		if err != nil {
			return Perception{}, fmt.Errorf("element %q: %w", firstNonEmpty(element.ID, element.Text, element.Role), err)
		}
		out.Elements = append(out.Elements, resolved)
	}
	return out, nil
}

func extractModelRef(stdout, stderr string) ModelRef {
	ref := ModelRef{}
	for _, line := range strings.Split(stdout+"\n"+stderr, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "model:"):
			ref.Model = strings.TrimSpace(strings.TrimPrefix(trimmed, "model:"))
		case strings.HasPrefix(trimmed, "provider:"):
			ref.Provider = strings.TrimSpace(strings.TrimPrefix(trimmed, "provider:"))
		}
	}
	return ref
}

func newExecError(result *ParseResult, err error, message string) *ExecError {
	execErr := &ExecError{
		Message: message,
		Cause:   err,
	}
	if result != nil {
		execErr.Command = append(execErr.Command, result.Command...)
		execErr.Model = result.Model
		execErr.Stdout = result.Stdout
		execErr.Stderr = result.Stderr
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		execErr.ExitCode = exitErr.ExitCode()
	}
	if errors.Is(err, context.DeadlineExceeded) {
		execErr.Message = "codex exec timed out"
	}
	return execErr
}

func positiveDuration(value, fallback time.Duration) time.Duration {
	if value > 0 {
		return value
	}
	return fallback
}
