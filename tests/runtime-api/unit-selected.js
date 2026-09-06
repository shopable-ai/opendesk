// Run from the repository root (OpenDesk, not Node):
// OPENDESK_RUNTIME_API_UNIT_FILTER=file,path ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
// This is the configurable entry; fixed per-family entries live in single/.
'use strict';
const runSelected = (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/support/run-selected.js')));
if (typeof runSelected !== 'function') throw new Error('Runtime API selected runner must be a function');
await runSelected();
