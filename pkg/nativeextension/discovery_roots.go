package nativeextension

import (
	"fmt"
	"path"
	"path/filepath"
	"strings"
)

const (
	darwinApplicationSupportSuffix = "Library/Application Support"
	linuxDefaultDataSuffix         = ".local/share"
	productDataSuffix              = "OpenDesk/NativeExtensions"
)

type currentUserPathInputs struct {
	Home         string
	XDGDataHome  string
	LocalAppData string
	FallbackData string
}

// publisherRootForExecutable encodes the two publisher/deployment layouts.
// The explicit executable path is internal Host input and must already be
// absolute so a test or proof run cannot accidentally make discovery depend on
// its current working directory.
func publisherRootForExecutable(goos, executable string) (DiscoveryRoot, error) {
	executable = strings.TrimSpace(executable)
	if goos == "windows" {
		cleaned, err := cleanWindowsAbsolute(executable)
		if err != nil {
			return DiscoveryRoot{}, fmt.Errorf("OpenDesk executable path: %w", err)
		}
		separator := strings.LastIndex(cleaned, "\\")
		if separator < 2 {
			return DiscoveryRoot{}, fmt.Errorf("OpenDesk executable path has no directory")
		}
		executableDir := cleaned[:separator]
		if strings.HasSuffix(executableDir, ":") {
			executableDir += "\\"
		}
		return DiscoveryRoot{Kind: RootPortable, Path: windowsJoin(executableDir, "native-extensions")}, nil
	}
	if goos == "darwin" || goos == "linux" {
		cleaned, err := cleanPOSIXAbsolute(executable)
		if err != nil {
			return DiscoveryRoot{}, fmt.Errorf("OpenDesk executable path: %w", err)
		}
		executableDir := path.Dir(cleaned)
		if goos == "darwin" && path.Base(executableDir) == "MacOS" {
			contentsDir := path.Dir(executableDir)
			appDir := path.Dir(contentsDir)
			if path.Base(contentsDir) == "Contents" && strings.HasSuffix(strings.ToLower(path.Base(appDir)), ".app") {
				return DiscoveryRoot{Kind: RootAppBundled, Path: path.Join(contentsDir, "Resources", "NativeExtensions")}, nil
			}
		}
		return DiscoveryRoot{Kind: RootPortable, Path: path.Join(executableDir, "native-extensions")}, nil
	}
	if executable == "" || !filepath.IsAbs(executable) {
		return DiscoveryRoot{}, fmt.Errorf("OpenDesk executable path must be absolute")
	}
	executableDir := filepath.Dir(filepath.Clean(executable))
	return DiscoveryRoot{
		Kind: RootPortable,
		Path: filepath.Join(executableDir, "native-extensions"),
	}, nil
}

// currentUserRootForPlatform is deliberately independent of runtime.GOOS so
// the three public path contracts can be table-tested on every development OS.
func currentUserRootForPlatform(goos string, inputs currentUserPathInputs) (string, error) {
	switch goos {
	case "darwin":
		home, err := cleanPOSIXAbsolute(inputs.Home)
		if err != nil {
			return "", fmt.Errorf("resolve macOS home: %w", err)
		}
		return path.Join(home, darwinApplicationSupportSuffix, productDataSuffix), nil
	case "linux":
		base := strings.TrimSpace(inputs.XDGDataHome)
		if base != "" {
			if !path.IsAbs(base) {
				return "", fmt.Errorf("XDG_DATA_HOME must be absolute when set")
			}
			base = path.Clean(base)
		} else {
			home, err := cleanPOSIXAbsolute(inputs.Home)
			if err != nil {
				return "", fmt.Errorf("resolve Linux data home: %w", err)
			}
			base = path.Join(home, linuxDefaultDataSuffix)
		}
		return path.Join(base, productDataSuffix), nil
	case "windows":
		base, err := cleanWindowsAbsolute(inputs.LocalAppData)
		if err != nil {
			return "", fmt.Errorf("resolve Windows LocalAppData: %w", err)
		}
		return windowsJoin(base, "OpenDesk", "NativeExtensions"), nil
	default:
		base := strings.TrimSpace(inputs.FallbackData)
		if base == "" || !filepath.IsAbs(base) {
			return "", fmt.Errorf("OS-standard user data directory is unavailable")
		}
		return filepath.Join(filepath.Clean(base), "OpenDesk", "NativeExtensions"), nil
	}
}

func cleanPOSIXAbsolute(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" || !path.IsAbs(value) {
		return "", fmt.Errorf("path must be absolute")
	}
	return path.Clean(value), nil
}

func cleanWindowsAbsolute(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("path must be absolute")
	}
	normalized := strings.ReplaceAll(value, "/", "\\")
	driveAbsolute := len(normalized) >= 3 &&
		((normalized[0] >= 'A' && normalized[0] <= 'Z') || (normalized[0] >= 'a' && normalized[0] <= 'z')) &&
		normalized[1] == ':' && normalized[2] == '\\'
	if driveAbsolute {
		components, err := cleanWindowsPathComponents(strings.Split(normalized[3:], "\\"))
		if err != nil {
			return "", err
		}
		root := strings.ToUpper(normalized[:1]) + ":\\"
		if len(components) == 0 {
			return root, nil
		}
		return root + strings.Join(components, "\\"), nil
	}
	if !strings.HasPrefix(normalized, "\\\\") {
		return "", fmt.Errorf("path must be drive-absolute or UNC")
	}
	components, err := cleanWindowsPathComponents(strings.Split(strings.TrimPrefix(normalized, "\\\\"), "\\"))
	if err != nil || len(components) < 2 || components[0] == "?" || components[0] == "." {
		return "", fmt.Errorf("UNC path must contain a server and share")
	}
	return "\\\\" + strings.Join(components, "\\"), nil
}

func cleanWindowsPathComponents(raw []string) ([]string, error) {
	components := make([]string, 0, len(raw))
	for _, component := range raw {
		if component == "" {
			continue
		}
		if component == "." || component == ".." {
			return nil, fmt.Errorf("path must not contain dot segments")
		}
		components = append(components, component)
	}
	return components, nil
}

func windowsJoin(base string, components ...string) string {
	result := strings.TrimRight(base, "\\/")
	for _, component := range components {
		result += "\\" + strings.Trim(component, "\\/")
	}
	return result
}
