package measurement

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"reflect"
	"testing"
	"time"
)

func evidenceFixture(t *testing.T) (CaptureFrame, Result, []byte) {
	t.Helper()
	mapping, err := NewCaptureMapping(Point{X: 10, Y: 20}, Size{Width: 100, Height: 50}, PixelSize{Width: 200, Height: 100}, "display-1", 1)
	if err != nil {
		t.Fatal(err)
	}
	frame := CaptureFrame{
		Snapshot: Snapshot{SampledAt: time.Date(2026, 9, 15, 8, 0, 0, 0, time.UTC), Mapping: mapping},
		Reference: Reference{
			Type:   ReferenceWindowOuter,
			Bounds: Rect{X: 20, Y: 25, Width: 70, Height: 35},
			Window: &WindowIdentity{ID: "w1", PID: 9, Title: "Fixture"},
		},
		Targets:          []TargetWindow{{ID: "w1", Title: "Fixture", PID: 9}, {ID: "w2", Title: "Other", PID: 10}},
		SelectedTargetID: "w1",
		TargetConfirmed:  true,
	}
	img := image.NewRGBA(image.Rect(0, 0, 200, 100))
	img.Set(40, 20, color.RGBA{R: 9, G: 8, B: 7, A: 255})
	var data bytes.Buffer
	if err := png.Encode(&data, img); err != nil {
		t.Fatal(err)
	}
	result, err := BuildPointResult(frame.Snapshot, frame.Reference, Point{X: 30, Y: 30}, img)
	if err != nil {
		t.Fatal(err)
	}
	return frame, result, data.Bytes()
}

func TestMeasurementEvidenceRoundTripAndPathContract(t *testing.T) {
	frame, result, pngBytes := evidenceFixture(t)
	ev, err := BuildEvidence("task-001", "recorder-toolbar", frame, result, pngBytes, EvidenceConfidence{Target: 1, Geometry: 1, Pixel: 1, Overall: 1})
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	paths, err := SaveEvidence(root, ev, pngBytes)
	if err != nil {
		t.Fatal(err)
	}
	if want := ".runtime/automation-authoring/task-001/measurement/evidence.json"; !pathHasSuffix(paths.Evidence, want) {
		t.Fatalf("evidence path=%q want suffix %q", paths.Evidence, want)
	}
	loaded, loadedPaths, err := LoadEvidence(root, "task-001")
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Result.ConciseText() != result.ConciseText() || !reflect.DeepEqual(loaded.Reference, ev.Reference) || loaded.Mapping != ev.Mapping || loadedPaths != paths {
		t.Fatalf("round trip changed evidence")
	}
}

func TestMeasurementEvidenceWindowEnumerationIsNotSemanticUICandidate(t *testing.T) {
	frame, result, pngBytes := evidenceFixture(t)
	ev, err := BuildEvidence("task-window-candidates", "menu", frame, result, pngBytes, EvidenceConfidence{Target: 1, Geometry: 1, Pixel: 1, Overall: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(ev.Candidates) != len(frame.Targets) {
		t.Fatalf("window candidate count=%d want %d", len(ev.Candidates), len(frame.Targets))
	}
	for _, candidate := range ev.Candidates {
		if candidate.Source != "window-enumeration" {
			t.Fatalf("candidate %q source=%q want window-enumeration", candidate.ID, candidate.Source)
		}
		if candidate.Semantic {
			t.Fatalf("target window %q must not be promoted to a semantic UI candidate", candidate.ID)
		}
	}

	// v1 artifacts created before this contract correction may contain
	// semantic:true on a window-enumeration row. Keep them readable while new
	// artifacts stop producing the misleading flag.
	legacy := ev
	legacy.Candidates = append([]CandidateEvidence(nil), ev.Candidates...)
	legacy.Candidates[0].Semantic = true
	if err := ValidateEvidence(legacy); err != nil {
		t.Fatalf("legacy v1 window candidate should remain readable: %v", err)
	}
}

func TestMeasurementEvidenceRejectsTraversalSemanticDriftAndSnapshotTampering(t *testing.T) {
	frame, result, pngBytes := evidenceFixture(t)
	if _, err := EvidencePathsForTask(t.TempDir(), "../escape"); err == nil {
		t.Fatal("unsafe task id accepted")
	}
	ev, err := BuildEvidence("safe-task", "menu", frame, result, pngBytes, EvidenceConfidence{Target: .9, Geometry: 1, Pixel: 1, Overall: .95})
	if err != nil {
		t.Fatal(err)
	}
	drift := ev
	drift.Mapping.Origin.X++
	if err := ValidateEvidence(drift); err == nil {
		t.Fatal("mapping drift accepted")
	}
	root := t.TempDir()
	paths, err := SaveEvidence(root, ev, pngBytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(paths.Snapshot, []byte("tampered"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := LoadEvidence(root, ev.TaskID); err == nil {
		t.Fatal("tampered snapshot accepted")
	}
}

func TestMeasurementEvidenceJSONUsesCanonicalResultInsteadOfDuplicateGeometry(t *testing.T) {
	frame, result, pngBytes := evidenceFixture(t)
	ev, err := BuildEvidence("task-json", "menu", frame, result, pngBytes, EvidenceConfidence{Target: 1, Geometry: 1, Pixel: 1, Overall: 1})
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(ev)
	if err != nil {
		t.Fatal(err)
	}
	for _, token := range [][]byte{[]byte(`"result"`), []byte(`"mapping"`), []byte(`"reference"`), []byte(`"frozenPixels"`), []byte(`"candidates"`)} {
		if !bytes.Contains(data, token) {
			t.Fatalf("evidence JSON missing %s", token)
		}
	}
}

func pathHasSuffix(path, suffix string) bool {
	cleanPath := bytes.ReplaceAll([]byte(path), []byte("\\"), []byte("/"))
	cleanSuffix := bytes.ReplaceAll([]byte(suffix), []byte("\\"), []byte("/"))
	return bytes.HasSuffix(cleanPath, cleanSuffix)
}
