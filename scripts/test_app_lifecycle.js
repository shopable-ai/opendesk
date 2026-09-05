// macOS App lifecycle gate entry for the OpenDesk Runtime.
// From the repository root (explicit live opt-in):
// OPENDESK_LIVE_APP_LIFECYCLE=1 ./dist/opendesk -script scripts/test_app_lifecycle.js -console-mode script

'use strict';

const gate = File.read(File.join(Execution.workdir, 'tests', 'app-lifecycle', 'gate.js'));
await (0, eval)('(async () => {\n' + gate + '\n})()');
