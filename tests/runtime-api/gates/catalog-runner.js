// OpenDesk Runtime API catalog and lifecycle gate implementation.
//
// Formal direct entrypoint from the repository root:
//   OPENDESK_RUNTIME_API_MODE=smoke \
//     ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
//
// This is an OpenDesk Runtime script, not a Node.js program. Finite commands are
// executed with Command.run(). Small POSIX helpers are used only where a test
// must keep one process alive while another process observes or signals it.

'use strict';

const ROOT_DIR = Execution.workdir;
const WATCHDOG = File.join(ROOT_DIR, 'tests', 'runtime-api', 'run_with_timeout.py');
const MODE = String(Execution.env.OPENDESK_RUNTIME_API_MODE || 'smoke');
const VALID_MODES = [
  'contract', 'unit', 'smoke', 'live', 'live-only', 'coverage', 'negative',
  'sound-cancel', 'notify-icon-live', 'custom-ui', 'custom-ui-config', 'dialog',
  'command', 'environment', 'file-json', 'path', 'language', 'sqlite',
];
const CLEANUP_FIELDS = [
  'workers', 'promiseCallbacks', 'timers',
  'httpWorkers', 'httpCallbacks',
  'soundWorkers', 'soundPending', 'soundPlaybacks',
  'notificationWorkers', 'notificationPending',
  'uiWorkers', 'uiPending', 'uiQueued', 'uiWindows', 'uiListeners', 'uiDriverSinks', 'uiHostProcesses',
  'shortcutBindings', 'shortcutPending',
  'eventSubscriptions', 'eventPending',
  'captureWorkers', 'capturePending', 'captureSessions',
  'appWorkers', 'appPending',
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
  if (!VALID_MODES.includes(MODE)) fail(`unknown Runtime API mode ${JSON.stringify(MODE)}; expected one of ${VALID_MODES.join(', ')}`);
  if (!File.isFile(WATCHDOG)) fail(`Runtime API watchdog is missing: ${WATCHDOG}`);

  RUN_ID = safeRunId();
  RUN_DIR = File.join(ROOT_DIR, '.runtime', 'tests', 'runtime-api', RUN_ID);
  if (File.exists(RUN_DIR)) File.removeDir(RUN_DIR);
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

async function prepareAppleVisionExtension() {
  const context = await readJSON(CONTEXT);
  if (!/^Darwin$/i.test(context.environment.os)) return;
  const sourceRoot = File.join(ROOT_DIR, 'examples', 'native-extensions', 'macos-vision');
  const extensionStage = `${APPLE_VISION_EXTENSION}.stage.${Execution.id}`;
  const manifestStage = File.join(APPLE_VISION_BUNDLE, `.extension.json.stage.${Execution.id}`);
  const typesStage = File.join(APPLE_VISION_BUNDLE, 'types', `.index.d.ts.stage.${Execution.id}`);
  File.ensureDir(File.join(APPLE_VISION_BUNDLE, 'bin'));
  File.ensureDir(File.join(APPLE_VISION_BUNDLE, 'types'));
  const sdk = (await requireCommand('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { timeout: 60_000 }, 'xcrun SDK lookup')).stdout.trim();
  const arch = context.environment.arch;
  await requireCommand('xcrun', [
    'swiftc', '-O', '-target', `${arch}-apple-macosx12.0`, '-sdk', sdk,
    File.join(sourceRoot, 'main.swift'), '-framework', 'Vision', '-framework', 'ImageIO', '-o', extensionStage,
  ], { cwd: ROOT_DIR, timeout: 10 * 60_000, maxOutputBytes: 16 * 1024 * 1024 }, 'build Apple Vision Native Extension');
  await requireCommand('/bin/cp', [File.join(sourceRoot, 'extension.json'), manifestStage], { timeout: 30_000 }, 'stage Apple Vision manifest');
  await requireCommand('/bin/cp', [File.join(sourceRoot, 'types', 'index.d.ts'), typesStage], { timeout: 30_000 }, 'stage Apple Vision types');
  await requireCommand('/bin/mv', [extensionStage, APPLE_VISION_EXTENSION], { timeout: 30_000 }, 'install Apple Vision extension');
  await requireCommand('/bin/mv', [manifestStage, File.join(APPLE_VISION_BUNDLE, 'extension.json')], { timeout: 30_000 }, 'install Apple Vision manifest');
  await requireCommand('/bin/mv', [typesStage, File.join(APPLE_VISION_BUNDLE, 'types', 'index.d.ts')], { timeout: 30_000 }, 'install Apple Vision types');
  await requireCommand('/bin/chmod', ['-R', 'go-w', APPLE_VISION_BUNDLE], { timeout: 30_000 }, 'protect Apple Vision bundle');
  await assertExecutable(APPLE_VISION_EXTENSION, 'Apple Vision Native Extension');
  const digest = await sha256(APPLE_VISION_EXTENSION);
  await updateContext((value) => {
    value.nativeExtensions = value.nativeExtensions || {};
    value.nativeExtensions.appleVision = {
      id: 'com.example.macos-vision', namespace: 'macosVision', bundlePath: APPLE_VISION_BUNDLE,
      path: APPLE_VISION_EXTENSION, sha256: digest,
      buildSource: `xcrun swiftc -O -target ${arch}-apple-macosx12.0 examples/native-extensions/macos-vision/main.swift`,
    };
  });
}

async function prepareNativeExtension() {
  const sourceRoot = File.join(ROOT_DIR, 'examples', 'native-extensions', 'go-basic');
  const extensionStage = `${GO_BASIC_EXTENSION}.stage.${Execution.id}`;
  const manifestStage = File.join(GO_BASIC_BUNDLE, `.extension.json.stage.${Execution.id}`);
  const typesStage = File.join(GO_BASIC_BUNDLE, 'types', `.index.d.ts.stage.${Execution.id}`);
  File.ensureDir(File.join(GO_BASIC_BUNDLE, 'bin'));
  File.ensureDir(File.join(GO_BASIC_BUNDLE, 'types'));
  await requireCommand('go', ['build', '-o', extensionStage, '.'], {
    cwd: sourceRoot,
    timeout: 10 * 60_000,
    maxOutputBytes: 16 * 1024 * 1024,
  }, 'build Go basic Native Extension');
  await requireCommand('/bin/cp', [File.join(sourceRoot, 'extension.json'), manifestStage], { timeout: 30_000 }, 'stage Go extension manifest');
  await requireCommand('/bin/cp', [File.join(sourceRoot, 'types', 'index.d.ts'), typesStage], { timeout: 30_000 }, 'stage Go extension types');
  await requireCommand('/bin/mv', [extensionStage, GO_BASIC_EXTENSION], { timeout: 30_000 }, 'install Go extension');
  await requireCommand('/bin/mv', [manifestStage, File.join(GO_BASIC_BUNDLE, 'extension.json')], { timeout: 30_000 }, 'install Go manifest');
  await requireCommand('/bin/mv', [typesStage, File.join(GO_BASIC_BUNDLE, 'types', 'index.d.ts')], { timeout: 30_000 }, 'install Go types');
  await assertExecutable(GO_BASIC_EXTENSION, 'Go basic Native Extension');
  const digest = await sha256(GO_BASIC_EXTENSION);
  await updateContext((value) => {
    value.nativeExtensions = value.nativeExtensions || {};
    value.nativeExtensions.goBasic = {
      id: 'com.example.go-basic', namespace: 'goBasic', bundlePath: GO_BASIC_BUNDLE,
      path: GO_BASIC_EXTENSION, sha256: digest,
      buildSource: `go -C ${sourceRoot} build -o ${GO_BASIC_EXTENSION} .`,
    };
  });
  await prepareAppleVisionExtension();
}

async function contract() {
  await runJS('contract', File.join(ROOT_DIR, 'tests', 'runtime-api', 'contract.js'), 3, 120);
}

async function language() {
  const gate = 'language';
  const result = await runJS(gate, File.join(ROOT_DIR, 'tests', 'runtime-api', 'javascript-language.js'), 3, 120);
  const marker = '[RUNTIME-JS-LANGUAGE] ';
  const reports = result.stdout.split(/\r?\n/)
    .filter((line) => line.includes(marker))
    .map((line) => parseJSON(line.slice(line.indexOf(marker) + marker.length), 'JavaScript language report'));
  if (reports.length !== 1 || reports[0].status !== 'passed') {
    fail(`JavaScript language gate emitted an invalid report: ${JSON.stringify(reports)}`);
  }
  const expectedChecks = [
    'es2015-core', 'es2015-template-literal', 'es2016', 'es2017',
    'es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'es2023',
    'opendesk-script-level-await',
  ];
  if (JSON.stringify(reports[0].checks) !== JSON.stringify(expectedChecks)) {
    fail(`JavaScript language checks changed: ${JSON.stringify(reports[0].checks)}`);
  }
  await verifyZeroCleanup(gate);
  await noResidual();
  const context = await readJSON(CONTEXT);
  await writeJSON(File.join(RUN_DIR, 'results', 'language.json'), {
    schemaVersion: '1.0.0',
    runId: RUN_ID,
    gate,
    startedAt: context.startedAt,
    finishedAt: new Date().toISOString(),
    runtime: context.binary,
    status: 'passed',
    checks: reports[0].checks,
  });
}

async function unit() {
  await prepareNativeExtension();
  await runJS('unit', File.join(ROOT_DIR, 'tests', 'runtime-api', 'unit.js'), 5, 180);
  await verifyZeroCleanup('unit');
}

async function coverage() {
  await runJS('coverage', File.join(ROOT_DIR, 'tests', 'runtime-api', 'coverage.js'), 5, 180);
}

async function sqlite() {
  let failure = null;
  try {
    await runJS('contract', File.join(ROOT_DIR, 'tests', 'runtime-api', 'sqlite-contract.js'), 5, 180);
    await verifyZeroCleanup('contract');
    await runJS('unit', File.join(ROOT_DIR, 'tests', 'runtime-api', 'sqlite-unit.js'), 15, 240);
    await verifyZeroCleanup('unit');
    await runJS('coverage', File.join(ROOT_DIR, 'tests', 'runtime-api', 'sqlite-coverage.js'), 10, 240);
    await verifyZeroCleanup('coverage');
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
    await noResidual();
  } catch (error) {
    failure = failure || error;
  }
  if (failure) throw failure;
}

async function smokeCase() {
  await runJS('smoke', File.join(ROOT_DIR, 'tests', 'runtime-api', 'smoke.js'), 3, 120);
}

async function negative() {
  await runJS('negative', File.join(ROOT_DIR, 'tests', 'runtime-api', 'negative.js'), 5, 120);
}

async function failureExit() {
  const extra = File.join(RUN_DIR, 'failure-exit.json');
  const probe = await executeJS('failure-exit-probe', File.join(ROOT_DIR, 'tests', 'runtime-api', 'failure_exit.js'), 2, 15);
  await writeJSON(extra, { exitStatus: probe.exitCode });
  await runJS('failure-exit', File.join(ROOT_DIR, 'tests', 'runtime-api', 'failure_exit_result.js'), 2, 60, { extra });
}

async function cleanup() {
  await runJS('cleanup', File.join(ROOT_DIR, 'tests', 'runtime-api', 'cleanup_validation.js'), 4, 120, { display: true });
}

async function quality() {
  await runJS('quality', File.join(ROOT_DIR, 'tests', 'runtime-api', 'quality_gate.js'), 5, 180, { display: true });
}

async function asyncStacks() {
  const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', 'async-fixture-session.sh');
  for (const stack of ['legacy', 'upgraded', 'playwright']) {
    const gate = `async-${stack}`;
    const result = await executeProcess(`${gate}-seam`, '/bin/sh', [seam, stack], {
      deadlineSeconds: 140,
      env: { OPENDESK_RUNTIME_API_CONTEXT_PATH: CONTEXT },
    });
    const fixturePidPath = File.join(RUN_DIR, 'processes', `${gate}-fixture.pid`);
    if (File.isFile(fixturePidPath)) await record('fixture-server', Number(File.read(fixturePidPath).trim()), `loopback-${gate}-fixture`);
    if (result.exitCode !== 0) fail(`${gate} fixture session failed with status ${result.exitCode}`);
  }
}

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
    '-script', File.join(ROOT_DIR, 'examples', 'environment.js'),
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

async function pathContext() {
  await runJS('path', File.join(ROOT_DIR, 'tests', 'runtime-api', 'path.js'), 3, 120);
  await verifyZeroCleanup('path');

  const source = File.join(ROOT_DIR, 'tests', 'runtime-api', 'acceptance', 'path.js');
  const workdirs = [File.join(RUN_DIR, 'path-workdir-a'), File.join(RUN_DIR, 'path-workdir-b')];
  const reports = [];
  for (let index = 0; index < workdirs.length; index += 1) {
    const workdir = workdirs[index];
    const logDir = File.join(RUN_DIR, 'runtime-logs', `path-workdir-${index + 1}`);
    File.ensureDir(workdir);
    const result = await executeProcess(`path-workdir-${index + 1}`, BINARY, [
      '-script', source, '-console-mode', 'script', '-log-dir', logDir,
    ], { cwd: workdir, deadlineSeconds: 120 });
    if (result.exitCode !== 0) fail(`path WorkDir ${index + 1} failed with status ${result.exitCode}`);
    const reportPath = File.join(logDir, 'path-acceptance.json');
    if (!File.isFile(reportPath)) fail(`path WorkDir report is missing: ${reportPath}`);
    const report = await readJSON(reportPath);
    if (report.ok !== true || report.workdir !== workdir || report.scriptPath !== source) {
      fail(`path WorkDir report is invalid: ${JSON.stringify(report)}`);
    }
    reports.push(report);
  }
  if (reports[0].workdir === reports[1].workdir || reports[0].resolved === reports[1].resolved) {
    fail('path did not preserve independent Execution WorkDirs');
  }

  const inlineLogDir = File.join(RUN_DIR, 'runtime-logs', 'path-inline');
  const inline = await executeProcess('path-inline', BINARY, [
    '-script-text', File.read(source), '-console-mode', 'script', '-log-dir', inlineLogDir,
  ], { cwd: workdirs[0], deadlineSeconds: 120 });
  if (inline.exitCode !== 0) fail(`path inline source failed with status ${inline.exitCode}`);
  const inlineReport = await readJSON(File.join(inlineLogDir, 'path-acceptance.json'));
  if (inlineReport.scriptPath !== null || inlineReport.scriptDir !== null || inlineReport.source !== 'inline') {
    fail(`inline source metadata is invalid: ${JSON.stringify(inlineReport)}`);
  }
  console.log(`[RUNTIME-API-PATH] workdirs=${workdirs.join(',')} inline=null`);
}

async function customUIConfig() {
  const root = File.join(RUN_DIR, 'custom-ui-config-cli');
  const source = File.join(ROOT_DIR, 'tests', 'runtime-api', 'custom-ui-config.js');
  const scriptDir = File.join(root, 'script-adjacent');
  const emptyDir = File.join(root, 'default-disabled');
  const tmSourceDir = File.join(root, 'tm-source');
  const tmWorkDir = File.join(root, 'tm-work');
  const configDir = File.join(root, 'configs');
  for (const path of [scriptDir, emptyDir, tmSourceDir, tmWorkDir, configDir]) File.ensureDir(path);
  const enabled = { schemaVersion: 1, runtime: { capabilities: ['ui'] } };
  const disabled = { schemaVersion: 1, runtime: { capabilities: [] } };
  await writeJSON(File.join(scriptDir, 'clawdesk.runtime.json'), enabled);
  await writeJSON(File.join(tmSourceDir, 'clawdesk.runtime.json'), disabled);
  await writeJSON(File.join(tmWorkDir, 'clawdesk.runtime.json'), enabled);
  await writeJSON(File.join(configDir, 'disabled.json'), disabled);
  await writeJSON(File.join(configDir, 'invalid-host-path.json'), { schemaVersion: 1, runtime: { capabilities: ['ui'], hostPath: '/tmp/untrusted' } });
  await writeJSON(File.join(configDir, 'unknown-capability.json'), { schemaVersion: 1, runtime: { capabilities: ['mouse'] } });

  async function success(gate, workdir, script, expectedEnabled, activationSource, prefixArgs = []) {
    const extra = File.join(root, `${gate}.expectation.json`);
    await writeJSON(extra, {
      enabled: expectedEnabled,
      activationSource,
      executionActivationSource: activationSource,
      floatingWindowDefined: expectedEnabled,
    });
    await generate(source, script, extra);
    const result = await executeProcess(gate, BINARY, [
      ...prefixArgs, '-script', script, '-console-mode', 'script', '-timeout', '2',
      '-log-dir', File.join(RUN_DIR, 'runtime-logs', gate),
    ], {
      cwd: workdir,
      deadlineSeconds: 60,
      stdoutPath: File.join(root, `${gate}.stdout.log`),
      stderrPath: File.join(root, `${gate}.stderr.log`),
      display: false,
    });
    File.write(File.join(root, `${gate}.exit-status`), `${result.exitCode}\n`);
    if (result.exitCode !== 0 || !result.stdout.includes('CUSTOM_UI_CONFIG_OK=')) {
      fail(`Custom UI CLI case ${gate} failed with status ${result.exitCode}: ${result.stderr || result.stdout}`);
    }
  }

  async function errorCase(gate, configPath, expectedCode, http = false) {
    const script = File.join(root, `${gate}.js`);
    if (!http) File.write(script, File.read(source));
    const args = http
      ? ['-http', '-port', '0', '-config', configPath, '-console-mode', 'script']
      : ['-config', configPath, '-script', script, '-console-mode', 'script', '-timeout', '2', '-log-dir', File.join(RUN_DIR, 'runtime-logs', gate)];
    const result = await executeProcess(gate, BINARY, args, {
      deadlineSeconds: 60,
      stdoutPath: File.join(root, `${gate}.stdout.log`),
      stderrPath: File.join(root, `${gate}.stderr.log`),
      display: false,
    });
    File.write(File.join(root, `${gate}.exit-status`), `${result.exitCode}\n`);
    if (result.exitCode === 0 || result.exitCode === 124 || !(result.stdout + result.stderr).includes(expectedCode)) {
      fail(`Custom UI CLI error case ${gate} did not expose ${expectedCode} (status ${result.exitCode})`);
    }
  }

  await success('custom-ui-config-script-adjacent', ROOT_DIR, File.join(scriptDir, 'task.js'), true, 'projectConfig');
  await success('custom-ui-config-default-disabled', ROOT_DIR, File.join(emptyDir, 'task.js'), false, 'disabled');
  await success('custom-ui-config-explicit-over-auto', ROOT_DIR, File.join(scriptDir, 'explicit.js'), false, 'disabled', ['-config', File.join(configDir, 'disabled.json')]);
  await success('custom-ui-config-cli-over-missing', ROOT_DIR, File.join(scriptDir, 'cli.js'), true, 'cli', ['-ui', '-config', File.join(configDir, 'does-not-exist.json')]);
  await success('custom-ui-config-no-ui-wins', ROOT_DIR, File.join(scriptDir, 'no-ui.js'), false, 'disabled', ['-no-ui', '-ui', '-config', File.join(scriptDir, 'clawdesk.runtime.json')]);
  await success('custom-ui-config-working-directory', tmWorkDir, File.join(tmSourceDir, 'tm.config.js'), true, 'projectConfig');
  await errorCase('custom-ui-config-invalid-host-path', File.join(configDir, 'invalid-host-path.json'), 'RUNTIME_CONFIG_INVALID');
  await errorCase('custom-ui-config-unknown-capability', File.join(configDir, 'unknown-capability.json'), 'RUNTIME_CONFIG_UNSUPPORTED');
  await errorCase('custom-ui-config-explicit-missing', File.join(configDir, 'does-not-exist.json'), 'RUNTIME_CONFIG_NOT_FOUND');
  await errorCase('custom-ui-config-http-invalid', File.join(configDir, 'invalid-host-path.json'), 'RUNTIME_CONFIG_INVALID', true);
  console.log('[RUNTIME-API-CUSTOM-UI-CONFIG] CLI priority and strict errors passed');
}

async function commandGate() {
  await runJS('command', File.join(ROOT_DIR, 'tests', 'runtime-api', 'command.js'), 2, 90);
  await verifyZeroCleanup('command');
  const context = await readJSON(CONTEXT);
  if (!/^(MINGW|MSYS)/.test(context.environment.os)) {
    const generated = File.join(RUN_DIR, 'generated', 'command-cancel.generated.js');
    await generate(File.join(ROOT_DIR, 'tests', 'runtime-api', 'command-cancel.js'), generated);
    const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', 'command-cancel.sh');
    const seamResult = await executeProcess('command-cancel-seam', '/bin/sh', [seam, generated], { deadlineSeconds: 120 });
    const observationPath = File.join(RUN_DIR, 'results', 'command-cancel-observation.json');
    if (!File.isFile(observationPath)) fail(`Command cancellation seam did not write ${observationPath}`);
    const observation = await readJSON(observationPath);
    if (!observation.ready || !observation.aliveBefore || observation.exitStatus === 0 || observation.exitStatus === 124
      || observation.childAliveAfter || observation.descendantAliveAfter) {
      fail(`Command cancellation observation failed: ${JSON.stringify(observation)}`);
    }
    if (seamResult.exitCode !== 0) fail(`Command cancellation process seam failed with status ${seamResult.exitCode}`);
    await recordWatchdog('command-cancel');
    await verifyZeroCleanup('command-cancel');
  }
  await noResidual();
}

async function soundCancel() {
  const result = await runCommand('/bin/sh', [File.join(ROOT_DIR, 'tests', 'runtime-api', 'sound-cancel-smoke.sh')], {
    cwd: ROOT_DIR,
    env: {
      ...childEnv,
      OPENDESK_BINARY: BINARY,
      OPENDESK_SOUND_CANCEL_RUN_DIR: File.join(RUN_DIR, 'sound-cancel'),
    },
    timeout: 120_000,
    maxOutputBytes: 16 * 1024 * 1024,
  });
  displayOutput(result.stdout);
  displayOutput(result.stderr, true);
  if (result.exitCode !== 0) fail(`sound cancellation seam failed with status ${result.exitCode}`);
  await noResidual();
}

async function notifyIconLive() {
  const context = await readJSON(CONTEXT);
  if (context.environment.os !== 'Darwin') fail('macOS notify icon live test requires Darwin');
  const installed = absolutePath(String(Execution.env.OPENDESK_BINARY || '/Applications/OpenDesk.app/Contents/MacOS/opendesk'));
  await assertExecutable(installed, 'installed OpenDesk.app executable');
  if (!installed.endsWith('/OpenDesk.app/Contents/MacOS/opendesk')) fail(`notify-icon-live requires the executable inside OpenDesk.app: ${installed}`);
  const digest = await sha256(installed);
  await updateContext((value) => {
    value.binary = {
      path: installed, sha256: digest, buildSource: 'installed OpenDesk.app executable',
      provenance: 'installed_app', originalPath: installed, originalSha256: digest,
    };
  });
  await runJS('notify-icon-live', File.join(ROOT_DIR, 'tests', 'runtime-api', 'live', 'notify-icon.test.js'), 1, 60, {
    binary: installed,
  });
}

async function runLiveSeam(mode, deadlineSeconds) {
  const fileByMode = {
    live: 'live-fixture-session.sh',
    'custom-ui': 'custom-ui-session.sh',
    dialog: 'dialog-session.sh',
  };
  const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', fileByMode[mode]);
  if (!File.isFile(seam)) fail(`${mode} lifecycle seam is missing: ${seam}`);
  const result = await executeProcess(`${mode}-session-wrapper`, '/bin/bash', [seam], {
    deadlineSeconds,
    maxOutputBytes: 64 * 1024 * 1024,
  });
  if (result.exitCode !== 0) fail(`${mode} lifecycle seam failed with status ${result.exitCode}`);
}

async function liveOnly() {
  let failure = null;
  try {
    await runLiveSeam('live', 780);
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
    await noResidual();
  } catch (error) {
    failure = error;
  }
  if (failure) throw failure;
}

async function customUI() {
  await runLiveSeam('custom-ui', 900);
}

async function dialog() {
  await runLiveSeam('dialog', 1200);
}

async function liveSuite() {
  let failure = null;
  try {
    await contract();
    await language();
    await unit();
    await smokeCase();
    await failureExit();
    await negative();
    await asyncStacks();
    await runLiveSeam('live', 780);
    await customUI();
    await customUIConfig();
    await coverage();
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
    await noResidual();
  } catch (error) {
    failure = error;
  }
  if (!failure) await quality();
  if (failure) throw failure;
}

async function smokeSuite() {
  await contract();
  await language();
  await unit();
  await smokeCase();
  await asyncStacks();
  await failureExit();
  await negative();
}

async function runMode() {
  const modes = {
    contract,
    unit,
    smoke: smokeSuite,
    coverage,
    sqlite,
    negative,
    'sound-cancel': soundCancel,
    'notify-icon-live': notifyIconLive,
    'custom-ui-config': customUIConfig,
    command: commandGate,
    environment,
    'file-json': fileJSON,
    path: pathContext,
    language,
    live: liveSuite,
    'live-only': liveOnly,
    'custom-ui': customUI,
    dialog,
  };
  await modes[MODE]();
}

try {
  await initialize();
  await runMode();
  console.log(`[RUNTIME-API PASS] mode=${MODE} evidence=${RUN_DIR}`);
} catch (error) {
  console.error(`[RUNTIME-API FAIL] mode=${MODE} evidence=${RUN_DIR || '<not-created>'}`);
  console.error(error && error.stack ? error.stack : String(error));
  throw error;
}
