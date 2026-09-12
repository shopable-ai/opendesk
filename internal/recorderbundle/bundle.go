package recorderbundle

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

const RecorderWindowID = "recording-console"

// Keep the embedded JavaScript mirror synchronized with the canonical product
// sources under apps/opendesk/recorder. The Go implementation and embedded
// runtime payload stay under internal/ so the App package tree remains JS-only.
//go:generate go run ./cmd/sync

// runtimeAssets is the built-in Recorder payload owned by the compiled OpenDesk
// program. JavaScript files are generated mirrors; generic icons remain owned
// by the shared Custom UI runtime catalog instead of being copied as PNGs.
//
//go:embed assets/controller.js assets/controller-core.js assets/recording-history.js assets/runtime-icon-adapter.js
var runtimeAssets embed.FS

// WriteToDir materializes the built-in Recorder product resources for the
// secondary execution. Callers never need the source repository at runtime.
func WriteToDir(root string) (string, error) {
	if root == "" {
		return "", fmt.Errorf("recorder UI root is required")
	}
	assets, err := fs.Sub(runtimeAssets, "assets")
	if err != nil {
		return "", err
	}
	if err := fs.WalkDir(assets, ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == "." {
			return nil
		}
		target := filepath.Join(root, "recording-console-simple", filepath.FromSlash(path))
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := fs.ReadFile(assets, path)
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
const recorderRuntimeDir = File.join(Execution.scriptDir, 'recording-console-simple');
const runtimeIconAdapterFile = File.join(recorderRuntimeDir, 'runtime-icon-adapter.js');
(0, eval)(File.read(runtimeIconAdapterFile) + '\n//# sourceURL=' + runtimeIconAdapterFile);

const simpleControllerFile = File.join(recorderRuntimeDir, 'controller.js');
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
