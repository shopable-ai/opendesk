import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyOrder} from '../browser-automation-core/independent-verifier.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const readTrace = file => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

export function auditTrace(file, {source, executionId, origin, tab} = {}) {
  const rows = readTrace(file), seen = new Set(), coreFiles = new Map();
  assert.ok(rows.length > 0, 'EMPTY_CANONICAL_TRACE');
  for (const row of rows) {
    assert.equal(row.canonical, true);
    assert.equal(row.surface, 'browser');
    if (source) assert.equal(row.source, source);
    if (executionId) assert.equal(row.executionId, executionId);
    if (origin) assert.equal(row.origin, origin);
    assert.ok(!seen.has(row.actionId), 'DUPLICATE_CANONICAL_ACTION'); seen.add(row.actionId);
    for (const field of ['executionId', 'actionId', 'requestId', 'source', 'surface', 'browserSession', 'connectionEpoch',
      'tab', 'frame', 'document', 'origin', 'url', 'operation', 'targetRequest', 'resolvedTarget', 'targetSemantics',
      'beforeObservation', 'runtimeInput', 'runtimeOutput', 'actualActionResult', 'afterObservation',
      'verification', 'status', 'errorClass', 'timestamps', 'evidenceReferences']) assert.ok(Object.hasOwn(row, field), 'MISSING_TRACE_FIELD:' + field);
    assert.equal(row.requestId, row.actionId);
    const responseRef = row.evidenceReferences.response;
    assert.equal(hash(fs.readFileSync(responseRef.path)), responseRef.sha256, 'RESPONSE_BYTES_CHANGED');
    const response = json(responseRef.path);
    assert.equal(response.requestId, row.requestId);
    const ref = row.evidenceReferences.coreTerminal;
    if (ref) {
      if (!coreFiles.has(ref.path)) coreFiles.set(ref.path, fs.readFileSync(ref.path, 'utf8').trimEnd().split('\n'));
      const line = coreFiles.get(ref.path)[ref.line - 1];
      assert.equal(hash(line + '\n'), ref.sha256, 'CORE_TERMINAL_CHANGED');
      const fact = JSON.parse(line);
      assert.equal(fact.requestId, row.requestId); assert.equal(fact.executionId, row.executionId);
      assert.equal(fact.operation, row.operation); assert.equal(fact.status, row.status);
      assert.equal(fact.outcome, row.outcome);
      if (['fill', 'click'].includes(row.operation) && row.status === 'SUCCESS') {
        assert.ok(fact.action && row.actualActionResult);
        assert.deepEqual(row.actualActionResult, fact.action);
      }
    } else {
      assert.equal(row.outcome, 'NOT_DISPATCHED', 'UNBOUND_ACTION_OUTCOME');
      assert.ok(row.evidenceReferences.policy, 'MISSING_PRE_DISPATCH_POLICY_EVIDENCE');
    }
    if (tab !== undefined && row.status === 'SUCCESS' && row.resolvedTarget) assert.equal(row.resolvedTarget.tab, tab);
  }
  return {status:'PASS', count:rows.length, uniqueCanonicalActions:seen.size, tracePath:file, traceSha256:hash(fs.readFileSync(file))};
}

export function auditCodex(file, traceFile) {
  const events = readTrace(file), calls = events.filter(event => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call');
  const rows = readTrace(traceFile), ids = new Set(rows.map(row => row.requestId));
  const seen = new Set();
  assert.ok(calls.length > 0, 'NO_REAL_CODEX_MCP_CALL');
  for (const event of events) {
    if (event.type === 'item.completed') assert.ok(['mcp_tool_call','agent_message','reasoning'].includes(event.item?.type), 'NON_MCP_AGENT_TOOL:' + event.item?.type);
  }
  const bindings = [];
  for (const event of calls) {
    const call = event.item;
    assert.equal(call.server, 'opendesk'); assert.ok(/^tm_browser_(status|tabs|observe|locate|read|act|wait|verify)$/.test(call.tool));
    assert.equal(call.status, 'completed'); assert.ok(!call.error, 'CODEX_TOOL_ERROR');
    const content = call.result?.content || [];
    const payload = JSON.parse(content.find(item => item.type === 'text').text);
    assert.equal(payload.source, 'agent'); assert.equal(payload.surface, 'browser');
    assert.ok(ids.has(payload.requestId), 'CODEX_CALL_NOT_IN_CANONICAL_TRACE');
    assert.ok(!seen.has(payload.requestId), 'DUPLICATE_CODEX_ACTION_BINDING'); seen.add(payload.requestId);
    const row = rows.find(item => item.requestId === payload.requestId);
    assert.equal(row.operation, call.tool === 'tm_browser_act' ? call.arguments.operation : call.tool.replace('tm_browser_', ''));
    bindings.push({codexItemId:call.id, tool:call.tool, requestId:payload.requestId, executionId:payload.executionId});
  }
  assert.equal(calls.length, rows.length, 'SECOND_OR_MISSING_CANONICAL_ACTION');
  return {status:'PASS', realCodexMCPCalls:calls.length, onlyExistingOpenDeskBrowserMCP:true, canonicalBindings:bindings,
    codexEventsSha256:hash(fs.readFileSync(file))};
}

export function executionFromTrace(file, orderId, supplementalConfirmation = null) {
  const rows = readTrace(file), response = row => json(row.evidenceReferences.response.path);
  const amount = rows.find(row => row.operation === 'read' && typeof row.runtimeOutput === 'string' && row.runtimeOutput !== '' &&
    row.afterObservation?.testId === 'amount');
  assert.ok(amount, 'MISSING_ACTUAL_DOM_AMOUNT_READ');
  const fills = rows.filter(row => row.operation === 'fill' && row.afterObservation?.testId === 'confirmation');
  assert.equal(fills.length, 1, 'CONFIRMATION_FILL_COUNT');
  const fill = fills[0];
  const confirmations = rows.filter(row => row.operation === 'click' && row.beforeObservation?.testId === 'confirm');
  const final = rows.findLast(row => row.operation === 'verify' && row.afterObservation?.testId === 'status');
  assert.ok(final, 'MISSING_CANDIDATE_FINAL_VERIFICATION');
  const confirmation = rows.findLast(row => row.operation === 'read' && row.afterObservation?.testId === 'confirmation');
  const confirmationResponse = confirmation ? response(confirmation) : supplementalConfirmation;
  assert.ok(confirmationResponse, 'MISSING_INDEPENDENT_CONFIRMATION_DOM_READ');
  return {schemaVersion:'browser-golden-execution/v1', executionId:amount.executionId, orderId,
    domReadAmount:amount.runtimeOutput, confirmationActual:confirmationResponse.result.value,
    domFinalStatus:final.verification.actual, readRequestId:amount.requestId, fillRequestId:fill.requestId,
    fillSourceReadRequestId:fill.sourceReadRequestId, readTarget:amount.resolvedTarget,
    readResponse:response(amount), fillResponse:response(fill), confirmationReadResponse:confirmationResponse,
    verificationResponse:response(final), confirmActionCount:confirmations.length,
    canonicalTracePath:file, canonicalTraceSha256:hash(fs.readFileSync(file)),
    confirmationObservationRole:confirmation ? 'executor-dom-read' : 'post-executor-independent-dom-read'};
}

export async function independentVerify(execution) {
  const fixture = json(path.join(ROOT, '.runtime/browser-core/fixture-public.json'));
  const privateVerifier = json(path.join(ROOT, '.runtime/browser-core/fixture-verifier.json'));
  assert.equal(fixture.instance, privateVerifier.instance);
  // The private credential is used only inside this post-executor verifier.
  const result = await verifyOrder({origin:fixture.origin,instance:fixture.instance,verifierCredential:privateVerifier.credential}, execution);
  assert.equal(execution.confirmActionCount, 1, 'CONFIRM_ACTION_COUNT');
  return {...result, fixtureInstance:fixture.instance, independentVerifierSource:path.join(ROOT,'tests/browser-automation-core/independent-verifier.mjs'),
    independentVerifierSha256:hash(fs.readFileSync(path.join(ROOT,'tests/browser-automation-core/independent-verifier.mjs')))};
}
