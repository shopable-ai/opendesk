//go:build !windows

package officialconfig

import "os"

func replaceConfigFile(temporaryPath, outputPath string) error {
	return os.Rename(temporaryPath, outputPath)
}
