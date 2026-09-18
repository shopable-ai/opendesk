package main

import (
	"context"
	"fmt"
	"strconv"
	"sync/atomic"
	"time"

	"opendesk/automation"
	"opendesk/pkg/customui"
	"opendesk/pkg/measurement"
)

var appMeasurementSelectionSequence atomic.Uint64

// appMeasurementReferenceSelector is the product-only owner of Live desktop
// selection feedback. It renders the candidate as a transparent native input
// shield, with dimmer panels everywhere else. The selected application's
// contents therefore remain unchanged while the surrounding desktop reads as
// a focused, modal-like selection state. The shield receives the candidate
// click so it cannot fall through to the business application; input away from
// a candidate (Dock, taskbar and app switchers included) stays outside it.
type appMeasurementReferenceSelector struct {
	driver  customui.Driver
	baseDir string
	observe func(context.Context, func(automation.PointerSelectionEvent) bool) error
}

func (selector appMeasurementReferenceSelector) SelectReference(ctx context.Context) (measurement.ReferenceSelection, error) {
	if selector.driver == nil {
		return measurement.ReferenceSelection{}, fmt.Errorf("measurement selection surface is unavailable")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	sequence := appMeasurementSelectionSequence.Add(1)
	sessionID := "measurement-reference-select-" + strconv.FormatUint(sequence, 10)
	session, err := customui.NewSession(sessionID, selector.baseDir, selector.driver, func(customui.Event) {})
	if err != nil {
		return measurement.ReferenceSelection{}, fmt.Errorf("create measurement selection session: %w", err)
	}
	defer session.Close(context.Background())

	surfaces, err := newMeasurementReferenceSelectionSurfaces(ctx, session, measurementDisplays(automation.NewScreen().GetDisplays()))
	if err != nil {
		return measurement.ReferenceSelection{}, fmt.Errorf("create measurement selection feedback: %w", err)
	}

	observe := selector.observe
	if observe == nil {
		observe = automation.ObservePointerSelection
	}
	manager := automation.NewWindowManager()
	feedback := func(candidate measurementWindowRow, hasCandidate bool) {
		// Pointer movement is lossy by design. A failed visual update is not
		// allowed to make the click gate permissive; selection continues to use
		// the native WindowManager fact and exact down/up validation below.
		updateCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = surfaces.Update(updateCtx, candidate, hasCandidate, measurementDisplays(automation.NewScreen().GetDisplays()))
	}
	selected, err := selectMeasurementReferenceWithFeedback(ctx, manager, observe, feedback)
	if err != nil {
		return measurement.ReferenceSelection{}, err
	}
	return measurement.ReferenceSelection{Reference: measurementReferenceForWindow(selected)}, nil
}

type measurementReferenceSelectionSurfaces struct {
	session     *customui.Session
	dimmers     []*customui.Window
	candidate   *customui.Window
	instruction *customui.Window
}

func newMeasurementReferenceSelectionSurfaces(ctx context.Context, session *customui.Session, displays []measurementDisplayRow) (*measurementReferenceSelectionSurfaces, error) {
	if session == nil {
		return nil, fmt.Errorf("measurement selection session is unavailable")
	}
	surfaces := &measurementReferenceSelectionSurfaces{session: session}
	if err := surfaces.ensureDimmers(ctx, len(displays)*4); err != nil {
		return nil, err
	}
	var err error
	if surfaces.candidate, err = session.Create(ctx, measurementReferenceSelectionWindowSpec(
		"measurement-reference-selection-candidate", customui.ReferenceSelectionRoleCandidate, "")); err != nil {
		return nil, err
	}
	if surfaces.instruction, err = session.Create(ctx, measurementReferenceSelectionWindowSpec(
		"measurement-reference-selection-instruction", customui.ReferenceSelectionRoleInstruction,
		"移动鼠标选择窗口 · 单击开始测量 · Esc 取消")); err != nil {
		return nil, err
	}
	return surfaces, nil
}

func (surfaces *measurementReferenceSelectionSurfaces) ensureDimmers(ctx context.Context, count int) error {
	if surfaces == nil || surfaces.session == nil {
		return fmt.Errorf("measurement selection feedback is unavailable")
	}
	for len(surfaces.dimmers) < count {
		index := len(surfaces.dimmers)
		window, err := surfaces.session.Create(ctx, measurementReferenceSelectionWindowSpec(
			"measurement-reference-selection-dimmer-"+strconv.Itoa(index), customui.ReferenceSelectionRoleDimmer, ""))
		if err != nil {
			return err
		}
		surfaces.dimmers = append(surfaces.dimmers, window)
	}
	return nil
}

func (surfaces *measurementReferenceSelectionSurfaces) Update(ctx context.Context, candidate measurementWindowRow, hasCandidate bool, displays []measurementDisplayRow) error {
	if surfaces == nil || surfaces.candidate == nil || surfaces.instruction == nil {
		return fmt.Errorf("measurement selection feedback is unavailable")
	}
	if !hasCandidate {
		return surfaces.hide(ctx)
	}
	dimmers := measurementReferenceSelectionDimmerBounds(displays, candidate)
	if err := surfaces.ensureDimmers(ctx, len(dimmers)); err != nil {
		return err
	}
	if err := showMeasurementReferenceSelectionWindow(ctx, surfaces.candidate,
		customui.Bounds{X: candidate.x, Y: candidate.y, Width: candidate.width, Height: candidate.height}); err != nil {
		return err
	}
	for index, bounds := range dimmers {
		if err := showMeasurementReferenceSelectionWindow(ctx, surfaces.dimmers[index], bounds); err != nil {
			return err
		}
	}
	for _, dimmer := range surfaces.dimmers[len(dimmers):] {
		if _, err := dimmer.Hide(ctx); err != nil {
			return err
		}
	}
	if instruction, ok := measurementReferenceSelectionInstructionBounds(displays, candidate); ok {
		if err := showMeasurementReferenceSelectionWindow(ctx, surfaces.instruction, instruction); err != nil {
			return err
		}
	} else if _, err := surfaces.instruction.Hide(ctx); err != nil {
		return err
	}
	return nil
}

func (surfaces *measurementReferenceSelectionSurfaces) hide(ctx context.Context) error {
	if surfaces == nil {
		return nil
	}
	for _, window := range append(append([]*customui.Window{}, surfaces.dimmers...), surfaces.candidate, surfaces.instruction) {
		if window == nil {
			continue
		}
		if _, err := window.Hide(ctx); err != nil {
			return err
		}
	}
	return nil
}

func showMeasurementReferenceSelectionWindow(ctx context.Context, window *customui.Window, bounds customui.Bounds) error {
	if window == nil {
		return fmt.Errorf("measurement selection window is unavailable")
	}
	if _, err := window.SetBounds(ctx, bounds); err != nil {
		return err
	}
	_, err := window.Show(ctx)
	return err
}

func measurementReferenceSelectionDimmerBounds(displays []measurementDisplayRow, candidate measurementWindowRow) []customui.Bounds {
	result := make([]customui.Bounds, 0, len(displays)*4)
	for _, display := range displays {
		displayBounds := customui.Bounds{X: display.x, Y: display.y, Width: display.width, Height: display.height}
		focus, intersects := measurementReferenceSelectionIntersection(displayBounds, customui.Bounds{
			X: candidate.x, Y: candidate.y, Width: candidate.width, Height: candidate.height,
		})
		if !intersects {
			result = append(result, displayBounds)
			continue
		}
		if focus.Y > displayBounds.Y {
			result = append(result, customui.Bounds{X: displayBounds.X, Y: displayBounds.Y, Width: displayBounds.Width, Height: focus.Y - displayBounds.Y})
		}
		if focus.X > displayBounds.X {
			result = append(result, customui.Bounds{X: displayBounds.X, Y: focus.Y, Width: focus.X - displayBounds.X, Height: focus.Height})
		}
		right := focus.X + focus.Width
		displayRight := displayBounds.X + displayBounds.Width
		if right < displayRight {
			result = append(result, customui.Bounds{X: right, Y: focus.Y, Width: displayRight - right, Height: focus.Height})
		}
		bottom := focus.Y + focus.Height
		displayBottom := displayBounds.Y + displayBounds.Height
		if bottom < displayBottom {
			result = append(result, customui.Bounds{X: displayBounds.X, Y: bottom, Width: displayBounds.Width, Height: displayBottom - bottom})
		}
	}
	return result
}

func measurementReferenceSelectionIntersection(first, second customui.Bounds) (customui.Bounds, bool) {
	left := first.X
	if second.X > left {
		left = second.X
	}
	top := first.Y
	if second.Y > top {
		top = second.Y
	}
	right := first.X + first.Width
	if second.X+second.Width < right {
		right = second.X + second.Width
	}
	bottom := first.Y + first.Height
	if second.Y+second.Height < bottom {
		bottom = second.Y + second.Height
	}
	if right <= left || bottom <= top {
		return customui.Bounds{}, false
	}
	return customui.Bounds{X: left, Y: top, Width: right - left, Height: bottom - top}, true
}

func measurementReferenceSelectionInstructionBounds(displays []measurementDisplayRow, candidate measurementWindowRow) (customui.Bounds, bool) {
	display, ok := selectMeasurementDisplay(displays, candidate)
	if !ok || display.width <= 16 || display.height <= 48 {
		return customui.Bounds{}, false
	}
	const instructionHeight = 30.0
	width := 340.0
	if available := display.width - 16; width > available {
		width = available
	}
	left := candidate.x
	if left < display.x+8 {
		left = display.x + 8
	}
	if maximum := display.x + display.width - width - 8; left > maximum {
		left = maximum
	}
	top := candidate.y - instructionHeight - 8
	if top < display.y+8 {
		top = candidate.y + candidate.height + 8
	}
	if maximum := display.y + display.height - instructionHeight - 8; top > maximum {
		top = maximum
	}
	if top < display.y+8 {
		return customui.Bounds{}, false
	}
	return customui.Bounds{X: left, Y: top, Width: width, Height: instructionHeight}, true
}

func measurementReferenceSelectionWindowSpec(id, role, label string) customui.WindowSpec {
	content := customui.ContentSpec{BasePath: "."}
	switch role {
	case customui.ReferenceSelectionRoleDimmer:
		content.HTML = `<main id="referenceSelectionDimmer"></main>`
		content.CSS = `html,body,#referenceSelectionDimmer{margin:0;width:100%;height:100%;overflow:hidden;background:rgba(5,12,18,.56);pointer-events:none}`
	case customui.ReferenceSelectionRoleInstruction:
		content.HTML = `<main id="referenceSelectionInstruction">移动鼠标选择窗口 · 单击开始测量 · Esc 取消</main>`
		content.CSS = `html,body,#referenceSelectionInstruction{margin:0;width:100%;height:100%;overflow:hidden;background:rgba(8,18,29,.94);color:#f5fbff;font:600 12px/30px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;border-radius:8px;pointer-events:none}`
	default:
		content.HTML = `<main id="referenceSelectionCandidate"></main>`
		content.CSS = `html,body,#referenceSelectionCandidate{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;box-sizing:border-box;border:2px solid #42b7ff;pointer-events:auto}`
	}
	return customui.WindowSpec{
		ID: id, Kind: "reference-selection", Title: "",
		Bounds: customui.Bounds{X: 0, Y: 0, Width: 1, Height: 1}, AlwaysOnTop: true,
		Content:            content,
		ReferenceSelection: &customui.ReferenceSelectionSurfaceSpec{Role: role, Label: label},
	}
}
