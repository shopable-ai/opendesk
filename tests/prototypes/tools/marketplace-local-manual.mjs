#!/usr/bin/env node
// Start one isolated, reproducible local HTML → OpenDesk Marketplace check.
// It intentionally never kills an existing OpenDesk instance or a listener it
// did not start. Use the printed cleanup command only for a recorded manual run.
import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../../..');
const MANUAL_ROOT = path.join(ROOT, '.runtime', 'tests', 'marketplace');
const SERVER_SCRIPT = path.join(TOOL_DIR, 'marketplace-local-server.mjs');
const BUNDLE = path.join(ROOT, 'dist', 'OpenDesk.app');
const BUILD_SCRIPT = path.join(ROOT, 'scripts', 'build_macos_app.sh');
const BUILD_STATE = path.join(MANUAL_ROOT, 'build-current.json');
const BUILD_INPUTS = [
  'go.mod', 'go.sum', 'VERSION', 'cmd/opendesk', 'pkg/flowmarketplace', 'pkg/flowinstall', 'pkg/flowpackage',
  'pkg/officialconfig', 'internal/officialassets', 'apps/opendesk', 'scripts/build_macos_app.sh',
];
const EXECUTABLE = path.join(BUNDLE, 'Contents', 'MacOS', 'opendesk');
const APP_ROOT = path.join(ROOT, 'apps', 'opendesk');
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

function usage() {
  return `usage:\n  node tests/prototypes/tools/marketplace-local-manual.mjs\n  node tests/prototypes/tools/marketplace-local-manual.mjs --cleanup <manual-run-dir>`;
}

export function isManualRunDirectory(runDirectory) {
  const resolved = path.resolve(runDirectory);
  return path.dirname(resolved) === MANUAL_ROOT && path.basename(resolved).startsWith('manual-');
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error) : '',
  };
}

function runningProcesses() {
  const result = commandOutput('/bin/ps', ['-axo', 'pid=,command=']);
  if (result.status !== 0) throw new Error(`cannot inspect running processes: ${result.stderr || result.error}`);
  return result.stdout.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const match = /^(\d+)\s+(.+)$/.exec(line);
    return match ? {pid: Number(match[1]), command: match[2]} : undefined;
  }).filter(Boolean);
}

function processWorkingDirectory(pid) {
  const result = commandOutput('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  if (result.status !== 0 || result.error) return undefined;
  return result.stdout.split('\n').find(line => line.startsWith('n'))?.slice(1);
}

export function isCurrentOpenDeskAppModeCommand(command, cwd) {
  if (typeof command !== 'string' || !command.includes('opendesk')) return false;
  const match = /(?:^|\s)-app(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(command);
  const appPath = match?.[1] || match?.[2] || match?.[3];
  if (!appPath) return false;
  const resolved = path.isAbsolute(appPath) ? path.resolve(appPath)
    : (cwd ? path.resolve(cwd, appPath) : '');
  return resolved === APP_ROOT;
}

function findConflictingOpenDeskProcesses() {
  return runningProcesses().flatMap(({pid, command}) => {
    const cwd = processWorkingDirectory(pid);
    return isCurrentOpenDeskAppModeCommand(command, cwd) ? [`${pid} ${command}`] : [];
  });
}

async function createRunDirectory() {
  await mkdir(MANUAL_ROOT, {recursive: true, mode: 0o700});
  const stem = `manual-${new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z')}`;
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = path.join(MANUAL_ROOT, suffix ? `${stem}-${suffix}` : stem);
    try {
      await mkdir(candidate, {mode: 0o700});
      return candidate;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('could not allocate a fresh manual Marketplace run directory');
}

async function writeJSON(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
}

async function waitFor(check, description, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${description}${lastError ? `: ${lastError.message || lastError}` : ''}`);
}

async function logContains(logPath, fragment) {
  try {
    return (await readFile(logPath, 'utf8')).includes(fragment);
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function gitCommand(args) {
  return spawnSync('/usr/bin/git', ['-C', ROOT, ...args], {encoding: 'utf8'});
}

async function currentBuildFingerprint() {
  const head = gitCommand(['rev-parse', 'HEAD']);
  const diff = gitCommand(['diff', '--binary', 'HEAD', '--', ...BUILD_INPUTS]);
  const untracked = gitCommand(['ls-files', '--others', '--exclude-standard', '--', ...BUILD_INPUTS]);
  for (const result of [head, diff, untracked]) {
    if (result.status !== 0 || result.error) throw new Error(`cannot compute current OpenDesk build fingerprint: ${result.stderr || result.error}`);
  }
  const hash = createHash('sha256')
    .update(head.stdout).update('\0').update(diff.stdout).update('\0').update(untracked.stdout)
    .digest('hex');
  return {fingerprint: hash, reusable: untracked.stdout.trim() === ''};
}

async function ensureCurrentBundle(runDirectory) {
  if (process.platform !== 'darwin') throw new Error('the manual Marketplace helper is macOS-only');
  await mkdir(MANUAL_ROOT, {recursive: true, mode: 0o700});
  const current = await currentBuildFingerprint();
  let previous;
  try { previous = JSON.parse(await readFile(BUILD_STATE, 'utf8')); } catch (_) { previous = null; }

  const signature = commandOutput('/usr/bin/codesign', ['--verify', '--deep', '--strict', BUNDLE]);
  if (current.reusable && previous?.fingerprint === current.fingerprint && signature.status === 0 && !signature.error) {
    await writeFile(path.join(runDirectory, 'build.log'), `reused current signed bundle\nfingerprint=${current.fingerprint}\n`, {mode: 0o600});
    return;
  }

  const build = spawnSync('/bin/bash', [BUILD_SCRIPT], {cwd: ROOT, encoding: 'utf8', env: process.env});
  const report = `$ /bin/bash ${BUILD_SCRIPT}\n${build.stdout || ''}${build.stderr || ''}${build.error ? String(build.error) : ''}`;
  await writeFile(path.join(runDirectory, 'build.log'), report, {mode: 0o600});
  if (build.status !== 0 || build.error) throw new Error(`OpenDesk macOS build failed; see ${path.join(runDirectory, 'build.log')}`);

  const after = await currentBuildFingerprint();
  if (!after.reusable) {
    await writeFile(BUILD_STATE, JSON.stringify({fingerprint: '', reusable: false}, null, 2) + '\n', {mode: 0o600});
    return;
  }
  await writeFile(BUILD_STATE, JSON.stringify({fingerprint: after.fingerprint}, null, 2) + '\n', {mode: 0o600});
}

function verifyAndRegisterBundle(runDirectory) {
  if (process.platform !== 'darwin') throw new Error('the manual Marketplace helper is macOS-only');
  const log = path.join(runDirectory, 'bundle-check.log');
  const commands = [
    ['/usr/bin/codesign', ['--verify', '--deep', '--strict', BUNDLE]],
    [LSREGISTER, ['-f', BUNDLE]],
  ];
  let report = `bundle=${BUNDLE}\nexecutable=${EXECUTABLE}\n`;
  for (const [command, args] of commands) {
    const result = commandOutput(command, args);
    report += `$ ${command} ${args.join(' ')}\n${result.stdout}${result.stderr}${result.error}`;
    if (result.status !== 0 || result.error) {
      return writeFile(log, report, {mode: 0o600}).then(() => {
        throw new Error(`bundle verification or LaunchServices registration failed; see ${log}`);
      });
    }
  }
  return writeFile(log, report, {mode: 0o600});
}

async function startServer(runDirectory) {
  const serverLogPath = path.join(runDirectory, 'server.log');
  const serverLog = createWriteStream(serverLogPath, {flags: 'a', mode: 0o600});
  await new Promise((resolve, reject) => {
    serverLog.once('open', resolve);
    serverLog.once('error', reject);
  });
  const configPath = path.join(runDirectory, 'marketplace-development.json');
  const appData = path.join(runDirectory, 'app-data');
  const siteRoot = path.join(runDirectory, 'site');
  const appLogPath = path.join(runDirectory, 'receiver.log');
  const appRuntimeLogDir = path.join(runDirectory, 'app-runtime');
  await mkdir(appRuntimeLogDir, {recursive: true, mode: 0o700});
  const child = spawn(process.execPath, [
    SERVER_SCRIPT,
    '--host', '127.0.0.1',
    '--port', '0',
    '--site-root', siteRoot,
    '--config-output', configPath,
    '--opendesk-log', appLogPath,
  ], {cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; serverLog.write(chunk); });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { serverLog.write(chunk); });
  try {
    const ready = await waitFor(() => {
      const line = output.split('\n').find(value => value.startsWith('{') && value.includes('"ready":true'));
      return line ? JSON.parse(line) : undefined;
    }, 'local Marketplace server did not become ready');
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    await new Promise(resolve => serverLog.end(resolve));
    return {child, serverLogPath, configPath, appData, siteRoot, appLogPath, appRuntimeLogDir, ready};
  } catch (error) {
    child.kill('SIGTERM');
    child.stdout.destroy();
    child.stderr.destroy();
    await new Promise(resolve => serverLog.end(resolve));
    throw error;
  }
}

function findRecordedOpenDeskProcess(configPath) {
  const marker = `-marketplace-development-config ${configPath}`;
  const process = runningProcesses().find(value => value.command.includes(EXECUTABLE) && value.command.includes(marker));
  return process ? {pid: process.pid, command: process.command} : undefined;
}

async function startOpenDesk(configPath, appData, appLogPath, appRuntimeLogDir) {
  let app;
  try {
    const child = spawn('/usr/bin/open', ['-n', '-a', BUNDLE, '--args',
      '-app', APP_ROOT,
      '-marketplace-development-config', configPath,
      '-log-dir', appRuntimeLogDir,
      '-console-mode', 'script',
    ], {
      cwd: ROOT,
      env: {...process.env, OPENDESK_APP_DATA_DIR: appData},
      stdio: 'ignore',
    });
    child.unref();
    app = await waitFor(() => findRecordedOpenDeskProcess(configPath), 'could not identify the OpenDesk App Mode process for this run');
    await waitFor(() => logContains(appLogPath, '[MARKETPLACE_INSTALL] receiver-ready'), 'OpenDesk development receiver did not become ready');
    return app;
  } catch (error) {
    if (app) await stopRecordedProcess(app.pid, [EXECUTABLE, configPath]).catch(() => {});
    throw error;
  }
}

function directOpen(url, application) {
  const args = application ? ['-a', application, url] : [url];
  const result = commandOutput('/usr/bin/open', args);
  if (result.status !== 0 || result.error) throw new Error(`could not open ${url}: ${result.stderr || result.error}`);
}

function processCommand(pid) {
  const result = commandOutput('/bin/ps', ['-p', String(pid), '-o', 'command=']);
  return result.status === 0 ? result.stdout.trim() : '';
}

async function stopRecordedProcess(pid, markers) {
  if (!Number.isInteger(pid) || pid < 1) return;
  const command = processCommand(pid);
  if (!command) return;
  if (!markers.every(marker => command.includes(marker))) {
    throw new Error(`refusing to stop pid ${pid}: its current command no longer matches this recorded run`);
  }
  process.kill(pid, 'SIGTERM');
  await waitFor(() => !processCommand(pid), `pid ${pid} did not exit after SIGTERM`, 5000);
}

export async function cleanupRun(runDirectory) {
  const resolved = path.resolve(runDirectory);
  if (!isManualRunDirectory(resolved)) throw new Error('cleanup accepts only a direct .runtime/tests/marketplace/manual-* directory');
  const metadataPath = path.join(resolved, 'run.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  if (metadata.runDirectory !== resolved || !metadata.server || !metadata.app) throw new Error('run.json is not a valid manual Marketplace run record');
  await stopRecordedProcess(metadata.app.pid, [EXECUTABLE, metadata.configPath]);
  await stopRecordedProcess(metadata.server.pid, [SERVER_SCRIPT, metadata.configPath]);
  await appendFile(path.join(resolved, 'supervisor.log'), `cleanup completed at ${new Date().toISOString()}\n`, {mode: 0o600});
}

export async function startManualRun() {
  const conflicts = findConflictingOpenDeskProcesses();
  if (conflicts.length) {
    throw new Error(`a current OpenDesk App Mode instance is already running; the helper will not kill a shared instance:\n${conflicts.join('\n')}`);
  }
  const runDirectory = await createRunDirectory();
  const supervisorLog = path.join(runDirectory, 'supervisor.log');
  await ensureCurrentBundle(runDirectory);
  await verifyAndRegisterBundle(runDirectory);
  const server = await startServer(runDirectory);
  let app;
  try {
    app = await startOpenDesk(server.configPath, server.appData, server.appLogPath, server.appRuntimeLogDir);
    const metadata = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      runDirectory,
      bundle: BUNDLE,
      executable: EXECUTABLE,
      appRoot: APP_ROOT,
      configPath: server.configPath,
      appData: server.appData,
      url: `${server.ready.baseURL}/index.html`,
      releaseURL: server.ready.releaseURL,
      artifactURL: server.ready.artifactURL,
      siteRoot: server.siteRoot,
      server: {pid: server.child.pid, log: server.serverLogPath},
      app: {pid: app.pid, log: server.appLogPath, runtimeLogDir: server.appRuntimeLogDir},
    };
    await writeJSON(path.join(runDirectory, 'run.json'), metadata);
    // This non-installing parser rejection proves LaunchServices can deliver
    // to this exact, fresh receiver before Chrome chooses its scheme handler.
    // The later browser handoff remains independently verified from this log.
    directOpen(`${server.ready.deepLink}&unsupported=1`, BUNDLE);
    await waitFor(() => logContains(server.appLogPath, '[MARKETPLACE_INSTALL] rejected invalid install intent'), 'LaunchServices did not route the preflight URL to this OpenDesk run');
    await appendFile(supervisorLog, `ready at ${new Date().toISOString()}\nurl=${metadata.url}\n`, {mode: 0o600});
    directOpen(metadata.url);
    return metadata;
  } catch (error) {
    if (app) await stopRecordedProcess(app.pid, [EXECUTABLE, server.configPath]).catch(() => {});
    await stopRecordedProcess(server.child.pid, [SERVER_SCRIPT, server.configPath]).catch(() => {});
    await appendFile(supervisorLog, `failed at ${new Date().toISOString()}\n${error.stack || error}\n`, {mode: 0o600});
    throw error;
  }
}

async function main(argv) {
  if (argv.length === 0) {
    const run = await startManualRun();
    process.stdout.write(`Marketplace local manual run is ready.\nMain page: ${run.url}\nRelease: ${run.releaseURL}\nPackage: ${run.artifactURL}\nPrepared site: ${run.siteRoot}\nInstall data: ${run.appData}\nRun directory: ${run.runDirectory}\nOpenDesk log: ${run.app.log}\nCleanup: node tests/prototypes/tools/marketplace-local-manual.mjs --cleanup ${run.runDirectory}\n`);
    return;
  }
  if (argv.length === 2 && argv[0] === '--cleanup') {
    await cleanupRun(argv[1]);
    process.stdout.write(`Cleaned recorded Marketplace run: ${path.resolve(argv[1])}\n`);
    return;
  }
  throw new Error(usage());
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  });
}
