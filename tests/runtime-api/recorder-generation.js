// Real OpenDesk Runtime, isolated desktop owners and synthetic fixed recording files.
// This gate never grants capture/Accessibility or sends desktop input.
globalThis.OPENDESK_RUNTIME_API_CONTEXT = {
  schemaVersion: '1.0.0', runId: 'recorder-generation-' + Execution.id,
  runDir: File.join(File.cwd(), '.runtime', 'tests', 'recorder-generation', Execution.id),
  binary: { path: System.getExecutablePath(), sha256: '', buildSource: 'current-built-runtime; CI records binary SHA256 separately' },
  startedAt: new Date().toISOString(),
};
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/unit/ui-sequence.test.js');
RuntimeAPITest.load('tests/runtime-api/unit/ui-target-sequence.test.js');
RuntimeAPITest.load('tests/runtime-api/unit/ui-semantic-targets.test.js');
RuntimeAPITest.load('tests/runtime-api/unit/ui-semantic-targets-cancel.test.js');
RuntimeAPITest.load('tests/runtime-api/unit/recorder.test.js');
await RuntimeAPITest.run('RUNTIME-API-RECORDER-GENERATION');
