import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { LIMITS } from '../../lab/browser-automation-core/config.mjs';
import { untilConnected } from '../../lab/browser-automation-core/client.mjs';
import { success, locate, observeReady } from '../../lab/browser-automation-core/golden.mjs';

export async function runLiveResources({client, fixture, report, check, tabs, documentProof}) {
  const byId = value => ({kind: 'testId', value});
  let tab, scope;
  async function fresh() {
    if (tab != null) {await success(client, 'test.closeTab', {tab}); tabs.delete(tab);}
    tab = (await success(client, 'test.openTab', {url: `${fixture.origin}/resources.html`})).result.tab; tabs.add(tab);
    scope = await observeReady(client, tab); await documentProof(scope);
  }
  async function buildNodes(total) {
    await success(client, 'fill', {target: await locate(client, scope, byId('nodes')), value: String(total)});
    await success(client, 'click', {target: await locate(client, scope, byId('build'))});
  }
  await fresh();
  await check('D', 'R.DOM-scan', async () => {
    const boundaries = [];
    const baseline = (await success(client, 'observe', {scope})).result.trace.afterObservation;
    for (const count of [LIMITS.maxObserveElements - 1, LIMITS.maxObserveElements, LIMITS.maxObserveElements + 1]) {
      await buildNodes(baseline.scanNodes + count - baseline.eligibleNodes);
      const observed = await success(client, 'observe', {scope});
      assert.equal(observed.result.trace.afterObservation.eligibleNodes, count);
      assert.equal(observed.result.observation.length, Math.min(count, LIMITS.maxObserveElements));
      assert.equal(observed.result.trace.afterObservation.truncated, count > LIMITS.maxObserveElements); boundaries.push({eligibleCount: count, observed});
    }
    for (const total of [LIMITS.maxScanNodes - 1, LIMITS.maxScanNodes, LIMITS.maxScanNodes + 1]) {
      await buildNodes(total);
      const response = await client.request('observe', {scope});
      if (total <= LIMITS.maxScanNodes) {
        assert.equal(response.result.trace.afterObservation.scanNodes, total);
        assert.equal(response.result.observation.length, LIMITS.maxObserveElements);
        assert.equal(response.result.trace.afterObservation.truncated, true);
      } else {
        assert.equal(response.error.code, 'DOM_SCAN_LIMIT');
        // A visible early candidate cannot prove uniqueness when the full scan did not finish.
        const partial = await client.request('locate', {scope, query: byId('value')}); assert.equal(partial.error.code, 'DOM_SCAN_LIMIT');
      }
      assert.equal((await success(client, 'status')).result.pendingCount, 0); boundaries.push({total, response});
      await fresh();
    }
    return {boundaries, recovered: await success(client, 'echo', {nonce: crypto.randomUUID()})};
  });
  await check('D', 'R.fill-query-text', async () => {
    const target = await locate(client, scope, byId('value')), actions = await locate(client, scope, byId('actions'));
    const results = [];
    for (const length of [LIMITS.maxFillChars - 1, LIMITS.maxFillChars, LIMITS.maxFillChars + 1]) {
      const before = await success(client, 'read', {target: actions}), value = 'x'.repeat(length);
      const fill = await client.request('fill', {target, value});
      const read = await success(client, 'read', {target, field: 'value'}), after = await success(client, 'read', {target: actions});
      if (length <= LIMITS.maxFillChars) {assert.equal(read.result.value.length, length); assert.ok(!fill.error);}
      else {assert.equal(fill.error.code, 'NOT_INTERACTABLE'); assert.equal(after.result.value, before.result.value); assert.equal(read.result.value.length, LIMITS.maxFillChars);}
      results.push({length, fill, read, before, after});
    }
    for (const length of [LIMITS.maxTextChars - 1, LIMITS.maxTextChars, LIMITS.maxTextChars + 1]) {
      const fill = await success(client, 'fill', {target, value: 't'.repeat(length)});
      assert.equal(fill.result.trace.afterObservation.value.length, Math.min(length, LIMITS.maxTextChars)); results.push({textLength: length, fill});
    }
    for (const length of [LIMITS.maxQueryChars - 1, LIMITS.maxQueryChars, LIMITS.maxQueryChars + 1]) {
      const response = await client.request('locate', {scope, query: byId('q'.repeat(length))});
      assert.equal(response.error.code, length > LIMITS.maxQueryChars ? 'INVALID_QUERY' : 'TARGET_NOT_FOUND'); results.push({queryLength: length, response});
    }
    return {results, recovered: await success(client, 'read', {target, field: 'value'})};
  });
  await check('D', 'R.frames', async () => {
    const boundaries = [];
    for (const total of [LIMITS.maxFramesPerTab - 1, LIMITS.maxFramesPerTab, LIMITS.maxFramesPerTab + 1]) {
      await success(client, 'fill', {target: await locate(client, scope, byId('frames')), value: String(total)});
      await success(client, 'click', {target: await locate(client, scope, byId('build-frames'))});
      let inventory; const deadline = Date.now() + 5000;
      do {
        inventory = await client.request('frames', {tab});
        if (inventory.error || inventory.result.frames.length === total) break;
        await new Promise(r => setTimeout(r, 10));
      } while (Date.now() < deadline);
      if (total <= LIMITS.maxFramesPerTab) assert.equal(inventory.result.frames.length, total);
      else assert.equal(inventory.error.code, 'FRAME_LIMIT');
      boundaries.push({total, inventory}); await fresh();
    }
    return {boundaries, recovered: await success(client, 'observe', {scope})};
  });
  await check('D', 'R.targets', async () => {
    // New connection clears Broker caches; a new document isolates Content's per-document store.
    const before = (await success(client, 'status')).result;
    await client.request('fault.disconnect'); await untilConnected(client, state => state.connectionEpoch !== before.connectionEpoch);
    await fresh(); await buildNodes(LIMITS.maxScanNodes);
    const targets = [];
    for (let index = 20; ; index++) {
      const state = (await success(client, 'status')).result;
      if (state.resourceCounts.targets >= LIMITS.maxTargets) break;
      const response = await client.request('locate', {scope, query: byId(`node-${index}`)});
      assert.ok(response.result?.target, JSON.stringify(response)); targets.push(response.result.target);
    }
    const counts = (await success(client, 'status')).result.resourceCounts;
    assert.equal(counts.targets, LIMITS.maxTargets);
    const overflow = await client.request('locate', {scope, query: byId('node-1900')}); assert.equal(overflow.error.code, 'TARGET_STORE_LIMIT');
    const observed = await success(client, 'observe', {scope}); assert.equal(observed.result.resourceCounts.targets, LIMITS.maxTargets);
    await fresh(); const recovered = await success(client, 'locate', {scope, query: byId('value')});
    assert.equal((await success(client, 'status')).result.pendingCount, 0);
    return {counts, targetsAllocated: targets.length, overflow, observed, recovered};
  });
  await check('D', 'R.read-sources', async () => {
    const beforeConnection = (await success(client, 'status')).result;
    await client.request('fault.disconnect'); await untilConnected(client, state => state.connectionEpoch !== beforeConnection.connectionEpoch);
    scope = await observeReady(client, tab); await documentProof(scope);
    const target = await locate(client, scope, byId('value')), actionTarget = await locate(client, scope, byId('actions'));
    await success(client, 'fill', {target, value: 'SOURCE_CACHE'});
    const reads = [], boundaries = [];
    for (let index = 0; index < LIMITS.maxTargets + 1; index++) {
      reads.push(await success(client, 'read', {target, field: 'value'}));
      if (index + 1 >= LIMITS.maxTargets - 1) {
        const state = (await success(client, 'status')).result;
        assert.equal(state.resourceCounts.readSources, Math.min(index + 1, LIMITS.maxTargets)); boundaries.push({reads: index + 1, state});
      }
    }
    const beforeActions = await success(client, 'read', {target: actionTarget});
    const evicted = await client.request('fill', {target, value: reads[0].result.value, sourceReadRequestId: reads[0].requestId});
    assert.equal(evicted.error.code, 'READ_SOURCE_MISMATCH');
    const afterActions = await success(client, 'read', {target: actionTarget}); assert.equal(afterActions.result.value, beforeActions.result.value);
    // Reading the action counter adds two entries, so obtain a fresh real read immediately before the accepted consumer.
    const latest = await success(client, 'read', {target, field: 'value'});
    const accepted = await success(client, 'fill', {target, value: latest.result.value, sourceReadRequestId: latest.requestId});
    const actual = await success(client, 'read', {target, field: 'value'}); assert.equal(actual.result.value, latest.result.value);
    return {boundaries, firstRead: reads[0], evicted, beforeActions, afterActions, latest, accepted, actual};
  });
  await success(client, 'test.closeTab', {tab}); tabs.delete(tab);
  const state = (await success(client, 'status')).result, counts = state.resourceCounts;
  assert.equal(state.pendingCount, 0);
  for (const [field, limit] of [['connections', LIMITS.maxConnections], ['targets', LIMITS.maxTargets], ['documents', LIMITS.maxTrackedTabs * LIMITS.maxFramesPerTab], ['readSources', LIMITS.maxTargets], ['ownedTabs', LIMITS.maxTrackedTabs], ['events', LIMITS.maxEvents], ['requestMemory', LIMITS.maxRequestsPerSession], ['traceBytes', LIMITS.maxTraceBytes]]) assert.ok(counts[field] <= limit, field);
  report.resourcePostconditions = {status: 'PASS', state};
}
