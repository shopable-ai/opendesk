//go:build darwin
// +build darwin

package automation

import "testing"

func TestPointerSelectionWindowListUsesDirectNativeSnapshot(t *testing.T) {
	called := 0
	rows, err := listPointerSelectionWindowsWithResolver(func() ([]macWindow, error) {
		called++
		return []macWindow{{
			Title: "Reference", PID: 42, Handle: 99,
			X: 10, Y: 20, Width: 300, Height: 200, Index: 0,
		}}, nil
	})
	if err != nil {
		t.Fatalf("list pointer selection windows: %v", err)
	}
	if called != 1 {
		t.Fatalf("native snapshot resolver calls = %d, want 1", called)
	}
	if len(rows) != 1 || rows[0]["title"] != "Reference" || rows[0]["handle"] != uintptr(99) {
		t.Fatalf("rows = %#v", rows)
	}
}
