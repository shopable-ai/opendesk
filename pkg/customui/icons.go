package customui

import "opendesk/pkg/customui/toolbar"

// ToolbarIconPresentation remains an internal compatibility alias while the
// authoritative generated registry lives with the structured toolbar model.
type ToolbarIconPresentation = toolbar.IconPresentation

func ToolbarIconToken(name string) (string, bool) {
	return toolbar.IconToken(name)
}

func ToolbarIconPresentationFor(name string) (ToolbarIconPresentation, bool) {
	return toolbar.IconPresentationFor(name)
}

func ToolbarIconNames() []string {
	return toolbar.IconNames()
}
