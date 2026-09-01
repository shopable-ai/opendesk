package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	_ "image/png"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"opendesk/automation"
	"opendesk/pkg/desktopvision"
)

type config struct {
	Level            int
	App              string
	TargetText       string
	Model            string
	Provider         string
	CodexPath        string
	RunRoot          string
	RunID            string
	ScriptReplayRoot string
	Prompt           string
	CaptureCount     int
	Iterations       int
	Execute          bool
	Timeout          time.Duration
}

type preflightCapture struct {
	Index      int       `json:"index"`
	Path       string    `json:"path"`
	Hash       string    `json:"hash"`
	CapturedAt time.Time `json:"captured_at"`
	Width      int       `json:"width"`
	Height     int       `json:"height"`
}

type preflightReport struct {
	Level       int                   `json:"level"`
	App         string                `json:"app"`
	Window      desktopvision.Window  `json:"window"`
	Display     desktopvision.Display `json:"display"`
	Permissions map[string]any        `json:"permissions"`
	Captures    []preflightCapture    `json:"captures"`
	Passed      bool                  `json:"passed"`
	Failure     string                `json:"failure,omitempty"`
}

type runVerification struct {
	Level             int                     `json:"level"`
	OK                bool                    `json:"ok"`
	DryRun            bool                    `json:"dry_run"`
	ObservedText      string                  `json:"observed_text,omitempty"`
	Failures          []string                `json:"failures,omitempty"`
	Model             string                  `json:"model,omitempty"`
	Provider          string                  `json:"provider,omitempty"`
	Attempts          int                     `json:"attempts,omitempty"`
	Successes         int                     `json:"successes,omitempty"`
	RequiredSuccesses int                     `json:"required_successes,omitempty"`
	Misclicks         int                     `json:"misclicks,omitempty"`
	Restored          int                     `json:"restored,omitempty"`
	Iterations        []iterationVerification `json:"iterations,omitempty"`
}

type iterationVerification struct {
	Index        int      `json:"index"`
	OK           bool     `json:"ok"`
	DryRun       bool     `json:"dry_run"`
	ObservedText string   `json:"observed_text,omitempty"`
	RestoredText string   `json:"restored_text,omitempty"`
	Failures     []string `json:"failures,omitempty"`
}

type parsedSnapshot struct {
	Capture    preflightCapture
	Perception desktopvision.Perception
	Model      desktopvision.ModelRef
	Window     desktopvision.Window
	Display    desktopvision.Display
	Invocation modelInvocation
}

type modelInvocation struct {
	ImagePath           string                 `json:"image_path"`
	ImageSHA256         string                 `json:"image_sha256"`
	CapturedAt          time.Time              `json:"captured_at"`
	RequestedModel      string                 `json:"requested_model"`
	RequestedProvider   string                 `json:"requested_provider"`
	PromptVersion       string                 `json:"prompt_version"`
	ResolvedModel       desktopvision.ModelRef `json:"resolved_model"`
	Command             []string               `json:"command,omitempty"`
	Stdout              string                 `json:"stdout,omitempty"`
	Stderr              string                 `json:"stderr,omitempty"`
	RawResponse         string                 `json:"raw_response,omitempty"`
	ResponseImageSHA256 string                 `json:"response_image_sha256,omitempty"`
	Succeeded           bool                   `json:"succeeded"`
	Error               string                 `json:"error,omitempty"`
}

func main() {
	cfg := parseFlags()
	if err := run(cfg); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func parseFlags() config {
	var cfg config
	flag.IntVar(&cfg.Level, "level", 0, "Calculator test level: 0, 1, or 2")
	flag.StringVar(&cfg.App, "app", "Calculator", "Expected application executable name")
	flag.StringVar(&cfg.TargetText, "target", "7", "Target control text")
	flag.StringVar(&cfg.Model, "model", "", "Verified vision model identifier (required for level 1+)")
	flag.StringVar(&cfg.Provider, "provider", "", "Codex model provider override")
	flag.StringVar(&cfg.CodexPath, "codex", "codex", "Path to the Codex CLI")
	flag.StringVar(&cfg.RunRoot, "run-root", ".runtime/runs", "Run artifact root")
	flag.StringVar(&cfg.RunID, "run-id", "", "Run identifier")
	flag.StringVar(&cfg.ScriptReplayRoot, "script-replay-root", "", "Generic evidence root embedded in generated JavaScript")
	flag.StringVar(&cfg.Prompt, "prompt-version", desktopvision.DefaultPromptVersion, "Vision prompt version")
	flag.IntVar(&cfg.CaptureCount, "capture-count", 20, "Level 0 capture count")
	flag.IntVar(&cfg.Iterations, "iterations", 20, "Level 1/2 iteration count")
	flag.BoolVar(&cfg.Execute, "execute", false, "Permit a low-risk click after all gates pass")
	flag.DurationVar(&cfg.Timeout, "model-timeout", desktopvision.DefaultExecTimeout, "Vision model timeout")
	flag.Parse()
	return cfg
}

func run(cfg config) error {
	if cfg.Level < 0 || cfg.Level > 2 {
		return fmt.Errorf("level must be 0, 1, or 2")
	}
	if cfg.Level >= 1 && strings.TrimSpace(cfg.Model) == "" {
		return fmt.Errorf("level %d requires an explicitly verified --model", cfg.Level)
	}
	if cfg.CaptureCount <= 0 {
		return fmt.Errorf("capture-count must be positive")
	}
	if cfg.Iterations <= 0 {
		return fmt.Errorf("iterations must be positive")
	}
	if cfg.RunID == "" {
		cfg.RunID = "calculator-" + time.Now().Format("20060102T150405.000000000")
	}
	runDir := filepath.Join(cfg.RunRoot, cfg.RunID)
	if err := os.MkdirAll(filepath.Join(runDir, "preflight"), 0o755); err != nil {
		return err
	}

	trace := desktopvision.NewTraceRecorder(cfg.RunID)
	if err := activateApplication(cfg.App); err != nil {
		return writeFailure(runDir, trace, cfg, "activate_app", err)
	}

	page := automation.NewPage()
	windowManager := automation.NewWindowManager()
	window, err := windowManager.GetActiveWindow()
	if err != nil {
		return writeFailure(runDir, trace, cfg, "window_identity", err)
	}
	if !sameApp(window.ExeName, cfg.App) {
		return writeFailure(runDir, trace, cfg, "app_identity", fmt.Errorf("frontmost app is %q, want %q", window.ExeName, cfg.App))
	}
	display := displayForWindow(automation.NewScreen().GetDisplays(), window)
	windowRef := desktopvision.Window{
		Title: window.Title,
		BoundsScreen: desktopvision.ScreenBBox{
			float64(window.X), float64(window.Y),
			float64(window.X + window.Width), float64(window.Y + window.Height),
		},
	}

	report := preflightReport{
		Level:       0,
		App:         cfg.App,
		Window:      windowRef,
		Display:     display,
		Permissions: page.CheckScreenshotPermissions(),
		Captures:    make([]preflightCapture, 0, cfg.CaptureCount),
	}
	for index := 1; index <= cfg.CaptureCount; index++ {
		current, err := windowManager.GetActiveWindow()
		if err != nil || !sameApp(current.ExeName, cfg.App) {
			report.Failure = fmt.Sprintf("capture %d lost expected active app", index)
			break
		}
		path := filepath.Join(runDir, "preflight", fmt.Sprintf("%02d.png", index))
		capture, err := captureWindow(page, path, index)
		if err != nil {
			report.Failure = err.Error()
			break
		}
		if capture.Width != int(current.Width) || capture.Height != int(current.Height) {
			report.Failure = fmt.Sprintf("capture %d image/window size mismatch", index)
			break
		}
		report.Captures = append(report.Captures, capture)
	}
	report.Passed = len(report.Captures) == cfg.CaptureCount && report.Failure == ""
	if err := writeJSON(filepath.Join(runDir, "preflight.json"), report); err != nil {
		return err
	}
	if !report.Passed {
		return writeFailure(runDir, trace, cfg, "level_0", fmt.Errorf("level 0 failed: %s", report.Failure))
	}
	if err := copyFile(report.Captures[0].Path, filepath.Join(runDir, "pre.png")); err != nil {
		return err
	}
	trace.Record(desktopvision.TraceEvent{
		Stage:        "level_0",
		App:          cfg.App,
		Window:       windowIdentity(windowRef, display),
		Screenshot:   desktopvision.ScreenshotRef{Ref: "pre", Path: "pre.png", Hash: report.Captures[0].Hash},
		Verification: &desktopvision.Verification{OK: true, Strategy: preflightStrategyName(cfg.CaptureCount)},
	})
	if cfg.Level == 0 {
		if err := trace.WriteNDJSON(filepath.Join(runDir, "events.ndjson")); err != nil {
			return err
		}
		return writeJSON(filepath.Join(runDir, "verification.json"), runVerification{Level: 0, OK: true, DryRun: true})
	}
	provider := desktopvision.NewCodexProvider(desktopvision.ProviderOptions{
		Executable: cfg.CodexPath, WorkingDir: ".", Provider: cfg.Provider,
		DefaultModel: cfg.Model, PromptVersion: cfg.Prompt, Timeout: cfg.Timeout,
	})

	if cfg.Level == 1 {
		return runLevelOne(cfg, runDir, report, windowRef, display, provider, trace)
	}
	if !cfg.Execute {
		verification := runVerification{Level: 2, OK: false, DryRun: true, Failures: []string{"level 2 requires --execute"}, Model: cfg.Model, Provider: cfg.Provider}
		_ = writeJSON(filepath.Join(runDir, "verification.json"), verification)
		return writeFailure(runDir, trace, cfg, "execute_gate", fmt.Errorf("level 2 requires --execute"))
	}
	permissions := page.CheckScreenshotPermissions()
	if allowed, _ := permissions["accessibility"].(bool); !allowed {
		verification := runVerification{Level: 2, OK: false, DryRun: true, Failures: []string{"accessibility permission is not available"}, Model: cfg.Model, Provider: cfg.Provider}
		_ = writeJSON(filepath.Join(runDir, "verification.json"), verification)
		return writeFailure(runDir, trace, cfg, "accessibility_gate", fmt.Errorf("accessibility permission is not available to this runner"))
	}
	return runLevelTwo(cfg, runDir, page, windowManager, provider, trace)
}

func runLevelOne(cfg config, runDir string, report preflightReport, window desktopvision.Window, display desktopvision.Display, provider *desktopvision.CodexProvider, trace *desktopvision.TraceRecorder) error {
	summary := runVerification{Level: 1, DryRun: true, Attempts: cfg.Iterations, RequiredSuccesses: requiredSuccesses(cfg.Iterations), Model: cfg.Model, Provider: cfg.Provider}
	representative := 0
	for index := 1; index <= cfg.Iterations; index++ {
		iterDir := iterationDir(runDir, index)
		if err := os.MkdirAll(iterDir, 0o755); err != nil {
			return err
		}
		capture := report.Captures[(index-1)%len(report.Captures)]
		capture.Path = filepath.Join(iterDir, "pre.png")
		if err := copyFile(report.Captures[(index-1)%len(report.Captures)].Path, capture.Path); err != nil {
			return err
		}
		snapshot, err := parseCapturedSnapshot(cfg, capture, window, display, provider)
		iteration := iterationVerification{Index: index, DryRun: true}
		iterTrace := desktopvision.NewTraceRecorder(fmt.Sprintf("%s-level1-%02d", cfg.RunID, index))
		if err != nil {
			_ = writeModelInvocation(iterDir, snapshot.Invocation)
			iteration.Failures = []string{err.Error()}
			summary.Iterations = append(summary.Iterations, iteration)
			_ = writeJSON(filepath.Join(iterDir, "verification.json"), iteration)
			continue
		}
		if err := writeSnapshotArtifacts(iterDir, "pre.png", snapshot); err != nil {
			return err
		}
		targets := matchingElements(snapshot.Perception.Elements, cfg.TargetText)
		gate := desktopvision.EvaluateActionGate(snapshot.Perception, targets, desktopvision.GateExpectations{
			App: cfg.App, WindowTitle: window.Title, MinConfidence: desktopvision.DefaultConfidenceThreshold,
			MaxRisk: desktopvision.RiskLow, Now: capture.CapturedAt,
		})
		plan := map[string]any{"level": 1, "iteration": index, "target_text": cfg.TargetText, "execute": false, "gate": gate, "model": snapshot.Model}
		if err := writeJSON(filepath.Join(iterDir, "plan.json"), plan); err != nil {
			return err
		}
		event := desktopvision.TraceEvent{
			Stage: "level_1_static_recognition", App: cfg.App, Window: windowIdentity(window, display),
			Screenshot: desktopvision.ScreenshotRef{Ref: "pre", Path: capture.Path, Hash: capture.Hash},
			Model:      snapshot.Model, Perception: &snapshot.Perception,
			Verification: &desktopvision.Verification{OK: gate.Allowed, Strategy: "unique_visual_target_center"},
		}
		if gate.Allowed && gate.Target != nil {
			target := desktopvision.NormalizeTarget(*gate.Target)
			event.Target = &target
			if representative == 0 {
				event.Action = &desktopvision.ActionRecord{Type: "click", Button: "left", DryRun: true, ResolvedScreenPoint: gate.Target.CenterScreen}
				event.ExpectedPostcondition = &desktopvision.Postcondition{Type: "visual_text", Text: cfg.TargetText, Role: "display"}
				representative = index
			}
			iteration.OK = true
			summary.Successes++
		} else {
			iteration.Failures = append(iteration.Failures, gate.Failures...)
		}
		trace.Record(event)
		iterTrace.Record(event)
		summary.Iterations = append(summary.Iterations, iteration)
		if err := iterTrace.WriteNDJSON(filepath.Join(iterDir, "events.ndjson")); err != nil {
			return err
		}
		if err := writeJSON(filepath.Join(iterDir, "verification.json"), iteration); err != nil {
			return err
		}
	}
	summary.OK = summary.Successes >= summary.RequiredSuccesses
	if representative > 0 {
		if err := finalizeRepresentativeArtifacts(runDir, representative, cfg.ScriptReplayRoot, trace.Events()); err != nil {
			return err
		}
	}
	if err := trace.WriteNDJSON(filepath.Join(runDir, "events.ndjson")); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(runDir, "verification.json"), summary); err != nil {
		return err
	}
	if !summary.OK {
		return fmt.Errorf("level 1 succeeded %d/%d; require %d", summary.Successes, summary.Attempts, summary.RequiredSuccesses)
	}
	return nil
}

func runLevelTwo(cfg config, runDir string, page *automation.Page, windowManager *automation.WindowManager, provider *desktopvision.CodexProvider, trace *desktopvision.TraceRecorder) error {
	summary := runVerification{Level: 2, DryRun: false, Attempts: cfg.Iterations, RequiredSuccesses: requiredSuccesses(cfg.Iterations), Model: cfg.Model, Provider: cfg.Provider}
	representative := 0
	mouse := automation.NewMouse()
	for index := 1; index <= cfg.Iterations; index++ {
		iterDir := iterationDir(runDir, index)
		if err := os.MkdirAll(iterDir, 0o755); err != nil {
			return err
		}
		iteration := iterationVerification{Index: index}
		iterTrace := desktopvision.NewTraceRecorder(fmt.Sprintf("%s-level2-%02d", cfg.RunID, index))
		digit, err := captureAndParseSnapshot(cfg, iterDir, "pre.png", index, page, windowManager, provider)
		if err != nil {
			iteration.Failures = []string{err.Error()}
			summary.Iterations = append(summary.Iterations, iteration)
			_ = writeJSON(filepath.Join(iterDir, "verification.json"), iteration)
			continue
		}
		if err := writeSnapshotArtifacts(iterDir, "pre.png", digit); err != nil {
			return err
		}
		digitTargets := matchingElements(digit.Perception.Elements, cfg.TargetText)
		digitGate := actionGate(cfg, digit.Perception, digitTargets)
		plan := map[string]any{"level": 2, "iteration": index, "target_text": cfg.TargetText, "execute": true, "digit_gate": digitGate, "model": digit.Model}
		if !digitGate.Allowed || digitGate.Target == nil {
			iteration.Failures = append(iteration.Failures, digitGate.Failures...)
			_ = writeJSON(filepath.Join(iterDir, "plan.json"), plan)
			_ = writeJSON(filepath.Join(iterDir, "verification.json"), iteration)
			summary.Iterations = append(summary.Iterations, iteration)
			continue
		}
		if err := ensureReadyForClick(cfg, page, windowManager, digit, *digitGate.Target); err != nil {
			iteration.Failures = []string{err.Error()}
			_ = writeJSON(filepath.Join(iterDir, "plan.json"), plan)
			_ = writeJSON(filepath.Join(iterDir, "verification.json"), iteration)
			summary.Iterations = append(summary.Iterations, iteration)
			continue
		}
		digitTarget := desktopvision.NormalizeTarget(*digitGate.Target)
		digitEvent := desktopvision.TraceEvent{
			Stage: fmt.Sprintf("iteration_%02d_click_%s", index, cfg.TargetText), App: cfg.App,
			Window: windowIdentity(digit.Window, digit.Display), Screenshot: desktopvision.ScreenshotRef{Ref: "pre", Path: digit.Capture.Path, Hash: digit.Capture.Hash},
			Model: digit.Model, Perception: &digit.Perception, Target: &digitTarget,
			Preconditions:         append(gatePreconditions(digitGate), desktopvision.Precondition{Name: "accessibility", Passed: true}),
			Action:                &desktopvision.ActionRecord{Type: "click", Button: "left", ResolvedScreenPoint: digitGate.Target.CenterScreen},
			ExpectedPostcondition: &desktopvision.Postcondition{Type: "visual_text", Text: cfg.TargetText, Role: "display"},
		}
		trace.Record(digitEvent)
		iterTrace.Record(digitEvent)
		if err := mouse.Click(int(math.Round(digitGate.Target.CenterScreen[0])), int(math.Round(digitGate.Target.CenterScreen[1])), nil); err != nil {
			summary.Misclicks++
			iteration.Failures = []string{err.Error()}
			summary.Iterations = append(summary.Iterations, iteration)
			break
		}
		time.Sleep(350 * time.Millisecond)
		digitPost, err := captureAndParseSnapshot(cfg, iterDir, "digit-post.png", index, page, windowManager, provider)
		if err != nil {
			iteration.Failures = []string{err.Error()}
			summary.Iterations = append(summary.Iterations, iteration)
			break
		}
		observed := observedDisplayText(digitPost.Perception.Elements)
		iteration.ObservedText = observed
		digitOK := displayShowsValue(observed, cfg.TargetText)
		verifyDigit := desktopvision.TraceEvent{
			Stage: fmt.Sprintf("iteration_%02d_verify_digit", index), App: cfg.App,
			Window: windowIdentity(digitPost.Window, digitPost.Display), Screenshot: desktopvision.ScreenshotRef{Ref: "digit-post", Path: digitPost.Capture.Path, Hash: digitPost.Capture.Hash},
			Model: digitPost.Model, Perception: &digitPost.Perception,
			Verification: &desktopvision.Verification{OK: digitOK, Strategy: "model_display_text", ObservedText: observed},
		}
		trace.Record(verifyDigit)
		iterTrace.Record(verifyDigit)
		if !digitOK {
			summary.Misclicks++
			iteration.Failures = []string{"display did not equal expected digit"}
			summary.Iterations = append(summary.Iterations, iteration)
			break
		}
		clearTargets := matchingClearElements(digitPost.Perception.Elements)
		clearGate := actionGate(cfg, digitPost.Perception, clearTargets)
		plan["digit_verification"] = verifyDigit.Verification
		plan["clear_gate"] = clearGate
		if !clearGate.Allowed || clearGate.Target == nil {
			iteration.Failures = append(iteration.Failures, clearGate.Failures...)
			summary.Iterations = append(summary.Iterations, iteration)
			break
		}
		if err := ensureReadyForClick(cfg, page, windowManager, digitPost, *clearGate.Target); err != nil {
			iteration.Failures = []string{err.Error()}
			summary.Iterations = append(summary.Iterations, iteration)
			break
		}
		clearTarget := desktopvision.NormalizeTarget(*clearGate.Target)
		clearEvent := desktopvision.TraceEvent{
			Stage: fmt.Sprintf("iteration_%02d_click_clear", index), App: cfg.App,
			Window: windowIdentity(digitPost.Window, digitPost.Display), Screenshot: desktopvision.ScreenshotRef{Ref: "digit-post", Path: digitPost.Capture.Path, Hash: digitPost.Capture.Hash},
			Model: digitPost.Model, Perception: &digitPost.Perception, Target: &clearTarget,
			Preconditions:         append(gatePreconditions(clearGate), desktopvision.Precondition{Name: "accessibility", Passed: true}),
			Action:                &desktopvision.ActionRecord{Type: "click", Button: "left", ResolvedScreenPoint: clearGate.Target.CenterScreen},
			ExpectedPostcondition: &desktopvision.Postcondition{Type: "visual_text", Text: "0", Role: "display"},
		}
		trace.Record(clearEvent)
		iterTrace.Record(clearEvent)
		if err := mouse.Click(int(math.Round(clearGate.Target.CenterScreen[0])), int(math.Round(clearGate.Target.CenterScreen[1])), nil); err != nil {
			summary.Misclicks++
			iteration.Failures = []string{err.Error()}
			summary.Iterations = append(summary.Iterations, iteration)
			break
		}
		time.Sleep(350 * time.Millisecond)
		finalPost, err := captureAndParseSnapshot(cfg, iterDir, "post.png", index, page, windowManager, provider)
		if err != nil {
			iteration.Failures = []string{err.Error()}
			summary.Iterations = append(summary.Iterations, iteration)
			break
		}
		finalObserved := observedDisplayText(finalPost.Perception.Elements)
		iteration.RestoredText = finalObserved
		finalOK := displayShowsValue(finalObserved, "0")
		verifyClear := desktopvision.TraceEvent{
			Stage: fmt.Sprintf("iteration_%02d_verify_clear", index), App: cfg.App,
			Window: windowIdentity(finalPost.Window, finalPost.Display), Screenshot: desktopvision.ScreenshotRef{Ref: "post", Path: finalPost.Capture.Path, Hash: finalPost.Capture.Hash},
			Model: finalPost.Model, Perception: &finalPost.Perception,
			Verification: &desktopvision.Verification{OK: finalOK, Strategy: "model_display_text", ObservedText: finalObserved},
		}
		trace.Record(verifyClear)
		iterTrace.Record(verifyClear)
		plan["clear_verification"] = verifyClear.Verification
		if !finalOK {
			summary.Misclicks++
			iteration.Failures = []string{"display did not reset to zero"}
			summary.Iterations = append(summary.Iterations, iteration)
			break
		}
		iteration.OK = true
		summary.Successes++
		summary.Restored++
		if representative == 0 {
			representative = index
		}
		summary.Iterations = append(summary.Iterations, iteration)
		if err := writeJSON(filepath.Join(iterDir, "plan.json"), plan); err != nil {
			return err
		}
		if err := iterTrace.WriteNDJSON(filepath.Join(iterDir, "events.ndjson")); err != nil {
			return err
		}
		if err := writeJSON(filepath.Join(iterDir, "verification.json"), iteration); err != nil {
			return err
		}
	}
	summary.OK = summary.Successes >= summary.RequiredSuccesses && summary.Restored >= summary.RequiredSuccesses && summary.Misclicks == 0
	if representative > 0 {
		if err := finalizeRepresentativeArtifacts(runDir, representative, cfg.ScriptReplayRoot, trace.Events()); err != nil {
			return err
		}
	}
	if err := trace.WriteNDJSON(filepath.Join(runDir, "events.ndjson")); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(runDir, "verification.json"), summary); err != nil {
		return err
	}
	if !summary.OK {
		return fmt.Errorf("level 2 succeeded %d/%d with %d misclicks; require %d successes and zero misclicks", summary.Successes, summary.Attempts, summary.Misclicks, summary.RequiredSuccesses)
	}
	return nil
}

func parseCapturedSnapshot(cfg config, capture preflightCapture, window desktopvision.Window, display desktopvision.Display, provider *desktopvision.CodexProvider) (parsedSnapshot, error) {
	base := desktopvision.Perception{
		App: cfg.App, Window: window,
		Image:   desktopvision.Image{Size: desktopvision.ImageSize{Width: capture.Width, Height: capture.Height}, Hash: capture.Hash, CapturedAt: capture.CapturedAt},
		Display: display,
	}
	parsed, err := provider.Parse(context.Background(), desktopvision.ParseOptions{
		ImagePath: capture.Path, Model: cfg.Model, Provider: cfg.Provider, PromptVersion: cfg.Prompt,
		TargetText: cfg.TargetText, TargetRole: "button", Purpose: "locate_action_target", BasePerception: base,
	})
	snapshot := parsedSnapshot{
		Capture: capture,
		Model: desktopvision.ModelRef{
			Provider: cfg.Provider, Model: cfg.Model, PromptVersion: cfg.Prompt,
		},
		Window:  window,
		Display: display,
		Invocation: modelInvocation{
			ImagePath: capture.Path, ImageSHA256: capture.Hash, CapturedAt: capture.CapturedAt,
			RequestedModel: cfg.Model, RequestedProvider: cfg.Provider, PromptVersion: cfg.Prompt,
		},
	}
	if parsed != nil {
		snapshot.Model = parsed.Model
		snapshot.Perception = parsed.Perception
		snapshot.Invocation.ResolvedModel = parsed.Model
		snapshot.Invocation.Command = append([]string(nil), parsed.Command...)
		snapshot.Invocation.Stdout = parsed.Stdout
		snapshot.Invocation.Stderr = parsed.Stderr
		snapshot.Invocation.RawResponse = parsed.RawMessage
		snapshot.Invocation.ResponseImageSHA256 = parsed.Perception.Image.Hash
	}
	if err != nil {
		snapshot.Invocation.Error = err.Error()
		return snapshot, err
	}
	if parsed.Perception.Image.Hash != capture.Hash {
		err := fmt.Errorf("model response screenshot SHA mismatch: got %q, want %q", parsed.Perception.Image.Hash, capture.Hash)
		snapshot.Invocation.Error = err.Error()
		return snapshot, err
	}
	snapshot.Invocation.Succeeded = true
	return snapshot, nil
}

func captureAndParseSnapshot(cfg config, dir, imageName string, index int, page *automation.Page, windowManager *automation.WindowManager, provider *desktopvision.CodexProvider) (parsedSnapshot, error) {
	current, err := windowManager.GetActiveWindow()
	if err != nil {
		return parsedSnapshot{}, err
	}
	if !sameApp(current.ExeName, cfg.App) {
		return parsedSnapshot{}, fmt.Errorf("frontmost app is %q, want %q", current.ExeName, cfg.App)
	}
	display := displayForWindow(automation.NewScreen().GetDisplays(), current)
	if display.Bounds.Width() <= 0 || display.Bounds.Height() <= 0 {
		return parsedSnapshot{}, fmt.Errorf("target display bounds are unavailable")
	}
	window := desktopvision.Window{Title: current.Title, BoundsScreen: desktopvision.ScreenBBox{float64(current.X), float64(current.Y), float64(current.X + current.Width), float64(current.Y + current.Height)}}
	capture, err := captureWindow(page, filepath.Join(dir, imageName), index)
	if err != nil {
		return parsedSnapshot{}, err
	}
	if capture.Width != int(current.Width) || capture.Height != int(current.Height) {
		return parsedSnapshot{}, fmt.Errorf("captured image/window size mismatch")
	}
	return parseCapturedSnapshot(cfg, capture, window, display, provider)
}

func writeSnapshotArtifacts(dir, imageName string, snapshot parsedSnapshot) error {
	if err := writeModelInvocation(dir, snapshot.Invocation); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(dir, "perception.json"), snapshot.Perception); err != nil {
		return err
	}
	return desktopvision.WriteAnnotatedPNG(filepath.Join(dir, imageName), snapshot.Perception, filepath.Join(dir, "annotated.png"))
}

func writeModelInvocation(dir string, invocation modelInvocation) error {
	if strings.TrimSpace(invocation.ImagePath) == "" {
		return nil
	}
	return writeJSON(filepath.Join(dir, "model-invocation.json"), invocation)
}

func actionGate(cfg config, perception desktopvision.Perception, targets []desktopvision.Element) desktopvision.GateResult {
	return desktopvision.EvaluateActionGate(perception, targets, desktopvision.GateExpectations{
		App: cfg.App, WindowTitle: perception.Window.Title, MaxScreenshotAge: 30 * time.Second,
		MinConfidence: desktopvision.DefaultConfidenceThreshold, MaxRisk: desktopvision.RiskLow,
	})
}

func ensureReadyForClick(cfg config, page *automation.Page, windowManager *automation.WindowManager, snapshot parsedSnapshot, target desktopvision.Element) error {
	permissions := page.CheckScreenshotPermissions()
	if allowed, _ := permissions["accessibility"].(bool); !allowed {
		return fmt.Errorf("accessibility permission is not available")
	}
	if time.Since(snapshot.Capture.CapturedAt) > 30*time.Second {
		return fmt.Errorf("screenshot became stale before click")
	}
	current, err := windowManager.GetActiveWindow()
	if err != nil {
		return err
	}
	if !sameApp(current.ExeName, cfg.App) || current.Title != snapshot.Window.Title {
		return fmt.Errorf("application or window identity changed before click")
	}
	currentBounds := desktopvision.ScreenBBox{float64(current.X), float64(current.Y), float64(current.X + current.Width), float64(current.Y + current.Height)}
	if currentBounds != snapshot.Window.BoundsScreen {
		return fmt.Errorf("window bounds changed after perception")
	}
	if !target.BBoxWindow.Contains(target.CenterScreen, snapshot.Window) {
		return fmt.Errorf("click center escaped target bounds")
	}
	if !snapshot.Display.Bounds.Contains(target.CenterScreen) {
		return fmt.Errorf("click center escaped display bounds")
	}
	return nil
}

func activateApplication(app string) error {
	if strings.TrimSpace(app) == "" {
		return fmt.Errorf("app is required")
	}
	if err := exec.Command("open", "-a", app).Run(); err != nil {
		return fmt.Errorf("activate %s: %w", app, err)
	}
	time.Sleep(750 * time.Millisecond)
	return nil
}

func captureWindow(page *automation.Page, path string, index int) (preflightCapture, error) {
	result, err := page.Screenshot(automation.ScreenshotOptions{Path: path, Target: "activeWindow", ReturnType: "object"})
	if err != nil {
		return preflightCapture{}, err
	}
	object, _ := result.(map[string]any)
	width, height := intValue(object["width"]), intValue(object["height"])
	if width == 0 || height == 0 {
		file, err := os.Open(path)
		if err != nil {
			return preflightCapture{}, err
		}
		config, _, decodeErr := image.DecodeConfig(file)
		_ = file.Close()
		if decodeErr != nil {
			return preflightCapture{}, decodeErr
		}
		width, height = config.Width, config.Height
	}
	hash, err := fileSHA256(path)
	if err != nil {
		return preflightCapture{}, err
	}
	return preflightCapture{Index: index, Path: path, Hash: hash, CapturedAt: time.Now().UTC(), Width: width, Height: height}, nil
}

func displayForWindow(rows []map[string]any, window *automation.WindowInfo) desktopvision.Display {
	cx := float64(window.X) + float64(window.Width)/2
	cy := float64(window.Y) + float64(window.Height)/2
	for _, row := range rows {
		x, y := floatValue(row["x"]), floatValue(row["y"])
		width, height := floatValue(row["width"]), floatValue(row["height"])
		if cx >= x && cx <= x+width && cy >= y && cy <= y+height {
			return desktopvision.Display{ID: fmt.Sprint(row["id"]), Scale: floatValue(row["scale"]), Bounds: desktopvision.ScreenBBox{x, y, x + width, y + height}}
		}
	}
	return desktopvision.Display{ID: "unknown", Scale: 1}
}

func matchingElements(elements []desktopvision.Element, text string) []desktopvision.Element {
	var matches []desktopvision.Element
	for _, element := range elements {
		if strings.EqualFold(strings.TrimSpace(element.Text), strings.TrimSpace(text)) && element.Actionable {
			matches = append(matches, element)
		}
	}
	return matches
}

func observedDisplayText(elements []desktopvision.Element) string {
	var values []string
	for _, element := range elements {
		if strings.EqualFold(element.Role, "display") || strings.Contains(strings.ToLower(element.ID), "display") {
			values = append(values, strings.TrimSpace(element.Text))
		}
	}
	return strings.Join(values, " ")
}

func matchingClearElements(elements []desktopvision.Element) []desktopvision.Element {
	var matches []desktopvision.Element
	for _, element := range elements {
		if !element.Actionable {
			continue
		}
		text := strings.ToLower(strings.TrimSpace(element.Text))
		id := strings.ToLower(strings.TrimSpace(element.ID))
		switch {
		case text == "c", text == "ac", text == "ce", text == "clear":
			matches = append(matches, element)
		case strings.Contains(id, "clear"):
			matches = append(matches, element)
		}
	}
	return matches
}

func displayShowsValue(observed, expected string) bool {
	return strings.EqualFold(strings.TrimSpace(observed), strings.TrimSpace(expected))
}

func preflightStrategyName(captureCount int) string {
	return fmt.Sprintf("%d_capture_preflight", captureCount)
}

func requiredSuccesses(total int) int {
	if total <= 1 {
		return max(total, 1)
	}
	return int(math.Ceil(float64(total) * 0.95))
}

func iterationDir(runRoot string, iteration int) string {
	return filepath.Join(runRoot, fmt.Sprintf("iteration-%02d", iteration))
}

func finalizeRepresentativeArtifacts(runRoot string, iteration int, scriptReplayRoot string, events []desktopvision.TraceEvent) error {
	sourceDir := iterationDir(runRoot, iteration)
	for _, name := range []string{"pre.png", "perception.json", "annotated.png", "plan.json", "events.ndjson", "post.png", "verification.json"} {
		sourcePath := filepath.Join(sourceDir, name)
		if _, err := os.Stat(sourcePath); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return err
		}
		if err := copyFile(sourcePath, filepath.Join(runRoot, name)); err != nil {
			return err
		}
	}

	replayRoot := strings.TrimSpace(scriptReplayRoot)
	if replayRoot == "" {
		replayRoot = filepath.Join(runRoot, "replay")
	}
	script, err := desktopvision.GenerateReplayScript(events, desktopvision.ScriptOptions{
		ReplayDir:      replayRoot,
		VisionProvider: "",
		Provider:       "",
		Model:          "",
		MinConfidence:  desktopvision.DefaultConfidenceThreshold,
	})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(runRoot, "generated.js"), []byte(script), 0o644)
}

func windowIdentity(window desktopvision.Window, display desktopvision.Display) desktopvision.WindowIdentity {
	return desktopvision.WindowIdentity{Title: window.Title, BoundsScreen: window.BoundsScreen, DisplayID: display.ID, Scale: display.Scale}
}

func gatePreconditions(gate desktopvision.GateResult) []desktopvision.Precondition {
	return []desktopvision.Precondition{
		{Name: "application_identity", Passed: gate.Allowed},
		{Name: "window_identity", Passed: gate.Allowed},
		{Name: "screenshot_fresh", Passed: gate.Allowed},
		{Name: "target_unique", Passed: gate.Allowed},
		{Name: "confidence", Passed: gate.Allowed},
		{Name: "coordinate_inside_target", Passed: gate.Allowed},
		{Name: "risk_level", Passed: gate.Allowed},
	}
}

func writeFailure(runDir string, trace *desktopvision.TraceRecorder, cfg config, stage string, cause error) error {
	trace.Record(desktopvision.TraceEvent{
		Stage: stage, App: cfg.App,
		Model:    desktopvision.ModelRef{Provider: cfg.Provider, Model: cfg.Model, PromptVersion: cfg.Prompt},
		Failure:  &desktopvision.FailureRecord{Code: stage, Message: cause.Error()},
		Recovery: []desktopvision.RecoveryStep{{Type: "stop_without_action", Outcome: "blocked"}},
	})
	_ = trace.WriteNDJSON(filepath.Join(runDir, "events.ndjson"))
	return cause
}

func sameApp(actual, expected string) bool {
	return strings.EqualFold(strings.TrimSuffix(strings.TrimSpace(actual), ".app"), strings.TrimSuffix(strings.TrimSpace(expected), ".app"))
}

func fileSHA256(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

func copyFile(source, destination string) error {
	raw, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return os.WriteFile(destination, raw, 0o644)
}

func writeJSON(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(raw, '\n'), 0o644)
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func floatValue(value any) float64 {
	switch typed := value.(type) {
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	case float64:
		return typed
	default:
		return 0
	}
}
