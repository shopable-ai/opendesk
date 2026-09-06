// Run from the repository root (OpenDesk, not Node):
// OPENDESK_RUNTIME_API_UNIT_FILTER=file,path ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
// Select existing unit files; never publish this subset as results/unit.json.
'use strict';

const selectionFactory = (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/support/unit-selection.js')));
const selector = selectionFactory();
const filter = Execution.env.OPENDESK_RUNTIME_API_UNIT_FILTER;
selector.parse(filter); // Reject empty/unsafe requests before loading the framework.
if (!globalThis.OPENDESK_RUNTIME_API_CONTEXT) {
  globalThis.OPENDESK_RUNTIME_API_CONTEXT = {
    schemaVersion: '1.0.0', runId: Execution.id,
    runDir: File.join(File.cwd(), '.runtime', 'tests', 'runtime-api', Execution.id),
    binary: { path: '', sha256: '', buildSource: 'direct-runtime' },
    startedAt: new Date().toISOString(),
  };
}
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
let selection = null;
try {
  selection = selector.select(RuntimeAPITestFiles.unit, filter);
  RuntimeAPITest.writeGate('unit-selection', { status: 'running', selection, fullCatalog: false });
  for (const file of selection.files) {
    const before = RuntimeAPITest.tests.length;
    RuntimeAPITest.load(file);
    RuntimeAPITest.assert(RuntimeAPITest.tests.length > before, `selected file registered no tests: ${file}`);
  }
  const result = await RuntimeAPITest.run('RUNTIME-API-UNIT-SELECTED');
  RuntimeAPITest.writeGate('runtime-api-unit-selected', { ...result, selection, fullCatalog: false });
  RuntimeAPITest.writeGate('unit-selection', { status: 'passed', selection, fullCatalog: false });
} catch (error) {
  RuntimeAPITest.writeGate('unit-selection', {
    status: 'failed', selection, fullCatalog: false,
    error: String(error && error.message || error),
  });
  throw error;
}
