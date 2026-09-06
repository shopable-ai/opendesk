// environment: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, BINARY, fail, parseJSON, readJSON, record, executeProcess, runJS, verifyZeroCleanup, noResidual } = context;

async function environment() {
  const environmentDir = File.join(RUN_DIR, 'environment');
  const envFile = File.join(environmentDir, 'project.env');
  const defaultProject = File.join(environmentDir, 'default-project');
  File.ensureDir(environmentDir);
  File.write(envFile, `OPENDESK_ENV_FILE_ONLY=file-value
OPENDESK_ENV_PRECEDENCE=file-value
OPENDESK_ENV_LITERAL=\${SHOULD_NOT_EXPAND}
OPENDESK_ENV_EMPTY=
export OPENDESK_ENV_QUOTED='quoted value'
__proto__=literal-key
`);
  File.ensureDir(defaultProject);
  File.write(File.join(defaultProject, '.env'), `OPENDESK_ENV_DOTENV_ONLY=dotenv-value
OPENDESK_ENV_DEFAULT_PRECEDENCE=dotenv-value
`);
  File.write(File.join(defaultProject, '.opendesk.env'), `OPENDESK_ENV_OPENDESK_ONLY=opendesk-value
OPENDESK_ENV_DEFAULT_PRECEDENCE=opendesk-value
`);
  await runJS('environment', File.join(ROOT_DIR, 'tests', 'runtime-api', 'environment.js'), 3, 120, {
    runtimePrefixArgs: ['-env-file', envFile],
    env: { OPENDESK_ENV_PRECEDENCE: 'shell-value', OPENDESK_ENV_SYSTEM_ONLY: 'system=a=b' },
  });
  await verifyZeroCleanup('environment');

  const defaultGate = 'environment-default-files';
  const defaultFiles = await executeProcess(defaultGate, BINARY, [
    '-script', File.join(ROOT_DIR, 'tests', 'runtime-api', 'acceptance', 'environment-default-files.js'),
    '-console-mode', 'script', '-timeout', '3',
    '-log-dir', File.join(RUN_DIR, 'runtime-logs', defaultGate),
  ], {
    cwd: defaultProject,
    deadlineSeconds: 120,
    display: false,
    env: { OPENDESK_ENV_DEFAULT_PRECEDENCE: 'system-value' },
  });
  if (defaultFiles.exitCode !== 0
    || !defaultFiles.stdout.includes('[RUNTIME-API-ENVIRONMENT] .env and .opendesk.env discovery passed')) {
    fail(`environment default file discovery failed with status ${defaultFiles.exitCode}: ${defaultFiles.stderr || defaultFiles.stdout}`);
  }
  await verifyZeroCleanup(defaultGate);

  const exampleGate = 'environment-example';
  const example = await executeProcess(exampleGate, BINARY, [
    '-script', File.join(ROOT_DIR, 'examples', 'runtime', 'environment.js'),
    '-console-mode', 'script', '-timeout', '3',
    '-log-dir', File.join(RUN_DIR, 'runtime-logs', exampleGate),
  ], {
    deadlineSeconds: 120,
    display: false,
    env: { OPENDESK_EXAMPLE_MODE: 'runtime-gate' },
  });
  if (example.exitCode !== 0) fail(`environment public example failed with status ${example.exitCode}: ${example.stderr}`);
  const marker = '[ENVIRONMENT-EXAMPLE] ';
  const summaries = example.stdout.split(/\r?\n/)
    .filter((line) => line.includes(marker))
    .map((line) => parseJSON(line.split(marker, 2)[1], 'environment public example summary'));
  if (summaries.length !== 1) fail('environment public example did not emit exactly one summary');
  const exampleSummary = summaries[0];
  if (exampleSummary.mode !== 'runtime-gate'
    || typeof exampleSummary.consoleMode !== 'string'
    || exampleSummary.pathAvailable !== true
    || exampleSummary.snapshotFrozen !== true) {
    fail(`environment public example summary is invalid: ${JSON.stringify(exampleSummary)}`);
  }
  console.log('[RUNTIME-API-ENVIRONMENT] public example passed');
  await verifyZeroCleanup(exampleGate);

  const aiGate = 'environment-ai-run';
  const ai = await executeProcess(aiGate, BINARY, [
    'ai', 'run', File.join(ROOT_DIR, 'tests', 'runtime-api', 'acceptance', 'environment-ai-run.js'),
    '--env-file', envFile,
  ], {
    deadlineSeconds: 120,
    display: false,
    env: { OPENDESK_ENV_PRECEDENCE: 'shell-value', OPENDESK_ENV_SYSTEM_ONLY: 'system=a=b' },
    stdoutPath: File.join(RUN_DIR, 'results', `${aiGate}.stdout.json`),
  });
  if (ai.exitCode !== 0) fail(`environment ai run failed with status ${ai.exitCode}: ${ai.stderr}`);
  const payload = parseJSON(ai.stdout, 'environment ai run envelope');
  if (payload.ok !== true || payload.command !== 'run') fail('environment ai run did not return a successful envelope');
  const aiRunDir = payload.result && payload.result.artifacts && payload.result.artifacts.runDir;
  const report = aiRunDir && File.join(aiRunDir, 'environment-acceptance.json');
  if (!report || !File.isFile(report) || (await readJSON(report)).ok !== true) fail(`environment ai run report is missing or invalid: ${report}`);
  console.log(`[RUNTIME-API-ENVIRONMENT] ai run report=${report}`);

  const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', 'environment-http-session.sh');
  const http = await executeProcess('environment-http-session', '/bin/sh', [seam], {
    deadlineSeconds: 120,
    env: { OPENDESK_ENV_HOST_SECRET: 'must-not-leak' },
  });
  const serverPidPath = File.join(RUN_DIR, 'processes', 'environment-http-server.pid');
  if (File.isFile(serverPidPath)) await record('runtime', Number(File.read(serverPidPath).trim()), 'environment-http-server');
  if (http.exitCode !== 0) fail(`environment HTTP isolation session failed with status ${http.exitCode}`);
  await noResidual();
}

return Object.freeze({ environment });
})
