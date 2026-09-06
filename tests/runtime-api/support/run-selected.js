// Shared OpenDesk runner for fixed single-file entries and unit-selected.js.
// Loading this factory is inert; it never modifies Execution or installs a runner global.
(async function runSelected(fixedFilter) {
'use strict';
const selectionFactory = (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/support/unit-selection.js')));
const selector = selectionFactory();
const environmentFilter = Execution.env.OPENDESK_RUNTIME_API_UNIT_FILTER;
if (fixedFilter !== undefined && environmentFilter !== undefined) {
  throw new Error('single-file entry has a fixed scope; unset OPENDESK_RUNTIME_API_UNIT_FILTER or use unit-selected.js');
}
const filter = fixedFilter === undefined ? environmentFilter : fixedFilter;
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
})
