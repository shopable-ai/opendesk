// Run from the repository root while the OpenDesk desktop App is running:
// ./dist/opendesk -script examples/scheduler/test-add.js -console-mode script
'use strict';

const bridgeFile = File.join(Execution.scriptDir, '_test-cli.js');
(0, eval)(File.read(bridgeFile) + '\n//# sourceURL=' + bridgeFile);

const batch = await OpenDeskSchedulerTestCLIExamples.run(
  ['test', 'add'],
  'scheduler test add',
  30000,
);

console.log('SCHEDULER_TEST_ADD=' + JSON.stringify({
  batchId: batch.batchId,
  status: batch.status,
  jobs: batch.jobs.map(job => ({
    kind: job.kind,
    jobId: job.jobId,
    scheduledAt: job.expectedScheduledAt,
  })),
}));
return batch;
