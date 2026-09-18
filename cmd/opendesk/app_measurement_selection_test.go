package main

import (
	"os"
	"testing"

	"opendesk/automation"
	"opendesk/pkg/customui"
)

func TestMeasurementWindowAtPointUsesZOrderAndExcludesOpenDesk(t *testing.T) {
	rows := []map[string]interface{}{
		{"id": "overlay", "title": "OpenDesk helper", "pid": uint32(os.Getpid()), "handle": uint64(1), "x": 0, "y": 0, "width": 800, "height": 600, "exeName": "opendesk-ui-host"},
		{"id": "front", "title": "Front", "pid": uint32(200), "handle": uint64(20), "x": 100, "y": 100, "width": 500, "height": 400, "exeName": "front"},
		{"id": "back", "title": "Back", "pid": uint32(201), "handle": uint64(21), "x": 0, "y": 0, "width": 1000, "height": 800, "exeName": "back"},
	}
	candidate, ok := measurementWindowAtPointRows(rows, 250, 250)
	if !ok || candidate.id != "front" {
		t.Fatalf("candidate = %+v ok=%v", candidate, ok)
	}
}

func TestMeasurementReferenceSelectionRequiresSameWindowAndOracleClickTolerance(t *testing.T) {
	first := measurementWindowRow{id: "a", pid: 7, handle: 11, x: 10, y: 20, width: 300, height: 200}
	second := measurementWindowRow{id: "b", pid: 8, handle: 12, x: 400, y: 20, width: 300, height: 200}
	state := measurementReferenceSelectionState{}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionMove, X: 30, Y: 40}, first, true) {
		t.Fatal("hover completed selection")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionPress, X: 30, Y: 40, Button: 1}, first, true) {
		t.Fatal("press completed selection")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionRelease, X: 30, Y: 40, Button: 1}, second, true) || state.hasSelected {
		t.Fatal("release over another window confirmed the stale pressed candidate")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionPress, X: 30, Y: 40, Button: 1}, first, true) {
		t.Fatal("second press completed selection")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionRelease, X: 39, Y: 40, Button: 1}, first, true) || state.hasSelected {
		t.Fatal("drag-sized movement was treated as a click confirmation")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionPress, X: 30, Y: 40, Button: 1}, first, true) {
		t.Fatal("third press completed selection")
	}
	if !state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionRelease, X: 38, Y: 40, Button: 1}, first, true) || !state.hasSelected || state.selected.id != "a" {
		t.Fatalf("8 px same-window click did not confirm: %+v", state)
	}
}

func TestMeasurementReferenceSelectionRejectsNonPrimaryConfirmation(t *testing.T) {
	first := measurementWindowRow{id: "a", pid: 7, handle: 11, x: 10, y: 20, width: 300, height: 200}
	state := measurementReferenceSelectionState{}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionPress, X: 30, Y: 40, Button: 2}, first, true) {
		t.Fatal("secondary press completed selection")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionRelease, X: 30, Y: 40, Button: 2}, first, true) || state.hasSelected {
		t.Fatal("secondary click confirmed reference selection")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionPress, X: 30, Y: 40, Button: 1}, first, true) {
		t.Fatal("primary press completed selection")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionRelease, X: 30, Y: 40, Button: 2}, first, true) || state.hasSelected {
		t.Fatal("mixed-button release confirmed reference selection")
	}
}

func TestMeasurementReferenceSelectionRejectsBoundsChangeAndSupportsCancel(t *testing.T) {
	first := measurementWindowRow{id: "a", pid: 7, handle: 11, x: 10, y: 20, width: 300, height: 200}
	moved := first
	moved.x = 11
	state := measurementReferenceSelectionState{}
	_ = state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionPress, X: 30, Y: 40, Button: 1}, first, true)
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionRelease, X: 30, Y: 40, Button: 1}, moved, true) || state.hasSelected {
		t.Fatal("moved window was confirmed using stale press geometry")
	}
	if !state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionCancel}, measurementWindowRow{}, false) || !state.canceled {
		t.Fatal("Escape did not cancel live reference selection")
	}
}

func TestMeasurementReferenceSelectionDimmersLeaveCandidateContentsUncovered(t *testing.T) {
	candidate := measurementWindowRow{x: 100, y: 200, width: 300, height: 400}
	dimmers := measurementReferenceSelectionDimmerBounds([]measurementDisplayRow{{
		id: "primary", x: 0, y: 0, width: 1000, height: 800,
	}}, candidate)
	want := []customui.Bounds{
		{X: 0, Y: 0, Width: 1000, Height: 200},
		{X: 0, Y: 200, Width: 100, Height: 400},
		{X: 400, Y: 200, Width: 600, Height: 400},
		{X: 0, Y: 600, Width: 1000, Height: 200},
	}
	if len(dimmers) != len(want) {
		t.Fatalf("dimmer count = %d, want %d (%+v)", len(dimmers), len(want), dimmers)
	}
	for index, bounds := range dimmers {
		if bounds != want[index] {
			t.Fatalf("dimmer[%d] = %+v, want %+v", index, bounds, want[index])
		}
		if _, overlaps := measurementReferenceSelectionIntersection(bounds, customui.Bounds{
			X: candidate.x, Y: candidate.y, Width: candidate.width, Height: candidate.height,
		}); overlaps {
			t.Fatalf("dimmer[%d] overlaps candidate contents: %+v", index, bounds)
		}
	}
}

func TestMeasurementReferenceSelectionDimmersCoverOtherDisplays(t *testing.T) {
	candidate := measurementWindowRow{x: 100, y: 100, width: 300, height: 200}
	dimmers := measurementReferenceSelectionDimmerBounds([]measurementDisplayRow{
		{id: "primary", x: 0, y: 0, width: 1000, height: 800},
		{id: "left", x: -800, y: 0, width: 800, height: 600},
	}, candidate)
	wholeLeft := customui.Bounds{X: -800, Y: 0, Width: 800, Height: 600}
	found := false
	for _, bounds := range dimmers {
		if bounds == wholeLeft {
			found = true
		}
	}
	if !found {
		t.Fatalf("other display was not dimmed: %+v", dimmers)
	}
}

func TestMeasurementReferenceSelectionInstructionIsOutsideCandidateWhenSpaceExists(t *testing.T) {
	candidate := measurementWindowRow{x: 320, y: 180, width: 300, height: 200}
	instruction, ok := measurementReferenceSelectionInstructionBounds([]measurementDisplayRow{{
		id: "primary", x: 0, y: 0, width: 1440, height: 900,
	}}, candidate)
	if !ok {
		t.Fatal("instruction bounds were unavailable")
	}
	if _, overlaps := measurementReferenceSelectionIntersection(instruction, customui.Bounds{
		X: candidate.x, Y: candidate.y, Width: candidate.width, Height: candidate.height,
	}); overlaps {
		t.Fatalf("instruction obscures candidate contents: %+v", instruction)
	}
}

func TestMeasurementReferenceSelectionWindowSpecUsesHostOwnedRoles(t *testing.T) {
	spec := measurementReferenceSelectionWindowSpec("candidate", customui.ReferenceSelectionRoleCandidate, "")
	if spec.Kind != "reference-selection" || spec.ReferenceSelection == nil || spec.ReferenceSelection.Role != customui.ReferenceSelectionRoleCandidate {
		t.Fatalf("candidate spec = %#v", spec)
	}
	instruction := measurementReferenceSelectionWindowSpec("instruction", customui.ReferenceSelectionRoleInstruction, "Pick a window")
	if instruction.ReferenceSelection == nil || instruction.ReferenceSelection.Label != "Pick a window" {
		t.Fatalf("instruction spec = %#v", instruction)
	}
}
