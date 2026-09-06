// file-json: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, BINARY, fail, parseJSON, readJSON, record, executeProcess, runJS, verifyZeroCleanup, noResidual } = context;

async function fileJSON() {
  await runJS('file-json', File.join(ROOT_DIR, 'tests', 'runtime-api', 'file-json.js'), 3, 120);
  await verifyZeroCleanup('file-json');

  const gate = 'file-json-ai-run';
  const stdoutPath = File.join(RUN_DIR, 'results', `${gate}.stdout.json`);
  const stderrPath = File.join(RUN_DIR, 'results', `${gate}.stderr.log`);
  const result = await executeProcess(gate, BINARY, [
    'ai', 'run', File.join(ROOT_DIR, 'tests', 'runtime-api', 'acceptance', 'file-json.js'),
  ], { deadlineSeconds: 120, stdoutPath, stderrPath, display: false });
  if (result.exitCode !== 0) fail(`File JSON ai run failed with status ${result.exitCode}: ${result.stderr}`);
  const payload = parseJSON(result.stdout, 'File JSON ai run envelope');
  if (payload.ok !== true || payload.command !== 'run') fail('File JSON ai run did not return a successful run envelope');
  const runDir = payload.result && payload.result.artifacts && payload.result.artifacts.runDir;
  if (!runDir || !File.isDir(runDir)) fail('File JSON ai run did not return an existing artifact directory');
  const report = File.join(runDir, 'file-json-acceptance', 'report.json');
  if (!File.isFile(report) || (await readJSON(report)).ok !== true) fail(`File JSON acceptance report is missing or invalid: ${report}`);
  const events = File.join(runDir, 'events.ndjson');
  let cleanupEvent = null;
  for (const line of File.read(events).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseJSON(line, events);
    if (event.kind === 'cleanup') cleanupEvent = event.fields || {};
  }
  if (!cleanupEvent) fail('File JSON ai run did not record cleanup evidence');
  const required = ['fileJSONWorkers', 'fileJSONCallbacks', 'fileJSONTemps', 'fileHandles'];
  const bad = required.filter((key) => cleanupEvent[key] !== 0);
  if (bad.length > 0) fail(`File JSON ai run left resources: ${JSON.stringify(bad.map((key) => [key, cleanupEvent[key]]))}`);
  console.log(`[RUNTIME-API-FILE-JSON] ai run report=${report}`);
  await noResidual();
}

return Object.freeze({ fileJSON });
})
