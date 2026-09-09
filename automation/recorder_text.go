package automation

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
	"unicode/utf16"
)

const (
	recorderTextSampleInterval  = 40 * time.Millisecond
	recorderTextSampleFreshness = 750 * time.Millisecond
	recorderTextSettleInterval  = 120 * time.Millisecond
)

type recorderTextFieldSample struct {
	ObservedAt time.Time
	Window     *recorderWindowSnapshot
	Element    recorderElementDescriptor
	Value      string
}

type recorderTextSignal struct {
	Event recorderRawEvent
}

type recorderTextFingerprint struct {
	SHA256     string `json:"sha256"`
	UTF16Units int    `json:"utf16Units"`
}

type recorderTextPatch struct {
	Unit        string `json:"unit"`
	Start       int    `json:"start"`
	DeleteCount int    `json:"deleteCount"`
	InsertText  string `json:"insertText"`
}

type recorderTextEdit struct {
	ID             string                    `json:"id"`
	Status         string                    `json:"status"`
	SourceEventIDs []string                  `json:"sourceEventIds"`
	Window         *recorderWindowSnapshot   `json:"window"`
	Element        recorderElementDescriptor `json:"element"`
	Before         recorderTextFingerprint   `json:"before"`
	Patch          recorderTextPatch         `json:"patch"`
	After          recorderTextFingerprint   `json:"after"`
	ObservedAt     string                    `json:"observedAt"`
}

type recorderTextSegment struct {
	before    *recorderTextFieldSample
	after     *recorderTextFieldSample
	eventIDs  []string
	seen      map[string]bool
	lastInput time.Time
}

func (s *recorderSession) signalTextTrackerLocked(event recorderRawEvent) {
	if s == nil || !s.options.CaptureKeyboard || s.owner == nil || s.owner.textProbe == nil || s.textSignals == nil {
		return
	}
	select {
	case s.textSignals <- recorderTextSignal{Event: event}:
	default:
		s.textSignalsDropped.Add(1)
	}
}

func (s *recorderSession) runTextTracker() {
	defer close(s.textDone)
	if s == nil || !s.options.CaptureKeyboard || s.owner == nil || s.owner.textProbe == nil {
		for range s.textSignals {
		}
		return
	}

	var latest *recorderTextFieldSample
	var segment *recorderTextSegment
	appendEvent := func(event recorderRawEvent) {
		if segment == nil || segment.seen[event.EventID] {
			return
		}
		segment.seen[event.EventID] = true
		segment.eventIDs = append(segment.eventIDs, event.EventID)
	}
	finishSegment := func() {
		if segment == nil {
			return
		}
		before, after := segment.before, segment.after
		if before != nil && after != nil && len(segment.eventIDs) > 0 && recorderSameTextField(before, after) && before.Value != after.Value {
			patch := recorderBuildTextPatch(before.Value, after.Value)
			if len([]rune(patch.InsertText)) > recorderMaxTextActionRunes {
				s.addIssue("text-edit-too-large", "error", "a focused text edit exceeds the basic text action limit", segment.eventIDs[0])
			} else {
				observation := recorderTextEdit{
					Status: "verified", SourceEventIDs: append([]string(nil), segment.eventIDs...),
					Window: recorderCloneWindowSnapshot(before.Window), Element: before.Element,
					Before: recorderFingerprintText(before.Value), Patch: patch, After: recorderFingerprintText(after.Value),
					ObservedAt: after.ObservedAt.UTC().Format(time.RFC3339Nano),
				}
				s.textMu.Lock()
				observation.ID = fmt.Sprintf("t%04d", len(s.textEdits)+1)
				s.textEdits = append(s.textEdits, observation)
				s.textMu.Unlock()
			}
		}
		segment = nil
	}
	acceptSample := func(sample *recorderTextFieldSample) {
		if sample == nil {
			return
		}
		if segment != nil {
			if recorderSameTextField(segment.before, sample) {
				copy := *sample
				segment.after = &copy
				latest = &copy
				return
			}
			finishSegment()
		}
		copy := *sample
		latest = &copy
	}
	probe := func() {
		active, err := s.owner.windowProbe()
		if err != nil || active == nil {
			return
		}
		observedAt := time.Now().UTC()
		window, err := recorderSnapshotWindow(active, observedAt)
		if err != nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), recorderContextFreshness)
		sample, err := s.owner.textProbe(ctx, active, window)
		cancel()
		if err == nil {
			acceptSample(sample)
		}
	}
	startSegment := func(event recorderRawEvent) {
		if segment != nil {
			appendEvent(event)
			segment.lastInput = time.Now()
			return
		}
		receivedAt, err := time.Parse(time.RFC3339Nano, event.ReceivedAt)
		if err != nil || latest == nil || latest.ObservedAt.After(receivedAt) || receivedAt.Sub(latest.ObservedAt) > recorderTextSampleFreshness {
			return
		}
		before := *latest
		after := before
		segment = &recorderTextSegment{before: &before, after: &after, seen: map[string]bool{}, lastInput: time.Now()}
		appendEvent(event)
	}
	handle := func(event recorderRawEvent) {
		switch event.LibraryEvent {
		case "RECORDER_PAUSED", "RECORDER_RESUMED", "RECORDER_CONTROL_CLICK", "MOUSE_PRESSED", "MOUSE_DRAGGED", "MOUSE_WHEEL":
			finishSegment()
			if event.LibraryEvent == "RECORDER_RESUMED" {
				latest = nil
				probe()
			}
			return
		case "MOUSE_RELEASED", "MOUSE_CLICKED":
			probe()
			return
		case "KEY_PRESSED", "KEY_RELEASED", "KEY_TYPED":
		default:
			return
		}

		if event.LibraryEvent != "KEY_TYPED" {
			if event.Keycode == nil {
				finishSegment()
				return
			}
			if recorderIsModifierKey(*event.Keycode) {
				if segment != nil {
					appendEvent(event)
					segment.lastInput = time.Now()
				}
				return
			}
		}
		startSegment(event)
		probe()
	}

	probe()
	ticker := time.NewTicker(recorderTextSampleInterval)
	defer ticker.Stop()
	for {
		select {
		case signal, ok := <-s.textSignals:
			if !ok {
				time.Sleep(2 * recorderTextSampleInterval)
				probe()
				finishSegment()
				return
			}
			handle(signal.Event)
		case <-ticker.C:
			probe()
			if segment != nil && !segment.lastInput.IsZero() && time.Since(segment.lastInput) >= recorderTextSettleInterval {
				finishSegment()
			}
		}
	}
}

func recorderCloneWindowSnapshot(value *recorderWindowSnapshot) *recorderWindowSnapshot {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func recorderCloneElementDescriptor(value recorderElementDescriptor) *recorderElementDescriptor {
	copy := value
	copy.NativeActions = append(make([]string, 0, len(value.NativeActions)), value.NativeActions...)
	return &copy
}

func recorderTextEditHasAmbiguousIMEBoundary(edit recorderTextEdit, events map[string]recorderRawEvent) bool {
	nonASCII := false
	for _, value := range edit.Patch.InsertText {
		if value > 0x7f {
			nonASCII = true
			break
		}
	}
	if !nonASCII {
		return false
	}
	for _, eventID := range edit.SourceEventIDs {
		event := events[eventID]
		if event.Keycode != nil && (*event.Keycode == 0x001c || *event.Keycode == 0x0e1c || *event.Keycode == 0x000f) {
			return true
		}
	}
	return false
}

func recorderSameTextField(left, right *recorderTextFieldSample) bool {
	if left == nil || right == nil || left.Window == nil || right.Window == nil {
		return false
	}
	if left.Window.Application.IdentityKind != right.Window.Application.IdentityKind || left.Window.Application.IdentityValue != right.Window.Application.IdentityValue || left.Window.ID != right.Window.ID {
		return false
	}
	if left.Element.NativeRole != right.Element.NativeRole {
		return false
	}
	if left.Element.Identifier != "" || right.Element.Identifier != "" {
		return left.Element.Identifier != "" && left.Element.Identifier == right.Element.Identifier
	}
	return left.Element.Name == right.Element.Name && left.Element.Bounds == right.Element.Bounds
}

func recorderFingerprintText(value string) recorderTextFingerprint {
	units := utf16.Encode([]rune(value))
	payload := make([]byte, len(units)*2)
	for index, unit := range units {
		binary.LittleEndian.PutUint16(payload[index*2:], unit)
	}
	digest := sha256.Sum256(payload)
	return recorderTextFingerprint{SHA256: hex.EncodeToString(digest[:]), UTF16Units: len(units)}
}

func recorderBuildTextPatch(before, after string) recorderTextPatch {
	left, right := []rune(before), []rune(after)
	prefix := 0
	for prefix < len(left) && prefix < len(right) && left[prefix] == right[prefix] {
		prefix++
	}
	suffix := 0
	for suffix < len(left)-prefix && suffix < len(right)-prefix && left[len(left)-1-suffix] == right[len(right)-1-suffix] {
		suffix++
	}
	start := len(utf16.Encode(left[:prefix]))
	deleted := len(utf16.Encode(left[prefix : len(left)-suffix]))
	return recorderTextPatch{
		Unit: "utf16-code-unit", Start: start, DeleteCount: deleted,
		InsertText: string(right[prefix : len(right)-suffix]),
	}
}

func recorderApplyTextPatch(value string, patch recorderTextPatch) (string, bool) {
	if patch.Unit != "utf16-code-unit" || patch.Start < 0 || patch.DeleteCount < 0 {
		return "", false
	}
	units := utf16.Encode([]rune(value))
	if patch.Start > len(units) || patch.DeleteCount > len(units)-patch.Start {
		return "", false
	}
	insert := utf16.Encode([]rune(patch.InsertText))
	result := append([]uint16(nil), units[:patch.Start]...)
	result = append(result, insert...)
	result = append(result, units[patch.Start+patch.DeleteCount:]...)
	decoded := string(utf16.Decode(result))
	if strings.ContainsRune(decoded, '\uFFFD') && !strings.ContainsRune(value, '\uFFFD') && !strings.ContainsRune(patch.InsertText, '\uFFFD') {
		return "", false
	}
	return decoded, true
}

func recorderIsTextEditingKey(code uint16) bool {
	if code == 0 || recorderIsModifierKey(code) {
		return false
	}
	switch code {
	case 0x0001, // Escape
		0x000f,         // Tab
		0x001c, 0x0e1c, // Enter and numeric-keypad Enter
		0x003b, 0x003c, 0x003d, 0x003e, 0x003f, 0x0040, 0x0041, 0x0042, 0x0043, 0x0044, 0x0057, 0x0058,
		0xe048, 0xe04b, 0xe04d, 0xe050, // arrows
		0x0e47, 0x0e4f, 0x0e49, 0x0e51, 0x0e52: // navigation/insert
		return false
	default:
		return true
	}
}

func recorderKeyName(code uint16) (string, bool) {
	letterMap := map[uint16]string{0x0030: "B", 0x002e: "C", 0x0020: "D", 0x0012: "E", 0x0021: "F", 0x0022: "G", 0x0023: "H", 0x0017: "I", 0x0024: "J", 0x0025: "K", 0x0026: "L", 0x0032: "M", 0x0031: "N", 0x0018: "O", 0x0019: "P", 0x0010: "Q", 0x0013: "R", 0x001f: "S", 0x0014: "T", 0x0016: "U", 0x002f: "V", 0x0011: "W", 0x002d: "X", 0x0015: "Y", 0x002c: "Z"}
	letterMap[0x001e] = "A"
	if name, ok := letterMap[code]; ok {
		return name, true
	}
	keyMap := map[uint16]string{
		0x0001: "Escape", 0x0002: "1", 0x0003: "2", 0x0004: "3", 0x0005: "4", 0x0006: "5", 0x0007: "6", 0x0008: "7", 0x0009: "8", 0x000a: "9", 0x000b: "0",
		0x000c: "-", 0x000d: "=", 0x000e: "Backspace", 0x000f: "Tab", 0x001a: "[", 0x001b: "]", 0x002b: "\\", 0x0027: ";", 0x0028: "'", 0x001c: "Enter", 0x0e1c: "Enter", 0x0033: ",", 0x0034: ".", 0x0035: "/", 0x0039: "Space",
		0x0e53: "Delete", 0x0e47: "Home", 0x0e4f: "End", 0x0e49: "PageUp", 0x0e51: "PageDown", 0xe048: "ArrowUp", 0xe04b: "ArrowLeft", 0xe04d: "ArrowRight", 0xe050: "ArrowDown",
	}
	if code >= 0x003b && code <= 0x0044 {
		return fmt.Sprintf("F%d", int(code-0x003b)+1), true
	}
	if name, ok := keyMap[code]; ok {
		return name, true
	}
	return "", false
}

func recorderShortcutKeys(mask uint16, primary string) []string {
	keys := make([]string, 0, 5)
	if mask&((1<<1)|(1<<5)) != 0 {
		keys = append(keys, "Control")
	}
	if mask&((1<<2)|(1<<6)) != 0 {
		keys = append(keys, "Meta")
	}
	if mask&((1<<3)|(1<<7)) != 0 {
		keys = append(keys, "Alt")
	}
	if mask&((1<<0)|(1<<4)) != 0 {
		keys = append(keys, "Shift")
	}
	return append(keys, primary)
}
