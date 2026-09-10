package customui

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	NotificationMinimumWidth  = 280
	NotificationMaximumWidth  = 480
	NotificationMinimumHeight = 52
	NotificationMaximumHeight = 124
	NotificationMessageLines  = 3
	NotificationCaptionLines  = 2
	MaxNotifications          = 3
)

// NotificationSpec is a bounded native surface, not an HTML window or an OS
// notification. Timers and rendering belong to the UI host, not the JS loop.
type NotificationSpec struct {
	Message         string                `json:"message"`
	Caption         string                `json:"caption"`
	Level           string                `json:"level"`
	TimeoutMS       int64                 `json:"timeoutMs"`
	TimeoutProgress bool                  `json:"timeoutProgress"`
	Closable        bool                  `json:"closable"`
	Progress        *NotificationProgress `json:"progress"`
	Position        NotificationPosition  `json:"position"`
}

type NotificationProgress struct {
	Min           float64 `json:"min"`
	Max           float64 `json:"max"`
	Value         float64 `json:"value"`
	Indeterminate bool    `json:"indeterminate"`
}

func (p *NotificationProgress) UnmarshalJSON(data []byte) error {
	type plain NotificationProgress
	value := plain{Max: 1}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	if _, present := fields["value"]; !present {
		value.Value = value.Min
	}
	*p = NotificationProgress(value)
	return nil
}

// Position is a discriminated union. Target is a same-session FloatingWindow
// id after the Runtime has resolved the public instance-or-id input.
type NotificationPosition struct {
	Mode       string   `json:"mode"`
	X          *float64 `json:"x,omitempty"`
	Y          *float64 `json:"y,omitempty"`
	Horizontal string   `json:"horizontal,omitempty"`
	Vertical   string   `json:"vertical,omitempty"`
	Margin     *float64 `json:"margin,omitempty"`
	Display    string   `json:"display,omitempty"`
	Target     string   `json:"target,omitempty"`
	Side       string   `json:"side,omitempty"`
	Align      string   `json:"align,omitempty"`
	Gap        *float64 `json:"gap,omitempty"`
	Follow     *bool    `json:"follow,omitempty"`
}

type NotificationPatch struct {
	Message         *string               `json:"message,omitempty"`
	Caption         *string               `json:"caption,omitempty"`
	Level           *string               `json:"level,omitempty"`
	TimeoutMS       *int64                `json:"timeoutMs,omitempty"`
	TimeoutProgress *bool                 `json:"timeoutProgress,omitempty"`
	Closable        *bool                 `json:"closable,omitempty"`
	Progress        json.RawMessage       `json:"progress,omitempty"`
	Position        *NotificationPosition `json:"position,omitempty"`
}

type NotificationState struct {
	NotificationSpec
	RemainingMS        int64  `json:"remainingMs"`
	PositionAdjustment string `json:"positionAdjustment,omitempty"`
	CloseReason        string `json:"closeReason,omitempty"`
}

type NotificationUpdate struct {
	Spec         NotificationSpec `json:"spec"`
	ResetTimeout bool             `json:"resetTimeout"`
	Reposition   bool             `json:"reposition"`
}

type NotificationUpdateResult struct {
	Applied bool        `json:"applied"`
	Reason  string      `json:"reason,omitempty"`
	State   WindowState `json:"state"`
}

// Optional extension: existing test/native drivers must not pretend to support
// notifications merely because they implement ordinary windows.
type NotificationDriverWindow interface {
	UpdateNotification(context.Context, NotificationUpdate) (WindowState, error)
}

func DefaultNotificationSpec() NotificationSpec {
	return NotificationSpec{Level: "info", TimeoutMS: 3000, Position: NotificationPosition{Mode: "auto"}}
}

func NormalizeNotification(spec NotificationSpec) (NotificationSpec, error) {
	textOK := func(s string, max int, required bool) bool {
		return utf8.ValidString(s) && !strings.ContainsRune(s, 0) && utf8.RuneCountInString(s) <= max && (!required || strings.TrimSpace(s) != "")
	}
	if !textOK(spec.Message, 1024, true) || !textOK(spec.Caption, 2048, false) {
		return spec, invalidSpec("notification message must contain 1–1024 Unicode characters; caption is limited to 2048; NUL is forbidden")
	}
	switch spec.Level {
	case "info", "success", "warning", "error":
	default:
		return spec, invalidSpec("notification level must be info, success, warning, or error")
	}
	if spec.TimeoutMS < 0 || spec.TimeoutMS > 86400000 {
		return spec, invalidSpec("notification timeoutMs must be an integer from 0 to 86400000")
	}
	// A persistent notification must never become an input-transparent surface
	// with no user-controlled exit. Script close and execution teardown remain
	// available, but timeoutMs:0 also guarantees a visible native close button.
	if spec.TimeoutMS == 0 {
		spec.Closable = true
	}
	if spec.Progress != nil {
		p := *spec.Progress
		if !finiteNotification(p.Min) || !finiteNotification(p.Max) || !finiteNotification(p.Value) || p.Max <= p.Min || p.Value < p.Min || p.Value > p.Max {
			return spec, invalidSpec("notification progress requires finite min < max and min <= value <= max")
		}
		spec.Progress = &p
	}
	position, err := normalizeNotificationPosition(spec.Position)
	if err != nil {
		return spec, err
	}
	spec.Position = position
	return spec, nil
}

func normalizeNotificationPosition(p NotificationPosition) (NotificationPosition, error) {
	bad := func() (NotificationPosition, error) {
		return p, invalidSpec("notification position must use exactly one of auto, absolute, anchor, or relative, without mixing members")
	}
	anchor := p.Horizontal != "" || p.Vertical != "" || p.Margin != nil || p.Display != ""
	relative := p.Target != "" || p.Side != "" || p.Align != "" || p.Gap != nil || p.Follow != nil
	absolute := p.X != nil || p.Y != nil
	switch p.Mode {
	case "auto":
		if anchor || relative || absolute {
			return bad()
		}
	case "absolute":
		if anchor || relative || p.X == nil || p.Y == nil || !finiteNotification(*p.X) || !finiteNotification(*p.Y) {
			return bad()
		}
	case "anchor":
		if relative || absolute {
			return bad()
		}
		margin := 24.0
		if p.Margin != nil {
			margin = *p.Margin
		}
		v, err := NormalizeInitialWindowPlacement(WindowPlacement{Horizontal: p.Horizontal, Vertical: p.Vertical, Display: p.Display, Margin: margin})
		if err != nil {
			return p, err
		}
		p.Horizontal, p.Vertical, p.Display = v.Horizontal, v.Vertical, v.Display
		p.Margin = &v.Margin
	case "relative":
		if anchor || absolute || !publicIDPattern.MatchString(p.Target) {
			return bad()
		}
		if p.Side == "" {
			p.Side = "bottom"
		}
		if p.Align == "" {
			p.Align = "center"
		}
		if p.Side != "bottom" && p.Side != "top" && p.Side != "left" && p.Side != "right" {
			return bad()
		}
		if p.Align != "start" && p.Align != "center" && p.Align != "end" {
			return bad()
		}
		if p.Gap == nil {
			gap := 8.0
			p.Gap = &gap
		}
		if !finiteNotification(*p.Gap) || *p.Gap < 0 || *p.Gap > 256 {
			return bad()
		}
		if p.Follow == nil {
			follow := true
			p.Follow = &follow
		}
	default:
		return bad()
	}
	return p, nil
}

func MergeNotification(current NotificationSpec, patch NotificationPatch) (NotificationSpec, error) {
	next := current
	if patch.Message != nil {
		next.Message = *patch.Message
	}
	if patch.Caption != nil {
		next.Caption = *patch.Caption
	}
	if patch.Level != nil {
		next.Level = *patch.Level
	}
	if patch.TimeoutMS != nil {
		next.TimeoutMS = *patch.TimeoutMS
	}
	if patch.TimeoutProgress != nil {
		next.TimeoutProgress = *patch.TimeoutProgress
	}
	if patch.Closable != nil {
		next.Closable = *patch.Closable
	}
	if patch.Position != nil {
		next.Position = *patch.Position
	}
	if len(patch.Progress) != 0 {
		if bytes.Equal(bytes.TrimSpace(patch.Progress), []byte("null")) {
			next.Progress = nil
		} else {
			var progress NotificationProgress
			if err := json.Unmarshal(patch.Progress, &progress); err != nil {
				return next, invalidSpec("invalid notification progress: " + err.Error())
			}
			next.Progress = &progress
		}
	}
	return NormalizeNotification(next)
}

func finiteNotification(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

// NotificationPreferredSize gives deterministic non-GUI drivers and the
// initial process-driver request a bounded layout. Real native hosts measure
// with their platform fonts and return their applied size, clamped to the same
// public width and height limits.
func NotificationPreferredSize(spec NotificationSpec) Bounds {
	chromeWidth := 32.0
	if spec.Closable {
		chromeWidth = 60
	}
	width := math.Max(
		notificationEstimatedTextWidth(spec.Message, 14),
		notificationEstimatedTextWidth(spec.Caption, 11),
	) + chromeWidth
	width = math.Max(NotificationMinimumWidth, math.Min(NotificationMaximumWidth, math.Ceil(width)))
	contentWidth := width - chromeWidth
	messageLines := notificationEstimatedLines(spec.Message, contentWidth, 14, NotificationMessageLines)
	height := 10.0 + float64(messageLines*18) + 10
	if spec.Caption != "" {
		captionLines := notificationEstimatedLines(spec.Caption, contentWidth, 11, NotificationCaptionLines)
		height += 3 + float64(captionLines*14)
	}
	if spec.Progress != nil {
		height += 10
	}
	height = math.Max(NotificationMinimumHeight, math.Min(NotificationMaximumHeight, math.Ceil(height)))
	return Bounds{Width: width, Height: height}
}

func notificationEstimatedTextWidth(text string, fontSize float64) float64 {
	maximumUnits := 0
	for _, logical := range strings.Split(text, "\n") {
		units := notificationTextUnits(logical)
		if units > maximumUnits {
			maximumUnits = units
		}
	}
	return float64(maximumUnits) * fontSize * 0.55
}

func notificationEstimatedLines(text string, width, fontSize float64, maximum int) int {
	capacity := int(math.Floor(width / (fontSize * 0.55)))
	if capacity < 1 {
		capacity = 1
	}
	lines := 0
	for _, logical := range strings.Split(text, "\n") {
		units := notificationTextUnits(logical)
		lines += int(math.Max(1, math.Ceil(float64(units)/float64(capacity))))
		if lines >= maximum {
			return maximum
		}
	}
	if lines < 1 {
		return 1
	}
	return lines
}

func notificationTextUnits(text string) int {
	units := 0
	for _, r := range text {
		switch {
		case unicode.Is(unicode.Mn, r), unicode.Is(unicode.Me, r):
			continue
		case r >= 0x1100:
			units += 2
		default:
			units++
		}
	}
	return units
}

func (w *Window) UpdateNotification(ctx context.Context, patch NotificationPatch) (NotificationUpdateResult, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	if w.spec.Notification == nil {
		return NotificationUpdateResult{}, invalidSpec("window is not a notification")
	}
	next, err := MergeNotification(*w.spec.Notification, patch)
	if err != nil {
		return NotificationUpdateResult{}, withUIErrorContext(err, "notification.update", w.ID(), "")
	}
	if err := w.session.validateNotificationTarget(next.Position); err != nil {
		return NotificationUpdateResult{}, err
	}
	if w.Status() == StatusClosed {
		return NotificationUpdateResult{Applied: false, Reason: "closed", State: w.cachedState()}, nil
	}
	driver, ok := w.driver.(NotificationDriverWindow)
	if !ok {
		return NotificationUpdateResult{}, &Error{Code: CodeUnsupportedCapability, Operation: "notification.update", Capability: "notify", Message: "native driver does not support notifications"}
	}
	state, err := driver.UpdateNotification(ctx, NotificationUpdate{Spec: next, ResetTimeout: patch.TimeoutMS != nil, Reposition: patch.Position != nil})
	if err != nil {
		if w.Status() == StatusClosed {
			return NotificationUpdateResult{Reason: "closed", State: w.cachedState()}, nil
		}
		return NotificationUpdateResult{}, wrapDriver("notification.update", w.ID(), err)
	}
	w.setState(state)
	w.spec.Notification = &next
	if state.Status == StatusClosed {
		return NotificationUpdateResult{Reason: "closed", State: w.cachedState()}, nil
	}
	return NotificationUpdateResult{Applied: true, State: w.cachedState()}, nil
}

func (s *Session) validateNotificationTarget(position NotificationPosition) error {
	if position.Mode != "relative" {
		return nil
	}
	target, ok := s.Window(position.Target)
	if !ok || target.spec.Toolbar == nil {
		return &Error{Code: CodeNotFound, Operation: "notify", TargetID: position.Target, Message: "notification target must be a FloatingWindow in the current execution"}
	}
	return nil
}

func normalizeNotificationWindow(spec WindowSpec) (WindowSpec, error) {
	if spec.Kind != "notification" || spec.Toolbar != nil || spec.Content.HTML != "" || spec.Content.File != "" || spec.Placement != nil {
		return WindowSpec{}, invalidSpec("notification is a dedicated host-owned native surface")
	}
	notification, err := NormalizeNotification(*spec.Notification)
	if err != nil {
		return WindowSpec{}, err
	}
	spec.Notification = &notification
	spec.AlwaysOnTop, spec.Draggable = true, false
	spec.Bounds = NotificationPreferredSize(notification)
	spec.Controls = []Control{}
	return spec, nil
}

func (w *processWindow) UpdateNotification(ctx context.Context, update NotificationUpdate) (WindowState, error) {
	return w.stateCall(ctx, "updateNotification", update)
}

// NotificationRectangle is shared with offline layout tests. Native hosts use
// their actual monitor work area and native parent frame, never screenshot pixels.
func NotificationRectangle(position NotificationPosition, workArea Bounds, parent *Bounds, size Bounds) (Bounds, string, error) {
	var err error
	position, err = normalizeNotificationPosition(position)
	if err != nil {
		return Bounds{}, "", err
	}
	if !validBounds(workArea) {
		return Bounds{}, "", invalidSpec("work area must have finite bounds")
	}
	if parent != nil && !validBounds(*parent) {
		return Bounds{}, "", invalidSpec("parent must have finite bounds")
	}
	if size.Width < NotificationMinimumWidth || size.Width > NotificationMaximumWidth || size.Height < NotificationMinimumHeight || size.Height > NotificationMaximumHeight {
		return Bounds{}, "", invalidSpec("notification size must use the bounded native width and height")
	}
	frame := Bounds{Width: size.Width, Height: size.Height}
	if workArea.Width < frame.Width+32 || workArea.Height < frame.Height+32 {
		return frame, "", invalidSpec("display work area cannot fit notification")
	}
	bottom := func() Bounds {
		return Bounds{X: workArea.X + (workArea.Width-frame.Width)/2, Y: workArea.Y + workArea.Height - frame.Height - 24, Width: frame.Width, Height: frame.Height}
	}
	fits := func(r Bounds) bool {
		return r.X >= workArea.X && r.Y >= workArea.Y && r.X+r.Width <= workArea.X+workArea.Width && r.Y+r.Height <= workArea.Y+workArea.Height
	}
	switch position.Mode {
	case "auto":
		return bottom(), "", nil
	case "absolute":
		frame.X, frame.Y = *position.X, *position.Y
		if !fits(frame) {
			return frame, "", invalidSpec("absolute notification lies outside selected work area")
		}
		return frame, "", nil
	case "anchor":
		returnFrame, err := ResolveWindowPlacement(frame, WindowPlacement{Horizontal: position.Horizontal, Vertical: position.Vertical, Display: position.Display, Margin: *position.Margin}, workArea)
		return returnFrame, "", err
	case "relative":
		if parent == nil {
			return bottom(), "target-unavailable", nil
		}
		gap := *position.Gap
		place := func(side string) Bounds {
			r := frame
			switch side {
			case "top", "bottom":
				r.X = parent.X + (parent.Width-r.Width)/2
				if position.Align == "start" {
					r.X = parent.X
				}
				if position.Align == "end" {
					r.X = parent.X + parent.Width - r.Width
				}
				if side == "top" {
					r.Y = parent.Y - r.Height - gap
				} else {
					r.Y = parent.Y + parent.Height + gap
				}
			case "left", "right":
				r.Y = parent.Y + (parent.Height-r.Height)/2
				if position.Align == "start" {
					r.Y = parent.Y
				}
				if position.Align == "end" {
					r.Y = parent.Y + parent.Height - r.Height
				}
				if side == "left" {
					r.X = parent.X - r.Width - gap
				} else {
					r.X = parent.X + parent.Width + gap
				}
			}
			return r
		}
		if r := place(position.Side); fits(r) {
			return r, "", nil
		}
		opposite := map[string]string{"bottom": "top", "top": "bottom", "left": "right", "right": "left"}[position.Side]
		if r := place(opposite); fits(r) {
			return r, "flipped-" + opposite, nil
		}
		return bottom(), "work-area-fallback", nil
	}
	return frame, "", fmt.Errorf("notification position is not normalized")
}
