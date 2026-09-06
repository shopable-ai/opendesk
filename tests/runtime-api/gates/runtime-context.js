// Shared run context, process execution, provenance and cleanup verification.
// Suite-specific assertions and native-extension preparation are separate modules.
(function createRuntimeContext(options) {
'use strict';

const ROOT_DIR = Execution.workdir;
const WATCHDOG = File.join(ROOT_DIR, 'tests', 'runtime-api', 'run_with_timeout.py');
const MODE = options.mode;
const CLEANUP_FIELDS = [
  'workers', 'promiseCallbacks', 'timers',
  'httpWorkers', 'httpCallbacks', 'httpTemps',
  'soundWorkers', 'soundPending', 'soundPlaybacks',
  'notificationWorkers', 'notificationPending',
  'uiWorkers', 'uiPending', 'uiQueued', 'uiWindows', 'uiListeners', 'uiDriverSinks', 'uiHostProcesses',
  'shortcutBindings', 'shortcutPending',
  'eventSubscriptions', 'eventPending',
  'captureWorkers', 'capturePending', 'captureSessions',
  'appWorkers', 'appPending',
  'accessibilityWorkers', 'accessibilityPending', 'accessibilityQueued', 'accessibilityRefs', 'accessibilityNativeResources',
  'commandWorkers', 'commandCallbacks', 'commandProcesses',
  'audioPatternWorkers', 'audioPatternPending', 'audioPatternWatches', 'audioPatternSessions',
  'fileJSONWorkers', 'fileJSONCallbacks', 'fileJSONTemps', 'fileHandles',
  'sqliteWorkers', 'sqliteCallbacks', 'sqliteHandles',
];

let RUN_ID = '';
let RUN_DIR = '';
let CONTEXT = '';
let PROCESSES = '';
let BINARY = '';
let BINARY_SHA256 = '';
let BINARY_PROVENANCE = '';
let BUILD_SOURCE = '';
let BINARY_ORIGINAL_PATH = '';
let BINARY_ORIGINAL_SHA256 = '';
let GO_BASIC_BUNDLE = '';
let GO_BASIC_EXTENSION = '';
let APPLE_VISION_BUNDLE = '';
let APPLE_VISION_EXTENSION = '';
let childEnv = {};

function fail(message) {
  throw new Error(message);
}

function displayOutput(text, error = false) {
  const value = String(text || '').replace(/\n$/, '');
  if (!value) return;
  if (error) console.error(value);
  else console.log(value);
}

function commandResult(error) {
  return {
    exitCode: Number.isInteger(error && error.exitCode)
      ? error.exitCode
      : (error && error.code === 'TIMEOUT' ? 124 : null),
    stdout: String(error && error.stdout || ''),
    stderr: String(error && error.stderr || ''),
    errorCode: error && error.code ? String(error.code) : null,
    error: error || null,
  };
}

async function runCommand(command, args = [], options = {}) {
  try {
    const result = await Command.run(command, args, options);
    return {
      exitCode: result.exitCode,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
      errorCode: null,
      error: null,
    };
  } catch (error) {
    return commandResult(error);
  }
}

async function requireCommand(command, args = [], options = {}, label = command) {
  const result = await runCommand(command, args, options);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || result.errorCode || 'unknown error';
    fail(`${label} failed with status ${result.exitCode}: ${detail}`);
  }
  return result;
}

function parseJSON(text, label) {
  try {
    return JSON.parse(String(text));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

async function readJSON(path, label = path) {
  try {
    return await File.readJSON(path);
  } catch (error) {
    fail(`${label} could not be read: ${error.message || error}`);
  }
}

async function writeJSON(path, value) {
  await File.writeJSON(path, value, { spaces: 2, createDirs: true });
}

function absolutePath(path) {
  if (String(path).startsWith('/')) return String(path);
  return File.path(path);
}

function safeRunId() {
  const configured = Execution.env.OPENDESK_RUNTIME_API_RUN_ID;
  const candidate = configured && String(configured).length > 0 ? String(configured) : String(Execution.id);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate)) fail(`invalid Runtime API run id: ${candidate}`);
  return candidate;
}

async function sha256(path) {
  const result = await requireCommand('shasum', ['-a', '256', path], {
    cwd: ROOT_DIR,
    timeout: 30_000,
    maxOutputBytes: 1024 * 1024,
  }, `sha256 ${path}`);
  const value = result.stdout.trim().split(/\s+/)[0] || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value)) fail(`invalid sha256 output for ${path}`);
  return value.toLowerCase();
}

async function assertExecutable(path, label) {
  if (!File.isFile(path)) fail(`${label} is not a regular file: ${path}`);
  await requireCommand('/bin/test', ['-x', path], { timeout: 10_000 }, `${label} executable check`);
}

async function initialize() {
  if (!File.isFile(WATCHDOG)) fail(`Runtime API watchdog is missing: ${WATCHDOG}`);

  RUN_ID = safeRunId();
  RUN_DIR = File.join(ROOT_DIR, '.runtime', 'tests', 'runtime-api', RUN_ID);
  if (File.exists(RUN_DIR)) fail(`Runtime API run directory already exists; evidence preserved: ${RUN_DIR}. Choose a new OPENDESK_RUNTIME_API_RUN_ID.`);
  for (const relative of ['results', 'generated', 'processes', 'runtime-logs', 'bin']) {
    File.ensureDir(File.join(RUN_DIR, relative));
  }
  CONTEXT = File.join(RUN_DIR, 'context.json');
  PROCESSES = File.join(RUN_DIR, 'processes.json');
  BINARY = File.join(RUN_DIR, 'bin', 'opendesk');
  BINARY_ORIGINAL_PATH = '';
  BINARY_ORIGINAL_SHA256 = '';

  const configuredBinary = Execution.env.OPENDESK_BINARY;
  if (configuredBinary && String(configuredBinary).length > 0) {
    BINARY_ORIGINAL_PATH = absolutePath(String(configuredBinary));
    await assertExecutable(BINARY_ORIGINAL_PATH, 'OPENDESK_BINARY');
    BINARY_ORIGINAL_SHA256 = await sha256(BINARY_ORIGINAL_PATH);
    const stage = File.join(RUN_DIR, 'bin', `.opendesk-stage-${Execution.id}`);
    await requireCommand('/bin/cp', ['-p', BINARY_ORIGINAL_PATH, stage], { timeout: 60_000 }, 'stage OPENDESK_BINARY');
    await requireCommand('/bin/mv', [stage, BINARY], { timeout: 30_000 }, 'install run-local OPENDESK_BINARY');
    BINARY_PROVENANCE = 'external_binary_copy';
    BUILD_SOURCE = 'verified run-local copy of OPENDESK_BINARY';
  } else {
    await requireCommand('go', ['build', '-o', BINARY, './cmd/opendesk'], {
      cwd: ROOT_DIR,
      timeout: 10 * 60_000,
      maxOutputBytes: 16 * 1024 * 1024,
    }, 'go build ./cmd/opendesk');
    BINARY_PROVENANCE = 'source_build';
    BUILD_SOURCE = 'go build ./cmd/opendesk';
  }
  await assertExecutable(BINARY, 'run-local OpenDesk binary');
  BINARY_SHA256 = await sha256(BINARY);
  if (BINARY_PROVENANCE === 'external_binary_copy' && BINARY_SHA256 !== BINARY_ORIGINAL_SHA256) {
    fail('run-local OpenDesk binary hash does not match OPENDESK_BINARY');
  }

  GO_BASIC_BUNDLE = File.join(RUN_DIR, 'bin', 'native-extensions', 'com.example.go-basic');
  GO_BASIC_EXTENSION = File.join(GO_BASIC_BUNDLE, 'bin', 'native-ext-go-basic');
  APPLE_VISION_BUNDLE = File.join(RUN_DIR, 'bin', 'native-extensions', 'com.example.macos-vision');
  APPLE_VISION_EXTENSION = File.join(APPLE_VISION_BUNDLE, 'bin', 'native-ext-macos-vision');

  const commit = (await requireCommand('git', ['rev-parse', 'HEAD'], { cwd: ROOT_DIR, timeout: 30_000 }, 'git rev-parse HEAD')).stdout.trim();
  const dirtyResult = await requireCommand('git', ['status', '--porcelain'], { cwd: ROOT_DIR, timeout: 30_000 }, 'git status --porcelain');
  const os = (await requireCommand('/usr/bin/uname', ['-s'], { timeout: 10_000 }, 'uname -s')).stdout.trim();
  const arch = (await requireCommand('/usr/bin/uname', ['-m'], { timeout: 10_000 }, 'uname -m')).stdout.trim();
  const browser = String(Execution.env.OPENDESK_RUNTIME_API_BROWSER_APP
    || Execution.env.HOST_API_BROWSER_APP
    || 'Safari');
  const liveFilter = String(Execution.env.OPENDESK_RUNTIME_API_LIVE_FILTER
    || Execution.env.HOST_API_LIVE_FILTER
    || '');
  const startedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  childEnv = {
    OPENDESK_RUNTIME_API_RUN_ID: RUN_ID,
    OPENDESK_RUNTIME_API_RUN_DIR: RUN_DIR,
    OPENDESK_RUNTIME_API_BINARY: BINARY,
    OPENDESK_RUNTIME_API_BINARY_SHA256: BINARY_SHA256,
    OPENDESK_RUNTIME_API_BUILD_SOURCE: BUILD_SOURCE,
    OPENDESK_RUNTIME_API_BINARY_PROVENANCE: BINARY_PROVENANCE,
    OPENDESK_RUNTIME_API_BINARY_ORIGINAL_PATH: BINARY_ORIGINAL_PATH,
    OPENDESK_RUNTIME_API_BINARY_ORIGINAL_SHA256: BINARY_ORIGINAL_SHA256,
    OPENDESK_RUNTIME_API_STARTED_AT: startedAt,
    OPENDESK_RUNTIME_API_GIT_COMMIT: commit,
    OPENDESK_RUNTIME_API_GIT_DIRTY: dirtyResult.stdout.length > 0 ? 'true' : 'false',
    OPENDESK_RUNTIME_API_BROWSER_APP: browser,
    OPENDESK_RUNTIME_API_LIVE_FILTER: liveFilter,
  };

  await writeJSON(CONTEXT, {
    schemaVersion: '1.0.0',
    runId: RUN_ID,
    runDir: RUN_DIR,
    startedAt,
    git: { commit, dirty: childEnv.OPENDESK_RUNTIME_API_GIT_DIRTY === 'true' },
    environment: { os, arch, browser },
    binary: {
      path: BINARY,
      sha256: BINARY_SHA256,
      buildSource: BUILD_SOURCE,
      provenance: BINARY_PROVENANCE,
      originalPath: BINARY_ORIGINAL_PATH || null,
      originalSha256: BINARY_ORIGINAL_SHA256 || null,
    },
    nativeExtensions: {},
  });
  await writeJSON(PROCESSES, { schemaVersion: '1.0.0', runId: RUN_ID, records: [] });
  console.log(`[RUNTIME-API] mode=${MODE} runId=${RUN_ID} evidence=${RUN_DIR}`);
}

async function updateContext(mutator) {
  const value = await readJSON(CONTEXT);
  mutator(value);
  await writeJSON(CONTEXT, value);
}

async function record(role, pid, source, extra = {}) {
  const number = Number(pid);
  if (!Number.isInteger(number) || number <= 0) return;
  const value = await readJSON(PROCESSES);
  value.records.push({ role, pid: number, source, ...extra });
  await writeJSON(PROCESSES, value);
}

async function recordWatchdog(gate) {
  const pidfile = File.join(RUN_DIR, 'processes', `${gate}.json`);
  if (!File.isFile(pidfile)) return;
  const process = await readJSON(pidfile);
  await record('watchdog', process.watchdogPid, gate);
  await record('runtime', process.runtimePid, gate, {
    processGroupId: Number(process.processGroupId),
    watchdogPid: Number(process.watchdogPid),
    gate,
    command: process.command,
  });
}

async function generate(source, output, extra = '') {
  const context = await readJSON(CONTEXT);
  let prefix = `globalThis.OPENDESK_RUNTIME_API_CONTEXT = ${JSON.stringify(context)};\n`;
  if (extra) {
    const data = await readJSON(extra);
    prefix += `globalThis.RUNTIME_API_EXTRA = ${JSON.stringify(data)};\n`;
    if (Object.prototype.hasOwnProperty.call(data, 'fixture')) {
      prefix += `globalThis.RUNTIME_API_FIXTURE = ${JSON.stringify(data.fixture)};\n`;
    }
  }
  File.write(output, prefix + File.read(source));
}

async function executeProcess(gate, command, args, options = {}) {
  const pidfile = File.join(RUN_DIR, 'processes', `${gate}.json`);
  const deadlineSeconds = Number(options.deadlineSeconds || 120);
  const stdoutPath = options.stdoutPath || File.join(RUN_DIR, 'results', `${gate}.stdout.log`);
  const stderrPath = options.stderrPath || File.join(RUN_DIR, 'results', `${gate}.stderr.log`);
  const watchdogArgs = ['--seconds', String(deadlineSeconds), '--pid-file', pidfile, '--', command, ...args];
  const result = await runCommand('/usr/bin/python3', [WATCHDOG, ...watchdogArgs], {
    cwd: options.cwd || ROOT_DIR,
    env: { ...childEnv, ...(options.env || {}) },
    timeout: (deadlineSeconds + 10) * 1000,
    maxOutputBytes: options.maxOutputBytes || 64 * 1024 * 1024,
  });
  File.write(stdoutPath, result.stdout);
  File.write(stderrPath, result.stderr);
  if (options.display !== false) {
    displayOutput(result.stdout);
    displayOutput(result.stderr, true);
  }
  await recordWatchdog(gate);
  return result;
}

async function executeJS(gate, source, timeoutSeconds, deadlineSeconds, options = {}) {
  const generated = File.join(RUN_DIR, 'generated', `${gate}.generated.js`);
  await generate(source, generated, options.extra || '');
  const runtimeArgs = [];
  if (options.enableUI === true) runtimeArgs.push('-ui');
  if (Array.isArray(options.runtimePrefixArgs)) runtimeArgs.push(...options.runtimePrefixArgs);
  runtimeArgs.push(
    '-script', generated,
    '-stack', options.stack || 'legacy',
    '-console-mode', 'script',
    '-timeout', String(timeoutSeconds),
    '-log-dir', File.join(RUN_DIR, 'runtime-logs', gate),
  );
  return executeProcess(gate, options.binary || BINARY, runtimeArgs, {
    deadlineSeconds,
    cwd: options.cwd || ROOT_DIR,
    env: options.env || {},
    display: options.display,
  });
}

async function runJS(gate, source, timeoutSeconds, deadlineSeconds, options = {}) {
  const result = await executeJS(gate, source, timeoutSeconds, deadlineSeconds, options);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || result.errorCode || 'unknown error';
    const error = new Error(`${gate} failed with status ${result.exitCode}: ${detail}`);
    error.exitStatus = result.exitCode;
    throw error;
  }
  return result;
}

async function verifyZeroCleanup(gate, recordName = gate) {
  const events = File.join(RUN_DIR, 'runtime-logs', gate, 'events.ndjson');
  const evidenceDir = gate.startsWith('custom-ui')
    ? File.join(RUN_DIR, 'runtime-logs', 'custom-ui', 'floating-toolbar')
    : File.join(RUN_DIR, 'runtime-logs', gate);
  if (!File.isFile(events)) fail(`missing lifecycle events: ${events}`);
  let cleanup = null;
  for (const line of File.read(events).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseJSON(line, events);
    if (event.kind === 'cleanup') cleanup = event.fields || {};
  }
  if (!cleanup) fail(`runtime cleanup event is missing: ${events}`);
  const bad = {};
  const counts = {};
  for (const key of CLEANUP_FIELDS) {
    counts[key] = cleanup[key];
    if (cleanup[key] !== 0) bad[key] = cleanup[key];
  }
  if (Object.keys(bad).length > 0) fail(`runtime cleanup is not zero: ${JSON.stringify(bad)}`);
  File.ensureDir(evidenceDir);
  const resourcesPath = File.join(evidenceDir, 'resources.json');
  const resources = File.isFile(resourcesPath) ? await readJSON(resourcesPath) : { schemaVersion: 1 };
  resources[recordName] = counts;
  await writeJSON(resourcesPath, resources);
  const resultPath = File.join(evidenceDir, 'result.json');
  if (File.isFile(resultPath)) {
    const result = await readJSON(resultPath);
    result.lifecycle = result.lifecycle || {};
    result.lifecycle.resourceZero = result.lifecycle.resourceZero || {};
    result.lifecycle.resourceZero[recordName] = counts;
    await writeJSON(resultPath, result);
  }
  console.log(`[RUNTIME-API-UI-CLEANUP] ${JSON.stringify(counts)}`);
}

async function noResidual() {
  const result = await requireCommand('/bin/ps', ['-axo', 'pid=,command='], {
    cwd: ROOT_DIR,
    timeout: 30_000,
    maxOutputBytes: 16 * 1024 * 1024,
  }, 'process residual inspection');
  const residual = result.stdout.split(/\r?\n/).filter((line) => line.includes(RUN_DIR));
  if (residual.length > 0) fail(`[RUNTIME-API] residual test process: ${residual.join('\n')}`);
  console.log('[RUNTIME-API-CLEANUP] no runtime, watchdog, fixture server, or run-scoped process remains');
}

return Object.freeze({
  fail, displayOutput, commandResult, runCommand, requireCommand, parseJSON, readJSON, writeJSON, absolutePath, safeRunId, sha256, assertExecutable, initialize, updateContext, record, recordWatchdog, generate, executeProcess, executeJS, runJS, verifyZeroCleanup, noResidual,
  get ROOT_DIR() { return ROOT_DIR; },
  get RUN_ID() { return RUN_ID; },
  get RUN_DIR() { return RUN_DIR; },
  get CONTEXT() { return CONTEXT; },
  get PROCESSES() { return PROCESSES; },
  get BINARY() { return BINARY; },
  get BINARY_SHA256() { return BINARY_SHA256; },
  get BINARY_PROVENANCE() { return BINARY_PROVENANCE; },
  get BUILD_SOURCE() { return BUILD_SOURCE; },
  get BINARY_ORIGINAL_PATH() { return BINARY_ORIGINAL_PATH; },
  get BINARY_ORIGINAL_SHA256() { return BINARY_ORIGINAL_SHA256; },
  get GO_BASIC_BUNDLE() { return GO_BASIC_BUNDLE; },
  get GO_BASIC_EXTENSION() { return GO_BASIC_EXTENSION; },
  get APPLE_VISION_BUNDLE() { return APPLE_VISION_BUNDLE; },
  get APPLE_VISION_EXTENSION() { return APPLE_VISION_EXTENSION; },
  get childEnv() { return childEnv; },
});
})
