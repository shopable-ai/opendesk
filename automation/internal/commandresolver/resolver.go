// Package commandresolver implements the execution-environment executable
// lookup used by OpenDesk's Command owner. It never reads the host process
// environment and never launches a process.
package commandresolver

import "strings"

const (
	StatusOK            = "ok"
	StatusInvalid       = "invalid"
	StatusNotFound      = "not-found"
	StatusNotExecutable = "not-executable"
)

type Resolution struct {
	Path   string
	Status string
}

// environmentValue reads only the detached environment owned by the current
// execution. Windows callers request case-insensitive name matching; the last
// entry wins, matching runtimeenv normalization.
func environmentValue(environment []string, name string, caseInsensitive bool) (string, bool) {
	value := ""
	found := false
	for _, entry := range environment {
		key, candidate, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		matches := key == name
		if caseInsensitive {
			matches = strings.EqualFold(key, name)
		}
		if matches {
			value = candidate
			found = true
		}
	}
	return value, found
}

func result(path, status string) Resolution {
	return Resolution{Path: path, Status: status}
}

func candidateValid(candidate string) bool {
	return candidate != "" && strings.TrimSpace(candidate) == candidate && !strings.ContainsRune(candidate, '\x00')
}

func windowsExecutableExtensions(raw string) []string {
	if raw == "" {
		raw = ".COM;.EXE;.BAT;.CMD"
	}
	result := make([]string, 0, 4)
	seen := make(map[string]struct{})
	for _, item := range strings.Split(raw, ";") {
		extension := strings.TrimSpace(item)
		if extension == "" || strings.ContainsAny(extension, `/\\\x00`) {
			continue
		}
		if extension[0] != '.' {
			extension = "." + extension
		}
		extension = strings.ToUpper(extension)
		if _, exists := seen[extension]; exists {
			continue
		}
		seen[extension] = struct{}{}
		result = append(result, extension)
	}
	return result
}

func windowsExecutableNames(candidate string, extensions []string) []string {
	if windowsHasExecutableExtension(candidate, extensions) {
		return []string{candidate}
	}
	result := make([]string, 0, len(extensions))
	for _, extension := range extensions {
		result = append(result, candidate+extension)
	}
	return result
}

func windowsHasExecutableExtension(candidate string, extensions []string) bool {
	upper := strings.ToUpper(candidate)
	for _, extension := range extensions {
		if strings.HasSuffix(upper, extension) {
			return true
		}
	}
	return false
}
