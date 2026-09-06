// Shared state and dependency-free helpers for the Runtime API catalog runner.
//
// Loaded by ../catalog-runner.js through File.read + indirect eval. Modules in
// this directory deliberately communicate only through this namespace because
// the OpenDesk Runtime does not expose a public import/require module system.

'use strict';

(() => {
  const namespace = '__OpenDeskRuntimeAPICatalogRunner';
  if (globalThis[namespace]) throw new Error('Runtime API catalog runner state was initialized twice');

  const rootDir = Execution.workdir;
  const runner = {
    state: {
      rootDir,
      watchdog: File.join(rootDir, 'tests', 'runtime-api', 'run_with_timeout.py'),
      mode: String(Execution.env.OPENDESK_RUNTIME_API_MODE || 'smoke'),
      validModes: [
        'contract', 'unit', 'smoke', 'live', 'live-only', 'coverage', 'negative',
        'sound-cancel', 'notify-icon-live', 'custom-ui', 'custom-ui-config', 'dialog',
        'command', 'environment', 'file-json', 'path', 'language', 'sqlite',
      ],
      cleanupFields: [
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
      ],
      runId: '',
      runDir: '',
      contextPath: '',
      processesPath: '',
      binary: '',
      binarySha256: '',
      binaryProvenance: '',
      buildSource: '',
      binaryOriginalPath: '',
      binaryOriginalSha256: '',
      goBasicBundle: '',
      goBasicExtension: '',
      appleVisionBundle: '',
      appleVisionExtension: '',
      childEnv: {},
    },
    gates: {},
  };

  runner.fail = (message) => {
    throw new Error(message);
  };

  runner.displayOutput = (text, error = false) => {
    const value = String(text || '').replace(/\n$/, '');
    if (!value) return;
    if (error) console.error(value);
    else console.log(value);
  };

  runner.commandResult = (error) => ({
    exitCode: Number.isInteger(error && error.exitCode)
      ? error.exitCode
      : (error && error.code === 'TIMEOUT' ? 124 : null),
    stdout: String(error && error.stdout || ''),
    stderr: String(error && error.stderr || ''),
    errorCode: error && error.code ? String(error.code) : null,
    error: error || null,
  });

  runner.runCommand = async (command, args = [], options = {}) => {
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
      return runner.commandResult(error);
    }
  };

  runner.requireCommand = async (command, args = [], options = {}, label = command) => {
    const result = await runner.runCommand(command, args, options);
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || result.errorCode || 'unknown error';
      runner.fail(`${label} failed with status ${result.exitCode}: ${detail}`);
    }
    return result;
  };

  runner.parseJSON = (text, label) => {
    try {
      return JSON.parse(String(text));
    } catch (error) {
      runner.fail(`${label} is not valid JSON: ${error.message}`);
    }
  };

  runner.readJSON = async (path, label = path) => {
    try {
      return await File.readJSON(path);
    } catch (error) {
      runner.fail(`${label} could not be read: ${error.message || error}`);
    }
  };

  runner.writeJSON = async (path, value) => {
    await File.writeJSON(path, value, { spaces: 2, createDirs: true });
  };

  runner.absolutePath = (path) => {
    if (String(path).startsWith('/')) return String(path);
    return File.path(path);
  };

  runner.safeRunId = () => {
    const configured = Execution.env.OPENDESK_RUNTIME_API_RUN_ID;
    const candidate = configured && String(configured).length > 0 ? String(configured) : String(Execution.id);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate)) runner.fail(`invalid Runtime API run id: ${candidate}`);
    return candidate;
  };

  runner.sha256 = async (path) => {
    const result = await runner.requireCommand('shasum', ['-a', '256', path], {
      cwd: runner.state.rootDir,
      timeout: 30_000,
      maxOutputBytes: 1024 * 1024,
    }, `sha256 ${path}`);
    const value = result.stdout.trim().split(/\s+/)[0] || '';
    if (!/^[a-fA-F0-9]{64}$/.test(value)) runner.fail(`invalid sha256 output for ${path}`);
    return value.toLowerCase();
  };

  runner.assertExecutable = async (path, label) => {
    if (!File.isFile(path)) runner.fail(`${label} is not a regular file: ${path}`);
    await runner.requireCommand('/bin/test', ['-x', path], { timeout: 10_000 }, `${label} executable check`);
  };

  globalThis[namespace] = runner;
})();
