//go:build !darwin

package automation

func listDesktopApplicationsPlatform() ([]desktopApplicationState, error) {
	return listProcessApplicationsFallback()
}

func desktopClipboardRevisionPlatform() (desktopClipboardRevision, error) {
	return clipboardTextRevisionFallback()
}
