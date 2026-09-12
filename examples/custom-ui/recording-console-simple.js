// Compatibility entry. Run from the repository root:
// ./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
// The Recorder UI implementation is owned by internal/recorderbundle/ui and
// the maintained workflow entry lives under workflows/human-to-recipe/.
'use strict';

const workflowEntry = File.join(
  Execution.workdir,
  'workflows',
  'human-to-recipe',
  'recording-console-simple.js',
);
(0, eval)(File.read(workflowEntry) + '\n//# sourceURL=' + workflowEntry);
