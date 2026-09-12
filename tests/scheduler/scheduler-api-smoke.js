// Scheduler HTTP API acceptance test.
//
// Start an isolated Scheduler from the repository root, then run this file with
// a trusted local OpenDesk binary. See tests/scheduler/README.md.
'use strict';

const apiURL = String(
  Execution.env.OPENDESK_SCHEDULER_API_URL
    || 'http://127.0.0.1:60844/api/scheduler',
).replace(/\/+$/, '');
const evidenceDir = File.join(
  Execution.workdir,
  '.runtime',
  'tests',
  'scheduler',
  'js-api-smoke',
);
const evidencePath = File.join(evidenceDir, 'result.json');
const exampleEvidencePath = File.join(
  Execution.workdir,
  '.runtime',
  'examples',
  'scheduler',
  'last-run.json',
);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function assert(condition, message) {
  if (!condition) throw new Error(`Scheduler acceptance failed: ${message}`);
}

function unwrap(response, operation) {
  assert(response && response.status === 200, `${operation} HTTP status=${response && response.status}`);
  const envelope = response.data;
  assert(envelope && envelope.code === 0, `${operation} envelope=${JSON.stringify(envelope)}`);
  return envelope.data;
}

async function waitForTerminalRun(jobID, runID) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const runs = unwrap(
      await axios.get(`${apiURL}/jobs/${encodeURIComponent(jobID)}/runs`, {
        params: {limit: 20},
        timeout: 3000,
      }),
      'list runs',
    );
    assert(Array.isArray(runs), 'run history is not an array');
    const run = runs.find((candidate) => candidate.id === runID);
    if (run && ['succeeded', 'failed', 'canceled', 'skipped'].includes(run.status)) {
      return {run, runs};
    }
    await sleep(100);
  }
  throw new Error(`Scheduler acceptance failed: run ${runID} did not finish within 20s`);
}

let jobID = '';
let fileJobID = '';
try {
  const name = `scheduler-js-smoke-${Date.now()}`;
  const created = unwrap(
    await axios.post(`${apiURL}/jobs`, {
      name,
      sourceType: 'inline',
      inlineScript: "console.log('SCHEDULER_JS_PAYLOAD_EXECUTED'); return {ok:true};",
      scheduleType: 'at',
      scheduleExpression: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timezone: 'UTC',
      misfirePolicy: 'run_once',
      taskType: 'script',
    }, {timeout: 3000}),
    'create job',
  );
  jobID = created.id;
  assert(typeof jobID === 'string' && jobID.length > 0, 'created job has no id');
  assert(created.name === name, `created name=${JSON.stringify(created.name)}`);
  assert(created.sourceType === 'inline', `created sourceType=${JSON.stringify(created.sourceType)}`);
  assert(created.hasInlineScript === true, 'created job does not report persisted inline source');
  assert(!own(created, 'inlineScript'), 'create response leaked inline source');

  const jobs = unwrap(await axios.get(`${apiURL}/jobs`, {timeout: 3000}), 'list jobs');
  assert(Array.isArray(jobs), 'job list is not an array');
  const listed = jobs.find((job) => job.id === jobID);
  assert(listed, `created job ${jobID} is absent from list`);
  assert(!own(listed, 'inlineScript'), 'job list leaked inline source');

  const paused = unwrap(
    await axios.post(`${apiURL}/jobs/${encodeURIComponent(jobID)}/pause`, null, {timeout: 3000}),
    'pause job',
  );
  assert(paused.enabled === false, 'pause did not disable job');

  const resumed = unwrap(
    await axios.post(`${apiURL}/jobs/${encodeURIComponent(jobID)}/resume`, null, {timeout: 3000}),
    'resume job',
  );
  assert(resumed.enabled === true, 'resume did not enable job');

  const pausedAgain = unwrap(
    await axios.post(`${apiURL}/jobs/${encodeURIComponent(jobID)}/pause`, null, {timeout: 3000}),
    'pause job before run-now',
  );
  assert(pausedAgain.enabled === false, 'second pause did not disable job');

  const queued = unwrap(
    await axios.post(`${apiURL}/jobs/${encodeURIComponent(jobID)}/run`, null, {timeout: 3000}),
    'run job now',
  );
  assert(typeof queued.id === 'string' && queued.id.length > 0, 'run-now returned no run id');
  assert(queued.jobId === jobID, `run-now jobId=${JSON.stringify(queued.jobId)}`);
  assert(queued.status === 'queued', `run-now status=${JSON.stringify(queued.status)}`);

  const {run, runs} = await waitForTerminalRun(jobID, queued.id);
  assert(run.status === 'succeeded', `run finished with status=${run.status} error=${run.error || ''}`);
  assert(typeof run.executionId === 'string' && run.executionId.length > 0, 'successful run has no executionId');
  assert(runs.filter((candidate) => candidate.id === queued.id).length === 1, 'run history duplicated the occurrence');

  const deleted = unwrap(
    await axios.delete(`${apiURL}/jobs/${encodeURIComponent(jobID)}`, {timeout: 3000}),
    'delete job',
  );
  assert(deleted.id === jobID && deleted.deleted === true, `delete response=${JSON.stringify(deleted)}`);
  jobID = '';

  const jobsAfterDelete = unwrap(await axios.get(`${apiURL}/jobs`, {timeout: 3000}), 'list after delete');
  assert(!jobsAfterDelete.some((job) => job.id === created.id), 'deleted job remains listed');

  const fileCreated = unwrap(
    await axios.post(`${apiURL}/jobs`, {
      name: `scheduler-file-example-${Date.now()}`,
      sourceType: 'file',
      scriptPath: 'examples/scheduler/write-evidence.js',
      scheduleType: 'at',
      scheduleExpression: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timezone: 'UTC',
      misfirePolicy: 'run_once',
      taskType: 'script',
    }, {timeout: 3000}),
    'create file example job',
  );
  fileJobID = fileCreated.id;
  assert(typeof fileJobID === 'string' && fileJobID.length > 0, 'created file job has no id');
  assert(fileCreated.sourceType === 'file', `file sourceType=${JSON.stringify(fileCreated.sourceType)}`);
  assert(
    fileCreated.scriptPath === 'examples/scheduler/write-evidence.js',
    `file scriptPath=${JSON.stringify(fileCreated.scriptPath)}`,
  );

  const fileQueued = unwrap(
    await axios.post(`${apiURL}/jobs/${encodeURIComponent(fileJobID)}/run`, null, {timeout: 3000}),
    'run file example now',
  );
  assert(fileQueued.jobId === fileJobID, `file run-now jobId=${JSON.stringify(fileQueued.jobId)}`);
  assert(fileQueued.status === 'queued', `file run-now status=${JSON.stringify(fileQueued.status)}`);

  const {run: fileRun, runs: fileRuns} = await waitForTerminalRun(fileJobID, fileQueued.id);
  assert(
    fileRun.status === 'succeeded',
    `file run finished with status=${fileRun.status} error=${fileRun.error || ''}`,
  );
  assert(
    typeof fileRun.executionId === 'string' && fileRun.executionId.length > 0,
    'successful file run has no executionId',
  );
  assert(
    fileRuns.filter((candidate) => candidate.id === fileQueued.id).length === 1,
    'file run history duplicated the occurrence',
  );

  const exampleEvidence = await File.readJSON(exampleEvidencePath, {defaultValue: null});
  assert(exampleEvidence && exampleEvidence.status === 'passed', 'file example wrote no passing evidence');
  assert(exampleEvidence.scheduled === true, 'file example did not identify Scheduler execution');
  assert(
    exampleEvidence.executionId === fileRun.executionId,
    `file evidence executionId=${JSON.stringify(exampleEvidence.executionId)}`
      + ` history executionId=${JSON.stringify(fileRun.executionId)}`,
  );
  assert(
    String(exampleEvidence.source).startsWith('scheduler:file:'),
    `file example source=${JSON.stringify(exampleEvidence.source)}`,
  );

  const fileDeleted = unwrap(
    await axios.delete(`${apiURL}/jobs/${encodeURIComponent(fileJobID)}`, {timeout: 3000}),
    'delete file example job',
  );
  assert(
    fileDeleted.id === fileJobID && fileDeleted.deleted === true,
    `file delete response=${JSON.stringify(fileDeleted)}`,
  );
  fileJobID = '';

  const evidence = {
    schemaVersion: 1,
    status: 'passed',
    apiURL,
    jobId: created.id,
    runId: run.id,
    executionId: run.executionId,
    runStatus: run.status,
    sourceType: created.sourceType,
    sourceRedacted: !own(created, 'inlineScript') && !own(listed, 'inlineScript'),
    pauseResumeVerified: true,
    runNowWhilePausedVerified: true,
    schedulerExampleVerified: true,
    fileJobId: fileCreated.id,
    fileRunId: fileRun.id,
    fileExecutionId: fileRun.executionId,
    fileRunStatus: fileRun.status,
    fileOccurrenceCount: fileRuns.filter((candidate) => candidate.id === fileQueued.id).length,
    exampleEvidencePath,
    deleted: true,
    recordedAt: new Date().toISOString(),
  };
  File.ensureDir(evidenceDir);
  await File.writeJSON(evidencePath, evidence, {spaces: 2});
  console.log(`SCHEDULER_JS_ACCEPTANCE_PASS evidence=${evidencePath}`);
} finally {
  for (const cleanupJobID of [jobID, fileJobID]) {
    if (!cleanupJobID) continue;
    try {
      await axios.delete(`${apiURL}/jobs/${encodeURIComponent(cleanupJobID)}`, {timeout: 3000});
    } catch (cleanupError) {
      console.error(`Scheduler acceptance cleanup failed for ${cleanupJobID}: ${cleanupError}`);
    }
  }
}
