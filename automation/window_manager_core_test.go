package automation

import "testing"

type focusedWindowPlatform struct {
	windowManagerPlatform
	resolved *WindowInfo
	findErr  error
	focusErr error
	rows     []map[string]interface{}
}

func (p *focusedWindowPlatform) GetWindowByTitle(string) (*WindowInfo, error) {
	return p.resolved, p.findErr
}

func (p *focusedWindowPlatform) Focus(string) error { return p.focusErr }

func (p *focusedWindowPlatform) List() ([]map[string]interface{}, error) { return p.rows, nil }

func TestWindowFacadeClassifiesResolvedTargetDisappearance(t *testing.T) {
	manager := &WindowManager{impl: &focusedWindowPlatform{
		resolved: &WindowInfo{Title: "Fixture", ProcessID: 42, Handle: 99},
		focusErr: &WindowError{Code: WindowNotFound, Message: "window was closed"},
	}}

	err := manager.Focus("Fixture")
	if code := windowErrorCode(err); code != WindowStaleTarget {
		t.Fatalf("focus error code=%q error=%v", code, err)
	}
	structured := err.(*WindowError).JSProperties()
	if structured["operation"] != "window.focus" || structured["capability"] != "window.focus" {
		t.Fatalf("structured error=%#v", structured)
	}
}

func TestWindowFacadeNormalizesIdentityAndPID(t *testing.T) {
	rows := []map[string]interface{}{{"title": "Fixture", "processId": uint32(42), "handle": uintptr(99)}}
	manager := &WindowManager{impl: &focusedWindowPlatform{rows: rows}}

	result, err := manager.List()
	if err != nil {
		t.Fatal(err)
	}
	if result[0]["pid"] != uint32(42) || result[0]["processId"] != uint32(42) {
		t.Fatalf("pid aliases=%#v", result[0])
	}
	if result[0]["id"] != makeWindowID(42, 99) {
		t.Fatalf("identity=%#v", result[0])
	}
}

func TestWindowCapabilitiesAreExplicitForEveryMaintainedTarget(t *testing.T) {
	for _, platform := range []string{"darwin", "windows", "linux"} {
		capabilities := windowCapabilities(platform)
		if capabilities.Platform != platform || capabilities.Backend == "" {
			t.Fatalf("platform=%s capabilities=%#v", platform, capabilities)
		}
		for _, name := range []string{
			"window.list", "window.active", "window.findByTitle", "window.focus",
			"window.getBounds", "window.setBounds", "window.minimize", "window.maximize",
			"window.restore", "window.close", "window.alwaysOnTop", "window.bringToTop",
		} {
			capability, ok := capabilities.Capabilities[name]
			if !ok || capability.Status == "" {
				t.Fatalf("platform=%s missing capability=%s: %#v", platform, name, capabilities)
			}
			if platform == "linux" && capability.Supported {
				t.Fatalf("unsupported target exposed %s as supported", name)
			}
		}
	}
}

func TestWindowFacadeRejectsInvalidGeometryBeforeBackend(t *testing.T) {
	manager := &WindowManager{impl: &focusedWindowPlatform{}}
	if code := windowErrorCode(manager.SetWindowBounds("Fixture", 0, 0, 0, 100)); code != WindowInvalidArgument {
		t.Fatalf("setWindowBounds code=%q", code)
	}
}
