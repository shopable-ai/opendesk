'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(
  __dirname,
  '..',
  '..',
  'examples',
  'scheduler',
  'schedule-two-notifications.js',
);
const source = fs.readFileSync(sourcePath, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function envelope(data) {
  return {status: 200, data: {code: 0, message: 'success', data}};
}

function createHarness(options = {}) {
  const now = 2_000_000_000_000;
  const jobs = [];
  const runListCalls = new Map();
  const requests = [];
  const logs = [];
  const errors = [];
  const writes = [];
  const deleted = [];

  class ExampleDate extends Date {
    static now() { return now; }
  }

  function runFor(job) {
    const index = jobs.indexOf(job) + 1;
    const executionId = `scheduler-exec-${index}`;
    return {
      id: `run-${index}`,
      jobId: job.id,
      scheduledAt: job.scheduleExpression,
      startedAt: new Date(Date.parse(job.scheduleExpression) + 10).toISOString(),
      finishedAt: new Date(Date.parse(job.scheduleExpression) + 100).toISOString(),
      status: 'succeeded',
      executionId,
    };
  }

  const axios = {
    async post(url, body) {
      requests.push({method: 'POST', url, body});
      assert.equal(url, 'http://127.0.0.1:60944/api/scheduler/jobs');
      const job = {
        ...body,
        id: `job-${jobs.length + 1}`,
        nextRunAt: body.scheduleExpression,
      };
      jobs.push(job);
      return envelope(job);
    },
    async get(url) {
      requests.push({method: 'GET', url});
      if (url === 'http://127.0.0.1:60944/api/scheduler/jobs') {
        return envelope(jobs.map((job) => ({...job, lastRun: runFor(job)})));
      }
      const match = url.match(/\/jobs\/(job-\d+)\/runs$/);
      assert.ok(match, `unexpected GET ${url}`);
      const count = (runListCalls.get(match[1]) || 0) + 1;
      runListCalls.set(match[1], count);
      const job = jobs.find((candidate) => candidate.id === match[1]);
      return envelope(count === 1 ? [] : [runFor(job)]);
    },
    async delete(url) {
      requests.push({method: 'DELETE', url});
      const jobID = decodeURIComponent(url.split('/').pop());
      deleted.push(jobID);
      return envelope({id: jobID, deleted: true});
    },
  };

  const File = {
    join: path.join,
    ensureDir() {},
    async readJSON(filePath) {
      const match = filePath.match(/scheduler-exec-(\d+)\/notify-result\.json$/);
      assert.ok(match, `unexpected readJSON ${filePath}`);
      return {
        status: 'passed',
        scheduled: true,
        executionId: `scheduler-exec-${match[1]}`,
      };
    },
    read(filePath) {
      const match = filePath.match(/scheduler-exec-(\d+)\/stdout\.log$/);
      assert.ok(match, `unexpected read ${filePath}`);
      const executionId = `scheduler-exec-${match[1]}`;
      return [
        `[SCHEDULER_NOTIFY] stage=start mode=scheduler executionId=${executionId}`,
        `[SCHEDULER_NOTIFY] stage=complete mode=scheduler executionId=${executionId}`,
      ].join('\n');
    },
    async writeJSON(filePath, value) {
      writes.push({filePath, value});
    },
  };
  const Execution = {
    env: options.cleanup ? {OPENDESK_SCHEDULER_EXAMPLE_CLEANUP: '1'} : {},
    executionId: 'direct-client',
    workdir: '/workspace',
  };
  const fakeConsole = {
    log(message) { logs.push(String(message)); },
    error(message) { errors.push(String(message)); },
  };

  return {
    axios,
    File,
    Execution,
    Date: ExampleDate,
    console: fakeConsole,
    sleep: async () => {},
    requests,
    logs,
    errors,
    writes,
    deleted,
    jobs,
  };
}

async function runExample(harness) {
  const execute = new AsyncFunction('Execution', 'File', 'axios', 'sleep', 'Date', 'console', source);
  return execute(
    harness.Execution,
    harness.File,
    harness.axios,
    harness.sleep,
    harness.Date,
    harness.console,
  );
}

test('public example creates two future at jobs and waits for Scheduler history', async () => {
  assert.doesNotMatch(source, /setTimeout|setInterval/);
  const harness = createHarness();
  const result = await runExample(harness);

  const creates = harness.requests.filter((request) => request.method === 'POST');
  assert.equal(creates.length, 2);
  assert.ok(creates.every((request) => request.url.endsWith('/jobs')));
  assert.ok(creates.every((request) => request.body.scheduleType === 'at'));
  assert.ok(creates.every((request) => request.body.sourceType === 'file'));
  assert.ok(creates.every((request) => request.body.scriptPath === 'examples/scheduler/notify-and-log.js'));
  assert.equal(
    Date.parse(creates[1].body.scheduleExpression) - Date.parse(creates[0].body.scheduleExpression),
    3000,
  );
  assert.equal(harness.requests.some((request) => request.url.endsWith('/run')), false);

  assert.equal(harness.logs.length, 2);
  assert.match(harness.logs[0], /^\[SCHEDULER_DEMO\] setup=start /);
  assert.match(harness.logs[1], /^\[SCHEDULER_DEMO\] setup=created /);
  assert.deepEqual(harness.errors, []);
  assert.equal(result.status, 'passed');
  assert.equal(result.schedulerTriggered, true);
  assert.equal(result.preDueHistoryEmpty, true);
  assert.equal(result.differentExecutionIDs, true);
  assert.equal(result.jobsRetainedForUI, true);
  assert.deepEqual(result.results.map((item) => item.executionId), [
    'scheduler-exec-1',
    'scheduler-exec-2',
  ]);
  assert.deepEqual(harness.deleted, []);
  assert.equal(harness.writes.length, 1);
  assert.equal(
    harness.writes[0].filePath,
    '/workspace/.runtime/examples/scheduler/schedule-two-notifications-result.json',
  );
});

test('explicit cleanup option deletes only the two jobs created by this run', async () => {
  const harness = createHarness({cleanup: true});
  const result = await runExample(harness);
  assert.equal(result.jobsRetainedForUI, false);
  assert.deepEqual([...harness.deleted].sort(), ['job-1', 'job-2']);
  assert.equal(harness.errors.length, 0);
});
