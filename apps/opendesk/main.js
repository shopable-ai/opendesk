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

const runner = OpenDeskProductScriptRunner.create({officialShell});
const unsubscribeAppActions = automation.app.onAction(async event => {
  if (!event || (event.id !== 'opendesk.open' && event.id !== 'runner.open')) return;
  await runner.open(event.source || event.id);
});

try {
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
    officialShell: officialShell.state(),
  }));

  await runner.waitUntilClosed();
} finally {
  unsubscribeAppActions();
}
