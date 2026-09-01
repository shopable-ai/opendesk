package automation

import (
	"os"
	"path/filepath"
)

const repositoryNotificationIcon = "public/icons/opendesk-notification.png"

func notificationIconPath() string {
	executable, _ := os.Executable()
	workingDirectory, _ := os.Getwd()
	return findNotificationIcon(executable, workingDirectory)
}

func findNotificationIcon(executable, workingDirectory string) string {
	candidates := make([]string, 0, 3)
	if executable != "" {
		executableDir := filepath.Dir(executable)
		candidates = append(candidates,
			filepath.Join(executableDir, "resources", "opendesk-notification.png"),
			filepath.Join(executableDir, "..", repositoryNotificationIcon),
		)
	}
	if workingDirectory != "" {
		candidates = append(candidates, filepath.Join(workingDirectory, repositoryNotificationIcon))
	}

	for _, candidate := range candidates {
		info, err := os.Stat(candidate)
		if err == nil && info.Mode().IsRegular() {
			absolute, absErr := filepath.Abs(candidate)
			if absErr == nil {
				return absolute
			}
			return candidate
		}
	}
	return ""
}
