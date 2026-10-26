import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Run the actual D12 assertions with controlled responses: no Broker, Chrome,
// registration changes, or replacement for the required live-browser gate.
const source = fs.readFileSync(new URL('./live-dom.mjs', import.meta.url), 'utf8');
const start = source.indexOf("    await check('D', 'D12', async () => {");
const end = source.indexOf("    await check('D', 'D12.normal-mode'", start);
assert.ok(start >= 0 && end > start, 'D12 case boundaries must exist');
const d12 = `(async () => { ${source.slice(start, end)} })()`;

async function runD12({allowedOrigins = true, installationFailed = false, acceptedCredential,
  events = [{type: 'disconnected', reason: 'EXTENSION_NOT_ALLOWED'}], changedCounts = false} = {}) {
  const credentials = [], counts = {clicks: '0', actions: '0', frameCounts: []};
  let diagnosticReads = 0, countReads = 0, result;
  await vm.runInNewContext(d12, {
    assert, path, EVIDENCE: '/no-retired-installation-evidence',
    fs: {readFileSync() { throw Object.assign(Error('retired installation snapshot read'), {code: 'ENOENT'}); }},
    Client: class {
      async connect(credential) {
        credentials.push(credential);
        if (credential !== acceptedCredential) throw Object.assign(Error('refused'), {code: 'UNAUTHORIZED'});
      }
    },
    client: {request: async operation => { assert.equal(operation, 'fault.identity'); return {result: {}}; }},
    success: async (_client, operation) => {
      if (operation === 'status') return {result: {connectionEpoch: 'before'}};
      assert.equal(operation, 'events'); return {result: events};
    },
    untilConnected: async (_client, predicate) => {
      const state = {connectionEpoch: 'after'}; assert.equal(predicate(state), true); return state;
    },
    scope: {}, mainTab: 1, observeReady: async () => ({}),
    actionCounts: async () => changedCounts && countReads++ > 0 ? {...counts, actions: '1'} : counts,
    installationReport: () => {
      diagnosticReads++;
      if (installationFailed) return {nativeHost: {status: 'FAIL', errorCode: 'ENOENT'}};
      return {nativeHost: {checks: {allowedOrigins}}};
    },
    check: async (gate, id, operation) => {
      assert.equal(gate, 'D'); assert.equal(id, 'D12'); result = await operation();
    },
  });
  assert.deepEqual(credentials, ['wrong', '']);
  assert.equal(diagnosticReads, 1, 'D12 must inspect the current installation');
  assert.equal(result.pinnedOrigin, true);
  return result;
}

test('D12 checks the current installation without a retired installation snapshot', async () => {
  assert.ok(/import\s*\{\s*installationReport\s*\}\s*from\s*['"]\.\.\/\.\.\/lab\/browser-automation-core\/installation\.mjs['"]/.test(source), 'D12 must use the canonical installation diagnostic');
  await runD12();
});
test('D12 still rejects an unpinned native origin', async () => {
  await assert.rejects(runD12({allowedOrigins: false}), {code: 'ERR_ASSERTION'});
});
test('D12 fails closed when current installation inspection fails', async () => {
  await assert.rejects(runD12({installationFailed: true}), {name: 'TypeError'});
});
test('D12 still requires wrong credentials to be refused', async () => {
  await assert.rejects(runD12({acceptedCredential: 'wrong'}), {code: 'ERR_ASSERTION'});
});
test('D12 still requires missing credentials to be refused', async () => {
  await assert.rejects(runD12({acceptedCredential: ''}), {code: 'ERR_ASSERTION'});
});
test('D12 still requires the extension identity rejection event', async () => {
  await assert.rejects(runD12({events: []}), {code: 'ERR_ASSERTION'});
});
test('D12 still rejects page side effects', async () => {
  await assert.rejects(runD12({changedCounts: true}), {code: 'ERR_ASSERTION'});
});
