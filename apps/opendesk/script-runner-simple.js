'use strict';

const controllerFile = File.join(Execution.scriptDir, 'script-runner', 'controller.js');
(0, eval)(File.read(controllerFile) + '\n//# sourceURL=' + controllerFile);

if (!globalThis.OpenDeskScriptRunnerSimple
  || typeof OpenDeskScriptRunnerSimple.createApp !== 'function') {
  throw new Error('OpenDesk Script Runner controller did not load');
}

function readEnv(name) {
  const value = System.getEnv(name);
  return value && value.trim() ? value.trim() : '';
}

function resolveAppDataRoot() {
  const configured = readEnv('OPENDESK_APP_DATA_DIR');
  if (configured) return File.path(configured);

  const home = readEnv('HOME') || readEnv('USERPROFILE');
  const appCapabilities = automation.app.getCapabilities();
  const packageID = appCapabilities.packageId || 'com.opendesk.desktop';
  if (home) return File.join(home, '.opendesk', 'apps', packageID);
  throw new Error('无法确定 OpenDesk 可写数据目录；请设置 OPENDESK_APP_DATA_DIR');
}

const appDataRoot = resolveAppDataRoot();
File.ensureDir(appDataRoot);

const configuredRoot = readEnv('OPENDESK_SCRIPT_RUNNER_DIR');
const hasConfiguredRoot = !!configuredRoot;
const scriptRoot = hasConfiguredRoot
  ? File.path(configuredRoot)
  : File.join(appDataRoot, 'recipes');
const runnerExecution = Object.freeze({workdir: appDataRoot});

function createProductRunner() {
  let app = null;
  let runTask = null;
  let opening = null;
  let lastError = null;

  function start() {
    if (app && runTask) return app;
    const current = OpenDeskScriptRunnerSimple.createApp({
      scriptRoot,
      managedScriptRoot: !hasConfiguredRoot,
      file: File,
      command: Command,
      execution: runnerExecution,
      system: System,
      ui,
      FloatingWindow,
      AbortController,
      openListOnStart: false,
    });
    app = current;
    const task = current.run()
      .catch(error => {
        lastError = error && error.message ? String(error.message) : String(error || 'Script Runner failed');
        console.error('SCRIPT_RUNNER_LIFECYCLE_ERROR=' + JSON.stringify({message: lastError}));
      })
      .finally(() => {
        if (runTask === task) runTask = null;
        if (app === current) app = null;
      });
    runTask = task;
    return current;
  }

  async function open(source) {
    if (opening) return opening;
    const task = (async () => {
      const current = start();
      await Promise.resolve();
      await current.openList(source ? `打开来源：${source}` : '');
      lastError = null;
      return state();
    })();
    opening = task;
    try {
      return await task;
    } finally {
      if (opening === task) opening = null;
    }
  }

  async function stopRun() {
    return app ? app.stopRun() : false;
  }

  function state() {
    return {
      active: !!app,
      opening: !!opening,
      lastError,
      runner: app ? app.state() : null,
    };
  }

  return Object.freeze({open, openList: open, stopRun, state});
}

globalThis.OpenDeskProductScriptRunner = createProductRunner();
globalThis.OpenDeskProductPaths = Object.freeze({
  appDataRoot,
  scriptRoot,
  packageRoot: Execution.workdir,
  executable: System.getExecutablePath(),
});
