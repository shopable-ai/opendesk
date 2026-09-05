// Thin formal OpenDesk Runtime entrypoint. The implementation is kept with the
// Runtime API tests so scripts/ remains an entrypoint directory, not the
// business assertion layer.
'use strict';

const runner = File.join(Execution.workdir, 'tests', 'runtime-api', 'gates', 'catalog-runner.js');
if (!File.isFile(runner)) throw new Error(`Runtime API catalog runner is missing: ${runner}`);
const source = File.read(runner);
await (0, eval)(`(async () => {\n${source}\n})()\n//# sourceURL=${runner}`);
