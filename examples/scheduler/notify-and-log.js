// Run from the repository root:
// ./dist/opendesk -ui -script examples/scheduler/notify-and-log.js -console-mode script
//
// In the OpenDesk product app, point OPENDESK_SCRIPT_RUNNER_DIR at this
// directory and create a Scheduler file task for notify-and-log.js.
'use strict';

const firedAt = new Date().toISOString();
const scheduled = String(Execution.source).startsWith('scheduler:');
const executionLabel = Execution.executionId.slice(-12);

console.log(
  `[SCHEDULER_NOTIFY] stage=start mode=${scheduled ? 'scheduler' : 'direct'}`
    + ` executionId=${Execution.executionId} firedAt=${firedAt}`,
);

// ui.notify() is retained here deliberately to exercise the compatibility API
// requested by Scheduler users. New application code may prefer ui.toast().
const notice = await ui.notify({
  message: `${scheduled ? 'Scheduler 到期触发' : 'Direct payload smoke'} · ${firedAt}`,
  caption: `Execution …${executionLabel}`,
  level: 'success',
  timeoutMs: 2500,
  closable: true,
});
await notice.waitUntilClosed();

const evidence = {
  schemaVersion: 1,
  status: 'passed',
  executionId: Execution.executionId,
  source: Execution.source,
  scheduled,
  firedAt,
  completedAt: new Date().toISOString(),
};
const evidencePath = File.join(Execution.artifactDir, 'notify-result.json');
await File.writeJSON(evidencePath, evidence, {spaces: 2});

console.log(
  `[SCHEDULER_NOTIFY] stage=complete mode=${scheduled ? 'scheduler' : 'direct'}`
    + ` executionId=${Execution.executionId} evidence=${evidencePath}`,
);

return evidence;
