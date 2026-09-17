package measurement

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

// MeasurementPhase is the current product-level lifecycle vocabulary shared by
// the executable Prototype, Product integration, Custom UI surface, Recorder
// handoff and native candidate providers. Historical implementation stages such
// as P0-P4 are not lifecycle states and must not be inferred from these values.
type MeasurementPhase string

const (
	PhaseIdle               MeasurementPhase = "IDLE"
	PhaseReferenceSelecting MeasurementPhase = "REFERENCE_SELECTING"
	PhaseFreezing           MeasurementPhase = "FREEZING"
	PhaseMeasuring          MeasurementPhase = "MEASURING"
	PhaseAdjusting          MeasurementPhase = "ADJUSTING"

	// PhasePreparing and PhaseReview are retained only for compatibility with
	// existing internal code while Product integration migrates to the Current
	// Oracle. PREPARING must never authorize capture before explicit Reference
	// confirmation; REVIEW must never be treated as a required product stage.
	PhasePreparing MeasurementPhase = "PREPARING"
	PhaseReview    MeasurementPhase = "REVIEW"
)

// SnapshotToken identifies the exact frozen frame that an asynchronous
// candidate or perception result was computed from. Results must be discarded
// when any field differs from the active token.
type SnapshotToken struct {
	SessionID  string `json:"sessionId"`
	Generation uint64 `json:"generation"`
	SnapshotID string `json:"snapshotId"`
}

func (t SnapshotToken) Validate() error {
	if strings.TrimSpace(t.SessionID) == "" {
		return errors.New("measurement snapshot token requires sessionId")
	}
	if t.Generation == 0 {
		return errors.New("measurement snapshot token requires a positive generation")
	}
	if strings.TrimSpace(t.SnapshotID) == "" {
		return errors.New("measurement snapshot token requires snapshotId")
	}
	return nil
}

func (t SnapshotToken) Matches(other SnapshotToken) bool {
	return t.Validate() == nil && other.Validate() == nil &&
		t.SessionID == other.SessionID && t.Generation == other.Generation && t.SnapshotID == other.SnapshotID
}

type CandidateReliability string

const (
	CandidateReliabilityConfirmed CandidateReliability = "confirmed"
	CandidateReliabilityReliable  CandidateReliability = "reliable"
	CandidateReliabilityEstimated CandidateReliability = "estimated"
	CandidateReliabilityUnknown   CandidateReliability = "unknown"
)

// CandidateDescriptor is Measurement evidence about a possible region. Source
// and reliability are explicit so a visual/color region is never silently
// promoted to a semantic control.
type CandidateDescriptor struct {
	ID                   string               `json:"id"`
	Label                string               `json:"label,omitempty"`
	Source               string               `json:"source"`
	Bounds               Rect                 `json:"bounds"`
	Reliability          CandidateReliability `json:"reliability"`
	Semantic             bool                 `json:"semantic,omitempty"`
	StableRelocationHint bool                 `json:"stableRelocationHint,omitempty"`
}

func (candidate CandidateDescriptor) Validate() error {
	if strings.TrimSpace(candidate.ID) == "" || strings.TrimSpace(candidate.Source) == "" {
		return errors.New("measurement candidate requires id and source")
	}
	if !validRect(candidate.Bounds) || candidate.Bounds.Width <= 0 || candidate.Bounds.Height <= 0 {
		return errors.New("measurement candidate requires positive finite bounds")
	}
	switch candidate.Reliability {
	case CandidateReliabilityConfirmed, CandidateReliabilityReliable, CandidateReliabilityEstimated, CandidateReliabilityUnknown:
	default:
		return fmt.Errorf("unsupported measurement candidate reliability %q", candidate.Reliability)
	}
	return nil
}

// LayoutReference adds provenance to the existing Reference geometry. The
// nested Reference remains the only coordinate/reference geometry model.
type LayoutReference struct {
	Reference   Reference            `json:"reference"`
	Label       string               `json:"label,omitempty"`
	Source      string               `json:"source"`
	Reliability CandidateReliability `json:"reliability"`
}

func (reference LayoutReference) Validate() error {
	if err := reference.Reference.Validate(); err != nil {
		return err
	}
	if strings.TrimSpace(reference.Source) == "" {
		return errors.New("layout reference requires source")
	}
	return nil
}

// TwoLevelReferences intentionally contains at most the whole target window and
// one meaningful local layout reference. Candidate ancestry can still be kept
// as evidence elsewhere without turning the HUD into an ancestry inspector.
type TwoLevelReferences struct {
	Window Reference        `json:"windowReference"`
	Local  *LayoutReference `json:"localReference,omitempty"`
}

func (references TwoLevelReferences) Validate() error {
	if references.Window.Window == nil {
		return errors.New("windowReference must identify a real window")
	}
	if err := references.Window.Validate(); err != nil {
		return fmt.Errorf("windowReference: %w", err)
	}
	if references.Local != nil {
		if err := references.Local.Validate(); err != nil {
			return fmt.Errorf("localReference: %w", err)
		}
	}
	return nil
}

type MarginRelations struct {
	TargetToWindow EdgeDistances  `json:"targetToWindow"`
	TargetToLocal  *EdgeDistances `json:"targetToLocal,omitempty"`
}

// CoordinateTriple is the compact cursor-HUD coordinate contract. Region is
// nil when there is no reliable current region; callers must render that as
// "区域 —" rather than inventing (0,0).
type CoordinateTriple struct {
	Screen Point  `json:"screen"`
	Window Point  `json:"window"`
	Region *Point `json:"region,omitempty"`
}

func CoordinatesAt(point Point, window Reference, local *LayoutReference) (CoordinateTriple, error) {
	if !finitePoint(point) {
		return CoordinateTriple{}, errors.New("cursor point must be finite")
	}
	if window.Window == nil {
		return CoordinateTriple{}, errors.New("cursor window reference must identify a real window")
	}
	if err := window.Validate(); err != nil {
		return CoordinateTriple{}, err
	}
	triple := CoordinateTriple{
		Screen: point,
		Window: Point{X: point.X - window.Bounds.X, Y: point.Y - window.Bounds.Y},
	}
	if local != nil {
		if err := local.Validate(); err != nil {
			return CoordinateTriple{}, err
		}
		relative := Point{X: point.X - local.Reference.Bounds.X, Y: point.Y - local.Reference.Bounds.Y}
		triple.Region = &relative
	}
	return triple, nil
}

// BuildTwoLevelReferences selects at most one local layout reference from
// already acquired candidates. It never runs a locator/perception backend of
// its own. Confirmed/reliable semantic or manual candidates are preferred;
// estimated visual regions are retained by callers as evidence, not silently
// treated as layout parents.
func BuildTwoLevelReferences(window Reference, target Rect, candidates []CandidateDescriptor) (TwoLevelReferences, error) {
	references := TwoLevelReferences{Window: window}
	if err := references.Validate(); err != nil {
		return TwoLevelReferences{}, err
	}
	if !validRect(target) || target.Width <= 0 || target.Height <= 0 {
		return TwoLevelReferences{}, errors.New("target requires positive finite bounds")
	}

	bestArea := math.Inf(1)
	var best *CandidateDescriptor
	for i := range candidates {
		candidate := candidates[i]
		if candidate.Validate() != nil || !candidateContains(candidate.Bounds, target) || isTechnicalWrapper(candidate) {
			continue
		}
		if candidate.Reliability != CandidateReliabilityConfirmed && candidate.Reliability != CandidateReliabilityReliable {
			continue
		}
		if !candidate.Semantic && !isExplicitManualSource(candidate.Source) {
			continue
		}
		if nearlySameRect(candidate.Bounds, target) {
			continue
		}
		area := candidate.Bounds.Width * candidate.Bounds.Height
		if area < bestArea {
			copy := candidate
			best = &copy
			bestArea = area
		}
	}
	if best == nil {
		return references, nil
	}
	local := LayoutReference{
		Reference:   Reference{Type: ReferenceManualRegion, Bounds: best.Bounds},
		Label:       best.Label,
		Source:      best.Source,
		Reliability: best.Reliability,
	}
	if err := local.Validate(); err != nil {
		return TwoLevelReferences{}, err
	}
	references.Local = &local
	return references, nil
}

func BuildMarginRelations(target Rect, references TwoLevelReferences) (MarginRelations, error) {
	if err := references.Validate(); err != nil {
		return MarginRelations{}, err
	}
	if !validRect(target) || target.Width < 0 || target.Height < 0 {
		return MarginRelations{}, errors.New("target margin geometry must be finite and non-negative")
	}
	relations := MarginRelations{TargetToWindow: DistancesToReference(target, references.Window.Bounds)}
	if references.Local != nil {
		local := DistancesToReference(target, references.Local.Reference.Bounds)
		relations.TargetToLocal = &local
	}
	return relations, nil
}

func candidateContains(outer, inner Rect) bool {
	return outer.X <= inner.X && outer.Y <= inner.Y && outer.Right() >= inner.Right() && outer.Bottom() >= inner.Bottom()
}

func nearlySameRect(a, b Rect) bool {
	const epsilon = 2.0
	return math.Abs(a.X-b.X) <= epsilon && math.Abs(a.Y-b.Y) <= epsilon &&
		math.Abs(a.Right()-b.Right()) <= epsilon && math.Abs(a.Bottom()-b.Bottom()) <= epsilon
}

func isTechnicalWrapper(candidate CandidateDescriptor) bool {
	text := strings.ToLower(strings.TrimSpace(candidate.Label + " " + candidate.Source))
	for _, token := range []string{"technical-wrapper", "layout-wrapper", "anonymous-wrapper", "decorative-wrapper"} {
		if strings.Contains(text, token) {
			return true
		}
	}
	return false
}

func isExplicitManualSource(source string) bool {
	source = strings.ToLower(strings.TrimSpace(source))
	return source == "manual" || source == "manual-region" || source == "user-confirmed"
}
