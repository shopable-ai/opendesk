package measurement

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const AuthoringHandoffSchemaVersion = "measurement-authoring/v1"

type AuthoringConsumer string

const (
	ConsumerRecorder       AuthoringConsumer = "recorder"
	ConsumerHumanToRecipe  AuthoringConsumer = "human-to-recipe"
	ConsumerAgentToRecipe  AuthoringConsumer = "agent-to-recipe"
	ConsumerQualification  AuthoringConsumer = "qualification"
	ConsumerRepair         AuthoringConsumer = "repair"
)

type AuthoringStrategyHint struct {
	Kind     string `json:"kind"`
	Priority int    `json:"priority"`
	Reason   string `json:"reason"`
}

type AuthoringMeasurementInput struct {
	SchemaVersion             string                    `json:"schemaVersion"`
	TaskID                    string                    `json:"taskId"`
	Consumer                  AuthoringConsumer         `json:"consumer"`
	EvidenceRef               string                    `json:"evidenceRef"`
	MeasurementKind           string                    `json:"measurementKind"`
	Reference                 Reference                 `json:"reference"`
	SemanticEvidenceAvailable bool                      `json:"semanticEvidenceAvailable"`
	StrategyHints             []AuthoringStrategyHint   `json:"strategyHints"`
	Provenance                EvidenceProvenance        `json:"provenance"`
	Snapshot                  *SnapshotToken            `json:"snapshot,omitempty"`
	Target                    *MeasurementTargetGeometry `json:"target,omitempty"`
	References                *TwoLevelReferences       `json:"references,omitempty"`
	Margins                   *MarginRelations          `json:"margins,omitempty"`
	StableRelocation          *StableRelocationEvidence `json:"stableRelocation,omitempty"`
	CreatedAt                 time.Time                 `json:"createdAt"`
}

func BuildAuthoringMeasurementInput(consumer AuthoringConsumer, evidenceRef string, ev MeasurementEvidence, semanticAvailable bool, now time.Time) (AuthoringMeasurementInput, error) {
	if err := ValidateEvidence(ev); err != nil {
		return AuthoringMeasurementInput{}, err
	}
	if !validAuthoringConsumer(consumer) {
		return AuthoringMeasurementInput{}, fmt.Errorf("unsupported measurement authoring consumer %q", consumer)
	}
	if err := validateRelativeArtifactRef(evidenceRef); err != nil {
		return AuthoringMeasurementInput{}, err
	}
	if now.IsZero() {
		now = time.Now()
	}
	hints := make([]AuthoringStrategyHint, 0, 6)
	priority := 10
	if semanticAvailable {
		hints = append(hints, AuthoringStrategyHint{Kind: "semantic-first", Priority: priority, Reason: "semantic locator evidence is available; measurement must remain a constraint or verification source"})
		priority += 10
	}
	switch ev.Result.Kind {
	case "region":
		hints = append(hints, AuthoringStrategyHint{Kind: "constrained-region", Priority: priority, Reason: "use measured reference-relative geometry to constrain or validate target search"})
	case "point":
		if ev.Result.Point != nil && ev.Result.Point.Color != nil {
			hints = append(hints, AuthoringStrategyHint{Kind: "visual-verification", Priority: priority, Reason: "frozen capture pixel can verify visual plausibility without becoming the only locator"})
		}
	case "spacing":
		hints = append(hints, AuthoringStrategyHint{Kind: "layout-verification", Priority: priority, Reason: "measured relative spacing can validate layout drift"})
	case "twoPoint":
		hints = append(hints, AuthoringStrategyHint{Kind: "distance-verification", Priority: priority, Reason: "measured point distance can validate layout relationships"})
	}
	if len(hints) > 0 {
		priority += 10
	}
	input := AuthoringMeasurementInput{
		SchemaVersion: AuthoringHandoffSchemaVersion, TaskID: ev.TaskID, Consumer: consumer, EvidenceRef: evidenceRef,
		MeasurementKind: ev.Result.Kind, Reference: ev.Reference, SemanticEvidenceAvailable: semanticAvailable,
		StrategyHints: hints, Provenance: ev.Provenance, CreatedAt: now.UTC(),
	}
	if ev.Product != nil {
		token := ev.Product.Runtime.Snapshot
		references := ev.Product.References
		stable := ev.Product.StableHints
		input.Snapshot = &token
		input.Target = ev.Product.Target
		input.References = &references
		input.Margins = ev.Product.Margins
		input.StableRelocation = &stable
		input.StrategyHints = append(input.StrategyHints, AuthoringStrategyHint{
			Kind: "two-level-layout", Priority: priority,
			Reason: "consume Window + optional Local Layout Reference and signed margins as calibration/repair evidence; do not promote absolute coordinates to a long-term locator",
		})
		priority += 10
		if stable.Candidate != nil || stable.Window != nil {
			input.StrategyHints = append(input.StrategyHints, AuthoringStrategyHint{
				Kind: "stable-relocation-hints", Priority: priority,
				Reason: "prefer explicitly retained window/semantic relocation hints; runtime snapshot coordinates remain verification evidence",
			})
		}
	}
	if len(input.StrategyHints) == 0 {
		input.StrategyHints = append(input.StrategyHints, AuthoringStrategyHint{Kind: "measurement-evidence", Priority: priority, Reason: "consume measurement as supporting evidence"})
	}
	return input, nil
}

func SaveAuthoringMeasurementInput(repoRoot string, input AuthoringMeasurementInput) (string, error) {
	if input.SchemaVersion != AuthoringHandoffSchemaVersion {
		return "", errors.New("unsupported authoring handoff schema")
	}
	if err := validateEvidenceTaskID(input.TaskID); err != nil {
		return "", err
	}
	if !validAuthoringConsumer(input.Consumer) {
		return "", errors.New("invalid authoring consumer")
	}
	paths, err := EvidencePathsForTask(repoRoot, input.TaskID)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(paths.Directory, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(paths.Directory, "handoff-"+string(input.Consumer)+".json")
	data, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		return "", err
	}
	if err := atomicWrite(path, append(data, '\n'), 0o600); err != nil {
		return "", err
	}
	return path, nil
}

func LoadAuthoringMeasurementInput(repoRoot, taskID string, consumer AuthoringConsumer) (AuthoringMeasurementInput, string, error) {
	if !validAuthoringConsumer(consumer) {
		return AuthoringMeasurementInput{}, "", errors.New("invalid authoring consumer")
	}
	paths, err := EvidencePathsForTask(repoRoot, taskID)
	if err != nil {
		return AuthoringMeasurementInput{}, "", err
	}
	path := filepath.Join(paths.Directory, "handoff-"+string(consumer)+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return AuthoringMeasurementInput{}, path, err
	}
	var input AuthoringMeasurementInput
	if err := json.Unmarshal(data, &input); err != nil {
		return AuthoringMeasurementInput{}, path, err
	}
	if input.SchemaVersion != AuthoringHandoffSchemaVersion || input.TaskID != taskID || input.Consumer != consumer {
		return AuthoringMeasurementInput{}, path, errors.New("measurement authoring handoff identity mismatch")
	}
	if err := validateRelativeArtifactRef(input.EvidenceRef); err != nil {
		return AuthoringMeasurementInput{}, path, err
	}
	return input, path, nil
}

func validAuthoringConsumer(consumer AuthoringConsumer) bool {
	switch consumer {
	case ConsumerRecorder, ConsumerHumanToRecipe, ConsumerAgentToRecipe, ConsumerQualification, ConsumerRepair:
		return true
	default:
		return false
	}
}

func validateRelativeArtifactRef(ref string) error {
	clean := filepath.Clean(strings.TrimSpace(ref))
	if clean == "" || clean == "." || filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return errors.New("measurement evidence reference must be a safe relative artifact path")
	}
	return nil
}
