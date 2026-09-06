// Run from the repository root: ./dist/opendesk -script tests/runtime-api/single/clipboard.js -console-mode script
// Thin fixed-scope entry. Assertions remain in the existing Runtime unit manifest.
'use strict';
const runSelected = (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/support/run-selected.js')));
if (typeof runSelected !== 'function') throw new Error('Runtime API selected runner must be a function');
await runSelected('clipboard');
