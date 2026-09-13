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

// ui.toast() is the canonical execution-owned transient feedback API.
// ui.notify() remains a compatibility alias for existing scripts only.
const notice = await ui.toast({
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
