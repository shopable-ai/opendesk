import assert from 'node:assert/strict';

// This module runs ONLY after the executor returns. It never supplies an amount to the executor.
export async function verifyOrder(fixture, execution) {
  const response = await fetch(`${fixture.origin}/verifier?orderId=${encodeURIComponent(execution.orderId)}`, {
    headers: {Authorization: `Bearer ${fixture.verifierCredential}`}});
  assert.equal(response.status, 200);
  const server = await response.json();
  if (fixture.instance) assert.equal(server.instance, fixture.instance, 'FIXTURE_INSTANCE_MISMATCH');
  verifyRecord(server, execution);
  return {status: 'PASS', orderId: execution.orderId, domReadAmount: execution.domReadAmount, confirmationActual: execution.confirmationActual,
    domFinalStatus: execution.domFinalStatus, serverRecordedAmount: server.submissions[0].recordedAmount, serverAmount: server.amount,
    submissionCount: server.submissionCount, submissions: server.submissions, verifierRunAfterExecution: true,
    readRequestId: execution.readRequestId, fillSourceReadRequestId: execution.fillSourceReadRequestId, readTarget: execution.readTarget, serverSnapshot: server};
}
// Also used on isolated evidence copies by negative tests. Never supplies answers to the executor.
export function verifyRecord(server, execution) {
  assert.equal(server.orderId, execution.orderId);
  assert.equal(server.submissionCount, 1); assert.equal(server.amount, execution.domReadAmount);
  assert.equal(execution.confirmationActual, execution.domReadAmount); assert.equal(execution.domFinalStatus, 'Completed');
  assert.equal(server.submissions[0].recordedAmount, execution.domReadAmount); assert.equal(server.submissions[0].accepted, true);
  assert.equal(server.submissions.length, 1);
  assert.equal(execution.fillSourceReadRequestId, execution.readRequestId);
  const read = execution.readResponse, fill = execution.fillResponse;
  assert.equal(read?.requestId, execution.readRequestId);
  assert.equal(fill?.requestId, execution.fillRequestId);
  assert.equal(read?.result?.value, execution.domReadAmount);
  assert.equal(fill?.result?.value, execution.domReadAmount);
  assert.equal(fill?.result?.trace?.action?.sourceReadRequestId, read.requestId);
  assert.deepEqual(read.result.trace.resolvedTarget, execution.readTarget);
  for (const key of ['brokerSession', 'browserSession', 'connectionEpoch', 'tab', 'frame', 'document']) {
    assert.notEqual(execution.readTarget[key], null);
    assert.equal(fill.result.identity[key], execution.readTarget[key]);
    assert.equal(read.result.identity[key], execution.readTarget[key]);
  }
  assert.equal(execution.confirmationReadResponse?.result?.value, execution.domReadAmount);
  assert.equal(execution.verificationResponse?.result?.trace?.verification?.actual, 'Completed');
  assert.equal(execution.verificationResponse?.result?.trace?.verification?.pass, true);
}
