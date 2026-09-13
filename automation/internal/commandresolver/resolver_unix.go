//go:build !windows

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
	if filepath.IsAbs(candidate) {
		return inspectUnix(filepath.Clean(candidate))
	}
	if strings.ContainsRune(candidate, filepath.Separator) {
		return result("", StatusInvalid)
	}
	pathValue, found := environmentValue(environment, "PATH", false)
	if !found {
		return result("", StatusNotFound)
	}
	status := StatusNotFound
	for _, directory := range filepath.SplitList(pathValue) {
		// Empty or relative PATH entries imply cwd lookup. Agent discovery never
		// trusts an incidental task cwd, so only absolute entries participate.
		if directory == "" || !filepath.IsAbs(directory) {
			continue
		}
		resolved := inspectUnix(filepath.Join(directory, candidate))
		if resolved.Status == StatusOK {
			return resolved
		}
		if resolved.Status == StatusNotExecutable {
			status = StatusNotExecutable
		}
	}
	return result("", status)
}

func inspectUnix(candidate string) Resolution {
	info, err := os.Stat(candidate)
	if err != nil {
		if os.IsNotExist(err) {
			return result("", StatusNotFound)
		}
		return result("", StatusNotExecutable)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		return result("", StatusNotExecutable)
	}
	absolute, err := filepath.Abs(candidate)
	if err != nil {
		return result("", StatusNotExecutable)
	}
	return result(filepath.Clean(absolute), StatusOK)
}
