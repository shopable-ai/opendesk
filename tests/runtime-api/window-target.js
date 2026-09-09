// Repository root, embedded OpenDesk runtime only:
// ./dist/opendesk -script tests/runtime-api/window-target.js -console-mode script
// The existing selected runner owns context, registration, results and failure exit.
'use strict';
const runSelected = (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/support/run-selected.js')));
if (typeof runSelected !== 'function') throw new Error('Runtime API selected runner must be a function');
await runSelected('window-target');
