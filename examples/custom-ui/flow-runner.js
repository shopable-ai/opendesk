// Run from the repository root:
// ./dist/opendesk -ui -script examples/custom-ui/flow-runner.js -console-mode script -log-dir .runtime/examples/custom-ui/flow-runner
'use strict';

const controllerFile = File.join(Execution.workdir, 'apps', 'opendesk', 'flow-runner', 'controller.js');
(0, eval)(File.read(controllerFile) + '\n//# sourceURL=' + controllerFile);

if (!globalThis.OpenDeskFlowRunner
  || typeof OpenDeskFlowRunner.createApp !== 'function') {
  throw new Error('OpenDesk Flow Runner controller did not load');
}

const configuredRoot = System.getEnv('OPENDESK_FLOW_RUNNER_DIR') || System.getEnv('OPENDESK_SCRIPT_RUNNER_DIR');
const hasConfiguredRoot = !!(configuredRoot && configuredRoot.trim());
const runnableRoot = hasConfiguredRoot
  ? File.path(configuredRoot.trim())
  : File.join(Execution.workdir, 'recipes');

const flowRunner = OpenDeskFlowRunner.createApp({
  runnableRoot,
  managedRunnableRoot: !hasConfiguredRoot,
  file: File,
  command: Command,
  execution: Execution,
  system: System,
  ui,
  FloatingWindow,
  AbortController,
});

await flowRunner.run();
