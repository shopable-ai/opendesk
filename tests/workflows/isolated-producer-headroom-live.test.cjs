'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EVIDENCE_ROOT, compilePacket, sha256, post } = require('./tools/isolated-producer.cjs');
const { createNarrowBridge, runHeadroomBridgeProbe } = require('./tools/isolated-producer-headroom-live.cjs');

fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
const root = fs.mkdtempSync(path.join(EVIDENCE_ROOT, 'narrow-bridge-tests-'));

async function fixture(context) {
  const directory = fs.mkdtempSync(path.join(root, 'case-'));
  const mapping = { requestedSelector: 'hr-6-astra', provider: 'openai', backendModel: 'gpt-6-astra' };
  const evidence = { version: 1, source: 'http://127.0.0.1:10100/api/aliases', observedAt: new Date().toISOString(), mappings: [mapping] };
  const evidencePath = path.join(directory, 'alias.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  fs.writeFileSync(path.join(directory, 'probe.txt'), 'SYNTHETIC_ONLY');
  const route = { version: 2, mode: 'mock', endpoint: 'http://127.0.0.1:1/v1/responses', model: 'hr-6-astra', expectedResponseModel: 'gpt-6-astra', stream: true,
    aliasMapping: { ...mapping, evidencePath, evidenceSha256: sha256(fs.readFileSync(evidencePath)) } };
  const packet = { version: 1, taskId: 'mock-only', stage: 0, turn: 0, files: [{ id: 'probe', role: 'requirement', path: 'probe.txt', sha256: sha256('SYNTHETIC_ONLY') }] };
  const compiled = compilePacket({ packetRoot: directory, packet, route });
  const forwards = [];
  const bridge = createNarrowBridge({ root: directory, compiled, route, forward: async outbound => {
    forwards.push(outbound);
    return { status: 200, bytes: Buffer.from('SYNTHETIC_WIRE') };
  } });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  context.after(async () => { bridge.server.closeAllConnections(); await new Promise(resolve => bridge.server.close(resolve)); });
  return { directory, compiled, bridge, forwards, endpoint: new URL(`http://127.0.0.1:${bridge.server.address().port}/v1/responses`) };
}

test('bridge captures selector bytes then only maps model; second request cannot forward', async context => {
  const current = await fixture(context);
  const result = await post(current.endpoint, current.compiled.bodyText, true, undefined, 5000);
  assert.equal(result.status, 200);
  assert.equal(current.forwards.length, 1);
  const transformed = JSON.parse(current.forwards[0].bodyText);
  assert.equal(transformed.model, 'gpt-6-astra');
  transformed.model = 'hr-6-astra';
  assert.equal(JSON.stringify(transformed), current.compiled.bodyText);
  assert.equal(fs.readFileSync(path.join(current.directory, 'headroom-egress.body.json'), 'utf8'), current.compiled.bodyText);
  const duplicate = await post(current.endpoint, current.compiled.bodyText, true, undefined, 5000);
  assert.equal(duplicate.status, 502);
  assert.equal(current.forwards.length, 1);
  assert.equal(current.bridge.state.failure, 'bridge_duplicate_request_rejected');
});

for (const [name, change] of [
  ['history', body => { body.previous_response_id = 'synthetic_forbidden'; }],
  ['tools', body => { body.tools = [{ type: 'web_search' }]; }],
  ['instructions', body => { body.instructions += ' synthetic injection'; }],
  ['early alias rewrite', body => { body.model = 'gpt-6-astra'; }],
]) {
  test(`bridge rejects ${name} before upstream`, async context => {
    const current = await fixture(context);
    const body = JSON.parse(current.compiled.bodyText);
    change(body);
    const result = await post(current.endpoint, JSON.stringify(body), true, undefined, 5000);
    assert.equal(result.status, 502);
    assert.equal(current.forwards.length, 0);
    assert.equal(current.bridge.state.failure, 'headroom_body_injection_or_change');
    assert(!fs.existsSync(path.join(current.directory, 'backend-request.body.json')));
  });
}

test('bridge rejects stale or altered alias evidence before forwarding', async context => {
  const current = await fixture(context);
  fs.appendFileSync(path.join(current.directory, 'alias.json'), ' ');
  const result = await post(current.endpoint, current.compiled.bodyText, true, undefined, 5000);
  assert.equal(result.status, 502);
  assert.equal(current.forwards.length, 0);
  assert.equal(current.bridge.state.failure, 'alias_evidence_hash_mismatch');
});

test('actual clean installed Headroom plus bridge mock preserves body and empty-completed SSE', {
  skip: process.platform !== 'darwin' || !fs.existsSync('/Users/mac/.local/share/headroom-ai-venv/bin/python'), timeout: 70000,
}, async () => {
  const proof = await runHeadroomBridgeProbe();
  assert.equal(proof.pass, true, JSON.stringify(proof));
  assert.equal(proof.mockOnly, true);
  assert.equal(proof.modelAttempts, 0);
  assert.equal(proof.businessPromptsDispatched, 0);
  assert.equal(proof.rawBytesIdentical, true);
  assert.equal(proof.responseBytesIdentical, true);
  assert.equal(proof.requestedSelector, 'hr-6-astra');
  assert.equal(proof.actualResponseModel, 'gpt-6-astra');
  assert.equal(proof.responseText, 'ISOLATED_ROUTE_OK');
  assert.equal(proof.childStopped.forced, false);
  console.log(`Headroom bridge mock-only evidence: ${proof.evidenceRoot}`);
});
