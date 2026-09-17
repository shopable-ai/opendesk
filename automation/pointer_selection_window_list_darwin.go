//go:build darwin
// +build darwin

package automation

func listPointerSelectionWindows(_ *WindowManager) ([]map[string]interface{}, error) {
	return listPointerSelectionWindowsWithResolver(listMacWindowsCoreGraphics)
}

func listPointerSelectionWindowsWithResolver(resolve func() ([]macWindow, error)) ([]map[string]interface{}, error) {
	windows, err := resolve()
	if err != nil {
		return nil, err
	}
	return macWindowRows(windows), nil
}
