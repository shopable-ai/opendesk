package measurement

import "testing"

func productTestWindow() Reference {
	return Reference{
		Type:   ReferenceWindowOuter,
		Bounds: Rect{X: 100, Y: 40, Width: 1000, Height: 800},
		Window: &WindowIdentity{ID: "window-1", PID: 42, Title: "Target"},
	}
}

func TestSnapshotTokenRejectsOldGenerationAndSnapshot(t *testing.T) {
	active := SnapshotToken{SessionID: "measurement-1", Generation: 3, SnapshotID: "snapshot-3"}
	if !active.Matches(active) {
		t.Fatal("active snapshot token must match itself")
	}
	for _, stale := range []SnapshotToken{
		{SessionID: "measurement-1", Generation: 2, SnapshotID: "snapshot-3"},
		{SessionID: "measurement-1", Generation: 3, SnapshotID: "snapshot-2"},
		{SessionID: "measurement-2", Generation: 3, SnapshotID: "snapshot-3"},
	} {
		if active.Matches(stale) {
			t.Fatalf("stale token was accepted: %+v", stale)
		}
	}
}

func TestBuildTwoLevelReferencesSelectsNearestMeaningfulParentOnly(t *testing.T) {
	window := productTestWindow()
	target := Rect{X: 390, Y: 410, Width: 240, Height: 56}
	candidates := []CandidateDescriptor{
		{ID: "same-wrapper", Label: "technical-wrapper", Source: "accessibility", Bounds: Rect{X: 389, Y: 409, Width: 242, Height: 58}, Reliability: CandidateReliabilityConfirmed, Semantic: true},
		{ID: "input-area", Label: "输入区", Source: "accessibility", Bounds: Rect{X: 360, Y: 365, Width: 520, Height: 150}, Reliability: CandidateReliabilityReliable, Semantic: true, StableRelocationHint: true},
		{ID: "chat-area", Label: "聊天区", Source: "accessibility", Bounds: Rect{X: 300, Y: 120, Width: 720, Height: 650}, Reliability: CandidateReliabilityReliable, Semantic: true},
		{ID: "visual", Label: "颜色区域", Source: "pixel-region-growing", Bounds: Rect{X: 370, Y: 380, Width: 300, Height: 100}, Reliability: CandidateReliabilityEstimated},
	}

	references, err := BuildTwoLevelReferences(window, target, candidates)
	if err != nil {
		t.Fatal(err)
	}
	if references.Local == nil {
		t.Fatal("expected a meaningful local reference")
	}
	if references.Local.Label != "输入区" || references.Local.Source != "accessibility" {
		t.Fatalf("local reference = %+v", references.Local)
	}
	if references.Local.Reference.Bounds != candidates[1].Bounds {
		t.Fatalf("local bounds = %+v", references.Local.Reference.Bounds)
	}
}

func TestBuildTwoLevelReferencesDoesNotPromoteEstimatedVisualRegion(t *testing.T) {
	window := productTestWindow()
	target := Rect{X: 390, Y: 410, Width: 240, Height: 56}
	references, err := BuildTwoLevelReferences(window, target, []CandidateDescriptor{{
		ID: "visual", Label: "视觉区域", Source: "pixel-region-growing",
		Bounds: Rect{X: 360, Y: 365, Width: 520, Height: 150}, Reliability: CandidateReliabilityEstimated,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if references.Local != nil {
		t.Fatalf("estimated visual region was promoted to local reference: %+v", references.Local)
	}
}

func TestMarginRelationsKeepWindowAndLocalSignedEdges(t *testing.T) {
	window := productTestWindow()
	local := &LayoutReference{
		Reference:   Reference{Type: ReferenceManualRegion, Bounds: Rect{X: 300, Y: 300, Width: 600, Height: 220}},
		Label:       "输入区",
		Source:      "accessibility",
		Reliability: CandidateReliabilityReliable,
	}
	references := TwoLevelReferences{Window: window, Local: local}
	target := Rect{X: 250, Y: 320, Width: 700, Height: 100}
	relations, err := BuildMarginRelations(target, references)
	if err != nil {
		t.Fatal(err)
	}
	if relations.TargetToWindow.Left != 150 || relations.TargetToWindow.Top != 280 || relations.TargetToWindow.Right != 150 || relations.TargetToWindow.Bottom != 420 {
		t.Fatalf("window margins = %+v", relations.TargetToWindow)
	}
	if relations.TargetToLocal == nil {
		t.Fatal("missing local margins")
	}
	if relations.TargetToLocal.Left != -50 || relations.TargetToLocal.Top != 20 || relations.TargetToLocal.Right != -50 || relations.TargetToLocal.Bottom != 100 {
		t.Fatalf("local signed margins = %+v", *relations.TargetToLocal)
	}
}

func TestCoordinatesAtUsesScreenWindowAndNullableRegion(t *testing.T) {
	window := productTestWindow()
	point := Point{X: 460, Y: 450}
	withoutLocal, err := CoordinatesAt(point, window, nil)
	if err != nil {
		t.Fatal(err)
	}
	if withoutLocal.Screen != point || withoutLocal.Window != (Point{X: 360, Y: 410}) || withoutLocal.Region != nil {
		t.Fatalf("coordinate triple without local = %+v", withoutLocal)
	}

	local := &LayoutReference{
		Reference:   Reference{Type: ReferenceManualRegion, Bounds: Rect{X: 360, Y: 365, Width: 520, Height: 150}},
		Label:       "输入区",
		Source:      "manual",
		Reliability: CandidateReliabilityConfirmed,
	}
	withLocal, err := CoordinatesAt(point, window, local)
	if err != nil {
		t.Fatal(err)
	}
	if withLocal.Region == nil || *withLocal.Region != (Point{X: 100, Y: 85}) {
		t.Fatalf("coordinate triple with local = %+v", withLocal)
	}
}
