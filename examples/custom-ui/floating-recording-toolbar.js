// Compatibility entry for the former recording-toolbar demo.
// Run from the repository root:
// ./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/floating-recording-toolbar.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-recording-toolbar
//
// This entry deliberately reuses the recording-console controller and the
// execution-owned Recorder object. It does not keep a second simulated
// recording state machine or script executor.
'use strict';

const controllerFile = File.join(Execution.scriptDir, 'recording-console', 'controller.js');
(0, eval)(File.read(controllerFile) + '\n//# sourceURL=' + controllerFile);

const recordingConsole = await OpenDeskRecordingConsole.createApp({
  recorder: Recorder,
  getActiveWindow: () => window.getActiveWindow(),
  captureKeyboard: Execution.env.OPENDESK_RECORDER_CAPTURE_KEYBOARD === '1',
  controlKeycodes: [],
  trayId: 'recordingToolbar',
  detailsId: 'recordingToolbarDetails',
});

await recordingConsole.run();
