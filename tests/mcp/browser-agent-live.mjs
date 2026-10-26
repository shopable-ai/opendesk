#!/usr/bin/env node
// From the repository root, after reloading the controlled Order fixture tab:
// node tests/mcp/browser-agent-live.mjs --origin http://127.0.0.1:59941 --tab 560066638
// Optional: OPENDESK_MCP_BINARY=/absolute/path/to/opendesk-mcp (default: dist/opendesk-mcp).
// Uses the installed Core/extension/broker; never starts a browser, fixture server or broker.
// Artifacts: .runtime/tests/automation-api-r1.3/mcp-live-repro/<timestamp>-<pid>/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const usage = 'node tests/mcp/browser-agent-live.mjs --origin URL --tab ID';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (key === '--help') { console.log(usage); process.exit(0); }
  assert(['--origin', '--tab'].includes(key) && !Object.hasOwn(options, key), usage);
  assert(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), usage);
  options[key] = process.argv[i + 1];
}
assert(options['--origin'] && /^\d+$/.test(options['--tab'] ?? ''), usage);
const originURL = new URL(options['--origin']);
assert(originURL.protocol === 'http:' && originURL.hostname === '127.0.0.1'
  && !originURL.username && !originURL.password && originURL.pathname === '/'
  && !originURL.search && !originURL.hash, 'Use the exact local fixture origin');
const origin = originURL.origin, tab = Number(options['--tab']);
assert(Number.isSafeInteger(tab) && tab >= 0 && tab < Number.MAX_SAFE_INTEGER, 'Invalid tab ID');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const binary = path.resolve(root, process.env.OPENDESK_MCP_BINARY || 'dist/opendesk-mcp');
const directory = path.join(root, '.runtime/tests/automation-api-r1.3/mcp-live-repro',
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

// No auth calls, install-file reads, environment dumps or raw stderr logging.
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, /credential|password|secret|authorization|cookie|token/i.test(key) ? '[REDACTED]' : redact(item)]));
  if (typeof value === 'string') {
    try { return JSON.stringify(redact(JSON.parse(value))); } catch { /* Plain DOM text. */ }
    return value.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\b(credential|password|secret|authorization|cookie|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  }
  return value;
}
const save = (name, value) => fs.writeFileSync(path.join(directory, name),
  JSON.stringify(redact(value), null, 2) + '\n', { mode: 0o600 });
const wire = (direction, message) => fs.appendFileSync(path.join(directory, 'jsonrpc.ndjson'),
  JSON.stringify({ at: new Date().toISOString(), direction, message: redact(message) }) + '\n', { mode: 0o600 });
const report = { binary, origin, tab, passed: false, checks: {}, nativeAnswers: [], tracePaths: [],
  clickRequests: 0, stoppedOnUnknown: false, stderrBytes: 0 };
let actionsStopped = false, closing = false, nextId = 0, answerNumber = 0, transportError = null;
const pending = new Map();
const child = spawn(binary, ['-browser-core-root', root, '-browser-origin', origin, '-browser-tab', String(tab)],
  { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
function failTransport(error) {
  transportError ||= error;
  actionsStopped = true; // Transport loss must never cause cleanup/replay of a possibly dispatched action.
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
  pending.clear();
}
child.on('error', failTransport);
child.stdin.on('error', failTransport);
child.stdout.on('error', failTransport);
child.stderr.on('data', bytes => { report.stderrBytes += bytes.length; });
const closed = new Promise(resolve => child.once('close', (code, signal) => {
  report.processExit = { code, signal };
  if (!closing || pending.size) failTransport(new Error('MCP stdio closed'));
  resolve();
}));
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
lines.on('line', line => {
  try {
    const message = JSON.parse(line);
    wire('receive', message);
    assert.equal(message.jsonrpc, '2.0');
    if (!Object.hasOwn(message, 'id')) return; // Server notification; retained in the transcript.
    const request = pending.get(message.id);
    assert(request, 'Unexpected JSON-RPC response ID');
    assert(Object.hasOwn(message, 'result') !== Object.hasOwn(message, 'error'), 'Expected result or error');
    if (Object.hasOwn(message, 'error')) assert(message.error && Number.isInteger(message.error.code), 'Invalid JSON-RPC error');
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`JSON-RPC error ${message.error.code}`));
    else request.resolve(message.result);
  } catch { failTransport(new Error('Invalid MCP JSON-RPC response; no actions permitted')); }
});
function send(message) {
  if (transportError) throw transportError;
  wire('send', message);
  child.stdin.write(JSON.stringify(message) + '\n');
}
function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => failTransport(new Error(`MCP deadline: ${method}; no retry`)), 20_000);
    pending.set(id, { resolve, reject, timer });
    try { send({ jsonrpc: '2.0', id, method, params }); }
    catch (error) { failTransport(error); }
  });
}
async function browser(operation, args = {}) {
  assert(!actionsStopped || ['observe', 'read', 'verify'].includes(operation), 'STOP: no further actions after unknown');
  if (operation === 'act' && args.operation === 'click') {
    assert.equal(report.clickRequests, 0, 'Exactly one click; never resend');
    report.clickRequests++;
  }
  // A malformed/missing action answer is also unsafe to recover with another action.
  if (operation === 'act') actionsStopped = true;
  const result = await rpc('tools/call', { name: `tm_browser_${operation}`, arguments: args });
  const blocks = result.content?.filter(item => item.type === 'text');
  assert.equal(blocks?.length, 1, 'Expected the native browser answer in one MCP text block');
  const answer = JSON.parse(blocks[0].text);
  if (answer.outcome === 'OUTCOME_UNKNOWN' || answer.error?.outcome === 'OUTCOME_UNKNOWN') {
    actionsStopped = true;
    report.stoppedOnUnknown = true;
  } else if (operation === 'act' && !answer.error && answer.outcome === 'SUCCEEDED') actionsStopped = false;
  const name = `${String(++answerNumber).padStart(3, '0')}-${operation}.json`;
  save(name, answer);
  report.nativeAnswers.push({ operation, file: name, requestId: answer.requestId, outcome: answer.outcome });
  for (const source of [answer.evidence, answer.browserExecution]) {
    for (const key of ['tracePath', 'coreTracePath', 'responsePath']) {
      if (typeof source?.[key] === 'string' && !report.tracePaths.includes(source[key])) report.tracePaths.push(source[key]);
    }
  }
  save('trace-paths.json', report.tracePaths);
  return answer;
}
function succeeded(answer) {
  assert(!answer.error, `Native browser failure: ${answer.error?.code}`);
  assert.equal(answer.outcome, 'SUCCEEDED');
  assert.equal(typeof answer.requestId, 'string');
  return answer;
}
const ok = async (operation, args) => succeeded(await browser(operation, args));
const locate = async (scope, query) => (await ok('locate', { scope, query })).result.target;
const read = (target, field) => ok('read', { target, field });
async function verify(target, field, expected) {
  const answer = await ok('verify', { target, condition: { kind: 'equals', field, expected } });
  assert.equal(answer.result.trace.verification.pass, true);
  assert.equal(answer.result.trace.verification.actual, expected);
  return answer;
}

try {
  const initialized = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'opendesk-browser-agent-live', version: '1.0.0' } });
  assert.equal(initialized.protocolVersion, '2024-11-05');
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const tools = await rpc('tools/list');
  for (const name of ['status', 'tabs', 'observe', 'locate', 'read', 'act', 'wait', 'verify'])
    assert(tools.tools.some(tool => tool.name === `tm_browser_${name}`), `Missing tm_browser_${name}`);
  report.checks.toolsList = true;
  assert.equal((await ok('status')).result.connected, true, 'Installed extension/broker must already be ready');
  const tabs = (await ok('tabs')).result.tabs;
  const selected = tabs.find(item => item.tab === tab);
  assert(selected, 'The explicit fixture tab is not available');
  const selectedURL = new URL(selected.url);
  assert.equal(selectedURL.origin, origin);
  assert(['/', '/order.html'].includes(selectedURL.pathname), 'Use the own Order fixture tab');
  const identity = (await ok('observe', { scope: { tab, frame: 0 } })).result.identity;
  assert.equal(identity.tab, tab); assert.equal(identity.frame, 0);
  assert.equal(typeof identity.document, 'string'); assert(identity.document);
  const scope = { tab, frame: 0, document: identity.document };
  const order = await locate(scope, { kind: 'label', value: 'Order ID' });
  const slow = await locate(scope, { kind: 'testId', value: 'slow-safe-action' });
  const counter = await locate(scope, { kind: 'testId', value: 'slow-safe-count' });
  assert.equal((await read(counter, 'text')).result.value, '0', 'Reload the fixture tab before each run');

  const ambiguous = await browser('locate', { scope, query: { kind: 'role', role: 'button', name: 'Duplicate' } });
  assert.equal(ambiguous.error?.code, 'AMBIGUOUS_TARGET');
  assert.equal(ambiguous.outcome, 'FAILED_CONFIRMED');
  report.checks.ambiguity = true;
  // Deliberately outside the one authorized tab; rejected by the host before Core dispatch.
  const wrongTab = await browser('observe', { scope: { tab: tab + 1, frame: 0 } });
  assert.equal(wrongTab.error?.code, 'PERMISSION_DENIED');
  assert.equal(wrongTab.outcome, 'NOT_DISPATCHED');
  report.checks.wrongTab = true;
  report.checks.stale = { skipped: true, reason: 'Requires replacement/navigation; preserve targets and the single-click bound.' };

  const original = await read(order, 'value');
  assert.equal(original.result.redacted, false); assert.equal(typeof original.result.value, 'string');
  const value = '中文订单🧪🙂';
  assert.notEqual(original.result.value, value, 'Fixture already contains the test value; reload it');
  try {
    await ok('act', { operation: 'fill', target: order, value });
    const checked = await verify(order, 'value', value);
    assert.equal((await read(order, 'value')).result.value, value);
    report.checks.chineseEmoji = { verifiedBy: checked.requestId };
  } finally {
    if (!actionsStopped) {
      await ok('act', { operation: 'fill', target: order, value: original.result.value,
        sourceReadRequestId: original.requestId });
      const checked = await verify(order, 'value', original.result.value);
      assert.equal((await read(order, 'value')).result.value, original.result.value);
      report.checks.restored = { sourceReadRequestId: original.requestId, verifiedBy: checked.requestId };
    }
  }
  const unknown = await browser('act', { operation: 'click', target: slow, timeoutMs: 100 });
  assert.equal(unknown.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(unknown.error?.code, 'TIMEOUT');
  assert.equal(report.stoppedOnUnknown, true);
  for (const key of ['tracePath', 'coreTracePath', 'responsePath']) assert.equal(typeof unknown.evidence?.[key], 'string');
  // No further actions, relocations, cleanup fills or replay. Only independent DOM evidence.
  await ok('observe', { scope });
  const counted = await read(counter, 'text');
  assert.notEqual(counted.requestId, unknown.requestId);
  assert.match(counted.result.value, /^\d+$/);
  const count = Number(counted.result.value);
  report.checks.unknown = { requestId: unknown.requestId, counterReadRequestId: counted.requestId,
    count, atMostOnce: count <= 1, dispatched: count === 1 };
  assert(count <= 1, 'Unsafe duplicate side effect');
  assert.equal(count, 1, 'Need independent proof that the timed-out click actually ran');
  const checked = await verify(counter, 'text', '1');
  assert.notEqual(checked.requestId, unknown.requestId);
  report.checks.unknown.verifiedBy = checked.requestId;
  assert.equal(report.clickRequests, 1);
  report.passed = true;
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  closing = true;
  child.stdin.end();
  const terminate = setTimeout(() => child.kill('SIGTERM'), 2_000);
  const kill = setTimeout(() => child.kill('SIGKILL'), 5_000);
  await closed;
  clearTimeout(terminate); clearTimeout(kill); lines.close();
  if (report.passed && (transportError || report.processExit.code !== 0 || report.processExit.signal)) {
    report.passed = false;
    report.failure = transportError?.message || 'MCP did not exit cleanly';
    process.exitCode = 1;
  }
  save('summary.json', report);
  console.log(JSON.stringify({ passed: report.passed, artifacts: directory, failure: redact(report.failure) }));
}
