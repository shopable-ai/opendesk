import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecord } from './independent-verifier.mjs';

const target = {brokerSession: 'b', browserSession: 's', connectionEpoch: 'e', tab: 1, frame: 0, document: 'd', elementIdentity: 'amount', semanticRevision: 'rev'};
const identity = {...target};
const successful = () => ({server: {orderId: 'one', amount: '17.23', submissionCount: 1, submissions: [{recordedAmount: '17.23', accepted: true}]},
  execution: {orderId: 'one', domReadAmount: '17.23', confirmationActual: '17.23', domFinalStatus: 'Completed', readRequestId: 'read', fillRequestId: 'fill', fillSourceReadRequestId: 'read', readTarget: target,
    readResponse: {requestId: 'read', result: {identity, value: '17.23', trace: {resolvedTarget: target}}},
    fillResponse: {requestId: 'fill', result: {identity, value: '17.23', trace: {action: {sourceReadRequestId: 'read'}}}},
    confirmationReadResponse: {result: {value: '17.23'}}, verificationResponse: {result: {trace: {verification: {actual: 'Completed', pass: true}}}}}});
test('independent verifier accepts matching records and rejects six corrupt evidence variants', () => {
  const good = successful(); verifyRecord(good.server, good.execution);
  const mutations = [x => {x.server.amount = '99.00';}, x => {x.server.submissionCount = 0; x.server.submissions = [];},
    x => {x.server.submissionCount = 2; x.server.submissions.push({...x.server.submissions[0]});}, x => {x.execution.domFinalStatus = 'Submitting';},
    x => {x.execution.fillSourceReadRequestId = null;}, x => {x.execution.fillResponse.result.trace.action.sourceReadRequestId = 'another-read';}];
  for (const mutate of mutations) { const copy = structuredClone(good); mutate(copy); assert.throws(() => verifyRecord(copy.server, copy.execution)); }
});
