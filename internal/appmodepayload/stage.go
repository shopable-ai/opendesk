package appmodepayload

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// ReleasePolicyPath is repository/build metadata. It is not part of the
// opendesk.app.json schema and is never copied into a policy-closed payload.
const ReleasePolicyPath = ".release/app-mode-runtime-files.txt"

var blockedReleaseExtensions = map[string]struct{}{
	".go":    {},
	".swift": {},
}

type Result struct {
	PolicyApplied bool
	Files         []string
}

func Stage(sourceRoot, destinationRoot string) (Result, error) {
	source, err := absoluteDirectory(sourceRoot, "App Mode package source")
	if err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(destinationRoot) == "" {
		return Result{}, errors.New("App Mode payload destination is required")
	}
	destination, err := filepath.Abs(destinationRoot)
	if err != nil {
		return Result{}, fmt.Errorf("resolve App Mode payload destination: %w", err)
	}
	destination = filepath.Clean(destination)
	if destination == filepath.VolumeName(destination)+string(filepath.Separator) {
		return Result{}, fmt.Errorf("refusing App Mode payload destination at filesystem root: %s", destination)
	}
	if destination == source {
		return Result{}, errors.New("App Mode payload destination must differ from source")
	}
	if rel, relErr := filepath.Rel(source, destination); relErr == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return Result{}, errors.New("App Mode payload destination must not be inside source")
	}
	if rel, relErr := filepath.Rel(destination, source); relErr == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return Result{}, errors.New("App Mode payload destination must not contain source")
	}
	if err := rejectSymlinks(source); err != nil {
		return Result{}, err
	}
	if info, statErr := os.Stat(filepath.Join(source, "opendesk.app.json")); statErr != nil || !info.Mode().IsRegular() {
		return Result{}, fmt.Errorf("App Mode package must contain regular opendesk.app.json: %s", source)
	}

	entries, policyApplied, err := readReleasePolicy(filepath.Join(source, filepath.FromSlash(ReleasePolicyPath)))
	if err != nil {
		return Result{}, err
	}
	if policyApplied {
		if err := validateLiteralPackageDependencies(source, entries); err != nil {
			return Result{}, err
		}
	}
	if err := os.RemoveAll(destination); err != nil {
		return Result{}, fmt.Errorf("clear App Mode payload destination: %w", err)
	}
	if err := os.MkdirAll(destination, 0o755); err != nil {
		return Result{}, fmt.Errorf("create App Mode payload destination: %w", err)
	}

	if policyApplied {
		files := make([]string, 0, len(entries))
		for _, relative := range entries {
			if err := copyRegularFile(source, destination, relative); err != nil {
				return Result{}, err
			}
			files = append(files, relative)
		}
		return Result{PolicyApplied: true, Files: files}, nil
	}

	files, err := copyWholePackage(source, destination)
	if err != nil {
		return Result{}, err
	}
	return Result{Files: files}, nil
}

var (
	scriptDirJoinPattern = regexp.MustCompile(`(?s)(?:File|file)\.join\(\s*(?:Execution|execution)\.scriptDir\s*,([^)]*)\)`)
	jsStringPattern      = regexp.MustCompile(`['"]([^'"]+)['"]`)
)

// validateLiteralPackageDependencies closes the common product-module loading
// pattern at release staging time. It deliberately handles only literal
// package paths rooted at Execution.scriptDir; dynamic user-data reads remain
// runtime behavior rather than release resources.
func validateLiteralPackageDependencies(sourceRoot string, entries []string) error {
	listed := make(map[string]bool, len(entries))
	for _, entry := range entries {
		listed[entry] = true
	}
	dependencies := map[string]string{}
	for _, entry := range entries {
		if strings.ToLower(path.Ext(entry)) != ".js" {
			continue
		}
		content, err := os.ReadFile(filepath.Join(sourceRoot, filepath.FromSlash(entry)))
		if err != nil {
			return fmt.Errorf("read release JavaScript dependency source %s: %w", entry, err)
		}
		for _, dependency := range literalPackageDependencies(content) {
			if firstOwner, exists := dependencies[dependency]; !exists {
				dependencies[dependency] = entry
			} else if entry < firstOwner {
				dependencies[dependency] = entry
			}
		}
	}
	ordered := make([]string, 0, len(dependencies))
	for dependency := range dependencies {
		ordered = append(ordered, dependency)
	}
	sort.Strings(ordered)
	for _, dependency := range ordered {
		if !listed[dependency] {
			return fmt.Errorf("release payload omits literal package dependency %s loaded by %s", dependency, dependencies[dependency])
		}
		info, err := os.Lstat(filepath.Join(sourceRoot, filepath.FromSlash(dependency)))
		if err != nil {
			return fmt.Errorf("literal package dependency is missing %s (loaded by %s): %w", dependency, dependencies[dependency], err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return fmt.Errorf("literal package dependency must be a regular file: %s", dependency)
		}
	}
	return nil
}

func literalPackageDependencies(content []byte) []string {
	seen := map[string]bool{}
	for _, join := range scriptDirJoinPattern.FindAllSubmatch(content, -1) {
		arguments := strings.TrimSpace(string(join[1]))
		matches := jsStringPattern.FindAllStringSubmatchIndex(arguments, -1)
		if len(matches) == 0 {
			continue
		}
		segments := make([]string, 0, len(matches))
		cursor := 0
		literal := true
		for _, match := range matches {
			separator := strings.TrimSpace(arguments[cursor:match[0]])
			if separator != "" && separator != "," {
				literal = false
				break
			}
			value := arguments[match[2]:match[3]]
			if value == "" || strings.Contains(value, `\`) {
				literal = false
				break
			}
			segments = append(segments, value)
			cursor = match[1]
		}
		if tail := strings.TrimSpace(arguments[cursor:]); !literal || tail != "" {
			continue
		}
		dependency := path.Join(segments...)
		// Release policies enumerate regular files. An extensionless literal join
		// is a runtime directory root (for example a user-data workspace), not a
		// package file dependency.
		if path.Ext(dependency) == "" {
			continue
		}
		if validatePolicyEntry(dependency) == nil {
			seen[dependency] = true
		}
	}
	result := make([]string, 0, len(seen))
	for dependency := range seen {
		result = append(result, dependency)
	}
	sort.Strings(result)
	return result
}

func absoluteDirectory(root, label string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", label, err)
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return "", fmt.Errorf("stat %s: %w", label, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return "", fmt.Errorf("%s must be a real directory, not a symlink: %s", label, absolute)
	}
	// The root itself must be a real directory, but parent aliases such as
	// macOS /var -> /private/var are normal filesystem paths. Nested package
	// symlinks are still rejected by rejectSymlinks and copyRegularFile.
	return filepath.Clean(absolute), nil
}

func rejectSymlinks(root string) error {
	return filepath.WalkDir(root, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			relative, _ := filepath.Rel(root, current)
			return fmt.Errorf("App Mode package staging rejects symlink: %s", filepath.ToSlash(relative))
		}
		return nil
	})
}

func readReleasePolicy(filename string) ([]string, bool, error) {
	file, err := os.Open(filename)
	if errors.Is(err, os.ErrNotExist) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("open App Mode release payload policy: %w", err)
	}
	defer file.Close()

	seen := map[string]struct{}{}
	var entries []string
	scanner := bufio.NewScanner(file)
	for line := 1; scanner.Scan(); line++ {
		entry := strings.TrimSpace(scanner.Text())
		if entry == "" || strings.HasPrefix(entry, "#") {
			continue
		}
		if err := validatePolicyEntry(entry); err != nil {
			return nil, false, fmt.Errorf("invalid %s line %d: %w", ReleasePolicyPath, line, err)
		}
		if _, duplicate := seen[entry]; duplicate {
			return nil, false, fmt.Errorf("duplicate %s entry: %s", ReleasePolicyPath, entry)
		}
		seen[entry] = struct{}{}
		entries = append(entries, entry)
	}
	if err := scanner.Err(); err != nil {
		return nil, false, fmt.Errorf("read App Mode release payload policy: %w", err)
	}
	if len(entries) == 0 {
		return nil, false, fmt.Errorf("%s must list runtime files", ReleasePolicyPath)
	}
	if _, ok := seen["opendesk.app.json"]; !ok {
		return nil, false, fmt.Errorf("%s must include opendesk.app.json", ReleasePolicyPath)
	}
	return entries, true, nil
}

func validatePolicyEntry(entry string) error {
	if strings.ContainsRune(entry, '\x00') || strings.Contains(entry, "\\") {
		return fmt.Errorf("path must use normalized forward-slash syntax: %q", entry)
	}
	if len(entry) >= 2 && isASCIIAlpha(entry[0]) && entry[1] == ':' {
		return fmt.Errorf("Windows drive path is not allowed: %s", entry)
	}
	clean := path.Clean(entry)
	if path.IsAbs(entry) || filepath.IsAbs(entry) || clean == "." || clean != entry || clean == ".." || strings.HasPrefix(clean, "../") {
		return fmt.Errorf("path must be a normalized package-relative file: %s", entry)
	}
	if clean == ".release" || strings.HasPrefix(clean, ".release/") {
		return fmt.Errorf("release policy metadata cannot be staged: %s", entry)
	}
	if strings.EqualFold(path.Base(clean), "README.md") {
		return fmt.Errorf("development/documentation file cannot be staged: %s", entry)
	}
	if _, blocked := blockedReleaseExtensions[strings.ToLower(path.Ext(clean))]; blocked {
		return fmt.Errorf("build-time source file cannot be staged: %s", entry)
	}
	return nil
}

func isASCIIAlpha(value byte) bool {
	return value >= 'A' && value <= 'Z' || value >= 'a' && value <= 'z'
}

func copyRegularFile(sourceRoot, destinationRoot, relative string) error {
	source := filepath.Join(sourceRoot, filepath.FromSlash(relative))
	info, err := os.Lstat(source)
	if err != nil {
		return fmt.Errorf("release payload source is missing %s: %w", relative, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return fmt.Errorf("release payload entry must be a regular file: %s", relative)
	}
	data, err := os.ReadFile(source)
	if err != nil {
		return fmt.Errorf("read release payload source %s: %w", relative, err)
	}
	destination := filepath.Join(destinationRoot, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return fmt.Errorf("create release payload directory for %s: %w", relative, err)
	}
	if err := os.WriteFile(destination, data, info.Mode().Perm()); err != nil {
		return fmt.Errorf("write release payload file %s: %w", relative, err)
	}
	return nil
}

func copyWholePackage(sourceRoot, destinationRoot string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(sourceRoot, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(sourceRoot, current)
		if err != nil || relative == "." {
			return err
		}
		portable := filepath.ToSlash(relative)
		if entry.IsDir() {
			if portable == ".runtime" {
				return filepath.SkipDir
			}
			return os.MkdirAll(filepath.Join(destinationRoot, relative), 0o755)
		}
		if err := copyRegularFile(sourceRoot, destinationRoot, filepath.ToSlash(relative)); err != nil {
			return err
		}
		files = append(files, portable)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("stage App Mode package: %w", err)
	}
	return files, nil
}
