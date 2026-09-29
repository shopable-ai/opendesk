'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { EVIDENCE_ROOT, compilePacket, createBroker, sha256 } = require('./tools/isolated-producer.cjs');

fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
const runRoot = fs.mkdtempSync(path.join(EVIDENCE_ROOT, 'mock-tests-'));
const script = path.join(__dirname, 'tools/isolated-producer.cjs');
const NOW = Date.now();
const AUTH_SENTINEL = 'synthetic-authentication-for-mock-only';

function fixture() {
  const root = fs.mkdtempSync(path.join(runRoot, 'packet-'));
  const definitions = [
    ['requirement', 'requirement', 'requirements.md', 'SYNTHETIC_CURRENT_REQUIREMENT'],
    ['method', 'method', 'method.md', 'SYNTHETIC_NECESSARY_METHOD'],
    ['upstream', 'qualified_upstream', 'upstream.txt', 'SYNTHETIC_QUALIFIED_UPSTREAM'],
    ['observation', 'raw_ui_observation', 'ui.json', '{"raw":"SYNTHETIC_CURRENT_UI"}'],
  ];
  const files = definitions.map(([id, role, filename, text]) => {
    fs.writeFileSync(path.join(root, filename), text);
    const entry = { id, role, path: filename, sha256: sha256(text) };
    if (role === 'qualified_upstream') {
      entry.stage = 0;
      entry.qualification = { status: 'passed', evidenceId: 'synthetic-qualification', sha256: entry.sha256 };
    }
    if (role === 'raw_ui_observation') {
      entry.turn = 0;
      entry.capturedAt = new Date(NOW).toISOString();
    }
    return entry;
  });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'UNDECLARED_RULES_MUST_NOT_APPEAR');
  fs.writeFileSync(path.join(root, 'history.txt'), 'UNDECLARED_HISTORY_MUST_NOT_APPEAR');
  const packet = { version: 1, taskId: 'synthetic-task', stage: 1, turn: 0, files };
  const route = { version: 1, mode: 'mock', endpoint: 'http://127.0.0.1:1/v1/responses', model: 'hr-6-astra', expectedResponseModel: 'hr-6-astra', stream: false };
  return { root, packet, route };
}

function compile(current) {
  return compilePacket({ packetRoot: current.root, packet: current.packet, route: current.route, now: NOW });
}

function completed(model = 'hr-6-astra') {
  return { id: 'resp_mock_only', object: 'response', status: 'completed', model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'SYNTHETIC_INERT_PROPOSAL' }] }] };
}

async function serverFor(context, handler) {
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => handler(request, response, Buffer.concat(chunks)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}/v1/responses`;
}

test('exact packet construction has no paths, tools, history, hidden rules or caller overrides', () => {
  const current = fixture();
  process.env.ISOLATED_PRODUCER_AMBIENT_SENTINEL = 'UNDECLARED_ENV_MUST_NOT_APPEAR';
  try {
    const result = compile(current);
    const body = JSON.parse(result.bodyText);
    assert.deepEqual(Object.keys(body).sort(), ['input', 'instructions', 'model', 'store', 'stream', 'tool_choice', 'tools']);
    assert.deepEqual(body.tools, []);
    assert.equal(body.tool_choice, 'none');
    assert.equal(body.store, false);
    assert.equal(body.model, 'hr-6-astra');
    assert.equal(body.input.length, 1);
    assert.equal(body.input[0].role, 'user');
    const packet = JSON.parse(body.input[0].content[0].text);
    assert.equal(packet.documents.length, 4);
    assert.deepEqual(packet.documents.map(document => document.id), current.packet.files.map(entry => entry.id));
    for (const document of packet.documents) {
      assert.deepEqual(Object.keys(document).sort(), ['id', 'role', 'sha256', 'text']);
      assert.equal(sha256(document.text), document.sha256);
    }
    assert.equal(result.bodySha256, sha256(result.bodyText));
    assert.equal(result.manifest.length, 4);
    for (const forbidden of [current.root, 'requirements.md', 'UNDECLARED_', 'previous_response_id', 'conversation', AUTH_SENTINEL]) assert.equal(result.bodyText.includes(forbidden), false);
  } finally {
    delete process.env.ISOLATED_PRODUCER_AMBIENT_SENTINEL;
  }
});

const rejections = [
  ['packet extra field', current => { current.packet.history = []; }, 'undeclared_or_missing_field'],
  ['entry extra field', current => { current.packet.files[0].messages = []; }, 'undeclared_or_missing_field'],
  ['route tools override', current => { current.route.tools = []; }, 'undeclared_or_missing_field'],
  ['route credentials rejected', current => { current.route.headers = {}; }, 'undeclared_or_missing_field'],
  ['route model alias rejected', current => { current.route.model = 'gpt-6-astra'; }, 'unexpected_requested_model'],
  ['route expected model alias rejected', current => { current.route.expectedResponseModel = 'gpt-6-astra'; }, 'unexpected_expected_model'],
  ['future answer role', current => { current.packet.files[0].role = 'future_answer'; }, 'forbidden_role'],
  ['assistant role', current => { current.packet.files[0].role = 'assistant'; }, 'forbidden_role'],
  ['current upstream stage', current => { current.packet.files[2].stage = 1; }, 'future_or_current_upstream'],
  ['future upstream stage', current => { current.packet.files[2].stage = 2; }, 'future_or_current_upstream'],
  ['unqualified upstream', current => { current.packet.files[2].qualification.status = 'pending'; }, 'unqualified_upstream'],
  ['qualification byte mismatch', current => { current.packet.files[2].qualification.sha256 = '0'.repeat(64); }, 'unqualified_upstream'],
  ['hash mismatch', current => { current.packet.files[0].sha256 = '0'.repeat(64); }, 'hash_mismatch'],
  ['traversal', current => { current.packet.files[0].path = '../outside.md'; }, 'out_of_scope'],
  ['absolute path', current => { current.packet.files[0].path = path.join(current.root, 'requirements.md'); }, 'out_of_scope'],
  ['Git path', current => { current.packet.files[0].path = '.git/answer.txt'; }, 'out_of_scope'],
  ['historical runtime path', current => { current.packet.files[0].path = '.runtime/answer.txt'; }, 'out_of_scope'],
  ['test answer path', current => { current.packet.files[0].path = 'tests/answer.txt'; }, 'out_of_scope'],
  ['reference JavaScript', current => { current.packet.files[0].path = 'reference.js'; }, 'unsupported_input_file'],
  ['duplicate path', current => { current.packet.files[1].path = 'requirements.md'; }, 'duplicate_input'],
  ['duplicate ID', current => { current.packet.files[1].id = 'requirement'; }, 'duplicate_input'],
  ['stale observation', current => { current.packet.files[3].capturedAt = new Date(NOW - 300001).toISOString(); }, 'stale_or_future_observation'],
  ['future observation', current => { current.packet.files[3].capturedAt = new Date(NOW + 1).toISOString(); }, 'stale_or_future_observation'],
  ['observation wrong turn', current => { current.packet.files[3].turn = 1; }, 'stale_or_future_observation'],
  ['URL credential syntax', current => { current.route.endpoint = 'http://user:synthetic@127.0.0.1:1/v1/responses'; }, 'unsafe_endpoint'],
  ['URL query data', current => { current.route.endpoint += '?key=synthetic'; }, 'unsafe_endpoint'],
  ['nonloopback HTTP', current => { current.route.endpoint = 'http://example.invalid/v1/responses'; }, 'unsafe_endpoint'],
  ['remote mock', current => { current.route.endpoint = 'https://example.invalid/v1/responses'; }, 'mock_requires_loopback'],
];

for (const [name, mutate, code] of rejections) {
  test(`reject ${name} before HTTP`, () => {
    const current = fixture();
    mutate(current);
    assert.throws(() => compile(current), error => error.code === code);
  });
}

test('reject leaf symlink, ancestor symlink and packet-root symlink', () => {
  const current = fixture();
  fs.symlinkSync('requirements.md', path.join(current.root, 'link.md'));
  current.packet.files[0].path = 'link.md';
  assert.throws(() => compile(current), { code: 'symlink_rejected' });
  fs.symlinkSync(current.root, path.join(runRoot, 'linked-root'));
  current.packet.files[0].path = 'requirements.md';
  assert.throws(() => compile({ ...current, root: path.join(runRoot, 'linked-root') }), { code: 'symlink_rejected' });
  fs.symlinkSync(current.root, path.join(current.root, 'linked-directory'));
  current.packet.files[0].path = 'linked-directory/requirements.md';
  assert.throws(() => compile(current), { code: 'symlink_rejected' });
});

test('reject hardlinks, invalid UTF8 and oversized files', () => {
  const current = fixture();
  fs.linkSync(path.join(current.root, 'requirements.md'), path.join(current.root, 'hardlink.md'));
  assert.throws(() => compile(current), { code: 'unsafe_input_file' });
  const invalid = fixture();
  const bytes = Buffer.from([0xff]);
  fs.writeFileSync(path.join(invalid.root, 'requirements.md'), bytes);
  invalid.packet.files[0].sha256 = sha256(bytes);
  assert.throws(() => compile(invalid), { code: 'invalid_text' });
  const large = fixture();
  fs.writeFileSync(path.join(large.root, 'requirements.md'), Buffer.alloc(128 * 1024 + 1));
  assert.throws(() => compile(large), { code: 'unsafe_input_file' });
});

test('mock HTTP captures exact complete wire body; evidence excludes auth/headers and records response model', async context => {
  const current = fixture();
  let captured;
  current.route.endpoint = await serverFor(context, (request, response, bytes) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, AUTH_SENTINEL);
    captured = bytes;
    fs.writeFileSync(path.join(runRoot, 'captured-outbound.body.json'), bytes);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(completed('hr-6-astra')));
  });
  const expected = compile(current);
  const broker = createBroker({ packetRoot: current.root, evidenceRoot: runRoot, authenticate: setHeader => { setHeader('authorization', AUTH_SENTINEL); } });
  const result = await broker.send({ packet: current.packet, route: current.route });
  assert.equal(captured.toString(), expected.bodyText);
  assert.equal(result.requestBodySha256, sha256(captured));
  assert.equal(result.response.model, 'hr-6-astra');
  assert.equal(result.requestedModel, 'hr-6-astra');
  assert.equal(result.mode, 'mock');
  assert.equal(result.response.id, 'resp_mock_only');
  for (const name of fs.readdirSync(result.evidenceDirectory)) {
    const evidence = fs.readFileSync(path.join(result.evidenceDirectory, name), 'utf8');
    assert.equal(evidence.includes(AUTH_SENTINEL), false);
    assert.equal(evidence.includes('authorization'), false);
    assert.equal(evidence.includes('headers'), false);
  }
  const recorded = fs.readFileSync(path.join(result.evidenceDirectory, 'request.body.json'));
  assert.deepEqual(recorded, captured);
  assert.deepEqual(JSON.parse(recorded).tools, []);
  assert.equal(JSON.parse(recorded).tool_choice, 'none');
  fs.writeFileSync(path.join(runRoot, 'mock-proof.json'), JSON.stringify({ mockOnly: true, capturedBodySha256: sha256(captured), evidenceDirectory: result.evidenceDirectory, reportedModel: result.response.model, responseId: result.response.id }, null, 2));
});

test('reject unapproved live route and invalid packet without contacting server', async context => {
  const current = fixture();
  let requests = 0;
  current.route.endpoint = await serverFor(context, (request, response) => { requests += 1; response.end('{}'); });
  const broker = createBroker({ packetRoot: current.root, evidenceRoot: runRoot });
  current.route.mode = 'live';
  await assert.rejects(broker.send({ packet: current.packet, route: current.route }), { code: 'live_not_authorized' });
  current.route.mode = 'mock';
  current.packet.previous_response_id = 'forbidden';
  await assert.rejects(broker.send({ packet: current.packet, route: current.route }), { code: 'undeclared_or_missing_field' });
  assert.equal(requests, 0);
});

test('SSE records completed response, never reuses response IDs', async context => {
  const current = fixture();
  const captures = [];
  current.route.stream = true;
  current.route.endpoint = await serverFor(context, (request, response, bytes) => {
    captures.push(JSON.parse(bytes));
    response.setHeader('content-type', 'text/event-stream');
    response.end(`event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: completed() })}\n\ndata: [DONE]\n\n`);
  });
  const broker = createBroker({ packetRoot: current.root, evidenceRoot: runRoot });
  await broker.send({ packet: current.packet, route: current.route });
  current.packet.turn = 1;
  current.packet.files[3].turn = 1;
  const result = await broker.send({ packet: current.packet, route: current.route });
  assert.equal(result.response.outputText, 'SYNTHETIC_INERT_PROPOSAL');
  assert.equal(captures.length, 2);
  assert.equal(JSON.stringify(captures[1]).includes('resp_mock_only'), false);
  assert.equal(JSON.stringify(captures[1]).includes('SYNTHETIC_INERT_PROPOSAL'), false);
  await assert.rejects(broker.send({ packet: current.packet, route: current.route }), { code: 'invalid_turn_sequence' });
});

test('one broker instance rejects concurrent turns', async context => {
  const current = fixture();
  let release;
  let arrived;
  const received = new Promise(resolve => { arrived = resolve; });
  current.route.endpoint = await serverFor(context, (request, response) => {
    release = () => response.end(JSON.stringify(completed()));
    arrived();
  });
  const broker = createBroker({ packetRoot: current.root, evidenceRoot: runRoot });
  const first = broker.send({ packet: current.packet, route: current.route });
  await received;
  await assert.rejects(broker.send({ packet: current.packet, route: current.route }), { code: 'serial_request_required' });
  release();
  await first;
});

test('mismatched response model is recorded and rejected, not relabeled', async context => {
  const current = fixture();
  current.route.endpoint = await serverFor(context, (request, response) => response.end(JSON.stringify(completed('unexpected-model'))));
  const evidenceRoot = fs.mkdtempSync(path.join(runRoot, 'mismatch-'));
  await assert.rejects(createBroker({ packetRoot: current.root, evidenceRoot }).send({ packet: current.packet, route: current.route }), { code: 'response_model_mismatch' });
  const directory = path.join(evidenceRoot, fs.readdirSync(evidenceRoot)[0]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'response.json'))).model, 'unexpected-model');
});

test('unexpected model tool call rejected without dispatch', async context => {
  const current = fixture();
  current.route.endpoint = await serverFor(context, (request, response) => {
    const result = completed();
    result.output = [{ type: 'function_call', name: 'exec', arguments: 'synthetic-never-executed' }];
    response.end(JSON.stringify(result));
  });
  await assert.rejects(createBroker({ packetRoot: current.root, evidenceRoot: runRoot }).send({ packet: current.packet, route: current.route }), { code: 'unexpected_response_tool_or_item' });
});

test('SSE tool call rejected even if terminal output would be harmless', async context => {
  const current = fixture();
  current.route.stream = true;
  current.route.endpoint = await serverFor(context, (request, response) => response.end(
    `data: ${JSON.stringify({ type: 'response.output_item.added', item: { type: 'function_call' } })}\n\n` +
    `data: ${JSON.stringify({ type: 'response.completed', response: completed() })}\n\n`));
  await assert.rejects(createBroker({ packetRoot: current.root, evidenceRoot: runRoot }).send({ packet: current.packet, route: current.route }), { code: 'unexpected_response_tool_or_item' });
});

test('no HTTP redirects or retries; raw error body is not written', async context => {
  const current = fixture();
  let requests = 0;
  current.route.endpoint = await serverFor(context, (request, response) => {
    requests += 1;
    response.writeHead(302, { location: '/v1/responses' });
    response.end(AUTH_SENTINEL);
  });
  const evidenceRoot = fs.mkdtempSync(path.join(runRoot, 'redirect-'));
  await assert.rejects(createBroker({ packetRoot: current.root, evidenceRoot }).send({ packet: current.packet, route: current.route }), { code: 'http_status_rejected' });
  assert.equal(requests, 1);
  const directory = path.join(evidenceRoot, fs.readdirSync(evidenceRoot)[0]);
  for (const filename of fs.readdirSync(directory)) assert.equal(fs.readFileSync(path.join(directory, filename), 'utf8').includes(AUTH_SENTINEL), false);
});

test('CLI prepare produces evidence without sending HTTP, rejects unknown flags', () => {
  const current = fixture();
  const packetPath = path.join(current.root, 'packet.json');
  const routePath = path.join(current.root, 'route.json');
  fs.writeFileSync(packetPath, JSON.stringify(current.packet));
  fs.writeFileSync(routePath, JSON.stringify(current.route));
  const result = spawnSync(process.execPath, [script, 'prepare', '--root', current.root, '--packet', packetPath, '--route', routePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.sent, false);
  assert.equal(receipt.bodySha256, compile(current).bodySha256);
  const rejected = spawnSync(process.execPath, [script, 'prepare', '--headers', AUTH_SENTINEL], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stderr.includes(AUTH_SENTINEL), false);
});

test('bounded transport timeout, no retry', async context => {
  const current = fixture();
  let requests = 0;
  current.route.endpoint = await serverFor(context, () => { requests += 1; });
  await assert.rejects(createBroker({ packetRoot: current.root, evidenceRoot: runRoot, timeoutMs: 100 }).send({ packet: current.packet, route: current.route }), { code: 'transport_timeout' });
  assert.equal(requests, 1);
});

test('CLI send uses test-owned mock server and reports the received response identity', async context => {
  const current = fixture();
  let captured;
  current.route.endpoint = await serverFor(context, (request, response, bytes) => {
    captured = bytes;
    response.end(JSON.stringify(completed()));
  });
  const packetPath = path.join(current.root, 'packet.json');
  const routePath = path.join(current.root, 'route.json');
  fs.writeFileSync(packetPath, JSON.stringify(current.packet));
  fs.writeFileSync(routePath, JSON.stringify(current.route));
  const result = await promisify(execFile)(process.execPath, [script, 'send', '--root', current.root, '--packet', packetPath, '--route', routePath]);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.mode, 'mock');
  assert.equal(receipt.response.id, 'resp_mock_only');
  assert.equal(receipt.requestBodySha256, sha256(captured));
  assert.deepEqual(JSON.parse(captured).tools, []);
  assert.equal(JSON.parse(captured).tool_choice, 'none');
});

test('authentication callback exception is sanitized and cannot inject a body field', async context => {
  const current = fixture();
  let requests = 0;
  current.route.endpoint = await serverFor(context, (request, response) => { requests += 1; response.end('{}'); });
  const evidenceRoot = fs.mkdtempSync(path.join(runRoot, 'auth-failure-'));
  const broker = createBroker({ packetRoot: current.root, evidenceRoot, authenticate: () => { throw new Error(AUTH_SENTINEL); } });
  await assert.rejects(broker.send({ packet: current.packet, route: current.route }), error => error.code === 'authentication_callback_failed' && !error.message.includes(AUTH_SENTINEL));
  assert.equal(requests, 0);
  const directory = path.join(evidenceRoot, fs.readdirSync(evidenceRoot)[0]);
  for (const filename of fs.readdirSync(directory)) assert.equal(fs.readFileSync(path.join(directory, filename), 'utf8').includes(AUTH_SENTINEL), false);
  const injected = createBroker({ packetRoot: current.root, evidenceRoot, authenticate: setHeader => { setHeader('x-history', 'forbidden'); } });
  await assert.rejects(injected.send({ packet: current.packet, route: current.route }), { code: 'authentication_callback_failed' });
  assert.equal(requests, 0);
});

test('evidence location is explicitly scoped', async () => {
  const current = fixture();
  await assert.rejects(createBroker({ packetRoot: current.root, evidenceRoot: path.dirname(EVIDENCE_ROOT) }).send({ packet: current.packet, route: current.route }), { code: 'evidence_out_of_scope' });
});

test.after(() => {
  fs.writeFileSync(path.join(runRoot, 'run-metadata.json'), JSON.stringify({ mode: 'mock-only', productionRequests: 0, desktopInputs: 0, runRoot }, null, 2));
  console.log(`Mock-only evidence: ${runRoot}`);
});
