'use strict';

const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error('OpenDesk App Mode is unavailable: ' + JSON.stringify(capabilities));
}

const officialShellFile = File.join(Execution.scriptDir, 'official-shell.js');
(0, eval)(File.read(officialShellFile) + '\n//# sourceURL=' + officialShellFile);
if (!globalThis.OpenDeskOfficialShell || typeof OpenDeskOfficialShell.create !== 'function') {
  throw new Error('OpenDesk Official Shell did not load');
}

const officialShell = OpenDeskOfficialShell.create({
  file: File,
  command: Command,
  system: System,
  execution: Execution,
  packageRoot: Execution.scriptDir,
});

const runnerEntry = File.join(Execution.scriptDir, 'script-runner-simple.js');
(0, eval)(File.read(runnerEntry) + '\n//# sourceURL=' + runnerEntry);
if (!globalThis.OpenDeskProductScriptRunner
  || typeof OpenDeskProductScriptRunner.create !== 'function') {
  throw new Error('OpenDesk product Script Runner did not initialize');
}

const schedulerClientEntry = File.join(Execution.scriptDir, 'scheduler-client.js');
(0, eval)(File.read(schedulerClientEntry) + '\n//# sourceURL=' + schedulerClientEntry);
if (!globalThis.OpenDeskSchedulerClient
  || typeof OpenDeskSchedulerClient.listJobs !== 'function') {
  throw new Error('OpenDesk Scheduler client did not initialize');
}

const schedulerCenterEntry = File.join(Execution.scriptDir, 'scheduler-center.js');
(0, eval)(File.read(schedulerCenterEntry) + '\n//# sourceURL=' + schedulerCenterEntry);
if (!globalThis.OpenDeskSchedulerCenter
  || typeof OpenDeskSchedulerCenter.create !== 'function') {
  throw new Error('OpenDesk Scheduler Center did not initialize');
}

const runtimeLogEntry = File.join(Execution.scriptDir, 'runtime-log.js');
(0, eval)(File.read(runtimeLogEntry) + '\n//# sourceURL=' + runtimeLogEntry);
if (!globalThis.OpenDeskRuntimeLog
  || typeof OpenDeskRuntimeLog.create !== 'function') {
  throw new Error('OpenDesk Runtime Log did not initialize');
}

const runner = OpenDeskProductScriptRunner.create({officialShell});
const schedulerCenter = OpenDeskSchedulerCenter.create();
const runtimeLog = OpenDeskRuntimeLog.create({runner});
const officialActionIDs = new Set(['opendesk.home', 'opendesk.help', 'opendesk.customize']);

automation.app.onAction(async event => {
  if (!event) return;
  if (event.id === 'opendesk.open' || event.id === 'runner.open') {
    await runner.open(event.source || event.id);
    return;
  }
  if (event.id === 'scheduler.center' || event.id === 'scheduler.open') {
    await schedulerCenter.open(event.source || event.id);
    return;
  }
  if (event.id === 'scheduler.new') {
    await schedulerCenter.openCreate(event.source || event.id);
    return;
  }
  if (event.id === 'runtime.log') {
    await runtimeLog.open(event.source || event.id);
    return;
  }
  if (officialActionIDs.has(event.id)) {
    await officialShell.activate(event.id);
  }
});

const initialState = await runner.open('startup');

console.log('OPENDESK_PRODUCT_APP_READY=' + JSON.stringify({
  executionId: Execution.id,
  packageId: capabilities.packageId,
  packageRoot: Execution.workdir,
  scriptDir: Execution.scriptDir,
  executable: System.getExecutablePath(),
  appDataRoot: globalThis.OpenDeskProductPaths.appDataRoot,
  scriptRoot: globalThis.OpenDeskProductPaths.scriptRoot,
  mainWindowId: initialState.mainWindowId,
  toolbarMaxWidth: initialState.toolbarMaxWidth,
  recipeProcessModel: 'child-opendesk-process',
  scheduler: OpenDeskSchedulerClient.getCapabilities(),
  runtimeLog: runtimeLog.state(),
  officialShell: officialShell.state(),
}));
