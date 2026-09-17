// Run from the repository root while the OpenDesk desktop App is running:
// ./dist/opendesk -script examples/scheduler/test-verify.js -console-mode script
//
// This command may wait up to 60 seconds for the two one-time schedules. It
// never invokes Run Now. Native notification visibility remains NOT_RUN until a
// human/native observer records it separately.
'use strict';

const bridgeFile = File.join(Execution.scriptDir, '_test-cli.js');
(0, eval)(File.read(bridgeFile) + '\n//# sourceURL=' + bridgeFile);

const result = await OpenDeskSchedulerTestCLIExamples.run(
  ['test', 'verify', '--batch', 'latest', '--wait', '60s', '--latency-tolerance', '3s'],
  'scheduler test verify',
  75000,
);

console.log('SCHEDULER_TEST_VERIFY=' + JSON.stringify({
  batchId: result.batch.batchId,
  verificationStatus: result.report.verificationStatus,
  nativeVisual: result.report.nativeVisual,
  reportPath: result.reportPath,
  runs: result.report.runs.map(item => ({
    kind: item.kind,
    jobId: item.jobId,
    runCount: item.runCount,
    executionId: item.run && item.run.executionId,
    triggerType: item.run && item.run.triggerType,
    startLatencyMs: item.startLatencyMs,
  })),
}));
return result;
