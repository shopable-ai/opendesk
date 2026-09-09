package toolbar

// ButtonUpdate is the only FloatingWindow action mutation accepted by the
// native host. The host ignores stale revisions and returns its applied state.
type ButtonUpdate struct {
	Button ButtonSpec `json:"button"`
}

// LabelUpdate is the only mutable non-action content accepted by the host.
// Text, both alignment axes and tone may change; width is immutable because
// changing toolbar geometry after show is outside the compact contract.
type LabelUpdate struct {
	Label LabelSpec `json:"label"`
}

// ControlUpdate is the only mutation envelope accepted for Switch, Checkbox,
// Input, Select, Slider, SegmentedControl, and Progress items.
type ControlUpdate struct {
	Control ControlSpec `json:"control"`
}
