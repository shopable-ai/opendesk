// Repository smoke gate entry for the OpenDesk Runtime.
// From the repository root:
// ./dist/opendesk -script scripts/e2e_smoke.js -console-mode script

'use strict';

const gate = File.read(File.join(Execution.workdir, 'tests', 'e2e', 'smoke.js'));
await (0, eval)('(async () => {\n' + gate + '\n})()');
