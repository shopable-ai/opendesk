package automation

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dop251/goja"
)

// registerPath exposes the platform-native, string-only path helper. The
// execution owner passes the same normalized WorkDir used by File so resolve
// and relative never consult or mutate the process working directory.
func registerPath(runtime *goja.Runtime, workDir string) error {
	if runtime == nil {
		return fmt.Errorf("runtime is required")
	}
	object := runtime.NewObject()
	set := func(name string, fn func(goja.FunctionCall) goja.Value) error {
		if err := object.Set(name, fn); err != nil {
			return fmt.Errorf("register path.%s: %w", name, err)
		}
		return nil
	}

	if err := object.Set("sep", string(filepath.Separator)); err != nil {
		return fmt.Errorf("register path.sep: %w", err)
	}
	if err := object.Set("delimiter", string(os.PathListSeparator)); err != nil {
		return fmt.Errorf("register path.delimiter: %w", err)
	}
	if err := set("join", func(call goja.FunctionCall) goja.Value {
		parts := pathStringArguments(runtime, "join", call.Arguments)
		return runtime.ToValue(nodePathJoin(parts))
	}); err != nil {
		return err
	}
	if err := set("resolve", func(call goja.FunctionCall) goja.Value {
		parts := pathStringArguments(runtime, "resolve", call.Arguments)
		return runtime.ToValue(nodePathResolve(workDir, parts))
	}); err != nil {
		return err
	}
	if err := set("normalize", func(call goja.FunctionCall) goja.Value {
		return runtime.ToValue(nodePathNormalize(pathRequiredString(runtime, "normalize", call.Argument(0))))
	}); err != nil {
		return err
	}
	if err := set("dirname", func(call goja.FunctionCall) goja.Value {
		value := pathRequiredString(runtime, "dirname", call.Argument(0))
		return runtime.ToValue(nodePathDirname(value))
	}); err != nil {
		return err
	}
	if err := set("basename", func(call goja.FunctionCall) goja.Value {
		value := pathRequiredString(runtime, "basename", call.Argument(0))
		base := nodePathBasename(value)
		if len(call.Arguments) > 1 && !goja.IsUndefined(call.Argument(1)) {
			suffix := pathRequiredString(runtime, "basename", call.Argument(1))
			if suffix != "" && strings.HasSuffix(base, suffix) {
				base = strings.TrimSuffix(base, suffix)
			}
		}
		return runtime.ToValue(base)
	}); err != nil {
		return err
	}
	if err := set("extname", func(call goja.FunctionCall) goja.Value {
		return runtime.ToValue(nodePathExtname(pathRequiredString(runtime, "extname", call.Argument(0))))
	}); err != nil {
		return err
	}
	if err := set("relative", func(call goja.FunctionCall) goja.Value {
		from := pathRequiredString(runtime, "relative", call.Argument(0))
		to := pathRequiredString(runtime, "relative", call.Argument(1))
		from = nodePathResolve(workDir, []string{from})
		to = nodePathResolve(workDir, []string{to})
		relative, err := filepath.Rel(from, to)
		if err != nil {
			// Node returns the absolute destination when Windows drives differ.
			return runtime.ToValue(to)
		}
		if relative == "." {
			relative = ""
		}
		return runtime.ToValue(relative)
	}); err != nil {
		return err
	}
	if err := set("isAbsolute", func(call goja.FunctionCall) goja.Value {
		return runtime.ToValue(filepath.IsAbs(pathRequiredString(runtime, "isAbsolute", call.Argument(0))))
	}); err != nil {
		return err
	}
	if err := runtime.Set("path", object); err != nil {
		return fmt.Errorf("register path: %w", err)
	}
	return nil
}

func pathStringArguments(runtime *goja.Runtime, operation string, values []goja.Value) []string {
	parts := make([]string, len(values))
	for index, value := range values {
		parts[index] = pathRequiredString(runtime, operation, value)
	}
	return parts
}

func pathRequiredString(runtime *goja.Runtime, operation string, value goja.Value) string {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		panic(runtime.NewTypeError("path.%s requires string arguments", operation))
	}
	text, ok := value.Export().(string)
	if !ok {
		panic(runtime.NewTypeError("path.%s requires string arguments", operation))
	}
	return text
}

func nodePathJoin(parts []string) string {
	filtered := make([]string, 0, len(parts))
	for _, part := range parts {
		if part != "" {
			filtered = append(filtered, part)
		}
	}
	if len(filtered) == 0 {
		return "."
	}
	// Node joins raw segments before normalizing. In particular, a trailing
	// separator in the final segment remains observable after join.
	return nodePathNormalize(strings.Join(filtered, string(filepath.Separator)))
}

func nodePathResolve(workDir string, parts []string) string {
	resolved := ""
	for index := len(parts) - 1; index >= -1; index-- {
		part := workDir
		if index >= 0 {
			part = parts[index]
		}
		if part == "" {
			continue
		}
		if resolved == "" {
			resolved = part
		} else {
			resolved = filepath.Join(part, resolved)
		}
		if filepath.IsAbs(resolved) {
			break
		}
	}
	if resolved == "" {
		resolved = workDir
	}
	return filepath.Clean(resolved)
}

func nodePathNormalize(value string) string {
	if value == "" {
		return "."
	}
	trailingSeparator := pathIsSeparator(value[len(value)-1])
	normalized := filepath.Clean(value)
	if trailingSeparator && normalized != string(filepath.Separator) && !pathIsSeparator(normalized[len(normalized)-1]) {
		normalized += string(filepath.Separator)
	}
	return normalized
}

func nodePathBasename(value string) string {
	end := len(value)
	for end > 0 && pathIsSeparator(value[end-1]) {
		end--
	}
	if end == 0 {
		return ""
	}
	start := end - 1
	for start >= 0 && !pathIsSeparator(value[start]) {
		start--
	}
	return value[start+1 : end]
}

func nodePathDirname(value string) string {
	if value == "" {
		return "."
	}
	volume := filepath.VolumeName(value)
	volumeEnd := len(volume)
	hasRoot := len(value) > volumeEnd && pathIsSeparator(value[volumeEnd])
	matchedSeparator := true
	end := -1
	for index := len(value) - 1; index >= volumeEnd; index-- {
		if pathIsSeparator(value[index]) {
			if !matchedSeparator {
				end = index
				break
			}
		} else {
			matchedSeparator = false
		}
	}
	if end == -1 {
		if hasRoot {
			return value[:volumeEnd+1]
		}
		if volume != "" {
			return volume
		}
		return "."
	}
	if hasRoot && end == volumeEnd {
		return value[:volumeEnd+1]
	}
	// Match Node's POSIX double-leading-separator dirname behavior.
	if volumeEnd == 0 && hasRoot && end == 1 {
		return value[:2]
	}
	return value[:end]
}

// nodePathExtname follows Node's hidden-file and repeated-dot rules without
// touching the filesystem. Separator handling is native to the target OS.
func nodePathExtname(value string) string {
	startDot, startPart, end := -1, 0, -1
	matchedSeparator := true
	preDotState := 0
	for index := len(value) - 1; index >= 0; index-- {
		character := value[index]
		if pathIsSeparator(character) {
			if !matchedSeparator {
				startPart = index + 1
				break
			}
			continue
		}
		if end == -1 {
			matchedSeparator = false
			end = index + 1
		}
		if character == '.' {
			if startDot == -1 {
				startDot = index
			} else if preDotState != 1 {
				preDotState = 1
			}
		} else if startDot != -1 {
			preDotState = -1
		}
	}
	if startDot == -1 || end == -1 || preDotState == 0 ||
		(preDotState == 1 && startDot == end-1 && startDot == startPart+1) {
		return ""
	}
	return value[startDot:end]
}

func pathIsSeparator(character byte) bool {
	if filepath.Separator == '\\' {
		return character == '\\' || character == '/'
	}
	return character == '/'
}
