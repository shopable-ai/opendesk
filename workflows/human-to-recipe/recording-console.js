// Run from the repository root:
// ./dist/opendesk -ui -allow-recorder-capture -script workflows/human-to-recipe/recording-console.js -console-mode script -log-dir .runtime/workflows/human-to-recipe/recording-console
//
// The visible Custom UI is the control surface for the same execution-owned
// Recorder Runtime used by workflows/human-to-recipe/record.js. The UI pause
// button dispatches to explicit session.pause()/session.resume() methods.
// Stopping builds actions and generation requires a separate button press.
// The generated file is shown before a second explicit user action may launch
// it as a fresh, cancelable OpenDesk execution through Command.run().
'use strict';

const controllerFile = File.join(Execution.scriptDir, 'recording-console', 'controller.js');
(0, eval)(File.read(controllerFile) + '\n//# sourceURL=' + controllerFile);

if (!globalThis.OpenDeskRecordingConsole || typeof OpenDeskRecordingConsole.createApp !== 'function') {
  throw new Error('OpenDesk recording console controller did not load');
}

const recordingConsole = await OpenDeskRecordingConsole.createApp({
  recorder: Recorder,
  getActiveWindow: () => window.getActiveWindow(),
  captureKeyboard: Execution.env.OPENDESK_RECORDER_CAPTURE_KEYBOARD === '1',
  controlKeycodes: [],
});

await recordingConsole.run();
