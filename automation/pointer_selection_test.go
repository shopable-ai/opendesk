package automation

import (
	"context"
	"sync"
	"testing"
)

type pointerSelectionTestBackend struct {
	mu         sync.Mutex
	events      []RecorderInputEvent
	configured bool
	stopped    bool
}

func (b *pointerSelectionTestBackend) Capabilities() RecorderBackendCapabilities {
	return RecorderBackendCapabilities{Supported: true, Platform: "test", Backend: "fixture", Permission: "authorized", CoordinateSpace: "screen-logical"}
}

func (b *pointerSelectionTestBackend) configureCaptureKeyboard(enabled bool) {
	b.mu.Lock()
	b.configured = enabled
	b.mu.Unlock()
}

func (b *pointerSelectionTestBackend) Start(ctx context.Context, sink func(RecorderInputEvent), failure func(error)) error {
	go func() {
		for _, event := range b.events {
			select {
			case <-ctx.Done():
				return
			default:
				sink(event)
			}
		}
	}()
	return nil
}

func (b *pointerSelectionTestBackend) Stop(context.Context) error {
	b.mu.Lock()
	b.stopped = true
	b.mu.Unlock()
	return nil
}
func (b *pointerSelectionTestBackend) Wait() {}

func TestObservePointerSelectionProjectsMovePressReleaseAndStops(t *testing.T) {
	backend := &pointerSelectionTestBackend{events: []RecorderInputEvent{
		{Type: uiohookEventMouseMoved, X: 10, Y: 20},
		{Type: uiohookEventMousePressed, Button: uiohookLeftButton, X: 12, Y: 22},
		{Type: uiohookEventMouseReleased, Button: uiohookLeftButton, X: 12, Y: 22},
	}}
	seen := []PointerSelectionKind{}
	if err := observePointerSelectionWithBackend(context.Background(), backend, func(event PointerSelectionEvent) bool {
		seen = append(seen, event.Kind)
		return event.Kind == PointerSelectionRelease
	}); err != nil {
		t.Fatal(err)
	}
	if len(seen) != 3 || seen[0] != PointerSelectionMove || seen[1] != PointerSelectionPress || seen[2] != PointerSelectionRelease {
		t.Fatalf("projected kinds = %#v", seen)
	}
	backend.mu.Lock()
	configured, stopped := backend.configured, backend.stopped
	backend.mu.Unlock()
	if !configured || !stopped {
		t.Fatalf("backend lifecycle configured=%v stopped=%v", configured, stopped)
	}
}

func TestProjectPointerSelectionUsesPhysicalWindowsPoint(t *testing.T) {
	event, ok := projectPointerSelectionEvent(RecorderInputEvent{
		Type: uiohookEventMouseMoved, X: 1, Y: 2,
		PhysicalPointAvailable: true, PhysicalX: -1440, PhysicalY: 315,
	})
	if !ok || event.X != -1440 || event.Y != 315 || event.Kind != PointerSelectionMove {
		t.Fatalf("projected event = %+v ok=%v", event, ok)
	}
}

func TestProjectPointerSelectionEscapeCancelsWithoutKeyboardContent(t *testing.T) {
	event, ok := projectPointerSelectionEvent(RecorderInputEvent{Type: uiohookEventKeyPressed, Rawcode: uiohookEscapeRawCode, Keychar: 'x'})
	if !ok || event.Kind != PointerSelectionCancel || event.X != 0 || event.Y != 0 || event.Button != 0 {
		t.Fatalf("escape event = %+v ok=%v", event, ok)
	}
}
