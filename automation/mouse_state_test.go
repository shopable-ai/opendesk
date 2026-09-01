package automation

import (
	"runtime"
	"testing"
)

func TestMouseTracksPressedButtonForDarwinDragMoves(t *testing.T) {
	mouse := NewMouse()
	if button := mouse.pressedButton(); button != "" {
		t.Fatalf("initial pressed button = %q", button)
	}

	mouse.setButtonPressed("right", true)
	if button := mouse.pressedButton(); button != "right" {
		t.Fatalf("pressed button = %q, want right", button)
	}
	wantDrag := ""
	if runtime.GOOS == "darwin" {
		wantDrag = "right"
	}
	if button := mouse.dragButtonForMove(); button != wantDrag {
		t.Fatalf("platform drag button = %q, want %q", button, wantDrag)
	}
	mouse.setButtonPressed("left", true)
	if button := mouse.pressedButton(); button != "left" {
		t.Fatalf("pressed button precedence = %q, want left", button)
	}
	mouse.setButtonPressed("left", false)
	if button := mouse.pressedButton(); button != "right" {
		t.Fatalf("pressed button after left release = %q, want right", button)
	}
	mouse.setButtonPressed("right", false)
	if button := mouse.pressedButton(); button != "" {
		t.Fatalf("pressed button after releases = %q", button)
	}
}
