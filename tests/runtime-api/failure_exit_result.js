(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
const result = globalThis.RUNTIME_API_EXTRA || {};
const exitStatus = Number(result.exitStatus);
const passed = exitStatus !== 0 && exitStatus !== 124;
RuntimeAPITest.writeGate('failure-exit', {
  status: passed ? 'passed' : 'failed',
  exitStatus,
  assertionObserved: passed,
});
console.log('[RUNTIME-API-FAILURE-EXIT RESULT] ' + JSON.stringify({ exitStatus, passed }));
if (!passed) throw new Error('failure_exit gate rejected status=' + exitStatus);
