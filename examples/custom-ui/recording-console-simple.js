// Compatibility entry. Run from the repository root:
// ./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
// Canonical Recorder UI resources live under apps/opendesk/recorder/. The
// maintained Human-to-Recipe entry remains responsible for workflow orchestration.
'use strict';

const workflowEntry = File.join(
  Execution.workdir,
  'workflows',
  'human-to-recipe',
  'recording-console-simple.js',
);
(0, eval)(File.read(workflowEntry) + '\n//# sourceURL=' + workflowEntry);
