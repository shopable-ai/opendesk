// Recorder contract/integration gate loaded by scripts/test_recorder.js.
// Formal command from the repository root:
// ./dist/opendesk -script scripts/test_recorder.js -console-mode script

'use strict';

const repoRoot = Execution.workdir;
const requestedRunId = Execution.env.RECORDER_TEST_RUN_ID || Execution.id;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(requestedRunId)) {
  throw new Error(`invalid RECORDER_TEST_RUN_ID: ${requestedRunId}`);
}
const evidenceRoot = Execution.env.RECORDER_EVIDENCE_ROOT
  ? File.path(Execution.env.RECORDER_EVIDENCE_ROOT)
  : File.join(repoRoot, '.runtime', 'tests', 'recorder', requestedRunId);
const schemaDirectory = File.join(repoRoot, 'schemas', 'recorder');

function fail(message) {
  throw new Error(message);
}

async function run() {
  File.ensureDir(evidenceRoot);
  let testResult;
  try {
    testResult = await Command.run('go', [
      'test',
      './pkg/recorder',
      './pkg/mcpserver',
      './apps/recorder',
      './tests/recorder/tools/...',
    ], {
      cwd: repoRoot,
      timeout: 20 * 60_000,
      maxOutputBytes: 32 * 1024 * 1024,
    });
  } catch (error) {
    File.write(File.join(evidenceRoot, 'go-test.stdout.log'), String(error.stdout || ''));
    File.write(File.join(evidenceRoot, 'go-test.stderr.log'), String(error.stderr || ''));
    fail(`Recorder Go tests failed: ${error.stderr || error.stdout || error.message || error}`);
  }
  File.write(File.join(evidenceRoot, 'go-test.stdout.log'), testResult.stdout);
  File.write(File.join(evidenceRoot, 'go-test.stderr.log'), testResult.stderr);

  const schemas = File.listDir(schemaDirectory)
    .map(String)
    .filter(name => name.endsWith('.schema.json'))
    .sort();
  if (schemas.length === 0) fail(`Recorder schemas are missing: ${schemaDirectory}`);
  for (const name of schemas) {
    const path = name.startsWith(schemaDirectory) ? name : File.join(schemaDirectory, name);
    const value = JSON.parse(File.read(path));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail(`Recorder schema must be a JSON object: ${path}`);
    }
  }

  const summary = {
    schemaVersion: 1,
    ok: true,
    executionId: Execution.id,
    scope: 'Recorder contract and integration tests',
    schemaCount: schemas.length,
    schemas: schemas.map(name => `schemas/recorder/${File.getName(name)}`),
    goTest: {
      exitCode: testResult.exitCode,
      packages: [
        './pkg/recorder',
        './pkg/mcpserver',
        './apps/recorder',
        './tests/recorder/tools/...',
      ],
    },
    evidenceDirectory: evidenceRoot,
  };
  await File.writeJSON(File.join(evidenceRoot, 'summary.json'), summary);
  await File.writeJSON(File.join(Execution.artifactDir, 'recorder-contract-summary.json'), summary);
  console.log(`[PASS] Recorder contract/integration gate; schemas=${schemas.length}; evidence=${evidenceRoot}`);
}

await run();
