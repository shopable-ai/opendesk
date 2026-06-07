package semanticexec

const (
	AssetStateDraft      = "draft"
	AssetStateVerified   = "verified"
	AssetStateDeprecated = "deprecated"
)

type AssetRecord struct {
	ScenarioID     string         `json:"scenarioId"`
	State          string         `json:"state"`
	SchemaVersion  string         `json:"schemaVersion"`
	CompatibilityTag string       `json:"compatibilityTag,omitempty"`
	EvidenceRefs   []EvidenceRef  `json:"evidenceRefs,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

func CanPromoteToVerified(record AssetRecord, result ExecutionResult) bool {
	if record.State == AssetStateDeprecated {
		return false
	}
	if result.Status != StatusSucceeded && result.Status != StatusDegraded {
		return false
	}
	for _, step := range result.Steps {
		if step.FalseSuccessSuspected || step.HumanGateRequired {
			return false
		}
	}
	return true
}

func ShouldDeprecate(record AssetRecord, result ExecutionResult) bool {
	if result.Status == StatusFalseSuccessSuspected || result.Status == StatusBlocked {
		return true
	}
	return false
}
