// Diagnostic payload only. The authoritative scheduled/manual/unknown source is
// JobRun.triggerType, written by Scheduler service code. Execution.source is
// recorded here only to help correlate an Execution; payload code must not use
// it to declare that automatic scheduling passed.
'use strict';

const firedAt = new Date().toISOString();
const executionLabel = Execution.executionId.slice(-12);
console.log(
  `[SCHEDULER_NOTIFY] stage=start executionId=${Execution.executionId}`
    + ` runtimeSource=${Execution.source} firedAt=${firedAt}`,
);

const toastInvocation = {called: false, returned: false, closed: false, error: ''};
let toastError = null;
try {
  toastInvocation.called = true;
  const notice = await ui.toast({
    message: `Scheduler payload invoked · ${firedAt}`,
    caption: `Execution …${executionLabel}`,
    level: 'success',
    timeoutMs: 2500,
    closable: true,
  });
  toastInvocation.returned = true;
  await notice.waitUntilClosed();
  toastInvocation.closed = true;
} catch (error) {
  toastError = error;
  toastInvocation.error = String(error && error.message || error);
}

const evidence = {
  schemaVersion: 2,
  executionId: Execution.executionId,
  runtimeSource: Execution.source,
  firedAt,
  completedAt: new Date().toISOString(),
  toastInvocation,
  nativeVisualConfirmed: false,
};
const evidencePath = File.join(Execution.artifactDir, 'notify-result.json');
await File.writeJSON(evidencePath, evidence, {spaces: 2});
console.log(`[SCHEDULER_NOTIFY] stage=complete executionId=${Execution.executionId} evidence=${evidencePath}`);
if (toastError) throw toastError;
return evidence;
