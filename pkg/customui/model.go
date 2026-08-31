package customui

import (
	"context"
	"time"
)

const ProtocolVersion = "1.0.0"

type ActivationSource string

const (
	ActivationDisabled      ActivationSource = "disabled"
	ActivationCLI           ActivationSource = "cli"
	ActivationProjectConfig ActivationSource = "projectConfig"
	ActivationHTTPRequest   ActivationSource = "httpRequest"
)

type WindowStatus string

const (
	StatusCreating WindowStatus = "creating"
	StatusHidden   WindowStatus = "hidden"
	StatusVisible  WindowStatus = "visible"
	StatusClosing  WindowStatus = "closing"
	StatusClosed   WindowStatus = "closed"
	StatusFailed   WindowStatus = "failed"
)

type Bounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type ContentSpec struct {
	File     string            `json:"file,omitempty"`
	HTML     string            `json:"html,omitempty"`
	CSSFile  string            `json:"cssFile,omitempty"`
	CSS      string            `json:"css,omitempty"`
	BasePath string            `json:"basePath,omitempty"`
	Assets   map[string]string `json:"assets,omitempty"`
}

type WindowSpec struct {
	ID          string      `json:"id"`
	Kind        string      `json:"kind,omitempty"`
	Title       string      `json:"title,omitempty"`
	Bounds      Bounds      `json:"bounds"`
	AlwaysOnTop bool        `json:"alwaysOnTop,omitempty"`
	Draggable   bool        `json:"draggable,omitempty"`
	Theme       string      `json:"theme,omitempty"`
	Content     ContentSpec `json:"content"`
	Controls    []Control   `json:"controls,omitempty"`
}

type Control struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Order int    `json:"order"`
}

type Capabilities struct {
	ProtocolVersion  string           `json:"protocolVersion"`
	Enabled          bool             `json:"enabled"`
	Available        bool             `json:"available"`
	ActivationSource ActivationSource `json:"activationSource"`
	Platform         string           `json:"platform"`
	Driver           string           `json:"driver"`
	MaxSessions      int              `json:"maxSessions"`
	Window           map[string]bool  `json:"window"`
	Controls         []string         `json:"controls"`
	Reason           string           `json:"reason,omitempty"`
}

type DriverResourceCounts struct {
	Sinks         int
	HostProcesses int
}

type DriverResourceReporter interface {
	ResourceCounts() DriverResourceCounts
}

type WindowState struct {
	ID             string       `json:"id"`
	SessionID      string       `json:"sessionId"`
	Status         WindowStatus `json:"status"`
	Visible        bool         `json:"visible"`
	Bounds         Bounds       `json:"bounds"`
	AlwaysOnTop    bool         `json:"alwaysOnTop"`
	Draggable      bool         `json:"draggable"`
	HostPID        int          `json:"hostPid,omitempty"`
	NativeWindowID int64        `json:"nativeWindowId,omitempty"`
	OnScreen       bool         `json:"onScreen"`
	Layer          int          `json:"layer"`
	Alpha          float64      `json:"alpha"`
	Revision       uint64       `json:"revision"`
	LastSequence   uint64       `json:"lastSequence"`
}

type ControlState struct {
	ID           string         `json:"id"`
	Type         string         `json:"type"`
	Text         string         `json:"text,omitempty"`
	Value        any            `json:"value,omitempty"`
	Checked      *bool          `json:"checked,omitempty"`
	Disabled     bool           `json:"disabled"`
	Visible      bool           `json:"visible"`
	Classes      []string       `json:"classes,omitempty"`
	LocalBounds  Bounds         `json:"localBounds"`
	ScreenBounds Bounds         `json:"screenBounds"`
	Extra        map[string]any `json:"extra,omitempty"`
}

type ControlPatch struct {
	Text     *string        `json:"text,omitempty"`
	Value    any            `json:"value,omitempty"`
	Checked  *bool          `json:"checked,omitempty"`
	Disabled *bool          `json:"disabled,omitempty"`
	Visible  *bool          `json:"visible,omitempty"`
	Classes  []string       `json:"classes,omitempty"`
	Source   *string        `json:"source,omitempty"`
	Options  []SelectOption `json:"options,omitempty"`
}

type SelectOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type Event struct {
	SessionID string         `json:"sessionId"`
	WindowID  string         `json:"windowId"`
	TargetID  string         `json:"targetId,omitempty"`
	Type      string         `json:"type"`
	Sequence  uint64         `json:"sequence"`
	Timestamp time.Time      `json:"timestamp"`
	Value     any            `json:"value,omitempty"`
	Checked   *bool          `json:"checked,omitempty"`
	Bounds    *Bounds        `json:"bounds,omitempty"`
	Reason    string         `json:"reason,omitempty"`
	Fields    map[string]any `json:"fields,omitempty"`
}

func IsPublicEventType(eventType string) bool {
	switch eventType {
	case "*", "click", "change", "input", "move", "resize", "close":
		return true
	default:
		return false
	}
}

// Driver and DriverWindow exchange plain Go data only. Neither side may retain
// a Goja Runtime or JavaScript callback.
type Driver interface {
	Capabilities(context.Context) Capabilities
	Create(context.Context, string, WindowSpec, func(Event)) (DriverWindow, error)
	CloseSession(context.Context, string) error
	Close() error
}

type DriverWindow interface {
	Show(context.Context) (WindowState, error)
	Hide(context.Context) (WindowState, error)
	Close(context.Context) (WindowState, error)
	SetBounds(context.Context, Bounds) (WindowState, error)
	SetAlwaysOnTop(context.Context, bool) (WindowState, error)
	SetDraggable(context.Context, bool) (WindowState, error)
	State(context.Context) (WindowState, error)
	ControlState(context.Context, string) (ControlState, error)
	UpdateControl(context.Context, string, ControlPatch) (ControlState, error)
}
