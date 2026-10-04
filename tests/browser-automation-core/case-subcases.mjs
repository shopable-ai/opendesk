import assert from 'node:assert/strict';
import { recordCase } from './evidence-contract.mjs';
import { LIMITS } from '../../lab/browser-automation-core/config.mjs';

// Independent judgments over immutable captures of the already executed real operations.
// These checks never replay an action and never manufacture a browser result.
export const SUBCASES = [
  ['A05.timeout', 'A05', x => {assert.equal(x.response.error.code, 'TIMEOUT'); assert.ok(x.elapsedMs <= 30 + LIMITS.deadlineToleranceMs); return x.response;}],
  ['A05.late', 'A05', x => {assert.equal(x.lateEvent.requestId, x.response.requestId); return x.lateEvent;}],
  ['A05.duplicate', 'A05', x => {assert.ok(x.duplicateEvents.some(e => e.type === 'late-response' && e.requestId === x.duplicate.requestId)); return x.duplicate;}],
  ['A12.bytes', 'A12', x => {assert.equal(x.response.error.code, 'MESSAGE_TOO_LARGE'); assert.equal(x.localRejection[0].error.code, 'MESSAGE_TOO_LARGE'); assert.ok(x.injectionEvents.some(e => e.actualBytes > LIMITS.maxMessageBytes)); return {response:x.response, local:x.localRejection, inputs:x.inputs, events:x.injectionEvents};}],
  ['B06.text', 'B06', x => {assert.equal(x.textResponse.result.value, 'Observed note'); assert.ok(x.textResponse.result.identity.document); return x.textResponse;}],
  ['B06.input', 'B06', x => {assert.equal(x.value.result.value, 'B-READ'); return x.value;}],
  ['B07.fill', 'B07', x => {assert.equal(x.input.result.value, 'B-FILL'); return {fill:x.fill, independentRead:x.input};}],
  ['B07.click', 'B07', x => {assert.equal(x.postcondition.result.trace.verification.actual, 'Visible after delay'); return {click:x.click, independentPostcondition:x.postcondition};}],
  ['B08.satisfied', 'B08', x => {assert.equal(x.wait.result.trace.verification.pass, true); return x.wait;}],
  ['B08.timeout', 'B08', x => {assert.ok(['TIMEOUT','WAIT_TIMEOUT'].includes(x.timeout.error.code)); return x.timeout;}],
  ['B08.cancel', 'B08', x => {assert.equal(x.cancelled.error.code, 'CANCELLED'); return x.cancelled;}],
  ['B09.pass', 'B09', x => {assert.equal(x.yes.result.trace.verification.pass, true); return x.yes;}],
  ['B09.fail', 'B09', x => {assert.equal(x.no.error.code, 'VERIFICATION_FAILED'); assert.equal(x.no.browserTrace.verification.actual, 'Observed note'); return x.no;}],
  ['D12.identity', 'D12', x => {assert.ok(x.events.some(e => e.reason === 'EXTENSION_NOT_ALLOWED')); assert.deepEqual(x.pageCountsAfter,x.pageCountsBefore); return {fault:x.fault, before:x.before, after:x.after, countsBefore:x.pageCountsBefore, countsAfter:x.pageCountsAfter};}],
  ['D12.credential', 'D12', x => {assert.equal(x.wrongCredential,'UNAUTHORIZED'); assert.equal(x.missingCredential,'UNAUTHORIZED'); return {wrong:x.wrongCredential, missing:x.missingCredential, countsBefore:x.pageCountsBefore, countsAfter:x.pageCountsAfter};}],
  ['D14.eval', 'D14', x => {assert.equal(x.evalResponse.error.code,'UNSUPPORTED_OPERATION'); assert.deepEqual(x.after,x.before); return {response:x.evalResponse, before:x.before, after:x.after};}],
  ['D14.unsupported', 'D14', x => {assert.equal(x.unsupported.error.code,'UNSUPPORTED_OPERATION'); assert.deepEqual(x.after,x.before); return {response:x.unsupported, before:x.before, after:x.after};}],
];
export async function recordSubcases(report, gates, persist) {
  for (const [id, parentId, judge] of SUBCASES) {
    const parent = report.cases.find(x => x.caseId === parentId);
    if (!parent || parent.status !== 'PASS' || !gates.includes(parent.gate)) continue;
    await recordCase(report, parent.gate, id, async () => ({parentCaseId:parentId, parentRawEvidencePaths:parent.rawEvidencePaths, result:judge(parent.actual)}), persist);
  }
}
