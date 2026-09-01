package automation

import (
	"errors"
	"testing"
)

type fakeDisplayControlBackend struct {
	current      DisplayModeInfo
	modes        []DisplayModeInfo
	setErr       error
	readbackMode *DisplayModeInfo
}

type fakeUnsupportedDisplayControlBackend struct{ fakeDisplayControlBackend }

func (*fakeUnsupportedDisplayControlBackend) Name() string        { return "unsupported" }
func (*fakeUnsupportedDisplayControlBackend) SupportsModes() bool { return false }

func (f *fakeDisplayControlBackend) Name() string        { return "fake-coregraphics" }
func (f *fakeDisplayControlBackend) SupportsModes() bool { return true }
func (f *fakeDisplayControlBackend) CurrentMode(uint32) (DisplayModeInfo, error) {
	if f.readbackMode != nil {
		return *f.readbackMode, nil
	}
	return f.current, nil
}
func (f *fakeDisplayControlBackend) ListModes(uint32) ([]DisplayModeInfo, error) {
	return append([]DisplayModeInfo(nil), f.modes...), nil
}
func (f *fakeDisplayControlBackend) SetMode(_ uint32, mode DisplayModeInfo) error {
	if f.setErr != nil {
		return f.setErr
	}
	f.current = mode
	return nil
}

func TestNormalizeDisplayModesMarksCurrentAndDeduplicates(t *testing.T) {
	current := DisplayModeInfo{IOModeID: 10, Width: 1440, Height: 900, PixelWidth: 2880, PixelHeight: 1800, RefreshRate: 60}
	modes := normalizeDisplayModes([]DisplayModeInfo{
		current,
		current,
		{IOModeID: 9, Width: 1280, Height: 800, PixelWidth: 2560, PixelHeight: 1600, RefreshRate: 60, UsableForDesktopGUI: true},
	}, &current)
	if len(modes) != 2 {
		t.Fatalf("modes=%#v, want two unique modes", modes)
	}
	if modes[0].Width != 1280 || modes[1].Width != 1440 || !modes[1].IsCurrent {
		t.Fatalf("unexpected normalized modes: %#v", modes)
	}
	if modes[1].ID == "" {
		t.Fatal("current mode id is empty")
	}
}

func TestScreenSetDisplayModeVerifiesReadback(t *testing.T) {
	displays := resolveDisplays()
	if len(displays) == 0 || displays[0].ID == "primary" {
		t.Skip("test needs a native numeric display id")
	}
	previous := DisplayModeInfo{IOModeID: 10, Width: 1440, Height: 900, PixelWidth: 2880, PixelHeight: 1800, RefreshRate: 60, UsableForDesktopGUI: true}
	target := DisplayModeInfo{IOModeID: 9, Width: 1280, Height: 800, PixelWidth: 2560, PixelHeight: 1600, RefreshRate: 60, UsableForDesktopGUI: true}
	backend := &fakeDisplayControlBackend{current: previous, modes: []DisplayModeInfo{previous, target}}
	screen := &Screen{displayControl: backend}
	result, err := screen.SetDisplayMode(displays[0].ID, displayModeID(target))
	if err != nil {
		t.Fatalf("SetDisplayMode failed: %v", err)
	}
	if !result.Verified || !sameDisplayMode(result.Previous, previous) || !sameDisplayMode(result.Current, target) {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestScreenSetDisplayModeRejectsUnavailableAndMismatchedReadback(t *testing.T) {
	displays := resolveDisplays()
	if len(displays) == 0 || displays[0].ID == "primary" {
		t.Skip("test needs a native numeric display id")
	}
	previous := DisplayModeInfo{IOModeID: 10, Width: 1440, Height: 900, PixelWidth: 2880, PixelHeight: 1800, RefreshRate: 60}
	target := DisplayModeInfo{IOModeID: 9, Width: 1280, Height: 800, PixelWidth: 2560, PixelHeight: 1600, RefreshRate: 60}
	backend := &fakeDisplayControlBackend{current: previous, modes: []DisplayModeInfo{previous, target}}
	screen := &Screen{displayControl: backend}
	if _, err := screen.SetDisplayMode(displays[0].ID, "missing"); displayControlErrorCode(err) != DisplayControlNotFound {
		t.Fatalf("missing mode error=%v", err)
	}
	mismatch := previous
	backend.readbackMode = &mismatch
	if _, err := screen.SetDisplayMode(displays[0].ID, displayModeID(target)); displayControlErrorCode(err) != DisplayControlReadbackFailed {
		t.Fatalf("readback error=%v", err)
	}
	var structured *DisplayControlError
	if !errors.As(screenModeError(screen, displays[0].ID), &structured) || structured.JSProperties()["capability"] != "modes.set" {
		t.Fatalf("structured error=%#v", structured)
	}
}

func screenModeError(screen *Screen, displayID string) error {
	_, err := screen.SetDisplayMode(displayID, "missing")
	return err
}

func TestDisplayCapabilitiesDoNotClaimBrightness(t *testing.T) {
	capabilities := NewScreen().GetDisplayCapabilities()
	brightness, ok := capabilities["brightness"].(map[string]interface{})
	if !ok || brightness["read"] != false || brightness["write"] != false {
		t.Fatalf("brightness capabilities=%#v", capabilities["brightness"])
	}
}

func TestUnsupportedDisplayModeFailsBeforePlatformIdentityParsing(t *testing.T) {
	screen := &Screen{displayControl: &fakeUnsupportedDisplayControlBackend{}}
	if _, err := screen.GetDisplayMode("primary"); displayControlErrorCode(err) != DisplayControlNotSupported {
		t.Fatalf("GetDisplayMode error=%v", err)
	}
	if _, err := screen.ListDisplayModes("primary"); displayControlErrorCode(err) != DisplayControlNotSupported {
		t.Fatalf("ListDisplayModes error=%v", err)
	}
	if _, err := screen.SetDisplayMode("primary", "mode"); displayControlErrorCode(err) != DisplayControlNotSupported {
		t.Fatalf("SetDisplayMode error=%v", err)
	}
}
