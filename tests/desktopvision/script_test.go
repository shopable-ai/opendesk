package desktopvision_test

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/desktopvision"
)

func TestGenerateReplayScriptUsesVisionRelocationAndWindowAnchors(t *testing.T) {
	now := time.Date(2026, 8, 30, 12, 7, 0, 0, time.UTC)
	target := desktopvision.NormalizeTarget(sampleElement())
	target.Actionable = true
	script, err := desktopvision.GenerateReplayScript([]desktopvision.TraceEvent{{
		Timestamp: now, Stage: "tap_digit_7", App: "Calculator",
		Window: desktopvision.WindowIdentity{Title: "Calculator", BoundsScreen: desktopvision.ScreenBBox{100, 80, 500, 380}},
		Model:  desktopvision.ModelRef{Provider: "openai", Model: "gpt-5.6-sol", PromptVersion: "ui-parser-v1"}, Target: &target,
		Action: &desktopvision.ActionRecord{Type: "click", Button: "left"}, ExpectedPostcondition: &desktopvision.Postcondition{Type: "text_visible", Text: "7"},
	}}, desktopvision.ScriptOptions{ReplayDir: ".runtime/runs/replay-001"})
	if err != nil {
		t.Fatalf("generate script: %v", err)
	}
	for _, want := range []string{"window.getActiveWindow()", "page.screenshot", "DesktopVision.parse", "model response screenshot SHA mismatch", "perception screenshot SHA mismatch", "targetRole", "targetText", "bboxDistance", "pointDistance", "REPLAY_PLAN.windowTitle", "REPLAY_PLAN.windowWidth", "REPLAY_PLAN.windowHeight", "step.target.bbox_norm", "step.target.center_window", "File.ensureDir", "screenPointWithinWindow", "localPointWithinBox", "activeWindow.x + localClickPoint.x", "candidate.localClickPoint", "Screen.getDisplays", "Screen.getVirtualBounds", "page.checkScreenshotPermissions", "ensureFreshCapture(capture)", "screenshot became stale before action", "active window changed after visual re-detection", "resolved click point escaped the active display bounds", "resolved click point escaped the candidate bounds", "target is not unique after re-detection", "await main();"} {
		if !strings.Contains(script, want) {
			t.Fatalf("expected generated script to contain %q", want)
		}
	}
	if regexp.MustCompile(`mouse\.click\(\d`).MatchString(script) {
		t.Fatalf("expected replay script to avoid literal click coordinates:\n%s", script)
	}
	if !strings.Contains(script, "const localClickPoint = candidate.localClickPoint") {
		t.Fatalf("expected replay click to start from a local candidate point, got:\n%s", script)
	}
	if strings.Contains(script, "main().catch") {
		t.Fatalf("expected the generated script to await main so asynchronous failures reach the host:\n%s", script)
	}
}

func TestGenerateReplayScriptIncludesPostActionVerification(t *testing.T) {
	target := desktopvision.NormalizeTarget(sampleElement())
	script, err := desktopvision.GenerateReplayScript([]desktopvision.TraceEvent{{
		Stage: "click_clear", App: "Calculator", Window: desktopvision.WindowIdentity{Title: "Calculator"},
		Model: desktopvision.ModelRef{Provider: "openai", Model: "gpt-5.6-sol", PromptVersion: "ui-parser-v1"}, Target: &target,
		Action: &desktopvision.ActionRecord{Type: "click"}, ExpectedPostcondition: &desktopvision.Postcondition{Type: "text_visible", Text: "0", Role: "text"},
	}}, desktopvision.ScriptOptions{})
	if err != nil {
		t.Fatalf("generate script: %v", err)
	}
	for _, want := range []string{"async function verifyExpectation(step)", `captureStep(step, "post")`, "verify_postcondition", "postcondition verification failed", "matches.length !== 1", "confidence >= Math.max(REPLAY_PLAN.minConfidence || 0, step.target.confidence || 0)"} {
		if !strings.Contains(script, want) {
			t.Fatalf("expected generated script to contain %q", want)
		}
	}
}

func TestGenerateReplayScriptRejectsActionWithoutTarget(t *testing.T) {
	_, err := desktopvision.GenerateReplayScript([]desktopvision.TraceEvent{{Stage: "broken", App: "Calculator", Window: desktopvision.WindowIdentity{Title: "Calculator"}, Action: &desktopvision.ActionRecord{Type: "click"}}}, desktopvision.ScriptOptions{})
	if err == nil {
		t.Fatal("expected missing target to fail script generation")
	}
}

func TestGenerateReplayScriptPreservesDryRun(t *testing.T) {
	target := desktopvision.NormalizeTarget(sampleElement())
	script, err := desktopvision.GenerateReplayScript([]desktopvision.TraceEvent{{
		Stage: "dry_run_digit", App: "Calculator", Window: desktopvision.WindowIdentity{BoundsScreen: desktopvision.ScreenBBox{100, 80, 500, 380}},
		Model: desktopvision.ModelRef{Provider: "openai", Model: "gpt-5.6-sol", PromptVersion: "ui-parser-v1"}, Target: &target,
		Action: &desktopvision.ActionRecord{Type: "click", DryRun: true},
	}}, desktopvision.ScriptOptions{})
	if err != nil {
		t.Fatalf("generate script: %v", err)
	}
	for _, want := range []string{`"dryRun": true`, "if (step.dryRun)", "visual target resolved without action"} {
		if !strings.Contains(script, want) {
			t.Fatalf("expected dry-run replay guard %q, got:\n%s", want, script)
		}
	}
}
