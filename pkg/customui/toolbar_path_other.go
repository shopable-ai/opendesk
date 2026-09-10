//go:build !windows

package customui

// Non-Windows platforms retain the existing URL/path parsing contract. Windows
// path exceptions are isolated in toolbar_path_windows.go so drive/UNC syntax
// does not broaden accepted path syntax on Unix-like systems.
func platformToolbarLocalPath(source string) (string, bool, error) {
	return "", false, nil
}
