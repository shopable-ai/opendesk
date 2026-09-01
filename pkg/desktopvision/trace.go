package desktopvision

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const TraceSchemaVersion = "2026-08-30"

type ModelRef struct {
	Provider      string `json:"provider,omitempty"`
	Model         string `json:"model,omitempty"`
	PromptVersion string `json:"prompt_version,omitempty"`
}

type ScreenshotRef struct {
	Ref  string `json:"ref,omitempty"`
	Path string `json:"path,omitempty"`
	Hash string `json:"hash,omitempty"`
}

type WindowIdentity struct {
	Title        string     `json:"title,omitempty"`
	BoundsScreen ScreenBBox `json:"bounds_screen,omitempty"`
	DisplayID    string     `json:"display_id,omitempty"`
	Scale        float64    `json:"scale,omitempty"`
}

type TargetRef struct {
	ID           string         `json:"id,omitempty"`
	Role         string         `json:"role,omitempty"`
	Text         string         `json:"text,omitempty"`
	BBoxNorm     NormalizedBBox `json:"bbox_norm,omitempty"`
	BBoxPx       PixelBBox      `json:"bbox_px,omitempty"`
	BBoxWindow   WindowBBox     `json:"bbox_window,omitempty"`
	CenterWindow WindowPoint    `json:"center_window,omitempty"`
	CenterScreen ScreenPoint    `json:"center_screen,omitempty"`
	Confidence   float64        `json:"confidence,omitempty"`
	Actionable   bool           `json:"actionable,omitempty"`
	Risk         RiskLevel      `json:"risk,omitempty"`
}

type Precondition struct {
	Name    string         `json:"name"`
	Passed  bool           `json:"passed"`
	Details map[string]any `json:"details,omitempty"`
}

type ActionRecord struct {
	Type                string      `json:"type"`
	Button              string      `json:"button,omitempty"`
	Text                string      `json:"text,omitempty"`
	Shortcut            string      `json:"shortcut,omitempty"`
	DryRun              bool        `json:"dry_run,omitempty"`
	ResolvedScreenPoint ScreenPoint `json:"resolved_screen_point,omitempty"`
}

type Postcondition struct {
	Type        string         `json:"type"`
	Text        string         `json:"text,omitempty"`
	Role        string         `json:"role,omitempty"`
	Description string         `json:"description,omitempty"`
	Details     map[string]any `json:"details,omitempty"`
}

type Verification struct {
	OK             bool           `json:"ok"`
	Strategy       string         `json:"strategy,omitempty"`
	ObservedText   string         `json:"observed_text,omitempty"`
	PixelDiffRatio float64        `json:"pixel_diff_ratio,omitempty"`
	Details        map[string]any `json:"details,omitempty"`
}

type FailureRecord struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type RecoveryStep struct {
	Type    string         `json:"type"`
	Outcome string         `json:"outcome,omitempty"`
	Details map[string]any `json:"details,omitempty"`
}

type TraceEvent struct {
	SchemaVersion         string         `json:"schema_version"`
	RunID                 string         `json:"run_id,omitempty"`
	Timestamp             time.Time      `json:"timestamp"`
	Stage                 string         `json:"stage,omitempty"`
	App                   string         `json:"app,omitempty"`
	Window                WindowIdentity `json:"window"`
	Screenshot            ScreenshotRef  `json:"screenshot"`
	Model                 ModelRef       `json:"model"`
	Perception            *Perception    `json:"perception,omitempty"`
	Target                *TargetRef     `json:"target,omitempty"`
	Preconditions         []Precondition `json:"preconditions,omitempty"`
	Action                *ActionRecord  `json:"action,omitempty"`
	ExpectedPostcondition *Postcondition `json:"expected_postcondition,omitempty"`
	Verification          *Verification  `json:"verification,omitempty"`
	Failure               *FailureRecord `json:"failure,omitempty"`
	Recovery              []RecoveryStep `json:"recovery,omitempty"`
	Metadata              map[string]any `json:"metadata,omitempty"`
}

type TraceRecorder struct {
	runID  string
	events []TraceEvent
}

func NewTraceRecorder(runID string) *TraceRecorder {
	return &TraceRecorder{runID: strings.TrimSpace(runID)}
}

func (r *TraceRecorder) Record(event TraceEvent) TraceEvent {
	normalized := normalizeTraceEvent(event, r.runID)
	r.events = append(r.events, normalized)
	return normalized
}

func (r *TraceRecorder) Events() []TraceEvent {
	out := make([]TraceEvent, len(r.events))
	copy(out, r.events)
	return out
}

func (r *TraceRecorder) WriteNDJSON(path string) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("trace path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create trace dir: %w", err)
	}
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create trace file: %w", err)
	}
	defer file.Close()
	return WriteTraceNDJSON(file, r.events)
}

func WriteTraceNDJSON(w io.Writer, events []TraceEvent) error {
	enc := json.NewEncoder(w)
	for _, event := range events {
		normalized := normalizeTraceEvent(event, event.RunID)
		if err := enc.Encode(normalized); err != nil {
			return fmt.Errorf("encode trace event: %w", err)
		}
	}
	return nil
}

func NormalizeTarget(element Element) TargetRef {
	return TargetRef{
		ID:           element.ID,
		Role:         element.Role,
		Text:         element.Text,
		BBoxNorm:     element.BBoxNorm,
		BBoxPx:       element.BBoxPx,
		BBoxWindow:   element.BBoxWindow,
		CenterWindow: element.CenterWindow,
		CenterScreen: element.CenterScreen,
		Confidence:   element.Confidence,
		Actionable:   element.Actionable,
		Risk:         element.Risk,
	}
}

func normalizeTraceEvent(event TraceEvent, runID string) TraceEvent {
	if event.SchemaVersion == "" {
		event.SchemaVersion = TraceSchemaVersion
	}
	if event.RunID == "" {
		event.RunID = strings.TrimSpace(runID)
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}
	if event.Perception != nil {
		if event.App == "" {
			event.App = event.Perception.App
		}
		if event.Window.Title == "" {
			event.Window.Title = event.Perception.Window.Title
		}
		if event.Window.BoundsScreen == (ScreenBBox{}) {
			event.Window.BoundsScreen = event.Perception.Window.BoundsScreen
		}
		if event.Window.DisplayID == "" {
			event.Window.DisplayID = event.Perception.Display.ID
		}
		if event.Window.Scale == 0 {
			event.Window.Scale = event.Perception.Display.Scale
		}
		if event.Screenshot.Hash == "" {
			event.Screenshot.Hash = event.Perception.Image.Hash
		}
	}
	return event
}
