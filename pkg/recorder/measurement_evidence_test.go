package recorder

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
	"time"

	"opendesk/pkg/measurement"
)

func recorderMeasurementEvidence(t *testing.T) measurement.MeasurementEvidence {
	t.Helper()
	mapping, err := measurement.NewCaptureMapping(measurement.Point{X: 0, Y: 0}, measurement.Size{Width: 100, Height: 100}, measurement.PixelSize{Width: 100, Height: 100}, "display-1", 1)
	if err != nil {
		t.Fatal(err)
	}
	ref := measurement.Reference{Type: measurement.ReferenceWindowOuter, Bounds: measurement.Rect{X: 10, Y: 10, Width: 80, Height: 80}, Window: &measurement.WindowIdentity{ID: "w1", PID: 42, Title: "Calculator"}}
	frame := measurement.CaptureFrame{Snapshot: measurement.Snapshot{SampledAt: time.Date(2026, 9, 15, 10, 0, 0, 0, time.UTC), Mapping: mapping}, Reference: ref, Targets: []measurement.TargetWindow{{ID: "w1", Title: "Calculator", PID: 42}}, SelectedTargetID: "w1", TargetConfirmed: true}
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	img.Set(20, 20, color.RGBA{R: 1, G: 2, B: 3, A: 255})
	var data bytes.Buffer
	if err := png.Encode(&data, img); err != nil {
		t.Fatal(err)
	}
	result, err := measurement.BuildPointResult(frame.Snapshot, ref, measurement.Point{X: 20, Y: 20}, img)
	if err != nil {
		t.Fatal(err)
	}
	ev, err := measurement.BuildEvidence("task-1", "recorder", frame, result, data.Bytes(), measurement.EvidenceConfidence{Target: .9, Geometry: 1, Pixel: 1, Overall: .95})
	if err != nil {
		t.Fatal(err)
	}
	return ev
}

func TestAttachMeasurementEvidenceEnrichesCandidateWithoutReplacingSemanticLocator(t *testing.T) {
	ev := recorderMeasurementEvidence(t)
	candidate := LocatorCandidate{Kind: "accessibility", Role: "button", Name: "=", Identifier: "equals", Confidence: .99, ExpectedWindow: "Calculator", ExpectedProcess: 42}
	updated, err := AttachMeasurementEvidence(candidate, ".runtime/automation-authoring/task-1/measurement/evidence.json", ev)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Kind != "accessibility" || updated.Identifier != "equals" || updated.Confidence != .99 {
		t.Fatalf("semantic locator was replaced: %+v", updated)
	}
	if len(updated.EvidenceRefs) != 1 || updated.WindowRelative["measurementKind"] != "point" || updated.WindowRelative["displayId"] != "display-1" {
		t.Fatalf("measurement evidence not attached: %+v", updated)
	}
}

func TestAttachMeasurementEvidenceCanSeedWeakCandidateConfidenceAndWindowIdentity(t *testing.T) {
	ev := recorderMeasurementEvidence(t)
	updated, err := AttachMeasurementEvidence(LocatorCandidate{Kind: "point"}, "measurement/evidence.json", ev)
	if err != nil {
		t.Fatal(err)
	}
	if updated.ExpectedWindow != "Calculator" || updated.ExpectedProcess != 42 || updated.Confidence != ev.Confidence.Overall {
		t.Fatalf("weak candidate not enriched: %+v", updated)
	}
}

func TestAttachMeasurementEvidenceRejectsUnsafeArtifactReference(t *testing.T) {
	ev := recorderMeasurementEvidence(t)
	unsafe := []string{
		"",
		"../escape.json",
		"/tmp/evidence.json",
		"\\tmp\\evidence.json",
		"C:\\tmp\\evidence.json",
		"c:/tmp/evidence.json",
		"\\\\server\\share\\evidence.json",
		"measurement/../escape.json",
		"measurement\\..\\escape.json",
	}
	for _, artifactPath := range unsafe {
		if _, err := AttachMeasurementEvidence(LocatorCandidate{Kind: "point"}, artifactPath, ev); err == nil {
			t.Fatalf("unsafe ref accepted: %q", artifactPath)
		}
	}
}

func TestAttachMeasurementEvidenceNormalizesRepositoryRelativeSeparators(t *testing.T) {
	ev := recorderMeasurementEvidence(t)
	updated, err := AttachMeasurementEvidence(LocatorCandidate{Kind: "point"}, `.runtime\automation-authoring\task-1\measurement\evidence.json`, ev)
	if err != nil {
		t.Fatal(err)
	}
	want := ".runtime/automation-authoring/task-1/measurement/evidence.json"
	if len(updated.EvidenceRefs) != 1 || updated.EvidenceRefs[0] != want {
		t.Fatalf("evidence ref = %v, want %q", updated.EvidenceRefs, want)
	}
}

func TestAttachMeasurementEvidenceToTargetPreservesOtherCandidates(t *testing.T) {
	ev := recorderMeasurementEvidence(t)
	target := &TargetSnapshot{Description: "equals", Candidates: []LocatorCandidate{{Kind: "accessibility", Identifier: "equals"}, {Kind: "ocr", Name: "="}}}
	if err := AttachMeasurementEvidenceToTarget(target, 1, "measurement/evidence.json", ev); err != nil {
		t.Fatal(err)
	}
	if len(target.Candidates[0].EvidenceRefs) != 0 || len(target.Candidates[1].EvidenceRefs) != 1 {
		t.Fatalf("attachment leaked across candidates: %+v", target)
	}
}
