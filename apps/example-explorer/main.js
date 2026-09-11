'use strict';

// Run from the repository root:
// ./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer

const appDir = Execution.scriptDir;
for (const name of ['catalog.js', 'launch.js', 'runner.js', 'view.js', 'controller.js']) {
  const modulePath = File.join(appDir, name);
  (0, eval)(File.read(modulePath) + '\n//# sourceURL=' + modulePath);
}

if (!globalThis.OpenDeskExampleExplorer || typeof OpenDeskExampleExplorer.createApp !== 'function') {
  throw new Error('OpenDesk Examples controller did not load');
}

const capabilities = ui.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error('Custom UI is unavailable: ' + (capabilities.reason || 'not enabled'));
}

const configuredRoot = System.getEnv('OPENDESK_EXAMPLES_ROOT');
const examplesRoot = configuredRoot && configuredRoot.trim()
  ? File.path(configuredRoot.trim())
  : File.join(Execution.workdir, 'examples');

const app = OpenDeskExampleExplorer.createApp({
  file: File,
  command: Command,
  execution: Execution,
  system: System,
  ui,
  AbortController,
  examplesRoot,
  stylesPath: File.join(appDir, 'styles.css'),
  logger: console,
});

await app.start();
