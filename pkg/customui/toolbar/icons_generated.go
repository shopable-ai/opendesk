// Code generated from assets/toolbar-icons-v1.json; DO NOT EDIT.
package toolbar

type iconDefinition struct {
	token        string
	presentation IconPresentation
}

var generatedIcons = map[string]iconDefinition{
	"play.fill":       {token: "play-fill", presentation: IconPresentation{SystemSymbol: "play.fill", Scale: 1.00, OffsetX: 0.50, OffsetY: 0.00}},
	"pause.fill":      {token: "pause-fill", presentation: IconPresentation{SystemSymbol: "pause.fill", Scale: 1.00, OffsetX: 0.00, OffsetY: 0.00}},
	"stop.fill":       {token: "stop-fill", presentation: IconPresentation{SystemSymbol: "stop.fill", Scale: 1.15, OffsetX: 0.00, OffsetY: 0.00}},
	"gearshape.fill":  {token: "gearshape-fill", presentation: IconPresentation{SystemSymbol: "gearshape.fill", Scale: 1.08, OffsetX: 0.00, OffsetY: 0.00}},
	"paperplane.fill": {token: "paperplane-fill", presentation: IconPresentation{SystemSymbol: "paperplane.fill", Scale: 1.00, OffsetX: -0.25, OffsetY: 0.25}},
	"timer":           {token: "timer", presentation: IconPresentation{SystemSymbol: "timer", Scale: 1.00, OffsetX: 0.00, OffsetY: 0.00}},
}

func IconToken(name string) (string, bool) { value, ok := generatedIcons[name]; return value.token, ok }
func IconPresentationFor(name string) (IconPresentation, bool) {
	value, ok := generatedIcons[name]
	return value.presentation, ok
}
func IconNames() []string {
	return []string{"gearshape.fill", "paperplane.fill", "pause.fill", "play.fill", "stop.fill", "timer"}
}
