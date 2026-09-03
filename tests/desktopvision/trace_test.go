package desktopvision_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"opendesk/pkg/desktopvision"
)

func TestTraceRecorderWritesStructuredNDJSON(t *testing.T) {
	now := time.Date(2026, 8, 30, 12, 5, 0, 0, time.UTC)
	recorder := desktopvision.NewTraceRecorder("run-calculator-001")
	perception := samplePerception(now)
	target := desktopvision.NormalizeTarget(sampleElement())

	recorder.Record(desktopvision.TraceEvent{
		Timestamp: now, Stage: "click_digit", App: "Calculator",
		Window:     desktopvision.WindowIdentity{Title: "Calculator", BoundsScreen: perception.Window.BoundsScreen, DisplayID: "main", Scale: 2},
		Screenshot: desktopvision.ScreenshotRef{Ref: "pre.png", Hash: "sha256:pre"},
		Model:      desktopvision.ModelRef{Provider: "openai", Model: "gpt-5.6-vision", PromptVersion: "ui-parser-v1"},
		Perception: &perception, Target: &target,
		Preconditions:         []desktopvision.Precondition{{Name: "app_identity", Passed: true}, {Name: "unique_target", Passed: true}},
		Action:                &desktopvision.ActionRecord{Type: "click", Button: "left", ResolvedScreenPoint: desktopvision.ScreenPoint{160, 245}},
		ExpectedPostcondition: &desktopvision.Postcondition{Type: "text_visible", Text: "7", Description: "display shows clicked digit"},
		Verification:          &desktopvision.Verification{OK: true, Strategy: "display_text_match", ObservedText: "7"},
	})
	recorder.Record(desktopvision.TraceEvent{
		Timestamp: now.Add(2 * time.Second), Stage: "retry_after_guard", App: "Calculator", Window: desktopvision.WindowIdentity{Title: "Calculator"},
		Screenshot: desktopvision.ScreenshotRef{Ref: "post.png", Hash: "sha256:post"},
		Model:      desktopvision.ModelRef{Provider: "openai", Model: "gpt-5.6-vision", PromptVersion: "ui-parser-v1"},
		Failure:    &desktopvision.FailureRecord{Code: desktopvision.GateFailureConfidenceTooLow, Message: "confidence below gate threshold"},
		Recovery:   []desktopvision.RecoveryStep{{Type: "recapture", Outcome: "completed"}, {Type: "relocalize", Outcome: "completed"}},
	})

	dir := t.TempDir()
	path := filepath.Join(dir, "events.ndjson")
	if err := recorder.WriteNDJSON(path); err != nil {
		t.Fatalf("write trace: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read trace: %v", err)
	}
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	var rows []map[string]any
	for scanner.Scan() {
		var row map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			t.Fatalf("decode row: %v", err)
		}
		rows = append(rows, row)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan trace: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	first := rows[0]
	for _, key := range []string{"timestamp", "app", "window", "screenshot", "model", "perception", "target", "preconditions", "action", "expected_postcondition", "verification"} {
		if _, ok := first[key]; !ok {
			t.Fatalf("expected first row to include %q", key)
		}
	}
	if first["run_id"] != "run-calculator-001" {
		t.Fatalf("expected run id to be recorded, got %#v", first["run_id"])
	}
	second := rows[1]
	if _, ok := second["failure"]; !ok {
		t.Fatal("expected failure object")
	}
	if _, ok := second["recovery"]; !ok {
		t.Fatal("expected recovery array")
	}
}

func TestNormalizeTargetCopiesResolvedCoordinates(t *testing.T) {
	element := sampleElement()
	element.BBoxPx = desktopvision.PixelBBox{80, 300, 160, 360}
	element.BBoxWindow = desktopvision.WindowBBox{40, 150, 80, 180}
	element.CenterWindow = desktopvision.WindowPoint{60, 165}
	element.CenterScreen = desktopvision.ScreenPoint{160, 245}
	element.Actionable = true
	target := desktopvision.NormalizeTarget(element)
	if target.BBoxNorm != element.BBoxNorm {
		t.Fatalf("expected normalized bbox to copy, got %#v", target.BBoxNorm)
	}
	if target.CenterScreen != element.CenterScreen {
		t.Fatalf("expected screen center to copy, got %#v", target.CenterScreen)
	}
	if !target.Actionable {
		t.Fatal("expected actionable flag to copy")
	}
}
