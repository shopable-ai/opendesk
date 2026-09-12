// Run from the repository root:
// ./dist/opendesk -ui -allow-recorder-capture -script workflows/human-to-recipe/recording-console-simple.js -console-mode script -log-dir .runtime/workflows/human-to-recipe/recording-console-simple
'use strict';

// The Human-to-Recipe workflow owns orchestration only. Recorder UI source is
// embedded from the single canonical implementation under internal/recorderbundle/ui.
const recorderUIRoot = File.join(Execution.workdir, 'internal', 'recorderbundle', 'ui');
const controllerFile = File.join(recorderUIRoot, 'controller.js');
globalThis.__OPENDESK_RECORDER_UI_ROOT = recorderUIRoot;
try {
  (0, eval)(File.read(controllerFile) + '\n//# sourceURL=' + controllerFile);
} finally {
  delete globalThis.__OPENDESK_RECORDER_UI_ROOT;
}

if (!globalThis.OpenDeskSimpleRecordingConsole || typeof OpenDeskSimpleRecordingConsole.createApp !== 'function') {
  throw new Error('OpenDesk simple recording console controller did not load');
}

const recordingConsole = await OpenDeskSimpleRecordingConsole.createApp({
  recorder: Recorder,
  getActiveWindow: () => window.getActiveWindow(),
  captureKeyboard: Execution.env.OPENDESK_RECORDER_CAPTURE_KEYBOARD === '1',
  controlKeycodes: [],
  iconRoot: File.join(recorderUIRoot, 'icons'),
  openDeskBinary: System.getExecutablePath(),
});

await recordingConsole.run();
