// Run from the repository root:
// ./dist/opendesk -script examples/scheduler/write-evidence.js -console-mode script
//
// Use the same relative path when creating a Scheduler file task. The stable
// last-run file makes it easy to confirm which Execution actually ran it.
'use strict';

const evidenceDir = File.join(
  Execution.workdir,
  '.runtime',
  'examples',
  'scheduler',
);
const runsDir = File.join(evidenceDir, 'runs');
const evidence = {
  schemaVersion: 1,
  status: 'passed',
  executionId: Execution.executionId,
  source: Execution.source,
  scheduled: String(Execution.source).startsWith('scheduler:file:'),
  scriptPath: Execution.scriptPath,
  scriptDir: Execution.scriptDir,
  workdir: Execution.workdir,
  executedAt: new Date().toISOString(),
};
const runEvidencePath = File.join(runsDir, `${Execution.executionId}.json`);
const lastRunPath = File.join(evidenceDir, 'last-run.json');

File.ensureDir(runsDir);
await File.writeJSON(runEvidencePath, evidence, {spaces: 2});
await File.writeJSON(lastRunPath, evidence, {spaces: 2});

console.log(
  `SCHEDULER_EXAMPLE_PASS mode=${evidence.scheduled ? 'scheduler' : 'direct'}`
    + ` executionId=${Execution.executionId} evidence=${lastRunPath}`,
);
