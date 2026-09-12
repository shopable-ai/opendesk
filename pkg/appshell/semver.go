package appshell

import (
	"regexp"
	"strings"
)

var semVerPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$`)

type semVersion struct {
	major, minor, patch string
	prerelease          []string
}

func parseSemVersion(value string) (semVersion, bool) {
	match := semVerPattern.FindStringSubmatch(value)
	if match == nil {
		return semVersion{}, false
	}
	var prerelease []string
	if match[4] != "" {
		prerelease = strings.Split(match[4], ".")
		for _, identifier := range prerelease {
			if isNumericIdentifier(identifier) && len(identifier) > 1 && identifier[0] == '0' {
				return semVersion{}, false
			}
		}
	}
	return semVersion{major: match[1], minor: match[2], patch: match[3], prerelease: prerelease}, true
}

func compareSemVersion(left, right semVersion) int {
	if cmp := compareNumericString(left.major, right.major); cmp != 0 {
		return cmp
	}
	if cmp := compareNumericString(left.minor, right.minor); cmp != 0 {
		return cmp
	}
	if cmp := compareNumericString(left.patch, right.patch); cmp != 0 {
		return cmp
	}
	if len(left.prerelease) == 0 && len(right.prerelease) == 0 {
		return 0
	}
	if len(left.prerelease) == 0 {
		return 1
	}
	if len(right.prerelease) == 0 {
		return -1
	}
	limit := len(left.prerelease)
	if len(right.prerelease) < limit {
		limit = len(right.prerelease)
	}
	for i := 0; i < limit; i++ {
		l, r := left.prerelease[i], right.prerelease[i]
		ln, rn := isNumericIdentifier(l), isNumericIdentifier(r)
		switch {
		case ln && rn:
			if cmp := compareNumericString(l, r); cmp != 0 {
				return cmp
			}
		case ln:
			return -1
		case rn:
			return 1
		default:
			if l < r {
				return -1
			}
			if l > r {
				return 1
			}
		}
	}
	if len(left.prerelease) < len(right.prerelease) {
		return -1
	}
	if len(left.prerelease) > len(right.prerelease) {
		return 1
	}
	return 0
}

func isNumericIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for i := 0; i < len(value); i++ {
		if value[i] < '0' || value[i] > '9' {
			return false
		}
	}
	return true
}

func compareNumericString(left, right string) int {
	if len(left) < len(right) {
		return -1
	}
	if len(left) > len(right) {
		return 1
	}
	if left < right {
		return -1
	}
	if left > right {
		return 1
	}
	return 0
}
