// Package runtimeenv resolves the environment snapshot supplied to one local
// JavaScript execution. It never mutates the OpenDesk process environment.
package runtimeenv

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

const maxEnvironmentLineBytes = 1024 * 1024

// Options controls project environment resolution.
type Options struct {
	WorkingDirectory string
	// File selects one explicit file. When empty, .env followed by
	// .opendesk.env is discovered in WorkingDirectory.
	File string
	// Inherited contains host entries in KEY=value form. They have the highest
	// precedence and are normally supplied from os.Environ by trusted local
	// entrypoints.
	Inherited []string
}

// Result is an execution-scoped environment snapshot plus the files that
// contributed to it.
type Result struct {
	Values map[string]string
	Files  []string
}

type environmentEntry struct {
	key   string
	value string
}

// Resolve loads project files without changing os.Environ. Precedence from
// low to high is .env, .opendesk.env, then Inherited. An explicit File replaces
// default file discovery.
func Resolve(options Options) (Result, error) {
	workingDirectory := strings.TrimSpace(options.WorkingDirectory)
	if workingDirectory == "" {
		var err error
		workingDirectory, err = os.Getwd()
		if err != nil {
			return Result{}, fmt.Errorf("read environment working directory: %w", err)
		}
	}
	absWorkingDirectory, err := filepath.Abs(workingDirectory)
	if err != nil {
		return Result{}, fmt.Errorf("resolve environment working directory: %w", err)
	}

	paths, err := environmentPaths(filepath.Clean(absWorkingDirectory), options.File)
	if err != nil {
		return Result{}, err
	}
	merged := make(map[string]environmentEntry)
	usedFiles := make([]string, 0, len(paths))
	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			return Result{}, fmt.Errorf("read environment file %s: %w", path, err)
		}
		values, parseErr := Parse(file)
		closeErr := file.Close()
		if parseErr != nil {
			return Result{}, fmt.Errorf("parse environment file %s: %w", path, parseErr)
		}
		if closeErr != nil {
			return Result{}, fmt.Errorf("close environment file %s: %w", path, closeErr)
		}
		mergeValues(merged, values)
		usedFiles = append(usedFiles, path)
	}
	mergeValues(merged, FromEnviron(options.Inherited))

	return Result{Values: exportedValues(merged), Files: usedFiles}, nil
}

// Parse reads the intentionally small, deterministic dotenv subset supported
// by OpenDesk: comments, export KEY=value, and matching single/double quotes.
// Values are not shell-evaluated and variable references are not expanded.
func Parse(reader io.Reader) (map[string]string, error) {
	if reader == nil {
		return nil, fmt.Errorf("environment reader is required")
	}
	values := make(map[string]string)
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), maxEnvironmentLineBytes)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") || strings.HasPrefix(line, "export\t") {
			line = strings.TrimSpace(line[len("export"):])
		}
		key, rawValue, found := strings.Cut(line, "=")
		if !found {
			return nil, fmt.Errorf("line %d must use KEY=value syntax", lineNumber)
		}
		key = strings.TrimSpace(key)
		if !ValidName(key) {
			return nil, fmt.Errorf("line %d has invalid environment name %q", lineNumber, key)
		}
		value := strings.TrimSpace(rawValue)
		if len(value) > 0 && (value[0] == '\'' || value[0] == '"') {
			if len(value) < 2 || value[len(value)-1] != value[0] {
				return nil, fmt.Errorf("line %d has an unterminated quoted value", lineNumber)
			}
			value = value[1 : len(value)-1]
		}
		if strings.ContainsAny(value, "\x00\r\n") {
			return nil, fmt.Errorf("line %d has an invalid environment value", lineNumber)
		}
		values[key] = value
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return values, nil
}

// FromEnviron converts KEY=value entries into a detached map. Invalid host
// entries, including Windows drive pseudo-variables such as =C:=..., are not
// part of the public JavaScript snapshot.
func FromEnviron(entries []string) map[string]string {
	merged := make(map[string]environmentEntry, len(entries))
	for _, entry := range entries {
		key, value, found := strings.Cut(entry, "=")
		if !found || !ValidName(key) || strings.ContainsRune(value, '\x00') {
			continue
		}
		canonical := normalizedName(key)
		merged[canonical] = environmentEntry{key: canonical, value: value}
	}
	return exportedValues(merged)
}

// ToEnviron returns a stable KEY=value representation suitable for exec.Cmd.
// On Windows, names are canonicalized to uppercase because the operating
// system treats them case-insensitively while a JavaScript object does not.
func ToEnviron(values map[string]string) ([]string, error) {
	canonicalValues := make(map[string]string, len(values))
	originalNames := make(map[string]string, len(values))
	for key, value := range values {
		if !ValidName(key) || strings.ContainsRune(value, '\x00') {
			return nil, fmt.Errorf("environment %q must use a valid name and a value without NUL", key)
		}
		canonical := normalizedName(key)
		if existing, found := originalNames[canonical]; found && existing != key {
			return nil, fmt.Errorf("environment names %q and %q conflict on %s", existing, key, runtime.GOOS)
		}
		originalNames[canonical] = key
		canonicalValues[canonical] = value
	}
	keys := make([]string, 0, len(canonicalValues))
	for key := range canonicalValues {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	entries := make([]string, 0, len(keys))
	for _, key := range keys {
		entries = append(entries, key+"="+canonicalValues[key])
	}
	return entries, nil
}

// MergeEnviron applies validated overrides to an inherited KEY=value list and
// returns a deterministic platform-canonical list. Overrides win over base.
func MergeEnviron(base []string, overrides map[string]string) ([]string, error) {
	overrideEntries, err := ToEnviron(overrides)
	if err != nil {
		return nil, err
	}
	entries := make([]string, 0, len(base)+len(overrideEntries))
	entries = append(entries, base...)
	entries = append(entries, overrideEntries...)
	return ToEnviron(FromEnviron(entries))
}

// Clone validates and detaches an environment map. A nil map becomes a
// non-nil empty snapshot so untrusted execution entrypoints fail closed.
func Clone(values map[string]string) (map[string]string, error) {
	entries, err := ToEnviron(values)
	if err != nil {
		return nil, err
	}
	return FromEnviron(entries), nil
}

// ValidName reports whether a key is portable across the supported hosts.
func ValidName(name string) bool {
	if name == "" {
		return false
	}
	for index := 0; index < len(name); index++ {
		character := name[index]
		letter := character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z'
		digit := character >= '0' && character <= '9'
		if character == '_' || letter || index > 0 && digit {
			continue
		}
		return false
	}
	return true
}

func environmentPaths(workingDirectory, explicitFile string) ([]string, error) {
	if strings.TrimSpace(explicitFile) != "" {
		path := strings.TrimSpace(explicitFile)
		if !filepath.IsAbs(path) {
			path = filepath.Join(workingDirectory, path)
		}
		path = filepath.Clean(path)
		info, err := os.Stat(path)
		if err != nil {
			return nil, fmt.Errorf("inspect environment file %s: %w", path, err)
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("environment file %s must be a regular file", path)
		}
		return []string{path}, nil
	}

	paths := make([]string, 0, 2)
	for _, name := range []string{".env", ".opendesk.env"} {
		path := filepath.Join(workingDirectory, name)
		info, err := os.Stat(path)
		switch {
		case err == nil && info.Mode().IsRegular():
			paths = append(paths, path)
		case err == nil:
			return nil, fmt.Errorf("environment file %s must be a regular file", path)
		case os.IsNotExist(err):
			continue
		default:
			return nil, fmt.Errorf("inspect environment file %s: %w", path, err)
		}
	}
	return paths, nil
}

func normalizedName(name string) string {
	if runtime.GOOS == "windows" {
		return strings.ToUpper(name)
	}
	return name
}

func mergeValues(destination map[string]environmentEntry, values map[string]string) {
	for key, value := range values {
		canonical := normalizedName(key)
		destination[canonical] = environmentEntry{key: canonical, value: value}
	}
}

func exportedValues(entries map[string]environmentEntry) map[string]string {
	values := make(map[string]string, len(entries))
	for _, entry := range entries {
		values[entry.key] = entry.value
	}
	return values
}
