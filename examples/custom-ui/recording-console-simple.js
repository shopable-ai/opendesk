// Run from the repository root:
// ./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
'use strict';

const simpleControllerFile = File.join(Execution.scriptDir, 'recording-console-simple', 'controller.js');
(0, eval)(File.read(simpleControllerFile) + '\n//# sourceURL=' + simpleControllerFile);

if (!globalThis.OpenDeskSimpleRecordingConsole || typeof OpenDeskSimpleRecordingConsole.createApp !== 'function') {
  throw new Error('OpenDesk simple recording console controller did not load');
}

const recordingConsole = await OpenDeskSimpleRecordingConsole.createApp({
  recorder: Recorder,
  getActiveWindow: () => window.getActiveWindow(),
  captureKeyboard: Execution.env.OPENDESK_RECORDER_CAPTURE_KEYBOARD === '1',
  controlKeycodes: [],
});

await recordingConsole.run();
