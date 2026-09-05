'use strict';

function fail(message) {
  throw new Error(message);
}

async function curl(args, label) {
  try {
    return await Command.run('/usr/bin/curl', args, {
      cwd: Execution.workdir,
      timeout: 10_000,
      maxOutputBytes: 4 * 1024 * 1024,
    });
  } catch (error) {
    fail(`${label} failed: ${error.stderr || error.stdout || error.message || error}`);
  }
}

const base = Execution.env.OPENDESK_RUNTIME_API_HTTP_BASE;
const runDir = Execution.env.OPENDESK_RUNTIME_API_RUN_DIR;
if (!base || !runDir) fail('environment HTTP seam context is missing');

const requestPath = File.join(runDir, 'environment', 'http-request.json');
const responsePath = File.join(runDir, 'environment', 'http-response.json');
const statusPath = File.join(runDir, 'environment', 'http-status.json');
const source = File.read(File.join(Execution.workdir, 'tests', 'runtime-api', 'acceptance', 'environment-http-isolation.js'));
const payload = {
  script: source,
  timeout: 10,
  consoleMode: 'script',
  logDir: File.join(runDir, 'runtime-logs', 'environment-http'),
};
await File.writeJSON(requestPath, payload);

const create = await curl([
  '--fail', '--silent', '--show-error', '--max-time', '5',
  '-H', 'Content-Type: application/json', '--data-binary', `@${requestPath}`, `${base}/executions`,
], 'environment HTTP execution creation');
File.write(responsePath, create.stdout);
const created = JSON.parse(create.stdout);
const executionId = created && created.data && created.data.executionId;
if (!executionId) fail('environment HTTP execution ID is missing');

let status = '';
for (let attempt = 0; attempt < 100; attempt += 1) {
  const current = await curl([
    '--fail', '--silent', '--show-error', '--max-time', '2', `${base}/executions/${executionId}`,
  ], 'environment HTTP execution status');
  File.write(statusPath, current.stdout);
  const value = JSON.parse(current.stdout);
  status = value && value.data && value.data.status || '';
  if (['succeeded', 'failed', 'timed_out', 'canceled'].includes(status)) break;
  await delay(50);
}
if (status !== 'succeeded') fail(`environment HTTP isolation failed with status ${status}`);
console.log(`[RUNTIME-API-ENVIRONMENT] HTTP isolation execution=${executionId} status=${status}`);
