// Recorder contract gate entry for the OpenDesk Runtime.
// From the repository root:
// ./dist/opendesk -script scripts/test_recorder.js -console-mode script

'use strict';

const gate = File.read(File.join(Execution.workdir, 'tests', 'recorder', 'contract-gate.js'));
await (0, eval)('(async () => {\n' + gate + '\n})()');
