package automation

import (
	"path/filepath"
	"runtime"
	"strings"
)

// downloadPlatformPathError rejects Windows names that cannot safely describe
// a final ordinary file. Unix permits ':' in a filename, so ADS validation is
// intentionally platform-specific rather than changing existing local paths.
func downloadPlatformPathError(path string) error {
	if runtime.GOOS != "windows" {
		return nil
	}
	trimmed := strings.TrimPrefix(filepath.Clean(path), filepath.VolumeName(path))
	for _, component := range strings.Split(trimmed, string(filepath.Separator)) {
		if component == "" || component == "." {
			continue
		}
		if strings.Contains(component, ":") {
			return downloadError(DownloadInvalidArgument, "http.download", "Windows alternate data stream paths are not supported", 0, false, nil)
		}
		name := strings.TrimRight(component, " .")
		stem := strings.ToUpper(strings.SplitN(name, ".", 2)[0])
		if stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL" ||
			(stem >= "COM1" && stem <= "COM9") || (stem >= "LPT1" && stem <= "LPT9") {
			return downloadError(DownloadInvalidArgument, "http.download", "Windows device paths are not supported", 0, false, nil)
		}
	}
	return nil
}
