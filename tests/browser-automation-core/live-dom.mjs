import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { SOURCE, ROOT, SOCKET, EVIDENCE, LIMITS, EXTENSION_ID } from '../../lab/browser-automation-core/config.mjs';
import { Client, untilConnected } from '../../lab/browser-automation-core/client.mjs';
import { success, locate, observeReady as waitForDocument, executeOrder } from '../../lab/browser-automation-core/golden.mjs';
import { startFixture } from './fixture-server.mjs';
import { verifyOrder, verifyRecord } from './independent-verifier.mjs';
import { recordSubcases } from './case-subcases.mjs';
import { recordCase, completeCaseIndex } from './evidence-contract.mjs';
import { expectedLoaded } from '../../lab/browser-automation-core/candidate.mjs';
import { runLiveResources } from './live-resources.mjs';
import { scanOutputs } from './redaction-scan.mjs';
import { setup } from '../../lab/browser-automation-core/setup.mjs';
import { installationReport } from '../../lab/browser-automation-core/installation.mjs';
import { provenance } from './component-check.mjs';

export async function runDOMGates({visualCheckpoint = false} = {}) {
  if (fs.existsSync(SOCKET)) throw Error('STOP_BROKER_FIRST');
  const qualified = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'current-state.json')));
  if (qualified.gates.A !== 'PASS') throw Error('ACTUAL_A_PASS_REQUIRED_BEFORE_DOM');
  const directory = path.join(EVIDENCE, `dom-${Date.now()}`); fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const report = {name: 'Browser Automation Core Demo', level: 'live-browser', status: 'NOT_RUN', directory,
    provenance: provenance(), limits: LIMITS, priorGateA: qualified.liveReport, gates: {B: 'NOT_RUN', C: 'NOT_RUN', D: 'NOT_RUN'}, cases: [], golden: []};
  const priorA = JSON.parse(fs.readFileSync(qualified.liveReport));
  if (priorA.status !== 'PASS' || priorA.level !== 'live-browser' || priorA.provenance.candidateId !== report.provenance.candidateId) throw Error('ACTUAL_A_CANDIDATE_MISMATCH');
  report.candidateId = report.provenance.candidateId; report.runId = path.basename(directory); report.loadedDocuments = [];
  let fixture, child, client, brokerLog, mainTab, scope, sensitiveValues = [];
  const tabs = new Set();
  const byId = value => ({kind: 'testId', value});
  const loaded = expectedLoaded();
  const persist = () => fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), {mode: 0o600});
  const expectError = (response, code) => { assert.equal(response.error?.code, code, JSON.stringify(response)); return response; };
  async function startBroker() {
    brokerLog = fs.openSync(path.join(directory, `broker-${Date.now()}.log`), 'ax', 0o600);
    child = spawn(process.execPath, [`${SOURCE}/cli.mjs`, 'start'], {cwd: ROOT, stdio: ['ignore', brokerLog, brokerLog]});
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) { try { client = await new Client().connect(); break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    if (!client) throw Error('BROKER_START_TIMEOUT');
    const state = await untilConnected(client);
    assert.equal(state.brokerPid, child.pid); assert.equal(state.browser.extensionId, EXTENSION_ID);
    assert.ok(/Chrome\//.test(state.browser.userAgent) && !state.browser.userAgent.includes('SIMULATED'));
    assert.equal(state.browser.loadedResources?.workerCodeSha256, loaded.workerCodeSha256);
    assert.deepEqual(state.browser.loadedResources?.resources, loaded.resources);
    const parent = execFileSync('/bin/ps', ['-p', String(state.browser.nativeHost.parentPid), '-o', 'comm='], {encoding: 'utf8'}).trim();
    assert.ok(/Google Chrome|Chromium/.test(parent));
    report.connections ||= []; report.connections.push({...state, nativeParentCommand: parent});
    report.traceFiles ||= []; report.traceFiles.push(path.join(state.evidenceDirectory, 'trace.ndjson'));
  }
  async function stopBroker() {
    client?.close(); client = null;
    if (child?.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
    if (brokerLog != null) { fs.closeSync(brokerLog); brokerLog = null; }
  }
  async function observeReady(selectedClient, tab, options) { const identity = await waitForDocument(selectedClient, tab, options); await documentProof(identity); return identity; }
  async function openTab() { const tab = (await success(client, 'test.openTab', {url: fixture.url})).result.tab; tabs.add(tab); return tab; }
  async function readId(value, chosenScope = scope) {
    const target = await locate(client, chosenScope, byId(value));
    return (await success(client, 'read', {target, field: 'text'})).result.value;
  }
  async function actionCounts(chosenScope = scope) {
    const frames = (await success(client, 'frames', {tab: chosenScope.tab})).result.frames;
    const frameCounts = [];
    for (const frame of frames.filter(item => item.frame !== 0)) frameCounts.push({frame: frame.frame, document: frame.document, clicks: await readId('frame-count', {tab: chosenScope.tab, frame: frame.frame, document: frame.document})});
    return {clicks: await readId('click-count', chosenScope), actions: await readId('action-count', chosenScope), frameCounts};
  }
  async function freshBusiness(prefix) { const execution = await executeOrder(client, scope, `${prefix}_${crypto.randomUUID().slice(0, 8)}`); return {execution, independent: await verifyOrder(fixture, execution)}; }
  async function server(orderId) {
    return (await fetch(`${fixture.origin}/verifier?orderId=${encodeURIComponent(orderId)}`, {headers: {Authorization: `Bearer ${fixture.verifierCredential}`}})).json();
  }
  const check = (gate, id, operation) => recordCase(report, gate, id, operation, persist);
  async function documentProof(selectedScope) {
    const observed = await success(client, 'observe', {scope: selectedScope});
    assert.equal(observed.result.loadedResources.contentCodeSha256, loaded.contentCodeSha256);
    assert.equal(observed.result.loadedResources.locatorCodeSha256, loaded.locatorCodeSha256);
    report.loadedDocuments.push({observedAt: new Date().toISOString(), ...observed.result.identity, loadedResources: observed.result.loadedResources});
    return observed;
  }
  async function waitEvent(type, requestId) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const found = (await success(client, 'events')).result.find(event => (event.type === type || event.eventType === type) && (event.requestId === requestId || event.data?.requestId === requestId));
      if (found) return found;
      await new Promise(r => setTimeout(r, 10));
    }
    throw Error('CONTROLLED_BOUNDARY_NOT_OBSERVED');
  }
  try {
    fixture = await startFixture(); report.fixture = {url: fixture.url, origin: fixture.origin, directory: fixture.directory, evidenceFile: fixture.evidenceFile, instance: fixture.instance};
    await startBroker(); mainTab = await openTab(); scope = await observeReady(client, mainTab); report.mainTab = mainTab; report.initialScope = scope; await documentProof(scope);
    await check('B', 'B01', async () => { const status = await success(client, 'status'), tabs = await success(client, 'tabs'); assert.ok(tabs.result.tabs.some(t => t.tab === mainTab)); return {status, tabs}; });
    await check('B', 'B02', async () => { const result = await success(client, 'observe', {scope}); assert.equal(result.result.identity.document, scope.document); assert.ok(result.result.observation.length > 0); return result; });
    await check('B', 'B03', async () => {
      const queries = [{kind: 'role', role: 'button', name: 'Query'}, {kind: 'label', value: 'Order ID'}, {kind: 'text', value: 'Observed note'},
        byId('amount'), {kind: 'attribute', attribute: 'name', value: 'confirmationAmount'},
        {kind: 'relation', axis: 'descendant', within: byId('order-panel'), target: {kind: 'role', role: 'button', name: 'Confirm'}}];
      const evidence = []; for (const query of queries) evidence.push({query, target: await locate(client, scope, query)}); return evidence;
    });
    await check('B', 'B04', async () => { const before = await server('B-NONE'); const response = expectError(await client.request('locate', {scope, query: byId('absent')}), 'TARGET_NOT_FOUND'); assert.equal((await server('B-NONE')).confirmAttemptCount, before.confirmAttemptCount); return response; });
    await check('B', 'B05', async () => { const before = await server('B-NONE'); const response = expectError(await client.request('locate', {scope, query: {kind: 'role', role: 'button', name: 'Duplicate'}}), 'AMBIGUOUS_TARGET'); assert.equal(response.error.candidateCount, 2); assert.equal((await server('B-NONE')).confirmAttemptCount, before.confirmAttemptCount); return response; });
    await check('B', 'B06', async () => { const textTarget = await locate(client, scope, byId('note')), textResponse = await success(client, 'read', {target: textTarget, field: 'text'}), text = textResponse.result.value; assert.equal(text, 'Observed note'); const target = await locate(client, scope, byId('order-id')); await success(client, 'fill', {target, value: 'B-READ'}); const value = await success(client, 'read', {target, field: 'value'}); assert.equal(value.result.value, 'B-READ'); return {text, textResponse, value}; });
    await check('B', 'B07', async () => { const target = await locate(client, scope, byId('order-id')); const fill = await success(client, 'fill', {target, value: 'B-FILL'}); const reveal = await locate(client, scope, byId('reveal')), beforeClick = await readId('action-count'); const click = await success(client, 'click', {target: reveal}); assert.equal(fill.result.value, 'B-FILL'); assert.equal(await readId('app-order-value'), 'B-FILL'); const input = await success(client, 'read', {target, field: 'value'}); assert.equal(input.result.value, 'B-FILL'); const delayed = await locate(client, scope, byId('delayed')); const postcondition = await success(client, 'wait', {target: delayed, condition: {kind: 'equals', field: 'text', expected: 'Visible after delay'}}, {timeoutMs: 5000}); assert.equal(Number(await readId('action-count')), Number(beforeClick) + 1); return {fill, input, click, beforeClick, postcondition}; });
    await check('B', 'B08', async () => {
      const target = await locate(client, scope, byId('delayed')); await success(client, 'click', {target: await locate(client, scope, byId('reveal'))}); const wait = await success(client, 'wait', {target, condition: {kind: 'equals', field: 'text', expected: 'Visible after delay'}}, {timeoutMs: 5000});
      const timeout = await client.request('wait', {target, condition: {kind: 'equals', field: 'text', expected: 'Never'}}, {timeoutMs: 150}); assert.ok(['TIMEOUT', 'WAIT_TIMEOUT'].includes(timeout.error?.code));
      const requestId = crypto.randomUUID(), pending = client.request('wait', {target, condition: {kind: 'equals', field: 'text', expected: 'Never'}}, {requestId, timeoutMs: 5000});
      client.cancel(requestId); const cancelled = expectError(await pending, 'CANCELLED'); return {wait, timeout, cancelled};
    });
    await check('B', 'B09', async () => { const target = await locate(client, scope, byId('note')); const yes = await success(client, 'verify', {target, condition: {kind: 'equals', field: 'text', expected: 'Observed note'}}); const no = expectError(await client.request('verify', {target, condition: {kind: 'equals', field: 'text', expected: 'Wrong'}}), 'VERIFICATION_FAILED'); assert.equal(no.browserTrace.verification.actual, 'Observed note'); return {yes, no}; });
    await check('B', 'B10', async () => {
      const inventory = await success(client, 'frames', {tab: mainTab}); const childFrame = inventory.result.frames.find(frame => frame.frame !== 0); assert.ok(childFrame?.document);
      const childScope = {tab: mainTab, frame: childFrame.frame, document: childFrame.document}; const target = await locate(client, childScope, {kind: 'role', role: 'button', name: 'Confirm'});
      const before = await readId('status'), mainCountsBefore = {actions: await readId('action-count'), clicks: await readId('click-count')}, childBefore = await readId('frame-count', childScope); await success(client, 'click', {target}); assert.equal(await readId('frame-status', childScope), 'Frame Clicked'); assert.equal(await readId('status'), before); const mainCountsAfter = {actions: await readId('action-count'), clicks: await readId('click-count')}, childAfter = await readId('frame-count', childScope); assert.deepEqual(mainCountsAfter, mainCountsBefore); assert.equal(Number(childAfter), Number(childBefore) + 1); return {inventory, target, mainCountsBefore, mainCountsAfter, childBefore, childAfter};
    }); 
    const matrixQueries = {
      role: {kind: 'role', role: 'button', name: 'Matrix name'}, label: {kind: 'label', value: 'Matrix label'}, text: {kind: 'text', value: 'Matrix text'},
      testId: byId('matrix-target'), attribute: {kind: 'attribute', attribute: 'data-action', value: 'matrix-attribute'},
      relation: {kind: 'relation', axis: 'descendant', within: byId('matrix-panel'), target: {kind: 'role', role: 'button', name: 'Matrix name'}},
    };
    for (const [mode, control, count] of [['unique', 'matrix-one', 1], ['missing', 'matrix-zero', 0], ['ambiguous', 'matrix-two', 2]]) {
      await success(client, 'click', {target: await locate(client, scope, byId(control))});
      for (const [kind, query] of Object.entries(matrixQueries)) await check('B', `B03.${kind}.${mode}`, async () => {
        const before = await readId('action-count'), response = await client.request('locate', {scope, query});
        if (count === 1) { assert.ok(response.result.target.elementIdentity); assert.equal(response.result.candidateCount, 1); }
        else { expectError(response, count === 0 ? 'TARGET_NOT_FOUND' : 'AMBIGUOUS_TARGET'); if (count === 2) assert.equal(response.error.candidateCount, 2); }
        const after = await readId('action-count'); assert.equal(after, before); return {query, count, response, before, after};
      });
    }
    await check('B', 'B10.identity', async () => {
      const frames = (await success(client, 'frames', {tab: mainTab})).result.frames;
      const frame = frames.find(x => x.frame !== 0), local = {tab: mainTab, frame: frame.frame, document: frame.document};
      await documentProof(local); const target = await locate(client, local, byId('frame-confirm'));
      const before = {main: await readId('action-count'), child: await readId('frame-count', local)};
      const incomplete = {...target}; delete incomplete.frame;
      const missing = expectError(await client.request('click', {target: incomplete}), 'INSUFFICIENT_TARGET_IDENTITY');
      const wrong = expectError(await client.request('click', {target: {...target, frame: 0}}), 'STALE_TARGET');
      const after = {main: await readId('action-count'), child: await readId('frame-count', local)}; assert.deepEqual(after, before);
      return {target, missing, wrong, before, after};
    });
    await check('B', 'B10.replacement', async () => {
      const frame = (await success(client, 'frames', {tab: mainTab})).result.frames.find(x => x.frame !== 0), local = {tab: mainTab, frame: frame.frame, document: frame.document};
      const target = await locate(client, local, byId('frame-confirm'));
      await success(client, 'click', {target: await locate(client, scope, byId('frame-replace'))});
      const before = await readId('action-count');
      const refused = expectError(await client.request('click', {target}), 'STALE_TARGET');
      const freshFrame = (await success(client, 'frames', {tab: mainTab})).result.frames.find(x => x.frame !== 0);
      const freshScope = {tab: mainTab, frame: freshFrame.frame, document: freshFrame.document};
      assert.notEqual(freshFrame.document, local.document); await documentProof(freshScope);
      const fresh = await locate(client, freshScope, byId('frame-confirm')); assert.equal(await readId('frame-count', freshScope), '0');
      await success(client, 'click', {target: fresh}); assert.equal(await readId('frame-count', freshScope), '1'); assert.equal(await readId('action-count'), before);
      return {local, target, refused, freshScope, fresh, before, after: await readId('action-count')};
    });
    report.gates.B = 'PASS'; persist();
    for (let i = 0; i < 3; i++) await check('C', `C${i + 1}`, async () => { const execution = await executeOrder(client, scope, `ORDER_${crypto.randomUUID().slice(0, 8)}`); const independent = await verifyOrder(fixture, execution); report.golden.push({execution, independent}); return {execution, independent}; });
    
    const goldenCopy = report.golden[0];
    const serverRecord = await server(goldenCopy.execution.orderId);
    const mutations = {
      amount: copy => {copy.server.amount = '0.00';}, missing: copy => {copy.server.submissionCount = 0; copy.server.submissions = [];},
      duplicate: copy => {copy.server.submissionCount = 2; copy.server.submissions.push({...copy.server.submissions[0]});},
      status: copy => {copy.execution.domFinalStatus = 'Submitting';},
      'lineage-missing': copy => {copy.execution.fillSourceReadRequestId = null;},
      'lineage-wrong': copy => {copy.execution.fillResponse.result.trace.action.sourceReadRequestId = crypto.randomUUID();},
    };
    for (const [name, mutate] of Object.entries(mutations)) await check('C', `C.negative.${name}`, async () => {
      const copy = structuredClone({server: serverRecord, execution: goldenCopy.execution}); mutate(copy);
      assert.throws(() => verifyRecord(copy.server, copy.execution));
      await verifyOrder(fixture, goldenCopy.execution);
      return {mutation: name, isolatedCopy: copy, verifierRejected: true, successfulRecordPreserved: true};
    });
    report.gates.C = 'PASS'; persist();
    if (visualCheckpoint) {
      await success(client, 'click', {target: await locate(client, scope, byId('hide-checks'))});
      const requestPath = path.join(directory, 'visual-request.json'), acknowledgement = path.join(directory, 'visual-reviewed.json');
      fs.writeFileSync(requestPath, JSON.stringify({runId: report.runId, candidateId: report.candidateId, requestedAt: new Date().toISOString(), deadlineMs: LIMITS.visualDeadlineMs, golden: report.golden, url: fixture.url, tab: mainTab, scope, source: report.provenance,
        purpose: 'Real observed DOM and completed third Golden order; verify actual window layout'}, null, 2), {mode: 0o600});
      fs.writeFileSync(path.join(EVIDENCE, 'current-visual-request.json'), JSON.stringify({requestPath, acknowledgement}), {mode: 0o600});
      const deadline = Date.now() + LIMITS.visualDeadlineMs;
      while (!fs.existsSync(acknowledgement) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      if (!fs.existsSync(acknowledgement)) throw Error('VISUAL_CHECKPOINT_TIMEOUT');
      report.visualEvidence = JSON.parse(fs.readFileSync(acknowledgement));
      if (report.visualEvidence.status !== 'PASS') throw Error('VISUAL_CHECK_FAILED');
    }
    await check('D', 'D01', async () => {
      const target = await locate(client, scope, byId('confirm')), before = await server('D-REFRESH'); await success(client, 'test.reloadTab', {tab: mainTab});
      scope = await observeReady(client, mainTab, {differentDocument: scope.document}); const countsBefore = await actionCounts(); const refused = expectError(await client.request('click', {target}), 'STALE_TARGET'); assert.equal(refused.error.outcome, 'NOT_DISPATCHED');
      assert.equal(await readId('click-count'), '0'); assert.equal((await server('D-REFRESH')).confirmAttemptCount, before.confirmAttemptCount); const countsAfter = await actionCounts(); assert.deepEqual(countsAfter, countsBefore); return {target, newScope: scope, refused, countsBefore, countsAfter, freshLegal: await freshBusiness('REFRESH')};
    });
    await check('D', 'D02', async () => {
      const second = await openTab(), secondScope = await observeReady(client, second); const inventory = await success(client, 'tabs'); assert.ok(inventory.result.tabs.filter(tab => tab.title === 'Order Demo').length >= 2);
      const refused = expectError(await client.request('click', {target: {title: 'Order Demo'}}), 'INSUFFICIENT_TARGET_IDENTITY');
      const execution = await executeOrder(client, scope, `TAB_${crypto.randomUUID().slice(0, 8)}`); const independent = await verifyOrder(fixture, execution);
      assert.equal(await readId('click-count', secondScope), '0'); return {firstScope: scope, secondScope, refused, execution, independent};
    });
    await check('D', 'D03', async () => { const target = await locate(client, scope, byId('confirm')), before = await server('D-REPLACE'); const replacement = await locate(client, scope, byId('replace')); await success(client, 'click', {target: replacement}); const countsBefore = await actionCounts(); const refused = expectError(await client.request('click', {target}), 'STALE_TARGET'); assert.equal(refused.error.outcome, 'FAILED_CONFIRMED'); assert.equal((await server('D-REPLACE')).confirmAttemptCount, before.confirmAttemptCount); const fresh = await locate(client, scope, byId('confirm')); assert.notEqual(fresh.elementIdentity, target.elementIdentity); const countsAfter = await actionCounts(); assert.deepEqual(countsAfter, countsBefore); return {target, fresh, refused, countsBefore, countsAfter, freshLegal: await freshBusiness('FRESH')}; });
    await check('D', 'D04', async () => { const target = await locate(client, scope, byId('confirm')), before = await server('D-SPA'); const spa = await locate(client, scope, byId('spa')); await success(client, 'click', {target: spa}); const countsBefore = await actionCounts(); const refused = expectError(await client.request('click', {target}), 'STALE_TARGET'); assert.equal((await server('D-SPA')).confirmAttemptCount, before.confirmAttemptCount); const fresh = await locate(client, scope, byId('confirm')); assert.notEqual(fresh.semanticRevision, target.semanticRevision); const countsAfter = await actionCounts(); assert.deepEqual(countsAfter, countsBefore); return {target, fresh, refused, countsBefore, countsAfter, freshLegal: await freshBusiness('FRESH')}; });
    await check('D', 'D05', async () => { const tab = await openTab(), local = await observeReady(client, tab), target = await locate(client, local, byId('confirm')); await success(client, 'test.closeTab', {tab}); tabs.delete(tab); const survivorScopes = []; for (const survivor of tabs) survivorScopes.push(await observeReady(client, survivor)); const countsBefore = []; for (const survivor of survivorScopes) countsBefore.push(await actionCounts(survivor)); const refused = expectError(await client.request('click', {target}), 'STALE_TARGET'); assert.equal(refused.error.outcome, 'NOT_DISPATCHED'); const countsAfter = []; for (const survivor of survivorScopes) countsAfter.push(await actionCounts(survivor)); assert.deepEqual(countsAfter, countsBefore); return {local, target, refused, survivorScopes, countsBefore, countsAfter, freshLegal: await freshBusiness('CLOSED')}; });
    await check('D', 'D06', async () => { const target = await locate(client, scope, byId('confirm')), before = (await success(client, 'status')).result, countsBefore = await actionCounts(); await client.request('fault.reload'); const after = await untilConnected(client, state => state.connectionEpoch !== before.connectionEpoch); const refused = expectError(await client.request('click', {target}), 'STALE_TARGET'); assert.equal(refused.error.outcome, 'NOT_DISPATCHED'); scope = await observeReady(client, mainTab); const countsAfter = await actionCounts(); assert.deepEqual(countsAfter, countsBefore); return {before, after, target, refused, countsBefore, countsAfter, freshLegal: await freshBusiness('RECONNECT')}; });
    let unknownOrder;
    await check('D', 'D08', async () => { unknownOrder = await executeOrder(client, scope, `LOST_${crypto.randomUUID().slice(0, 8)}`, {dropAck: true}); assert.equal(unknownOrder.confirmResponse.outcome, 'OUTCOME_UNKNOWN'); const independent = await verifyOrder(fixture, unknownOrder); const before = (await success(client, 'status')).result; await client.request('fault.disconnect'); const after = await untilConnected(client, state => state.connectionEpoch !== before.connectionEpoch); scope = await observeReady(client, mainTab); const afterReconnect = await verifyOrder(fixture, unknownOrder); const events = (await success(client, 'events')).result; assert.ok(events.some(event => event.eventType === 'ack-dropped' && event.data.requestId === unknownOrder.confirmResponse.requestId)); return {execution: unknownOrder, independent, before, after, afterReconnect, events}; });
    await check('D', 'D03.race', async () => {
      const target = await locate(client, scope, byId('confirm')), requestId = crypto.randomUUID();
      const pending = client.request('click', {target, testExecutionBarrier: true}, {requestId, timeoutMs: 5000});
      const held = await waitEvent('execution-held', requestId);
      await success(client, 'click', {target: await locate(client, scope, byId('replace'))});
      const before = {count: await readId('click-count'), server: await server('D-RACE')};
      await success(client, 'test.releaseExecution', {requestId});
      const refused = expectError(await pending, 'STALE_TARGET'); assert.equal(refused.outcome, 'FAILED_CONFIRMED');
      const after = {count: await readId('click-count'), server: await server('D-RACE')}; assert.deepEqual(after, before);
      return {target, held, refused, before, after};
    });
    await check('D', 'D09', async () => { const target = await locate(client, scope, byId('confirm')), before = await server('D-CANCEL'), requestId = crypto.randomUUID(); const pending = client.request('click', {target, testDispatchBarrier: true}, {requestId}); const held = await waitEvent('dispatch-held', requestId); const cancelledAt = Date.now(); client.cancel(requestId); const response = expectError(await pending, 'CANCELLED'); assert.equal(response.error.outcome, 'CANCELLED_BEFORE_DISPATCH'); assert.ok(Date.now() - cancelledAt <= LIMITS.cancelDeadlineMs + LIMITS.deadlineToleranceMs); assert.equal((await server('D-CANCEL')).confirmAttemptCount, before.confirmAttemptCount); return {target, held, response, countsAfter: await server('D-CANCEL')}; });
    await check('D', 'D10', async () => { const execution = await executeOrder(client, scope, `CANCEL_${crypto.randomUUID().slice(0, 8)}`, {dropAck: true, requestId: crypto.randomUUID(), cancelAfterDispatch: true}); assert.equal(execution.confirmResponse.outcome, 'OUTCOME_UNKNOWN'); assert.equal(execution.confirmResponse.error.code, 'CANCELLED'); const independent = await verifyOrder(fixture, execution); return {execution, independent}; });
    await check('D', 'D.identity-fields', async () => {
      const target = await locate(client, scope, byId('confirm')), before = {actions: await readId('action-count'), server: await server('IDENTITY')};
      const results = [];
      for (const field of ['brokerSession', 'browserSession', 'connectionEpoch', 'tab', 'frame', 'document', 'elementIdentity', 'semanticRevision']) {
        const forged = {...target, [field]: typeof target[field] === 'number' ? target[field] + 9999 : `${target[field]}-wrong`};
        const response = expectError(await client.request('click', {target: forged}), 'STALE_TARGET'); assert.equal(response.outcome || response.error.outcome, 'NOT_DISPATCHED'); results.push({field, response});
      }
      const after = {actions: await readId('action-count'), server: await server('IDENTITY')}; assert.deepEqual(after, before); return {target, results, before, after};
    });
    await check('D', 'D11', async () => { const target = await locate(client, scope, byId('disabled')), countsBefore = await actionCounts(); const refused = expectError(await client.request('click', {target}), 'NOT_INTERACTABLE'); assert.equal(refused.error.outcome, 'FAILED_CONFIRMED'); const rows = report.traceFiles.flatMap(file => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line))); const outcomes = new Set(rows.map(row => row.outcome)); for (const value of ['NOT_DISPATCHED', 'SUCCEEDED', 'FAILED_CONFIRMED', 'CANCELLED_BEFORE_DISPATCH', 'OUTCOME_UNKNOWN']) assert.ok(outcomes.has(value), value); const countsAfter = await actionCounts(); assert.deepEqual(countsAfter, countsBefore); return {refused, countsBefore, countsAfter, outcomes: [...outcomes]}; });
    await check('D', 'D09.response-race', async () => {
      const beforeCount = await readId('action-count'), target = await locate(client, scope, byId('reveal')), requestId = crypto.randomUUID();
      const pending = client.request('click', {target, testDispatchBarrier: true}, {requestId});
      const held = await waitEvent('dispatch-held', requestId);
      await success(client, 'test.releaseDispatch', {requestId}); client.cancel(requestId);
      const response = await pending; assert.ok(['SUCCEEDED', 'OUTCOME_UNKNOWN'].includes(response.outcome));
      if (response.outcome === 'OUTCOME_UNKNOWN') await waitEvent('late-response', requestId);
      const afterCount = await readId('action-count'); assert.ok(Number(afterCount) >= Number(beforeCount) && Number(afterCount) <= Number(beforeCount) + 1);
      await readId('delayed'); assert.equal((await success(client, 'status')).result.pendingCount, 0);
      const rows = report.traceFiles.flatMap(file => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)));
      assert.equal(rows.filter(row => row.requestId === requestId && ['SUCCESS', 'ERROR'].includes(row.status)).length, 1);
      return {held, response, beforeCount, afterCount, terminalCount: 1};
    });
    await check('D', 'D12', async () => {
      await assert.rejects(new Client().connect('wrong'), {code: 'UNAUTHORIZED'}); await assert.rejects(new Client().connect(''), {code: 'UNAUTHORIZED'});
      const pageCountsBefore = await actionCounts(), before = (await success(client, 'status')).result; const fault = await client.request('fault.identity');
      const after = await untilConnected(client, state => state.connectionEpoch !== before.connectionEpoch);
      const events = (await success(client, 'events')).result;
      assert.ok(events.some(event => event.type === 'disconnected' && event.reason === 'EXTENSION_NOT_ALLOWED'));
      scope = await observeReady(client, mainTab);
      assert.deepEqual(await actionCounts(), pageCountsBefore);
      const installation = installationReport(); assert.equal(installation.nativeHost.checks.allowedOrigins, true);
      return {pageCountsBefore, pageCountsAfter: await actionCounts(), wrongCredential: 'UNAUTHORIZED', missingCredential: 'UNAUTHORIZED', pinnedOrigin: true, fault, before, after, events,
        identityFaultScope: 'actual pinned Chrome Extension deliberately sends an unapproved declared hello identity; Broker rejects it before execution'};
    });
    await check('D', 'D12.normal-mode', async () => {
      await stopBroker(); setup(false); await startBroker(); scope = await observeReady(client, mainTab);
      const target = await locate(client, scope, byId('confirm')), before = await server('D-NORMAL');
      const refused = [];
      for (const operation of ['fault.delay', 'fault.duplicateAck', 'fault.disconnect', 'fault.hostExit', 'fault.reload', 'fault.identity', 'fault.protocol', 'fault.malformed', 'fault.oversized', 'test.openTab', 'test.reloadTab', 'test.closeTab', 'test.adoptTab', 'test.releaseDispatch', 'test.releaseExecution']) refused.push(expectError(await client.request(operation), 'TEST_MODE_REQUIRED'));
      for (const flag of ['dropAckAfterCompleted', 'testExecutionBarrier', 'testDispatchBarrier']) refused.push(expectError(await client.request('click', {target, [flag]: true}), 'TEST_MODE_REQUIRED'));
      const nonce = crypto.randomUUID(), control = await success(client, 'echo', {nonce}); assert.equal(control.result.nonce, nonce);
      const after = await server('D-NORMAL'); assert.deepEqual(after, before);
      await stopBroker(); setup(true); await startBroker(); scope = await observeReady(client, mainTab);
      return {normalMode: true, refused, control, before, after};
    });
    await check('D', 'D13', async () => {
      const secret = `PRIVATE_${crypto.randomUUID()}`, target = await locate(client, scope, byId('private-note'));
      const fill = await success(client, 'fill', {target, value: secret}), read = await success(client, 'read', {target, field: 'value'});
      const observation = await success(client, 'observe', {scope});
      const aggregateTarget = await locate(client, scope, byId('order-panel')), aggregate = await success(client, 'read', {target: aggregateTarget, field: 'text'}); assert.equal(aggregate.result.redacted, true); assert.equal(aggregate.result.value, null);
      const verified = await success(client, 'verify', {target, condition: {kind: 'equals', field: 'value', expected: secret}});
      const fillFailure = expectError(await client.request('fill', {target, value: secret + 'x'.repeat(LIMITS.maxFillChars)}), 'NOT_INTERACTABLE');
      const readFailure = expectError(await client.request('read', {target, field: 'invalid'}), 'INVALID_READ_FIELD');
      const failed = expectError(await client.request('verify', {target, condition: {kind: 'equals', field: 'value', expected: 'Wrong'}}), 'VERIFICATION_FAILED');
      assert.equal(fill.result.redacted, true); assert.equal(read.result.redacted, true); assert.equal(read.result.value, null);
      assert.ok(!JSON.stringify({fill, read, observation, aggregate, verified, fillFailure, readFailure, failed}).includes(secret));
      const install = (await import('../../lab/browser-automation-core/config.mjs')).loadInstall();
      sensitiveValues = [secret, install.clientCredential, install.hostCredential, fixture.verifierCredential];
      report.privateScanInput = path.join(EVIDENCE, `.private-redaction-input-${report.runId}.json`);
      fs.writeFileSync(report.privateScanInput, JSON.stringify(sensitiveValues), {mode: 0o600});
      const responsesFile = path.join(directory, 'sensitive-responses.json'); fs.writeFileSync(responsesFile, JSON.stringify({fill, read, observation, aggregate, verified, fillFailure, readFailure, failed}), {mode: 0o600});
      const logs = [responsesFile, ...report.traceFiles, ...fs.readdirSync(directory).filter(file => file.endsWith('.log')).map(file => path.join(directory, file))];
      const scan = scanOutputs(logs, sensitiveValues); assert.equal(scan.status, 'PASS');
      return {target, fill, read, observation, aggregate, verified, fillFailure, readFailure, failed, plaintextAbsentFromTraceAndLogs: true, scanFiles: logs, scan};
    });
    await check('D', 'D13.scanner-negative', async () => {
      const isolated = path.join(directory, 'isolated-scan-negative.txt'); fs.writeFileSync(isolated, sensitiveValues[0], {mode: 0o600});
      const result = scanOutputs([isolated], sensitiveValues); assert.equal(result.status, 'FAIL'); assert.ok(!JSON.stringify(result).includes(sensitiveValues[0]));
      assert.throws(() => scanOutputs([], sensitiveValues)); assert.throws(() => scanOutputs([`${isolated}.missing`], sensitiveValues));
      fs.unlinkSync(isolated);
      return {scannerDetectedPlantedLeak: true, reportContainsPlaintext: false, emptyInventoryRejected: true, missingFileRejected: true, result};
    });
    await check('D', 'D14', async () => { const before = await actionCounts(); const evalResponse = expectError(await client.request('eval', {source: "document.querySelector('[data-testid=confirm]').click()"}), 'UNSUPPORTED_OPERATION'); const unsupported = expectError(await client.request('unsupported.action'), 'UNSUPPORTED_OPERATION'); const after = await actionCounts(); assert.deepEqual(after, before); return {evalResponse, unsupported, before, after}; });
    await check('D', 'D15', async () => {
      const before = (await success(client, 'status')).result;
      const execution = await executeOrder(client, scope, `WORKER_${crypto.randomUUID().slice(0, 8)}`, {dropAck: true, onConfirmDispatched: async () => {
        const target = await locate(client, scope, byId('status')); await success(client, 'wait', {target, condition: {kind: 'equals', field: 'text', expected: 'Completed'}}, {timeoutMs: 5000});
        await client.request('fault.reload'); await untilConnected(client, state => state.connectionEpoch !== before.connectionEpoch);
      }});
      assert.equal(execution.confirmResponse.outcome, 'OUTCOME_UNKNOWN'); const independent = await verifyOrder(fixture, execution); scope = await observeReady(client, mainTab); return {before, execution, independent, after: (await success(client, 'status')).result};
    });
    await check('D', 'D07', async () => {
      const target = await locate(client, scope, byId('confirm')), before = (await success(client, 'status')).result, counts = await server('D-RESTART'), pageCountsBefore = await actionCounts();
      await stopBroker(); await startBroker(); const after = (await success(client, 'status')).result; assert.notEqual(before.brokerSession, after.brokerSession);
      const refused = expectError(await client.request('click', {target}), 'STALE_TARGET'); assert.equal(refused.error.outcome, 'NOT_DISPATCHED');
      scope = await observeReady(client, mainTab); const pageCountsAfter = await actionCounts(); assert.deepEqual(pageCountsAfter, pageCountsBefore); assert.equal((await server('D-RESTART')).confirmAttemptCount, counts.confirmAttemptCount); const unknownAfterRestart = unknownOrder ? await verifyOrder(fixture, unknownOrder) : null;
      return {before, after, target, refused, countsAfter: await server('D-RESTART'), unknownAfterRestart, pageCountsBefore, pageCountsAfter, freshLegal: await freshBusiness('BROKER')};
    });
    await runLiveResources({client, fixture, report, check, tabs, documentProof});
    await recordSubcases(report, ['B','C','D'], persist);
    report.gates.D = 'PASS'; report.status = 'PASS'; report.finalRedactionScan = {status: 'PASS', reportPath: path.join(directory, 'final-redaction-scan.json')};
  } catch (error) { report.status = report.cases.length ? 'FAIL' : 'BLOCKED'; report.errorCode = error.code || error.message; }
  finally {
    report.cleanup = [];
    if (client && fixture) for (const tab of tabs) {
      try { const inventory = await success(client, 'frames', {tab}); const observed = inventory.result.frames.find(frame => frame.frame === 0);
        if (!observed?.url.startsWith(fixture.origin + '/')) throw Error('CLEANUP_OWNERSHIP_CHANGED');
        await success(client, 'test.adoptTab', {tab, expectedUrl: observed.url}); await success(client, 'test.closeTab', {tab}); report.cleanup.push({tab, status: 'PASS'});
      } catch (error) { report.cleanup.push({tab, status: 'FAIL', code: error.code || error.message}); }
    }
    await stopBroker(); if (fixture) await fixture.close();
    if (report.cleanup.some(item => item.status !== 'PASS')) { report.status = 'FAIL'; report.cleanupFailed = true; }
    completeCaseIndex(report, ['B','C','D']); persist();
    if (report.status === 'PASS') {
      try {
        const inventory = [...report.traceFiles, ...fs.readdirSync(directory, {recursive: true}).filter(file => /\.(json|log)$/.test(file)).map(file => path.join(directory, file)), fixture.evidenceFile];
        const scan = scanOutputs(inventory, sensitiveValues);
        assert.equal(scan.status, 'PASS');
        fs.writeFileSync(report.finalRedactionScan.reportPath, JSON.stringify(scan, null, 2), {mode: 0o600});
      } catch (error) {report.status = 'FAIL'; report.gates.D = 'FAIL'; report.errorCode = error.code || error.message; persist();}
    }
  }
  return report;
}
