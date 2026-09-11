package recorderbundle

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

const RecorderWindowID = "recording-console"

// The Go package owns only release bundling/materialization. Recorder UI
// implementation remains JavaScript under ui/.
//
//go:embed ui/controller.js ui/controller-core.js ui/recording-history.js ui/icons/countdown-1.png ui/icons/countdown-2.png ui/icons/countdown-3.png
var assets embed.FS

func WriteToDir(root string) (string, error) {
	if root == "" {
		return "", fmt.Errorf("recorder UI root is required")
	}
	if err := fs.WalkDir(assets, "ui", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == "ui" {
			return nil
		}
		relative := strings.TrimPrefix(filepath.ToSlash(path), "ui/")
		target := filepath.Join(root, "recording-console-simple", filepath.FromSlash(relative))
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := assets.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o600)
	}); err != nil {
		return "", err
	}
	entryPath := filepath.Join(root, "recording-console-simple.js")
	if err := os.WriteFile(entryPath, []byte(EntryScript()), 0o600); err != nil {
		return "", err
	}
	return entryPath, nil
}

func EntryScript() string {
	return fmt.Sprintf(`'use strict';
const simpleControllerFile = File.join(Execution.scriptDir, 'recording-console-simple', 'controller.js');
(0, eval)(File.read(simpleControllerFile) + '\n//# sourceURL=' + simpleControllerFile);

const recordingConsole = OpenDeskSimpleRecordingConsole.createApp({
  recorder: Recorder,
  getActiveWindow: () => window.getActiveWindow(),
  captureKeyboard: Execution.env.OPENDESK_RECORDER_CAPTURE_KEYBOARD === '1',
  controlKeycodes: [],
  windowID: %q,
  openDeskBinary: System.getExecutablePath(),
});

await recordingConsole.run();
`, RecorderWindowID)
}
