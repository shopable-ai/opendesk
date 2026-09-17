package automation

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// PointerSelectionKind is the minimal host-owned input vocabulary used by
// Desktop Measurement while choosing a live Reference Window. It deliberately
// excludes text content and all application-specific semantics.
type PointerSelectionKind string

const (
	PointerSelectionMove    PointerSelectionKind = "move"
	PointerSelectionPress   PointerSelectionKind = "press"
	PointerSelectionRelease PointerSelectionKind = "release"
	PointerSelectionCancel  PointerSelectionKind = "cancel"
)

// PointerSelectionEvent contains only pointer geometry/button identity or the
// Escape cancellation signal. No keyboard text is exposed or persisted.
type PointerSelectionEvent struct {
	Kind   PointerSelectionKind
	X      int
	Y      int
	Button uint16
}

const (
	uiohookEventKeyPressed    uint16 = 4
	uiohookEventMousePressed  uint16 = 7
	uiohookEventMouseReleased uint16 = 8
	uiohookEventMouseMoved    uint16 = 9
	uiohookEventMouseDragged  uint16 = 10
	uiohookEscapeRawCode      uint16 = 0x0001
	uiohookLeftButton         uint16 = 1
)

// ObservePointerSelection owns a short-lived process-wide input observation
// lease for Desktop Measurement Reference selection. The caller decides when a
// valid selection is complete by returning true from handler. Pointer motion is
// lossy under pressure; press/release/cancel events are not intentionally
// dropped. Escape is observed only as a control key and no keyboard content is
// surfaced to the caller.
func ObservePointerSelection(ctx context.Context, handler func(PointerSelectionEvent) bool) error {
	return observePointerSelectionWithBackend(ctx, newRecorderInputBackend(), handler)
}

func observePointerSelectionWithBackend(ctx context.Context, backend RecorderInputBackend, handler func(PointerSelectionEvent) bool) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if backend == nil {
		return errors.New("pointer selection input backend is unavailable")
	}
	if handler == nil {
		return errors.New("pointer selection requires an event handler")
	}
	capability := backend.Capabilities()
	if !capability.Supported {
		return fmt.Errorf("pointer selection is unavailable on %s (%s)", capability.Platform, capability.Backend)
	}
	if capability.Permission == "denied" {
		return errors.New("pointer selection input permission is denied")
	}
	if configurable, ok := backend.(recorderKeyboardCaptureConfigurator); ok {
		// Only Escape is projected below. This does not enable text capture or
		// persistence; it exists solely so Reference selection has a cancel path.
		configurable.configureCaptureKeyboard(true)
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	events := make(chan PointerSelectionEvent, 128)
	failures := make(chan error, 1)
	var stopOnce sync.Once
	stopBackend := func() {
		stopOnce.Do(func() {
			cancel()
			stopCtx, stopCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer stopCancel()
			_ = backend.Stop(stopCtx)
			backend.Wait()
		})
	}
	defer stopBackend()

	if err := backend.Start(runCtx, func(raw RecorderInputEvent) {
		event, ok := projectPointerSelectionEvent(raw)
		if !ok {
			return
		}
		if event.Kind == PointerSelectionMove {
			select {
			case events <- event:
			default:
			}
			return
		}
		select {
		case events <- event:
		case <-runCtx.Done():
		}
	}, func(err error) {
		if err == nil {
			return
		}
		select {
		case failures <- err:
		default:
		}
	}); err != nil {
		return err
	}

	for {
		select {
		case event := <-events:
			if handler(event) {
				return nil
			}
		case err := <-failures:
			return err
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func projectPointerSelectionEvent(raw RecorderInputEvent) (PointerSelectionEvent, bool) {
	if raw.Type == uiohookEventKeyPressed && raw.Rawcode == uiohookEscapeRawCode {
		return PointerSelectionEvent{Kind: PointerSelectionCancel}, true
	}
	kind := PointerSelectionKind("")
	switch raw.Type {
	case uiohookEventMouseMoved, uiohookEventMouseDragged:
		kind = PointerSelectionMove
	case uiohookEventMousePressed:
		kind = PointerSelectionPress
	case uiohookEventMouseReleased:
		kind = PointerSelectionRelease
	default:
		return PointerSelectionEvent{}, false
	}
	x, y := int(raw.X), int(raw.Y)
	if raw.PhysicalPointAvailable {
		x, y = int(raw.PhysicalX), int(raw.PhysicalY)
	}
	return PointerSelectionEvent{Kind: kind, X: x, Y: y, Button: raw.Button}, true
}

func isPointerSelectionLeftButton(event PointerSelectionEvent) bool {
	return event.Button == uiohookLeftButton
}
