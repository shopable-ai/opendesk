// Run from the repository root:
// ./dist/opendesk -ui -script examples/custom-ui/script-runner-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/script-runner-simple
'use strict';

const controllerFile = File.join(Execution.scriptDir, 'script-runner-simple', 'controller.js');
(0, eval)(File.read(controllerFile) + '\n//# sourceURL=' + controllerFile);

if (!globalThis.OpenDeskScriptRunnerSimple || typeof OpenDeskScriptRunnerSimple.createApp !== 'function') {
  throw new Error('OpenDesk Script Runner Simple controller did not load');
}

const configuredRoot = System.getEnv('OPENDESK_SCRIPT_RUNNER_DIR');
const scriptRoot = configuredRoot && configuredRoot.trim()
  ? File.path(configuredRoot.trim())
  : File.join(Execution.workdir, 'recipes');

const runner = OpenDeskScriptRunnerSimple.createApp({
  scriptRoot,
  file: File,
  command: Command,
  execution: Execution,
  system: System,
  ui,
  FloatingWindow,
  AbortController,
});

await runner.run();
