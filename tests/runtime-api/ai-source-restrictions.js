// Verifies that remote HTTP and Scheduler JavaScript executions cannot use
// Agent.run to bypass the Command capability gate.
// From the repository root:
// ./dist/opendesk -script tests/runtime-api/ai-source-restrictions.js -console-mode script
'use strict';

const root = File.join(Execution.workdir, '.runtime', 'tests', 'ai-source-restrictions', Execution.id);
const database = File.join(root, 'scheduler.db');
const serverLogs = File.join(root, 'server-logs');
const port = Number(Execution.env.OPENDESK_AI_RESTRICTION_PORT || 61983);
const baseURL = `http://127.0.0.1:${port}`;
const apiURL = `${baseURL}/api/scheduler`;
const binary = Execution.env.OPENDESK_AI_RUNTIME_BINARY
  || File.join(Execution.workdir, 'dist', 'opendesk');
File.ensureDir(root);

function assert(condition, message) {
  if (!condition) throw new Error('AI source restriction acceptance failed: ' + message);
}

function unwrap(response, operation) {
  assert(response && response.status === 200, `${operation} HTTP status=${response && response.status}`);
  assert(response.data && response.data.code === 0, `${operation} envelope=${JSON.stringify(response && response.data)}`);
  return response.data.data;
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await axios.get(`${baseURL}/status`, {timeout: 500});
      if (response.status === 200 && response.data && response.data.service === 'opendesk') return;
    } catch (_) {
      // The listener may not have reached accept yet.
    }
    await delay(50);
  }
  throw new Error('isolated HTTP Runtime did not become ready');
}

async function waitForHTTPExecution(executionID) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const data = unwrap(await axios.get(`${baseURL}/executions/${encodeURIComponent(executionID)}`, {timeout: 1000}), 'get HTTP execution');
    if (['succeeded', 'failed', 'canceled', 'timeout'].includes(data.status)) return data;
    await delay(50);
  }
  throw new Error(`HTTP execution ${executionID} did not finish`);
}

async function waitForSchedulerRun(jobID, runID) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const runs = unwrap(
      await axios.get(`${apiURL}/jobs/${encodeURIComponent(jobID)}/runs`, {params: {limit: 20}, timeout: 1000}),
      'list Scheduler runs',
    );
    const run = runs.find((candidate) => candidate.id === runID);
    if (run && ['succeeded', 'failed', 'canceled', 'skipped'].includes(run.status)) return run;
    await delay(50);
  }
  throw new Error(`Scheduler run ${runID} did not finish`);
}

const restrictedScript = `
if (Command.getCapabilities().enabled !== false) throw new Error('Command unexpectedly enabled');
const capabilities = Agent.getCapabilities();
if (capabilities.enabled !== false) throw new Error('Agent unexpectedly enabled');
let code = null;
try {
  await Agent.run({prompt: 'must not start any backend'});
} catch (error) {
  code = error && error.code;
}
if (code !== 'DISABLED') throw new Error('Agent.run error=' + String(code));
console.log('AGENT_COMMAND_GATE_PASS ' + Execution.source);
`;

const controller = new AbortController();
let serverError = null;
const serverPending = Command.run(binary, [
  '-http',
  '-port', String(port),
  '-scheduler-db', database,
  '-console-mode', 'script',
  '-log-dir', serverLogs,
], {
  cwd: Execution.workdir,
  timeout: 60_000,
  maxOutputBytes: 4 * 1024 * 1024,
  signal: controller.signal,
}).catch((error) => {
  serverError = error;
  return null;
});

let jobID = null;
try {
  await waitForServer();

  const createdExecution = unwrap(await axios.post(`${baseURL}/executions`, {
    script: restrictedScript,
    timeout: 10,
    consoleMode: 'script',
    logDir: File.join(root, 'http-execution'),
  }, {timeout: 1000}), 'create HTTP execution');
  const httpResult = await waitForHTTPExecution(createdExecution.executionId);
  assert(httpResult.status === 'succeeded', `HTTP execution status=${httpResult.status}`);

  const job = unwrap(await axios.post(`${apiURL}/jobs`, {
    name: `ai-command-gate-${Date.now()}`,
    sourceType: 'inline',
    inlineScript: restrictedScript,
    scheduleType: 'at',
    scheduleExpression: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    timezone: 'UTC',
    misfirePolicy: 'run_once',
    taskType: 'script',
  }, {timeout: 1000}), 'create Scheduler job');
  jobID = job.id;
  const queued = unwrap(
    await axios.post(`${apiURL}/jobs/${encodeURIComponent(jobID)}/run`, null, {timeout: 1000}),
    'run Scheduler job',
  );
  const schedulerRun = await waitForSchedulerRun(jobID, queued.id);
  assert(schedulerRun.status === 'succeeded', `Scheduler run status=${schedulerRun.status} error=${schedulerRun.error || ''}`);

  console.log('[AI-SOURCE-RESTRICTIONS PASS] HTTP and Scheduler Agent.run remained Command-gated');
} finally {
  if (jobID) {
    try { await axios.delete(`${apiURL}/jobs/${encodeURIComponent(jobID)}`, {timeout: 1000}); } catch (_) {}
  }
  controller.abort('fixture complete');
  await serverPending;
  if (serverError && serverError.code !== 'CANCELED') throw serverError;
}
