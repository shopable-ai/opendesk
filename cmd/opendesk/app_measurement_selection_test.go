package main

import (
	"os"
	"testing"

	"opendesk/automation"
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

func TestMeasurementReferenceSelectionRequiresSameWindowAndClickSizedMovement(t *testing.T) {
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
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionRelease, X: 60, Y: 70, Button: 1}, first, true) || state.hasSelected {
		t.Fatal("drag-sized movement was treated as a click confirmation")
	}
	if state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionPress, X: 30, Y: 40, Button: 1}, first, true) {
		t.Fatal("third press completed selection")
	}
	if !state.apply(automation.PointerSelectionEvent{Kind: automation.PointerSelectionRelease, X: 32, Y: 41, Button: 1}, first, true) || !state.hasSelected || state.selected.id != "a" {
		t.Fatalf("same-window click did not confirm: %+v", state)
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
