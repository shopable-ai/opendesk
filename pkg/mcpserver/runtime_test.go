package mcpserver

import (
	"encoding/base64"
	"errors"
	"testing"
)

func TestNormalizeVisionArgsPrefersImageBytesAsBase64(t *testing.T) {
	args := normalizeVisionArgs(map[string]any{"imageBytes": []byte("abc")})
	if got := args["image"].(string); got != base64.StdEncoding.EncodeToString([]byte("abc")) {
		t.Fatalf("unexpected image base64: %q", got)
	}
}

func TestNormalizeVisionArgsMapsMCPExternalTargetTextToRuntimeOption(t *testing.T) {
	args := normalizeVisionArgs(map[string]any{"target_text": "发送"})
	if got := args["targetText"]; got != "发送" {
		t.Fatalf("expected target_text to map to runtime targetText, got %#v", args)
	}
}

func TestNormalizeVisionArgsPreservesExplicitRuntimeTargetText(t *testing.T) {
	args := normalizeVisionArgs(map[string]any{"target_text": "external", "targetText": "runtime"})
	if got := args["targetText"]; got != "runtime" {
		t.Fatalf("expected explicit targetText to win, got %#v", args)
	}
}

func TestSplitKeyChordSupportsCommaAndPlus(t *testing.T) {
	parts := splitKeyChord("cmd,shift+p")
	if len(parts) != 3 || parts[0] != "cmd" || parts[1] != "shift" || parts[2] != "p" {
		t.Fatalf("unexpected comma split: %#v", parts)
	}
	parts = splitKeyChord("cmd+shift+p")
	if len(parts) != 3 || parts[0] != "cmd" || parts[1] != "shift" || parts[2] != "p" {
		t.Fatalf("unexpected plus split: %#v", parts)
	}
}

func TestAckReturnsStableStructure(t *testing.T) {
	result := ack("click", map[string]any{"x": 1})
	if result["ok"] != true || result["action"] != "click" {
		t.Fatalf("unexpected ack result: %#v", result)
	}
}

func TestGuardCandidateAmbiguityIncludesReasonAndHint(t *testing.T) {
	result := guardCandidateAmbiguity(map[string]any{}, map[string]any{
		"ambiguous":       true,
		"text":            "发送",
		"label":           "发送",
		"ambiguityReason": "top candidates have similar scores for the same target text",
	})
	if result == nil {
		t.Fatalf("expected ambiguity guard result")
	}
	if result["guard"] != "ambiguousTarget" {
		t.Fatalf("unexpected guard: %#v", result)
	}
	if result["reason"] != "top candidates have similar scores for the same target text" {
		t.Fatalf("expected reason to be preserved, got %#v", result)
	}
	if result["hostHint"] == nil {
		t.Fatalf("expected hostHint, got %#v", result)
	}
}

func TestBuildRevalidationArgsUsesImagePathAndTargetText(t *testing.T) {
	candidate := map[string]any{
		"text":         "发送",
		"source":       "detect_ui",
		"capturedAt":   "2026-01-01T00:00:00Z",
		"staleAfterMs": 5000.0,
	}
	args := buildRevalidationArgs(map[string]any{
		"imagePath": "/tmp/inspect.png",
		"strategy":  "hybrid",
	}, candidate)
	if args == nil {
		t.Fatalf("expected revalidation args")
	}
	if args["target_text"] != "发送" {
		t.Fatalf("expected target_text, got %#v", args)
	}
	if args["imagePath"] != "/tmp/inspect.png" {
		t.Fatalf("expected imagePath, got %#v", args)
	}
	if args["strategy"] != "hybrid" {
		t.Fatalf("expected strategy to stay hybrid, got %#v", args)
	}
	if _, exists := args["staleAfterMs"]; exists {
		t.Fatalf("expected staleAfterMs to be cleared for revalidation, got %#v", args)
	}
}

func TestBuildRevalidationArgsUpgradesLayoutToHybrid(t *testing.T) {
	candidate := map[string]any{"label": "发送", "source": "layout", "staleAfterMs": 1000.0}
	args := buildRevalidationArgs(map[string]any{"strategy": "layout", "image": "abc"}, candidate)
	if args == nil {
		t.Fatalf("expected revalidation args")
	}
	if args["strategy"] != "hybrid" {
		t.Fatalf("expected layout revalidation to upgrade to hybrid, got %#v", args)
	}
	if args["image"] != "abc" {
		t.Fatalf("expected image to be preserved, got %#v", args)
	}
}

func TestBuildRevalidationArgsReturnsNilWithoutReusableTarget(t *testing.T) {
	if args := buildRevalidationArgs(map[string]any{"imagePath": "/tmp/inspect.png"}, map[string]any{"source": "layout"}); args != nil {
		t.Fatalf("expected nil args when target text is unavailable, got %#v", args)
	}
}

func TestExternalBlockerPayloadReturnsLeafToolSpecificRemediationAndHostHints(t *testing.T) {
	ocr := externalBlockerPayload("ocr", "ocr", errors.New("ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider"))
	if ocr == nil {
		t.Fatalf("expected OCR blocker payload")
	}
	if ocr["remediationHint"] != "set PADDLE_OCR_ENDPOINT for the paddle OCR provider, rerun tm_ocr with a fresh screenshot/imagePath, and only if that succeeds continue to tm_find_target -> tm_act_on_target" {
		t.Fatalf("unexpected OCR remediationHint: %#v", ocr)
	}
	if ocr["hostHint"] != "stop after this structured blocker; do not rerun tm_detect_ui/tm_find_target or treat layout region labels as real text/UI targets until OCR provider config is restored" {
		t.Fatalf("unexpected OCR hostHint: %#v", ocr)
	}

	detect := externalBlockerPayload("detect_ui", "detect_ui", errors.New("detect_ui failed: PADDLE_OCR_ENDPOINT is required for paddle provider"))
	if detect == nil {
		t.Fatalf("expected detect_ui blocker payload")
	}
	if detect["remediationHint"] != "set PADDLE_OCR_ENDPOINT for the paddle OCR provider, rerun tm_ocr first, and only if tm_ocr succeeds continue to tm_detect_ui/tm_find_target -> tm_act_on_target" {
		t.Fatalf("unexpected detect_ui remediationHint: %#v", detect)
	}
	if detect["hostHint"] != "stop after this structured blocker; do not treat layout region labels as real text/UI targets or keep retrying detect_ui/hybrid until OCR provider config is restored" {
		t.Fatalf("unexpected detect_ui hostHint: %#v", detect)
	}

	find := externalBlockerPayload("ocr", "hybrid", errors.New("ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider"))
	if find == nil {
		t.Fatalf("expected find_target blocker payload")
	}
	if find["remediationHint"] != "set PADDLE_OCR_ENDPOINT for the paddle OCR provider, rerun tm_ocr first, then rerun tm_inspect_desktop -> tm_find_target -> tm_act_on_target" {
		t.Fatalf("unexpected find_target remediationHint: %#v", find)
	}
	if find["hostHint"] != "do not treat layout region labels as real text/UI target discovery while OCR/detect-ui is blocked; after tm_ocr recovers, resume the real inspect -> find -> act loop" {
		t.Fatalf("unexpected find_target hostHint: %#v", find)
	}
}

func TestWrapRuntimeError(t *testing.T) {
	cause := errors.New("boom")
	wrapped := wrapRuntimeError("type", cause)
	if wrapped == nil || wrapped.Error() != "type failed: boom" {
		t.Fatalf("unexpected wrapped error: %#v", wrapped)
	}
	if !errors.Is(wrapped, cause) {
		t.Fatalf("expected wrapped error to preserve cause")
	}
	if wrapRuntimeError("type", nil) != nil {
		t.Fatalf("expected nil when cause is nil")
	}
}

func TestGetActiveWindowMapIncludesBoundsAndMetadata(t *testing.T) {
	window := activeWindowMap(nil)
	if window == nil {
		t.Fatalf("expected non-nil map for nil window")
	}
	if window["title"] != "" || window["pid"] != 0 {
		t.Fatalf("expected zero-value window map for nil input, got %#v", window)
	}
	if window["handle"] != "" {
		t.Fatalf("expected empty string handle for nil input, got %#v", window)
	}
}

func TestWrapRuntimeErrorPrefixesRuntimeAction(t *testing.T) {
	cause := errors.New("keyboard unavailable")
	wrapped := wrapRuntimeError("press_key", cause)
	if wrapped.Error() != "press_key failed: keyboard unavailable" {
		t.Fatalf("unexpected wrapped error: %v", wrapped)
	}
}
