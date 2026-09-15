package measurement

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/png"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"time"
)

const EvidenceVersion = "measurement-evidence/v1"

var evidenceTaskIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

type EvidenceOrigin string

const (
	EvidenceOriginManual        EvidenceOrigin = "manual"
	EvidenceOriginRecorder      EvidenceOrigin = "recorder"
	EvidenceOriginAccessibility EvidenceOrigin = "accessibility"
	EvidenceOriginUIA           EvidenceOrigin = "uia"
	EvidenceOriginWindow        EvidenceOrigin = "window"
	EvidenceOriginCapture       EvidenceOrigin = "capture"
	EvidenceOriginMeasurement   EvidenceOrigin = "measurement"
	EvidenceOriginAgent         EvidenceOrigin = "agent"
)

type EvidenceProvenance struct {
	Measurement EvidenceOrigin `json:"measurement"`
	Reference   EvidenceOrigin `json:"reference"`
	Capture     EvidenceOrigin `json:"capture"`
	Pixel       EvidenceOrigin `json:"pixel,omitempty"`
	Candidate   EvidenceOrigin `json:"candidate,omitempty"`
}

// CandidateEvidence is retained by measurement-evidence/v1 for compatibility.
// BuildEvidence fills it from the target-window enumeration, not from the
// frozen Snapshot's UI candidate stack. New semantic UI candidates belong in
// MeasurementProductEvidence.Candidate.
type CandidateEvidence struct {
	ID                   string               `json:"id"`
	Title                string               `json:"title,omitempty"`
	PID                  int64                `json:"pid,omitempty"`
	Source               string               `json:"source"`
	Reliability          CandidateReliability `json:"reliability,omitempty"`
	Semantic             bool                 `json:"semantic,omitempty"`
	StableRelocationHint bool                 `json:"stableRelocationHint,omitempty"`
	Selected             bool                 `json:"selected,omitempty"`
	Confirmed            bool                 `json:"confirmed,omitempty"`
}

type FrozenPixelEvidence struct {
	SHA256       string    `json:"sha256"`
	ImageSize    PixelSize `json:"imageSize"`
	SnapshotFile string    `json:"snapshotFile"`
}

type EvidenceConfidence struct {
	Target   float64  `json:"target"`
	Geometry float64  `json:"geometry"`
	Pixel    float64  `json:"pixel"`
	Overall  float64  `json:"overall"`
	Notes    []string `json:"notes,omitempty"`
}

// MeasurementTargetGeometry carries both the target bounds and percentage
// geometry relative to the two allowed layout references. Absolute bounds are
// runtime/calibration evidence; they are never marked as a stable locator.
type MeasurementTargetGeometry struct {
	Bounds         Rect          `json:"bounds"`
	WindowRelative RelativeRect  `json:"windowRelative"`
	LocalRelative  *RelativeRect `json:"localRelative,omitempty"`
}

type RuntimeMeasurementEvidence struct {
	Snapshot        SnapshotToken     `json:"snapshot"`
	Phase           MeasurementPhase  `json:"phase"`
	CoordinateSpace CoordinateContext `json:"coordinateSpace"`
	Mapping         CaptureMapping    `json:"displayMapping"`
	Cursor          *CoordinateTriple `json:"cursor,omitempty"`
	RawPixel        *RGB              `json:"rawPixel,omitempty"`
}

type StableRelocationEvidence struct {
	Window                    *WindowIdentity      `json:"windowIdentity,omitempty"`
	Candidate                 *CandidateDescriptor `json:"candidate,omitempty"`
	LocalReference            *LayoutReference     `json:"localReference,omitempty"`
	WindowRelative            *RelativeRect        `json:"windowRelative,omitempty"`
	AbsoluteCoordinatesLocator bool                `json:"absoluteCoordinatesLocator"`
}

// MeasurementProductEvidence is the additive product-level context consumed by
// authoring and repair. It extends the existing evidence envelope instead of
// creating another Geometry/Locator runtime.
type MeasurementProductEvidence struct {
	Target      *MeasurementTargetGeometry `json:"target,omitempty"`
	References  TwoLevelReferences         `json:"references"`
	Margins     *MarginRelations            `json:"margins,omitempty"`
	Candidate   *CandidateDescriptor        `json:"candidate,omitempty"`
	Runtime     RuntimeMeasurementEvidence  `json:"runtime"`
	StableHints StableRelocationEvidence    `json:"stableRelocation"`
}

type MeasurementEvidence struct {
	Version      string                      `json:"version"`
	TaskID       string                      `json:"taskId"`
	Source       string                      `json:"source"`
	CapturedAt   time.Time                   `json:"capturedAt"`
	Result       Result                      `json:"result"`
	Mapping      CaptureMapping              `json:"mapping"`
	Reference    Reference                   `json:"reference"`
	Candidates   []CandidateEvidence         `json:"candidates,omitempty"`
	FrozenPixels FrozenPixelEvidence         `json:"frozenPixels"`
	Confidence   EvidenceConfidence          `json:"confidence"`
	Provenance   EvidenceProvenance          `json:"provenance"`
	Product      *MeasurementProductEvidence `json:"product,omitempty"`
}

type EvidencePaths struct {
	Directory string
	Evidence  string
	Snapshot  string
}

func BuildEvidence(taskID, source string, frame CaptureFrame, result Result, frozenPNG []byte, confidence EvidenceConfidence) (MeasurementEvidence, error) {
	if err := validateEvidenceTaskID(taskID); err != nil {
		return MeasurementEvidence{}, err
	}
	if len(frozenPNG) == 0 {
		return MeasurementEvidence{}, errors.New("measurement evidence requires frozen PNG bytes")
	}
	hash := sha256.Sum256(frozenPNG)
	candidates := make([]CandidateEvidence, 0, len(frame.Targets))
	for _, target := range frame.Targets {
		selected := target.ID == frame.SelectedTargetID
		reliability := CandidateReliabilityReliable
		if selected && frame.TargetConfirmed {
			reliability = CandidateReliabilityConfirmed
		}
		candidates = append(candidates, CandidateEvidence{
			ID: target.ID, Title: target.Title, PID: target.PID, Source: "window-enumeration",
			Reliability: reliability, Semantic: false, Selected: selected, Confirmed: selected && frame.TargetConfirmed,
		})
	}
	ev := MeasurementEvidence{
		Version: EvidenceVersion, TaskID: taskID, Source: strings.TrimSpace(source), CapturedAt: frame.Snapshot.SampledAt,
		Result: result, Mapping: frame.Snapshot.Mapping, Reference: result.Reference, Candidates: candidates,
		FrozenPixels: FrozenPixelEvidence{SHA256: hex.EncodeToString(hash[:]), ImageSize: frame.Snapshot.Mapping.ImageSize, SnapshotFile: "snapshot.png"},
		Confidence: confidence,
	}
	ev.Provenance = deriveEvidenceProvenance(ev)
	if err := ValidateEvidence(ev); err != nil {
		return MeasurementEvidence{}, err
	}
	return ev, nil
}

// BuildEvidenceWithProduct enriches the canonical evidence artifact with the
// exact Session/Snapshot generation and two-level layout context. Older callers
// can continue using BuildEvidence; new Measurement/Recorder authoring paths
// should prefer this function when an active SnapshotToken is available.
func BuildEvidenceWithProduct(taskID, source string, frame CaptureFrame, result Result, frozenPNG []byte, confidence EvidenceConfidence, token SnapshotToken, phase MeasurementPhase, target *Rect, local *LayoutReference, candidate *CandidateDescriptor, cursor *CoordinateTriple) (MeasurementEvidence, error) {
	ev, err := BuildEvidence(taskID, source, frame, result, frozenPNG, confidence)
	if err != nil {
		return MeasurementEvidence{}, err
	}
	product, err := BuildMeasurementProductEvidence(token, phase, frame, result, target, local, candidate, cursor)
	if err != nil {
		return MeasurementEvidence{}, err
	}
	ev.Product = &product
	if err := ValidateEvidence(ev); err != nil {
		return MeasurementEvidence{}, err
	}
	return ev, nil
}

func BuildMeasurementProductEvidence(token SnapshotToken, phase MeasurementPhase, frame CaptureFrame, result Result, target *Rect, local *LayoutReference, candidate *CandidateDescriptor, cursor *CoordinateTriple) (MeasurementProductEvidence, error) {
	if err := token.Validate(); err != nil {
		return MeasurementProductEvidence{}, err
	}
	if phase != PhaseMeasuring && phase != PhaseReview {
		return MeasurementProductEvidence{}, fmt.Errorf("product evidence requires MEASURING or REVIEW phase, got %s", phase)
	}
	if frame.Reference.Window == nil {
		return MeasurementProductEvidence{}, errors.New("product evidence requires a real window reference")
	}
	references := TwoLevelReferences{Window: frame.Reference, Local: local}
	if local == nil && result.Reference.Type == ReferenceManualRegion {
		references.Local = &LayoutReference{Reference: result.Reference, Label: "局部参照", Source: "manual-region", Reliability: CandidateReliabilityConfirmed}
	}
	if err := references.Validate(); err != nil {
		return MeasurementProductEvidence{}, err
	}
	product := MeasurementProductEvidence{
		References: references,
		Candidate:  candidate,
		Runtime: RuntimeMeasurementEvidence{
			Snapshot: token, Phase: phase, CoordinateSpace: result.CoordinateSpace, Mapping: frame.Snapshot.Mapping, Cursor: cursor,
		},
		StableHints: StableRelocationEvidence{Window: frame.Reference.Window, LocalReference: references.Local, AbsoluteCoordinatesLocator: false},
	}
	if result.Point != nil && result.Point.Color != nil {
		pixel := *result.Point.Color
		product.Runtime.RawPixel = &pixel
	}
	resolvedTarget := target
	if resolvedTarget == nil && result.Region != nil {
		copy := result.Region.Absolute
		resolvedTarget = &copy
	}
	if resolvedTarget != nil {
		if !validRect(*resolvedTarget) || resolvedTarget.Width < 0 || resolvedTarget.Height < 0 {
			return MeasurementProductEvidence{}, errors.New("product target requires finite non-negative bounds")
		}
		geometry := MeasurementTargetGeometry{Bounds: *resolvedTarget, WindowRelative: RectRelativeTo(*resolvedTarget, references.Window.Bounds)}
		if references.Local != nil {
			localRelative := RectRelativeTo(*resolvedTarget, references.Local.Reference.Bounds)
			geometry.LocalRelative = &localRelative
		}
		product.Target = &geometry
		margins, err := BuildMarginRelations(*resolvedTarget, references)
		if err != nil {
			return MeasurementProductEvidence{}, err
		}
		product.Margins = &margins
		product.StableHints.WindowRelative = &geometry.WindowRelative
	}
	if candidate != nil {
		if err := candidate.Validate(); err != nil {
			return MeasurementProductEvidence{}, err
		}
		if candidate.StableRelocationHint {
			copy := *candidate
			product.StableHints.Candidate = &copy
		}
	}
	return product, product.Validate()
}

func (product MeasurementProductEvidence) Validate() error {
	if err := product.Runtime.Snapshot.Validate(); err != nil {
		return err
	}
	if product.Runtime.Phase != PhaseMeasuring && product.Runtime.Phase != PhaseReview {
		return errors.New("measurement product evidence has invalid phase")
	}
	if err := product.References.Validate(); err != nil {
		return err
	}
	if product.StableHints.AbsoluteCoordinatesLocator {
		return errors.New("absolute measurement coordinates must not be promoted to a stable locator")
	}
	if product.Candidate != nil {
		if err := product.Candidate.Validate(); err != nil {
			return err
		}
	}
	if product.Target == nil && product.Margins != nil {
		return errors.New("measurement margins require target geometry")
	}
	return nil
}

func deriveEvidenceProvenance(ev MeasurementEvidence) EvidenceProvenance {
	measurement := EvidenceOriginMeasurement
	source := strings.ToLower(ev.Source)
	switch {
	case strings.Contains(source, "recorder"):
		measurement = EvidenceOriginRecorder
	case strings.Contains(source, "agent"):
		measurement = EvidenceOriginAgent
	case strings.Contains(source, "manual") || strings.Contains(source, "menu") || strings.Contains(source, "human") || strings.Contains(source, "developer"):
		measurement = EvidenceOriginManual
	}
	reference := EvidenceOriginManual
	if ev.Reference.Window != nil {
		reference = EvidenceOriginWindow
	}
	pixel := EvidenceOrigin("")
	if ev.Result.Point != nil && ev.Result.Point.Color != nil {
		pixel = EvidenceOriginCapture
	}
	candidate := EvidenceOrigin("")
	if len(ev.Candidates) > 0 {
		candidate = EvidenceOriginWindow
	}
	return EvidenceProvenance{Measurement: measurement, Reference: reference, Capture: EvidenceOriginCapture, Pixel: pixel, Candidate: candidate}
}

func ValidateEvidence(ev MeasurementEvidence) error {
	if ev.Version != EvidenceVersion {
		return fmt.Errorf("unsupported measurement evidence version %q", ev.Version)
	}
	if err := validateEvidenceTaskID(ev.TaskID); err != nil {
		return err
	}
	if ev.CapturedAt.IsZero() {
		return errors.New("measurement evidence capturedAt is required")
	}
	if ev.Result.Version != ResultVersion {
		return fmt.Errorf("measurement evidence result version = %d, want %d", ev.Result.Version, ResultVersion)
	}
	if !ev.Result.Snapshot.SampledAt.Equal(ev.CapturedAt) {
		return errors.New("measurement evidence capturedAt diverges from canonical result snapshot")
	}
	if !reflect.DeepEqual(ev.Result.Snapshot.Mapping, ev.Mapping) {
		return errors.New("measurement evidence mapping diverges from canonical result mapping")
	}
	if !reflect.DeepEqual(ev.Result.Reference, ev.Reference) {
		return errors.New("measurement evidence reference diverges from canonical result reference")
	}
	if err := ev.Reference.Validate(); err != nil {
		return fmt.Errorf("measurement evidence reference: %w", err)
	}
	if ev.FrozenPixels.SnapshotFile != "snapshot.png" {
		return errors.New("measurement evidence snapshot file must be snapshot.png")
	}
	if len(ev.FrozenPixels.SHA256) != 64 {
		return errors.New("measurement evidence snapshot SHA-256 is invalid")
	}
	if ev.FrozenPixels.ImageSize != ev.Mapping.ImageSize {
		return errors.New("measurement evidence frozen image size diverges from capture mapping")
	}
	for _, score := range []float64{ev.Confidence.Target, ev.Confidence.Geometry, ev.Confidence.Pixel, ev.Confidence.Overall} {
		if score < 0 || score > 1 {
			return errors.New("measurement evidence confidence values must be within 0..1")
		}
	}
	selected, confirmed := 0, 0
	for _, candidate := range ev.Candidates {
		if strings.TrimSpace(candidate.ID) == "" || strings.TrimSpace(candidate.Source) == "" {
			return errors.New("measurement evidence candidate requires id and source")
		}
		if candidate.Selected {
			selected++
		}
		if candidate.Confirmed {
			confirmed++
			if !candidate.Selected {
				return errors.New("measurement evidence confirmed candidate must also be selected")
			}
		}
	}
	if selected > 1 || confirmed > 1 {
		return errors.New("measurement evidence may contain at most one selected and confirmed candidate")
	}
	if ev.Product != nil {
		if err := ev.Product.Validate(); err != nil {
			return fmt.Errorf("measurement product evidence: %w", err)
		}
		if !reflect.DeepEqual(ev.Product.Runtime.Mapping, ev.Mapping) {
			return errors.New("measurement product display mapping diverges from canonical evidence mapping")
		}
		if !reflect.DeepEqual(ev.Product.References.Window, ev.Result.SnapshotMappingWindowReferenceOr(ev.Product.References.Window)) {
			return errors.New("measurement product window reference is inconsistent")
		}
	}
	if ev.Provenance.Measurement != "" {
		if ev.Provenance.Capture != EvidenceOriginCapture {
			return errors.New("measurement evidence capture provenance must be capture")
		}
		if ev.Reference.Window != nil && ev.Provenance.Reference != EvidenceOriginWindow {
			return errors.New("window reference provenance must be window")
		}
		if ev.Reference.Window == nil && ev.Provenance.Reference != EvidenceOriginManual {
			return errors.New("manual reference provenance must be manual")
		}
		if ev.Result.Point != nil && ev.Result.Point.Color != nil && ev.Provenance.Pixel != EvidenceOriginCapture {
			return errors.New("frozen pixel provenance must be capture")
		}
	}
	return nil
}

// SnapshotMappingWindowReferenceOr exists only to make the product consistency
// check explicit without inventing a second source of window geometry. The
// Result may legitimately use a local manual reference, while Product keeps the
// immutable whole-window reference.
func (r Result) SnapshotMappingWindowReferenceOr(window Reference) Reference { return window }

func EvidencePathsForTask(repoRoot, taskID string) (EvidencePaths, error) {
	if err := validateEvidenceTaskID(taskID); err != nil {
		return EvidencePaths{}, err
	}
	root, err := filepath.Abs(strings.TrimSpace(repoRoot))
	if err != nil || strings.TrimSpace(repoRoot) == "" {
		return EvidencePaths{}, errors.New("repository root is required")
	}
	dir := filepath.Join(root, ".runtime", "automation-authoring", taskID, "measurement")
	return EvidencePaths{Directory: dir, Evidence: filepath.Join(dir, "evidence.json"), Snapshot: filepath.Join(dir, "snapshot.png")}, nil
}

func SaveEvidence(repoRoot string, ev MeasurementEvidence, frozenPNG []byte) (EvidencePaths, error) {
	if ev.Provenance.Measurement == "" {
		ev.Provenance = deriveEvidenceProvenance(ev)
	}
	if err := ValidateEvidence(ev); err != nil {
		return EvidencePaths{}, err
	}
	if err := verifyFrozenPNG(ev, frozenPNG); err != nil {
		return EvidencePaths{}, err
	}
	paths, err := EvidencePathsForTask(repoRoot, ev.TaskID)
	if err != nil {
		return EvidencePaths{}, err
	}
	if err := os.MkdirAll(paths.Directory, 0o755); err != nil {
		return EvidencePaths{}, fmt.Errorf("create measurement evidence directory: %w", err)
	}
	data, err := json.MarshalIndent(ev, "", "  ")
	if err != nil {
		return EvidencePaths{}, fmt.Errorf("encode measurement evidence: %w", err)
	}
	if err := atomicWrite(paths.Snapshot, frozenPNG, 0o600); err != nil {
		return EvidencePaths{}, err
	}
	if err := atomicWrite(paths.Evidence, append(data, '\n'), 0o600); err != nil {
		return EvidencePaths{}, err
	}
	return paths, nil
}

func LoadEvidence(repoRoot, taskID string) (MeasurementEvidence, EvidencePaths, error) {
	paths, err := EvidencePathsForTask(repoRoot, taskID)
	if err != nil {
		return MeasurementEvidence{}, EvidencePaths{}, err
	}
	data, err := os.ReadFile(paths.Evidence)
	if err != nil {
		return MeasurementEvidence{}, paths, fmt.Errorf("read measurement evidence: %w", err)
	}
	var ev MeasurementEvidence
	if err := json.Unmarshal(data, &ev); err != nil {
		return MeasurementEvidence{}, paths, fmt.Errorf("decode measurement evidence: %w", err)
	}
	if ev.TaskID != taskID {
		return MeasurementEvidence{}, paths, errors.New("measurement evidence task id does not match requested task")
	}
	if ev.Provenance.Measurement == "" {
		ev.Provenance = deriveEvidenceProvenance(ev)
	}
	if err := ValidateEvidence(ev); err != nil {
		return MeasurementEvidence{}, paths, err
	}
	pngBytes, err := os.ReadFile(paths.Snapshot)
	if err != nil {
		return MeasurementEvidence{}, paths, fmt.Errorf("read measurement evidence snapshot: %w", err)
	}
	if err := verifyFrozenPNG(ev, pngBytes); err != nil {
		return MeasurementEvidence{}, paths, err
	}
	return ev, paths, nil
}

func verifyFrozenPNG(ev MeasurementEvidence, frozenPNG []byte) error {
	hash := sha256.Sum256(frozenPNG)
	if hex.EncodeToString(hash[:]) != ev.FrozenPixels.SHA256 {
		return errors.New("measurement evidence snapshot hash mismatch")
	}
	img, format, err := image.Decode(bytes.NewReader(frozenPNG))
	if err != nil || format != "png" {
		return errors.New("measurement evidence snapshot is not a valid PNG")
	}
	if img.Bounds().Dx() != ev.FrozenPixels.ImageSize.Width || img.Bounds().Dy() != ev.FrozenPixels.ImageSize.Height {
		return errors.New("measurement evidence snapshot dimensions do not match frozen image size")
	}
	return nil
}

func validateEvidenceTaskID(taskID string) error {
	if !evidenceTaskIDPattern.MatchString(strings.TrimSpace(taskID)) {
		return errors.New("measurement evidence task id must be a safe single path segment")
	}
	return nil
}

func atomicWrite(path string, data []byte, mode os.FileMode) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
