package toolbar

// ButtonUpdate is the only FloatingWindow control mutation accepted by the
// native host. The host ignores stale revisions and returns its applied state.
type ButtonUpdate struct {
	Button ButtonSpec `json:"button"`
}
