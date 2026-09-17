// Compatibility entry for the original two-notification Scheduler demo.
// Run from the repository root while the OpenDesk desktop App is running:
// ./dist/opendesk -script examples/scheduler/schedule-two-notifications.js -console-mode script
//
// This no longer starts or targets a second HTTP Scheduler. It delegates to the
// same current-App batch implementation used by Plan Center and the scheduler
// management CLI. Verification is intentionally a separate operation so this
// add command can exit before either scheduled time arrives.
'use strict';

const bridgeFile = File.join(Execution.scriptDir, '_test-cli.js');
(0, eval)(File.read(bridgeFile) + '\n//# sourceURL=' + bridgeFile);

const batch = await OpenDeskSchedulerTestCLIExamples.run(
  ['test', 'add'],
  'scheduler test add',
  30000,
);
console.log('SCHEDULER_DEMO_ADD=' + JSON.stringify({
  batchId: batch.batchId,
  status: batch.status,
  jobs: batch.jobs.map(job => ({kind: job.kind, jobId: job.jobId, scheduledAt: job.expectedScheduledAt})),
}));
return batch;
