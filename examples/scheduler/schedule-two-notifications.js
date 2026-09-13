// Run both commands from the repository root. Keep terminal A running:
// ./dist/opendesk -http -ui -port 60944 -scheduler-db ./.runtime/examples/scheduler/scheduler.db -console-mode script
// Then run this Scheduler client in terminal B:
// OPENDESK_SCHEDULER_API_URL=http://127.0.0.1:60944/api/scheduler ./dist/opendesk -script examples/scheduler/schedule-two-notifications.js -console-mode script
'use strict';

const apiURL = String(
  Execution.env.OPENDESK_SCHEDULER_API_URL
    || 'http://127.0.0.1:60944/api/scheduler',
).replace(/\/+$/, '');
const cleanupRequested = String(
  Execution.env.OPENDESK_SCHEDULER_EXAMPLE_CLEANUP || '',
).trim() === '1';
const payloadPath = 'examples/scheduler/notify-and-log.js';
const firstDelayMs = 3000;
const secondDelayMs = 6000;
const terminalTimeoutMs = 45000;
const terminalStatuses = ['succeeded', 'failed', 'canceled', 'skipped'];
const resultDir = File.join(
  Execution.workdir,
  '.runtime',
  'examples',
  'scheduler',
);
const resultPath = File.join(resultDir, 'schedule-two-notifications-result.json');
const createdJobIDs = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Scheduler notification example failed: ${message}`);
}

function unwrap(response, operation) {
  assert(response && response.status === 200, `${operation} HTTP status=${response && response.status}`);
  const envelope = response.data;
  assert(envelope && envelope.code === 0, `${operation} envelope=${JSON.stringify(envelope)}`);
  return envelope.data;
}

async function createNotificationJob(index, scheduledFor, token) {
  const job = unwrap(
    await axios.post(`${apiURL}/jobs`, {
      name: `Scheduler notification ${index} · ${token}`,
      sourceType: 'file',
      scriptPath: payloadPath,
      scheduleType: 'at',
      scheduleExpression: scheduledFor,
      timezone: 'UTC',
      misfirePolicy: 'run_once',
      taskType: 'script',
    }, {timeout: 3000}),
    `create notification job ${index}`,
  );
  assert(typeof job.id === 'string' && job.id.length > 0, `job ${index} has no id`);
  assert(job.sourceType === 'file', `job ${index} sourceType=${JSON.stringify(job.sourceType)}`);
  assert(job.scriptPath === payloadPath, `job ${index} scriptPath=${JSON.stringify(job.scriptPath)}`);
  assert(
    Date.parse(job.nextRunAt) === Date.parse(scheduledFor),
    `job ${index} nextRunAt=${JSON.stringify(job.nextRunAt)} due=${scheduledFor}`,
  );
  createdJobIDs.push(job.id);
  return job;
}

async function listRuns(jobID) {
  const runs = unwrap(
    await axios.get(`${apiURL}/jobs/${encodeURIComponent(jobID)}/runs`, {
      params: {limit: 20},
      timeout: 3000,
    }),
    `list runs for ${jobID}`,
  );
  assert(Array.isArray(runs), `run history for ${jobID} is not an array`);
  assert(runs.length <= 1, `one-time job ${jobID} produced ${runs.length} runs`);
  return runs;
}

async function waitForAutomaticRuns(jobs) {
  const deadline = Date.now() + terminalTimeoutMs;
  const completed = new Map();
  while (Date.now() < deadline) {
    for (const job of jobs) {
      if (completed.has(job.id)) continue;
      const runs = await listRuns(job.id);
      if (runs[0] && terminalStatuses.includes(runs[0].status)) {
        completed.set(job.id, runs[0]);
      }
    }
    if (completed.size === jobs.length) {
      return jobs.map((job) => completed.get(job.id));
    }
    await sleep(100);
  }
  throw new Error(`Scheduler notification example failed: jobs did not finish within ${terminalTimeoutMs}ms`);
}

async function deleteCreatedJobs() {
  while (createdJobIDs.length > 0) {
    const jobID = createdJobIDs.pop();
    try {
      unwrap(
        await axios.delete(`${apiURL}/jobs/${encodeURIComponent(jobID)}`, {timeout: 3000}),
        `delete job ${jobID}`,
      );
    } catch (error) {
      console.error(`[SCHEDULER_DEMO] cleanup=failed jobId=${jobID} error=${String(error)}`);
    }
  }
}

try {
  console.log(`[SCHEDULER_DEMO] setup=start api=${apiURL} payload=${payloadPath}`);

  const scheduledFrom = Date.now();
  const scheduledTimes = [firstDelayMs, secondDelayMs]
    .map((delayMs) => new Date(scheduledFrom + delayMs).toISOString());
  const token = `${scheduledFrom}-${Execution.executionId}`;
  const jobs = [
    await createNotificationJob(1, scheduledTimes[0], token),
    await createNotificationJob(2, scheduledTimes[1], token),
  ];

  console.log(
    `[SCHEDULER_DEMO] setup=created firstJobId=${jobs[0].id} firstDue=${scheduledTimes[0]}`
      + ` secondJobId=${jobs[1].id} secondDue=${scheduledTimes[1]}`,
  );

  assert(Date.now() < Date.parse(scheduledTimes[0]), 'jobs were not both observable before the first due time');
  const preDueRuns = await Promise.all(jobs.map((job) => listRuns(job.id)));
  assert(preDueRuns.every((runs) => runs.length === 0), 'a job had run history before its due time');

  const runs = await waitForAutomaticRuns(jobs);
  const executionIDs = new Set();
  const results = [];
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index];
    const run = runs[index];
    const due = scheduledTimes[index];
    assert(run.status === 'succeeded', `job ${index + 1} status=${run.status} error=${run.error || ''}`);
    assert(run.jobId === job.id, `job ${index + 1} run jobId=${JSON.stringify(run.jobId)}`);
    assert(Date.parse(run.scheduledAt) === Date.parse(due), `job ${index + 1} scheduledAt=${run.scheduledAt}`);
    assert(Date.parse(run.startedAt) >= Date.parse(due), `job ${index + 1} started before it was due`);
    assert(typeof run.executionId === 'string' && run.executionId.length > 0, `job ${index + 1} has no executionId`);
    executionIDs.add(run.executionId);

    const artifactDir = File.join(Execution.workdir, '.runtime', 'runs', run.executionId);
    const notificationResultPath = File.join(artifactDir, 'notify-result.json');
    const stdoutPath = File.join(artifactDir, 'stdout.log');
    const notificationResult = await File.readJSON(notificationResultPath, {defaultValue: null});
    const stdout = File.read(stdoutPath);
    assert(notificationResult && notificationResult.status === 'passed', `job ${index + 1} has no notification result`);
    assert(notificationResult.scheduled === true, `job ${index + 1} payload did not detect Scheduler`);
    assert(notificationResult.executionId === run.executionId, `job ${index + 1} notification executionId mismatch`);
    assert(
      stdout.includes(`[SCHEDULER_NOTIFY] stage=start mode=scheduler executionId=${run.executionId}`),
      `job ${index + 1} stdout has no start marker`,
    );
    assert(
      stdout.includes(`[SCHEDULER_NOTIFY] stage=complete mode=scheduler executionId=${run.executionId}`),
      `job ${index + 1} stdout has no complete marker`,
    );
    results.push({
      index: index + 1,
      jobId: job.id,
      jobName: job.name,
      runId: run.id,
      executionId: run.executionId,
      scheduledAt: run.scheduledAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      stdoutPath,
      notificationResultPath,
    });
  }
  assert(executionIDs.size === 2, 'the two Scheduler runs did not receive different executionIds');

  const listedJobs = unwrap(await axios.get(`${apiURL}/jobs`, {timeout: 3000}), 'list retained jobs');
  for (let index = 0; index < jobs.length; index++) {
    const listed = listedJobs.find((job) => job.id === jobs[index].id);
    assert(listed, `completed job ${index + 1} is not visible in the job list`);
    assert(listed.lastRun && listed.lastRun.id === runs[index].id, `job ${index + 1} has no matching lastRun`);
  }

  if (cleanupRequested) await deleteCreatedJobs();
  const evidence = {
    schemaVersion: 1,
    status: 'passed',
    schedulerTriggered: true,
    apiURL,
    payloadPath,
    preDueHistoryEmpty: true,
    differentExecutionIDs: true,
    jobsRetainedForUI: !cleanupRequested,
    results,
    recordedAt: new Date().toISOString(),
  };
  File.ensureDir(resultDir);
  await File.writeJSON(resultPath, evidence, {spaces: 2});
  return evidence;
} finally {
  if (cleanupRequested && createdJobIDs.length > 0) await deleteCreatedJobs();
}
