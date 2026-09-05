// Run from the repository root:
// ./dist/opendesk -script examples/sqlite/smoke.test.js -console-mode script

const smokeCasesPath = File.path('examples/sqlite/smoke-cases.js');
(0, eval)(File.read(smokeCasesPath) + '\n//# sourceURL=' + smokeCasesPath);

async function main() {
  const root = SQLiteSmokeCases.makeRoot('example-smoke');
  const result = await SQLiteSmokeCases.runBehaviorSuite({
    root,
    label: 'examples/sqlite/smoke.test.js',
  });
  const evidencePath = File.join(root, 'smoke-result.json');
  File.write(evidencePath, JSON.stringify(result, null, 2));
  console.log('[SQLITE SMOKE RESULT] ' + JSON.stringify({
    status: result.status,
    total: result.total,
    passed: result.passed,
    failed: result.failed,
    skipped: result.skipped,
    evidencePath,
  }));
  if (result.failed !== 0) {
    throw new Error('SQLite smoke failed: ' + result.failed + '/' + result.total + ' cases; evidence=' + evidencePath);
  }
}

await main();
