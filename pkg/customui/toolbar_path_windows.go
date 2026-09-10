//go:build windows

package customui

import (
	"fmt"
	"strings"
)

// platformToolbarLocalPath recognizes Windows path forms before net/url sees
// a drive letter as a URL scheme. It only classifies/normalizes syntax; the
// existing canonical-directory and EvalSymlinks containment checks remain the
// security boundary for every accepted path.
func platformToolbarLocalPath(source string) (string, bool, error) {
	normalized := strings.ReplaceAll(source, "/", `\`)

	if strings.HasPrefix(normalized, `\\.\`) {
		return "", true, fmt.Errorf("custom icon path must not use a Windows device namespace")
	}
	if strings.HasPrefix(normalized, `\\?\`) {
		rest := normalized[len(`\\?\`):]
		if len(rest) >= len(`UNC\`) && strings.EqualFold(rest[:len(`UNC\`)], `UNC\`) {
			if len(rest) == len(`UNC\`) {
				return "", true, fmt.Errorf("custom icon extended UNC path is incomplete")
			}
			return `\\` + rest[len(`UNC\`):], true, nil
		}
		if isWindowsDriveAbsolutePath(rest) {
			return rest, true, nil
		}
		return "", true, fmt.Errorf("custom icon extended path must name an absolute drive or UNC path")
	}
	if isWindowsDriveQualifiedPath(normalized) {
		if !isWindowsDriveAbsolutePath(normalized) {
			return "", true, fmt.Errorf("custom icon path must not use a drive-relative Windows path")
		}
		return normalized, true, nil
	}
	if strings.HasPrefix(normalized, `\\`) {
		return normalized, true, nil
	}
	return "", false, nil
}

func isWindowsDriveQualifiedPath(path string) bool {
	return len(path) >= 2 && ((path[0] >= 'A' && path[0] <= 'Z') || (path[0] >= 'a' && path[0] <= 'z')) && path[1] == ':'
}

func isWindowsDriveAbsolutePath(path string) bool {
	return len(path) >= 3 && isWindowsDriveQualifiedPath(path) && path[2] == '\\'
}
