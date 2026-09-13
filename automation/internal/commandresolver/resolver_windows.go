//go:build windows

package commandresolver

import (
	"os"
	"path/filepath"
	"strings"
)

func Resolve(candidate string, environment []string) Resolution {
	if !candidateValid(candidate) {
		return result("", StatusInvalid)
	}
	pathExt, _ := environmentValue(environment, "PATHEXT", true)
	extensions := windowsExecutableExtensions(pathExt)
	if filepath.IsAbs(candidate) {
		if !windowsHasExecutableExtension(candidate, extensions) {
			return result("", StatusNotExecutable)
		}
		return inspectWindows(filepath.Clean(candidate))
	}
	if strings.ContainsAny(candidate, `/\\`) {
		return result("", StatusInvalid)
	}
	pathValue, found := environmentValue(environment, "PATH", true)
	if !found {
		return result("", StatusNotFound)
	}
	status := StatusNotFound
	for _, rawDirectory := range filepath.SplitList(pathValue) {
		directory := strings.TrimSpace(rawDirectory)
		if len(directory) >= 2 && directory[0] == '"' && directory[len(directory)-1] == '"' {
			directory = directory[1 : len(directory)-1]
		}
		if directory == "" || !filepath.IsAbs(directory) {
			continue
		}
		for _, name := range windowsExecutableNames(candidate, extensions) {
			resolved := inspectWindows(filepath.Join(directory, name))
			if resolved.Status == StatusOK {
				return resolved
			}
			if resolved.Status == StatusNotExecutable {
				status = StatusNotExecutable
			}
		}
	}
	return result("", status)
}

func inspectWindows(candidate string) Resolution {
	info, err := os.Stat(candidate)
	if err != nil {
		if os.IsNotExist(err) {
			return result("", StatusNotFound)
		}
		return result("", StatusNotExecutable)
	}
	if !info.Mode().IsRegular() {
		return result("", StatusNotExecutable)
	}
	absolute, err := filepath.Abs(candidate)
	if err != nil {
		return result("", StatusNotExecutable)
	}
	return result(filepath.Clean(absolute), StatusOK)
}
