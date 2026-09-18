'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const examplePath = path.resolve(__dirname, '..', '..', 'examples', 'scheduler', 'schedule-two-notifications.js');
const bridgePath = path.resolve(__dirname, '..', '..', 'examples', 'scheduler', '_test-cli.js');
const exampleSource = fs.readFileSync(examplePath, 'utf8');
const bridgeSource = fs.readFileSync(bridgePath, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function batch() {
  return {
    batchId: 'batch-test',
    status: 'waiting',
    jobs: [
      {kind: 'text', jobId: 'job-text', expectedScheduledAt: '2026-09-18T12:00:15Z'},
      {kind: 'file', jobId: 'job-file', expectedScheduledAt: '2026-09-18T12:00:45Z'},
    ],
  };
}

function createHarness() {
  const calls = [];
  const logs = [];
  const File = {
    join: path.join,
    read(filePath) {
      assert.equal(path.resolve(filePath), bridgePath);
      return bridgeSource;
    },
  };
  const Command = {
    async run(executable, args, options) {
      calls.push({executable, args, options});
      return {stdout: JSON.stringify({ok: true, result: batch()}), stderr: ''};
    },
  };
  return {
    File,
    Command,
    System: {getExecutablePath() { return '/product/OpenDesk'; }},
    Execution: {scriptDir: path.dirname(examplePath), workdir: '/workspace'},
    console: {log(value) { logs.push(String(value)); }},
    calls,
    logs,
  };
}

async function runExample(harness) {
  const previous = {
    Command: globalThis.Command,
    System: globalThis.System,
    Execution: globalThis.Execution,
  };
  globalThis.Command = harness.Command;
  globalThis.System = harness.System;
  globalThis.Execution = harness.Execution;
  const execute = new AsyncFunction('Execution', 'File', 'Command', 'System', 'console', exampleSource);
  try {
    return await execute(harness.Execution, harness.File, harness.Command, harness.System, harness.console);
  } finally {
    globalThis.Command = previous.Command;
    globalThis.System = previous.System;
    globalThis.Execution = previous.Execution;
  }
}

test('compatibility example delegates add to the current App Scheduler CLI', async () => {
  assert.doesNotMatch(exampleSource, /60944|axios|\/api\/scheduler|Run Now/);
  const harness = createHarness();
  const result = await runExample(harness);

  assert.deepEqual(result, batch());
  assert.deepEqual(harness.calls, [{
    executable: '/product/OpenDesk',
    args: ['scheduler', 'test', 'add'],
    options: {cwd: '/workspace', timeout: 30000, maxOutputBytes: 2 << 20, hideWindow: true},
  }]);
  assert.deepEqual(harness.logs, [
    'SCHEDULER_DEMO_ADD=' + JSON.stringify({
      batchId: 'batch-test',
      status: 'waiting',
      jobs: [
        {kind: 'text', jobId: 'job-text', scheduledAt: '2026-09-18T12:00:15Z'},
        {kind: 'file', jobId: 'job-file', scheduledAt: '2026-09-18T12:00:45Z'},
      ],
    }),
  ]);
});
