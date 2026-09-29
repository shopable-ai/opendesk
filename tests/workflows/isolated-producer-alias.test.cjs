'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { EVIDENCE_ROOT, sha256, compilePacket, resolveOutbound, createBroker } = require('./tools/isolated-producer.cjs');
const { BACKEND, createCodexOAuthAuthenticator } = require('./tools/isolated-producer-live-transport.cjs');

fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
const runRoot = fs.mkdtempSync(path.join(EVIDENCE_ROOT, 'alias-tests-'));

function fixture() {
  const root = fs.mkdtempSync(path.join(runRoot, 'packet-'));
  const text = 'SYNTHETIC_ALIAS_TEST_ONLY';
  fs.writeFileSync(path.join(root, 'input.txt'), text);
  const selected = { requestedSelector: 'hr-6-astra', provider: 'openai', backendModel: 'gpt-6-astra' };
  const evidence = { version: 1, source: 'http://127.0.0.1:10100/api/aliases', observedAt: new Date().toISOString(), mappings: [selected] };
  const evidencePath = path.join(root, 'alias.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  const packet = { version: 1, taskId: 'synthetic-alias', stage: 0, turn: 0, files: [{ id: 'input', role: 'requirement', path: 'input.txt', sha256: sha256(text) }] };
  const route = { version: 2, mode: 'mock', endpoint: 'http://127.0.0.1:1/v1/responses', model: 'hr-6-astra', expectedResponseModel: 'gpt-6-astra', stream: false,
    aliasMapping: { ...selected, evidencePath, evidenceSha256: sha256(fs.readFileSync(evidencePath)) } };
  return { root, packet, route, evidence };
}

function build(current) {
  return resolveOutbound(compilePacket({ packetRoot: current.root, packet: current.packet, route: current.route }), current.route);
}

test('declared alias changes only model; source and mapping hashes are bound', () => {
  const current = fixture();
  const original = compilePacket({ packetRoot: current.root, packet: current.packet, route: current.route });
  const outbound = build(current);
  const body = JSON.parse(outbound.bodyText);
  assert.equal(JSON.parse(original.bodyText).model, 'hr-6-astra');
  assert.equal(body.model, 'gpt-6-astra');
  body.model = 'hr-6-astra';
  assert.equal(JSON.stringify(body), original.bodyText);
  assert.equal(outbound.aliasEvidenceSha256, current.route.aliasMapping.evidenceSha256);
  assert.equal(outbound.aliasMappingSha256, sha256(JSON.stringify(current.evidence.mappings[0])));
  assert(!outbound.bodyText.includes('aliasMapping'));
  assert(!outbound.bodyText.includes(current.root));
});

for (const [name, mutate, code] of [
  ['undeclared mapping field', current => { current.route.aliasMapping.fallback = true; }, 'undeclared_or_missing_field'],
  ['selector change', current => { current.route.aliasMapping.requestedSelector = 'other'; }, 'alias_selector_mismatch'],
  ['expected backend change', current => { current.route.expectedResponseModel = 'other'; }, 'alias_backend_mismatch'],
  ['evidence hash change', current => { current.route.aliasMapping.evidenceSha256 = '0'.repeat(64); }, 'alias_evidence_hash_mismatch'],
  ['out of scope evidence', current => { current.route.aliasMapping.evidencePath = '/outside.json'; }, 'alias_evidence_out_of_scope'],
]) {
  test(`alias rejects ${name}`, () => {
    const current = fixture();
    mutate(current);
    assert.throws(() => build(current), { code });
  });
}

for (const [name, mutate, code] of [
  ['stale evidence', evidence => { evidence.observedAt = new Date(Date.now() - 600001).toISOString(); }, 'stale_alias_evidence'],
  ['ambiguous evidence', evidence => { evidence.mappings.push({ ...evidence.mappings[0] }); }, 'ambiguous_alias_evidence'],
  ['different native model', evidence => { evidence.mappings[0].backendModel = 'different'; }, 'alias_evidence_mapping_mismatch'],
]) {
  test(`alias rejects ${name} even with a matching file hash`, () => {
    const current = fixture();
    mutate(current.evidence);
    fs.writeFileSync(current.route.aliasMapping.evidencePath, JSON.stringify(current.evidence));
    current.route.aliasMapping.evidenceSha256 = sha256(fs.readFileSync(current.route.aliasMapping.evidencePath));
    assert.throws(() => build(current), { code });
  });
}

test('wire capture distinguishes selector, backend and actual response without fallback', async context => {
  const current = fixture();
  let count = 0;
  let captured;
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      count += 1;
      captured = Buffer.concat(chunks);
      response.end(JSON.stringify({ id: 'resp_alias_mock', object: 'response', status: 'completed', model: 'gpt-6-astra', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'MOCK_ONLY' }] }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  current.route.endpoint = `http://127.0.0.1:${server.address().port}/v1/responses`;
  const result = await createBroker({ packetRoot: current.root, evidenceRoot: runRoot }).send({ packet: current.packet, route: current.route });
  assert.equal(count, 1);
  assert.equal(result.requestedModel, 'hr-6-astra');
  assert.equal(result.backendModel, 'gpt-6-astra');
  assert.equal(result.response.model, 'gpt-6-astra');
  assert.equal(result.requestBodySha256, sha256(captured));
  assert.deepEqual(captured, fs.readFileSync(path.join(result.evidenceDirectory, 'request.body.json')));
  const original = JSON.parse(fs.readFileSync(path.join(result.evidenceDirectory, 'request.selector.body.json')));
  const wire = JSON.parse(captured);
  wire.model = original.model;
  assert.deepEqual(wire, original);
});

function syntheticOAuth(exp = Math.floor(Date.now() / 1000) + 3600) {
  const root = fs.mkdtempSync(path.join(runRoot, 'oauth-fixture-'));
  const authPath = path.join(root, 'auth.json');
  const token = `synthetic.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.not-a-real-token`;
  fs.writeFileSync(authPath, JSON.stringify({ tokens: { access_token: token, account_id: 'synthetic-account' } }), { mode: 0o600 });
  return { authPath, token };
}

test('OAuth stays in callback memory, endpoint bound and single use', () => {
  const { authPath, token } = syntheticOAuth();
  const before = fs.readFileSync(authPath);
  const authenticate = createCodexOAuthAuthenticator({ authPath });
  assert.throws(() => authenticate(() => {}, { endpoint: 'https://example.invalid' }), { code: 'oauth_forward_target_mismatch' });
  const values = {};
  authenticate((name, value) => { values[name] = value; }, { endpoint: BACKEND });
  assert.equal(values.authorization, `Bearer ${token}`);
  assert.equal(values['chatgpt-account-id'], 'synthetic-account');
  assert.throws(() => authenticate(() => {}, { endpoint: BACKEND }), { code: 'oauth_forward_already_used' });
  assert.deepEqual(fs.readFileSync(authPath), before);
});

test('OAuth rejects wrong backend before opening credentials', () => {
  assert.throws(() => createCodexOAuthAuthenticator({ endpoint: 'https://example.invalid', authPath: '/not-opened' }), { code: 'oauth_backend_not_approved' });
});

test('OAuth rejects expired token, loose permissions and symlinks without refresh', () => {
  const expired = syntheticOAuth(1);
  assert.throws(() => createCodexOAuthAuthenticator(expired), { code: 'oauth_access_token_expired' });
  const current = syntheticOAuth();
  fs.chmodSync(current.authPath, 0o644);
  assert.throws(() => createCodexOAuthAuthenticator(current), { code: 'oauth_file_unsafe' });
  fs.chmodSync(current.authPath, 0o600);
  const link = path.join(path.dirname(current.authPath), 'linked.json');
  fs.symlinkSync(current.authPath, link);
  assert.throws(() => createCodexOAuthAuthenticator({ authPath: link }), { code: 'oauth_symlink_rejected' });
});
