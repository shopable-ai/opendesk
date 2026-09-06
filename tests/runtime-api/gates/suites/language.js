// language: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_ID, RUN_DIR, CONTEXT, fail, parseJSON, readJSON, writeJSON, runJS, verifyZeroCleanup, noResidual } = context;

async function language() {
  const gate = 'language';
  const result = await runJS(gate, File.join(ROOT_DIR, 'tests', 'runtime-api', 'javascript-language.js'), 3, 120);
  const marker = '[RUNTIME-JS-LANGUAGE] ';
  const reports = result.stdout.split(/\r?\n/)
    .filter((line) => line.includes(marker))
    .map((line) => parseJSON(line.slice(line.indexOf(marker) + marker.length), 'JavaScript language report'));
  if (reports.length !== 1 || reports[0].status !== 'passed') {
    fail(`JavaScript language gate emitted an invalid report: ${JSON.stringify(reports)}`);
  }
  const expectedChecks = [
    'es2015-core', 'es2015-template-literal', 'es2016', 'es2017',
    'es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'es2023',
    'opendesk-script-level-await',
  ];
  if (JSON.stringify(reports[0].checks) !== JSON.stringify(expectedChecks)) {
    fail(`JavaScript language checks changed: ${JSON.stringify(reports[0].checks)}`);
  }
  await verifyZeroCleanup(gate);
  await noResidual();
  const context = await readJSON(CONTEXT);
  await writeJSON(File.join(RUN_DIR, 'results', 'language.json'), {
    schemaVersion: '1.0.0',
    runId: RUN_ID,
    gate,
    startedAt: context.startedAt,
    finishedAt: new Date().toISOString(),
    runtime: context.binary,
    status: 'passed',
    checks: reports[0].checks,
  });
}

return Object.freeze({ language });
})
