// Run from the repository root while the OpenDesk desktop App is running:
// ./dist/opendesk -script examples/scheduler/test-remove.js -console-mode script
'use strict';

const bridgeFile = File.join(Execution.scriptDir, '_test-cli.js');
(0, eval)(File.read(bridgeFile) + '\n//# sourceURL=' + bridgeFile);

const result = await OpenDeskSchedulerTestCLIExamples.run(
  ['test', 'remove', '--batch', 'latest'],
  'scheduler test remove',
  30000,
);

console.log('SCHEDULER_TEST_REMOVE=' + JSON.stringify({
  batchId: result.batchId,
  deletedJobIds: result.deletedJobIds,
  alreadyMissingJobIds: result.alreadyMissingJobIds,
  runningAtRemovalJobIds: result.runningAtRemovalJobIds,
  futureSchedulesRemoved: result.futureSchedulesRemoved,
  reportPath: result.reportPath,
}));
return result;
