package customui

import (
	"context"
	"opendesk/pkg/customui/toolbar"
	"time"
)

// ProtocolVersion advances with native-host schema changes so an older host
// cannot silently accept a host-owned Measurement surface declaration.
const ProtocolVersion = "1.13.0"

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

type WindowPlacement struct {
	Horizontal string  `json:"horizontal"`
	Vertical   string  `json:"vertical"`
	Margin     float64 `json:"margin,omitempty"`
	Display    string  `json:"display,omitempty"`
}

// RelativePlacement positions a window beside a current logical-desktop
// anchor. The native host owns display and work-area selection.
type RelativePlacement struct {
	Anchor         Bounds   `json:"anchor"`
	PreferredSides []string `json:"preferredSides"`
	Align          string   `json:"align,omitempty"`
	Gap            float64  `json:"gap,omitempty"`
}

type ContentSpec struct {
	File string `json:"file,omitempty"`
	// HTML accepts restricted inline markup. During Normalize, a relative
	// .html or .htm value is resolved as a script-relative file and replaced
	// with its contents before it reaches a driver.
	HTML     string            `json:"html,omitempty"`
	CSSFile  string            `json:"cssFile,omitempty"`
	CSS      string            `json:"css,omitempty"`
	BasePath string            `json:"basePath,omitempty"`
	Assets   map[string]string `json:"assets,omitempty"`
}

type WindowSpec struct {
	ID               string           `json:"id"`
	Kind             string           `json:"kind,omitempty"`
	Title            string           `json:"title,omitempty"`
	Chrome           string           `json:"chrome,omitempty"`
	Bounds           Bounds           `json:"bounds"`
	AlwaysOnTop      bool             `json:"alwaysOnTop,omitempty"`
	Draggable        bool             `json:"draggable,omitempty"`
	Placement        *WindowPlacement `json:"placement,omitempty"`
	KeyEvents        bool             `json:"keyEvents,omitempty"`
	InteractionGroup string           `json:"interactionGroup,omitempty"`
	// CenterOnActiveDisplay is reserved for host-owned surfaces such as Dialog.
	// It is intentionally not present in the JavaScript Custom UI declaration.
	// The native host resolves it from the current display at creation time.
	CenterOnActiveDisplay bool                 `json:"centerOnActiveDisplay,omitempty"`
	Theme                 string               `json:"theme,omitempty"`
	Content               ContentSpec          `json:"content,omitempty"`
	Toolbar               *toolbar.ToolbarSpec `json:"toolbar,omitempty"`
	Controls              []Control            `json:"controls,omitempty"`
	Notification          *NotificationSpec    `json:"notification,omitempty"`
	// Measurement is a host-owned surface extension. Public JavaScript cannot
	// declare it: automation/custom_ui.go decodes a deliberately narrower
	// declaration. It gives the first-party Measurement service bounded pointer
	// and keyboard events for one already-validated image control without
	// enabling document scripts or a second desktop-input framework.
	Measurement *MeasurementSurfaceSpec `json:"measurement,omitempty"`
	// AppCloseBehavior is host-owned App Mode policy. It is absent from the
	// public JavaScript declaration and is injected only for window.mainId.
	AppCloseBehavior string `json:"appCloseBehavior,omitempty"`
}

type MeasurementSurfaceSpec struct {
	TargetID string `json:"targetId"`
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

// SessionDriverResourceReporter reports resources owned by one execution
// session. A native host may be shared by several execution-scoped drivers,
// so lifecycle cleanup must not count another session's windows or host.
type SessionDriverResourceReporter interface {
	ResourceCountsForSession(sessionID string) DriverResourceCounts
}

type WindowState struct {
	ID             string             `json:"id"`
	SessionID      string             `json:"sessionId"`
	Status         WindowStatus       `json:"status"`
	Visible        bool               `json:"visible"`
	Bounds         Bounds             `json:"bounds"`
	AlwaysOnTop    bool               `json:"alwaysOnTop"`
	Draggable      bool               `json:"draggable"`
	HostPID        int                `json:"hostPid,omitempty"`
	NativeWindowID int64              `json:"nativeWindowId,omitempty"`
	OnScreen       bool               `json:"onScreen"`
	Layer          int                `json:"layer"`
	Alpha          float64            `json:"alpha"`
	Revision       uint64             `json:"revision"`
	LastSequence   uint64             `json:"lastSequence"`
	Notification   *NotificationState `json:"notification,omitempty"`
}

type ControlState struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	// Source is the validated local image source for an img control. Keeping it
	// in internal driver readback lets host-owned renderers prove that an image
	// was patched in place instead of silently replacing its native window.
	Source string `json:"source,omitempty"`
	// Image readiness is already measured by both native HTML bridges. Expose the
	// generic browser facts through the normal control-state contract so callers
	// can wait for a decoded image without adding feature-specific host events.
	ImageComplete      *bool    `json:"imageComplete,omitempty"`
	ImageNaturalWidth  *float64 `json:"imageNaturalWidth,omitempty"`
	ImageNaturalHeight *float64 `json:"imageNaturalHeight,omitempty"`
	// Text is intentionally present even when empty. Custom UI callers use an
	// empty text readback to clear reusable controls (for example, empty slots
	// in the Recorder history window); omitting it turns a successful clear into
	// an indistinguishable undefined value in JavaScript.
	Text string `json:"text"`
	Icon string `json:"icon,omitempty"`
	// IconPresentation is present only for FloatingWindow buttons. It records
	// the reviewed built-in symbol recipe or validated raster metadata; caller
	// paths and encoded bytes are never returned by the native host.
	IconPresentation  *ToolbarIconPresentation `json:"iconPresentation,omitempty"`
	AccessibilityName string                   `json:"accessibilityName,omitempty"`
	Value             any                      `json:"value,omitempty"`
	Checked           *bool                    `json:"checked,omitempty"`
	Active            bool                     `json:"active"`
	Disabled          bool                     `json:"disabled"`
	Busy              bool                     `json:"busy"`
	Error             string                   `json:"error,omitempty"`
	Visible           bool                     `json:"visible"`
	Classes           []string                 `json:"classes,omitempty"`
	LocalBounds       Bounds                   `json:"localBounds"`
	ScreenBounds      Bounds                   `json:"screenBounds"`
	Extra             map[string]any           `json:"extra,omitempty"`
}

type ControlPatch struct {
	Text *string `json:"text,omitempty"`
	Icon *string `json:"icon,omitempty"`
	// IconPresentation is an internal companion to Icon. Validation permits it
	// only when it exactly matches an allowlisted Icon value, so the native host
	// receives no caller-selected symbol or resource.
	IconPresentation *ToolbarIconPresentation `json:"iconPresentation,omitempty"`
	Value            any                      `json:"value,omitempty"`
	Checked          *bool                    `json:"checked,omitempty"`
	Active           *bool                    `json:"active,omitempty"`
	Disabled         *bool                    `json:"disabled,omitempty"`
	Busy             *bool                    `json:"busy,omitempty"`
	Error            *string                  `json:"error,omitempty"`
	Visible          *bool                    `json:"visible,omitempty"`
	Classes          []string                 `json:"classes,omitempty"`
	Source           *string                  `json:"source,omitempty"`
	Options          []SelectOption           `json:"options,omitempty"`
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
	// Paths is an internal native-host payload for the fileDrop event. It is
	// deliberately not a public JavaScript UI event; the first-party App Mode
	// owner consumes it and routes each path through FlowInstallService.
	Paths []string `json:"paths,omitempty"`
}

// FileDropEvent is emitted by the native host when Finder (or another file
// provider) drops supported files on an OpenDesk custom UI window. The event
// never enters the public UI event callback; ProcessDriver delivers it only to
// the explicitly registered product handler.
type FileDropEvent struct {
	SessionID string
	WindowID  string
	Paths     []string
}

func IsPublicEventType(eventType string) bool {
	switch eventType {
	case "*", "click", "change", "input", "move", "resize", "key", "interactionOutside", "close":
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
	SetPlacement(context.Context, WindowPlacement) (WindowState, error)
	SetRelativeTo(context.Context, RelativePlacement) (WindowState, error)
	SetAlwaysOnTop(context.Context, bool) (WindowState, error)
	SetDraggable(context.Context, bool) (WindowState, error)
	State(context.Context) (WindowState, error)
	ControlState(context.Context, string) (ControlState, error)
	UpdateControl(context.Context, string, ControlPatch) (ControlState, error)
	ToolbarButtonState(context.Context, string) (toolbar.ButtonResult, error)
	ApplyToolbarButton(context.Context, toolbar.ButtonSpec) (toolbar.ButtonResult, error)
	ToolbarLabelState(context.Context, string) (toolbar.LabelResult, error)
	ApplyToolbarLabel(context.Context, toolbar.LabelSpec) (toolbar.LabelResult, error)
	ToolbarControlState(context.Context, string) (toolbar.ControlResult, error)
	ApplyToolbarControl(context.Context, toolbar.ControlSpec) (toolbar.ControlResult, error)
}
