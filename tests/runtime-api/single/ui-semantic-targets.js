// Run from the repository root:
// ./dist/opendesk -script tests/runtime-api/single/ui-semantic-targets.js -console-mode script
// Fixed-scope entry for the semantic UI.tapTargets contract. It deliberately
// bypasses the global unit manifest so this focused regression can be executed
// independently while the catalog remains stable for parallel work.
'use strict';

if (!globalThis.OPENDESK_RUNTIME_API_CONTEXT) {
  globalThis.OPENDESK_RUNTIME_API_CONTEXT = {
    schemaVersion: '1.0.0',
    runId: Execution.id,
    runDir: File.join(File.cwd(), '.runtime', 'tests', 'runtime-api', Execution.id),
    binary: { path: '', sha256: '', buildSource: 'direct-runtime' },
    startedAt: new Date().toISOString(),
  };
}

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
const files = [
  'tests/runtime-api/unit/ui-semantic-targets.test.js',
  'tests/runtime-api/unit/ui-semantic-targets-cancel.test.js',
];
for (const file of files) {
  const before = RuntimeAPITest.tests.length;
  RuntimeAPITest.load(file);
  RuntimeAPITest.assert(RuntimeAPITest.tests.length > before, `semantic target suite registered no tests: ${file}`);
}
const result = await RuntimeAPITest.run('RUNTIME-API-UI-SEMANTIC-TARGETS');
RuntimeAPITest.writeGate('ui-semantic-targets', {
  ...result,
  files,
  fullCatalog: false,
});
