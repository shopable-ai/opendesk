import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { stableId, MAX_RESPONSE_BYTES, MAX_PAGE_RECORDS } from '../integrations/generic-page.mjs';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '../..');
const secret = 'FICTIONAL_HOST_ONLY_TOKEN_20261030';
const page1 = JSON.parse(await readFile(join(root, 'integrations/fixtures/generic-page-1.json'), 'utf8'));
const page2 = JSON.parse(await readFile(join(root, 'integrations/fixtures/generic-page-2.json'), 'utf8'));
async function workspace(t) {
  const base = join(repo, '.runtime/tests/ai-customer-support');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'adapters-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function run(dir, { http = false, cursor, env = {}, timeout = 5000, store = 'store-demo', source = 'generic-crm' } = {}) {
  const output = join(dir, randomUUID() + '.json');
  const args = [join(root, 'scripts/sync-business.mjs'), '--adapter', join(root, `integrations/generic-${http ? 'http' : 'json'}-adapter.mjs`),
    '--store', store, '--source', source, '--out', output, '--timeout-ms', String(timeout)];
  if (cursor !== undefined) args.push('--cursor', cursor);
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd: repo, env: { ...process.env,
      BUSINESS_HTTP_ENDPOINT: '', BUSINESS_HTTP_ALLOW_LOOPBACK: '', BUSINESS_HTTP_TOKEN: secret, ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const started = Date.now();
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('CLI test watchdog')); }, 10000);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', status => { clearTimeout(timer); accept({ status, stdout, stderr, output, elapsed: Date.now() - started }); });
  });
}
async function success(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(secret));
  const json = await readFile(result.output, 'utf8');
  assert.ok(!json.includes(secret));
  return JSON.parse(json);
}
async function failure(result, code = 'HOOK_FAILED') {
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), { ok: false, code });
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(secret));
  await assert.rejects(access(result.output));
}
async function loopback(t, handler) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: new URL(req.url, 'http://127.0.0.1'),
      authenticated: req.headers.authorization === 'Bearer ' + secret });
    handler(req, res);
  });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  t.after(() => new Promise(accept => { server.closeAllConnections(); server.close(accept); }));
  return { requests, endpoint: `http://127.0.0.1:${server.address().port}/records`,
    env: { BUSINESS_HTTP_ENDPOINT: `http://127.0.0.1:${server.address().port}/records`, BUSINESS_HTTP_ALLOW_LOOPBACK: '1' } };
}
const respond = (res, page) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(page)); };

test('offline actual CLI maps two pages, typed IDs, references and CNY; domain applies sequentially', async t => {
  const dir = await workspace(t);
  const first = await success(await run(dir));
  assert.equal(first.previousCursor, null);
  assert.equal(first.cursor, 'generic-page-1');
  assert.equal(first.records.length, 3);
  const [product, customer, image] = first.records;
  assert.equal(product.data.name, 'Fictional canvas bag');
  assert.equal(product.data.price, '¥159.90');
  assert.equal(product.id, image.data.productId);
  assert.equal(product.data.images[0].id, image.data.imageId);
  assert.equal(customer.id, stableId('generic-crm', 'customer', '42'));
  assert.deepEqual(customer.data, { name: 'Fictional customer', conversationId: null, tags: [], notes: '' });
  assert.ok(!JSON.stringify(first).includes('redacted@example.invalid'));
  assert.ok(first.records.every(r => r.storeId === 'store-demo' && r.sourceId === 'generic-crm'));
  assert.equal(stableId('crm', 'product', 'a/b'), stableId('crm', 'product', ' a/b '));
  assert.notEqual(stableId('crm', 'product', 'a/b'), stableId('crm', 'product', 'a-b'));
  assert.notEqual(stableId('crm', 'product', 42), stableId('other', 'product', 42));
  const second = await success(await run(dir, { cursor: first.cursor }));
  const order = second.records[0];
  assert.equal(second.previousCursor, first.cursor);
  assert.equal(second.cursor, 'generic-page-2');
  assert.equal(order.data.customerId, customer.id);
  assert.equal(order.data.items[0].productId, product.id);
  assert.equal(order.data.amount, 159.9);
  assert.equal(order.data.status, '待发货');
  const terminal = await success(await run(dir, { cursor: second.cursor }));
  assert.equal(terminal.cursor, second.cursor);
  assert.deepEqual(terminal.records, []);
  const bundled = await build({ entryPoints: [join(root, 'src/domain/business.ts')], bundle: true,
    write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  const domain = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  let state = domain.createBusinessState();
  for (const snapshot of [first, second, terminal]) {
    const parsed = domain.parseBusinessSnapshot(JSON.stringify(snapshot));
    state = domain.applyBusinessImport(state, domain.previewBusinessImport(state, parsed));
  }
  assert.equal(state.cursors[JSON.stringify(['store-demo', 'generic-crm'])], second.cursor);
  const other = await success(await run(dir, { store: 'store-outlet', source: 'other-crm' }));
  assert.notEqual(other.records[0].id, product.id);
  assert.ok(other.records.every(r => r.storeId === 'store-outlet' && r.sourceId === 'other-crm'));
  await failure(await run(dir, { cursor: '../unknown' }));
});

test('HTTP actual CLI issues one bounded GET per page with host credential, never auto-follows cursor', async t => {
  const dir = await workspace(t);
  const local = await loopback(t, (req, res) => respond(res, new URL(req.url, 'http://local').searchParams.has('cursor') ? page2 : page1));
  const first = await success(await run(dir, { http: true, env: local.env }));
  assert.equal(first.records.length, 3);
  assert.equal(local.requests.length, 1);
  await success(await run(dir, { http: true, env: local.env, cursor: first.cursor }));
  assert.equal(local.requests.length, 2);
  for (const req of local.requests) {
    assert.equal(req.method, 'GET');
    assert.equal(req.authenticated, true);
    assert.equal(req.url.pathname, '/records');
    assert.equal(req.url.searchParams.get('store'), 'store-demo');
    assert.equal(req.url.searchParams.get('source'), 'generic-crm');
    assert.equal(req.url.searchParams.get('limit'), String(MAX_PAGE_RECORDS));
    assert.ok(!req.url.href.includes(secret));
  }
  assert.equal(local.requests[0].url.searchParams.has('cursor'), false);
  assert.equal(local.requests[1].url.searchParams.get('cursor'), first.cursor);
});

test('HTTP rejects endpoint/credential configuration before making any request', async t => {
  const dir = await workspace(t);
  const local = await loopback(t, (_req, res) => respond(res, page1));
  for (const env of [
    { ...local.env, BUSINESS_HTTP_ALLOW_LOOPBACK: '' },
    { ...local.env, BUSINESS_HTTP_ENDPOINT: 'https://example.invalid/records' },
    { ...local.env, BUSINESS_HTTP_ENDPOINT: local.endpoint.replace('127.0.0.1', 'localhost') },
    { ...local.env, BUSINESS_HTTP_ENDPOINT: local.endpoint + '?token=' + secret },
    { ...local.env, BUSINESS_HTTP_ENDPOINT: local.endpoint.replace('http://', 'http://user:password@') },
    { ...local.env, BUSINESS_HTTP_ENDPOINT: local.endpoint + '/elsewhere' },
    { ...local.env, BUSINESS_HTTP_TOKEN: '' },
    { ...local.env, BUSINESS_HTTP_TOKEN: 'invalid\nheader' },
  ]) await failure(await run(dir, { http: true, env }));
  assert.equal(local.requests.length, 0);
});

test('redirect/status/raw diagnostics and malformed bodies never publish or leak', async t => {
  const dir = await workspace(t);
  const target = await loopback(t, (_req, res) => respond(res, page1));
  for (const mode of ['redirect', 'status', 'json', 'content-type', 'credential-echo', 'escaped-echo']) {
    const local = await loopback(t, (_req, res) => {
      if (mode === 'redirect') { res.writeHead(302, { location: target.endpoint }); res.end(secret); }
      else if (mode === 'status') { res.writeHead(401); res.end(secret); }
      else if (mode === 'json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(secret); }
      else if (mode === 'content-type') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(secret); }
      else if (mode === 'credential-echo') respond(res, { ...page1, debug: secret });
      else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ...page1, debug: secret }).replace('FICTIONAL', '\\u0046ICTIONAL')); }
    });
    await failure(await run(dir, { http: true, env: local.env }));
    assert.equal(local.requests.length, 1);
  }
  assert.equal(target.requests.length, 0);
});

test('HTTP rejects declared, streamed and decompressed oversized bodies', async t => {
  const dir = await workspace(t);
  for (const mode of ['declared', 'streamed', 'gzip']) {
    const local = await loopback(t, (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', ...(mode === 'declared' ? { 'content-length': String(MAX_RESPONSE_BYTES + 1) } : {}),
        ...(mode === 'gzip' ? { 'content-encoding': 'gzip' } : {}) });
      const bytes = Buffer.from(' '.repeat(MAX_RESPONSE_BYTES + 1));
      res.end(mode === 'gzip' ? gzipSync(bytes) : bytes);
    });
    await failure(await run(dir, { http: true, env: local.env }));
    assert.equal(local.requests.length, 1);
  }
});

test('HTTP deadline covers both stalled headers and stalled streaming bodies; parent deadline remains effective', async t => {
  const dir = await workspace(t);
  for (const body of [false, true]) {
    const local = await loopback(t, (_req, res) => {
      if (body) { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); }
    });
    const result = await run(dir, { http: true, env: local.env });
    await failure(result);
    assert.ok(result.elapsed < 4500, 'adapter must fail before the 5s CLI deadline');
  }
  const local = await loopback(t, () => {});
  await failure(await run(dir, { http: true, env: local.env, timeout: 500 }), 'TIMEOUT');
});

test('HTTP rejects cursor mismatch, row overflow, bad IDs/money/status/schema and duplicate IDs', async t => {
  const dir = await workspace(t);
  const cases = [
    p => { p.request_cursor = 'wrong'; },
    p => { p.next_cursor = ''; },
    p => { p.rows = Array(MAX_PAGE_RECORDS + 1).fill(p.rows[0]); },
    p => { p.rows[0].external_id = Number.MAX_SAFE_INTEGER + 1; },
    p => { p.rows[0].external_id = {}; },
    p => { p.rows[0].fields.price_fen = 1.5; },
    p => { p.rows[0].fields.price_fen = -1; },
    p => { p.rows[0].revision = 0; },
    p => { p.rows[0].modified_at = 'yesterday'; },
    p => { p.rows.push(p.rows[0]); },
  ];
  for (let i = 0; i < cases.length; i++) {
    const page = structuredClone(page1); cases[i](page);
    const local = await loopback(t, (_req, res) => respond(res, page));
    await failure(await run(dir, { http: true, env: local.env }), i >= 8 ? 'SCHEMA' : 'HOOK_FAILED');
  }
  const invalidOrder = structuredClone(page2); invalidOrder.rows[0].fields.status = 'unknown';
  const local = await loopback(t, (_req, res) => respond(res, invalidOrder));
  await failure(await run(dir, { http: true, env: local.env, cursor: 'generic-page-1' }));
});

test('HTTP tombstones omit upstream fields; nonempty same-cursor pages are rejected', async t => {
  const dir = await workspace(t);
  const page = { request_cursor: 'generic-page-2', next_cursor: 'generic-page-3', rows: [
    { type: 'order', external_id: 'order / 1', revision: 2, modified_at: '2026-10-30T01:00:00.000Z', deleted: true,
      fields: { private: 'not exported' } },
  ] };
  const local = await loopback(t, (_req, res) => respond(res, page));
  const snapshot = await success(await run(dir, { http: true, env: local.env, cursor: page.request_cursor }));
  assert.equal(snapshot.records[0].data, null);
  assert.equal(snapshot.records[0].deleted, true);
  assert.equal(snapshot.records[0].id, stableId('generic-crm', 'order', 'order / 1'));
  page.next_cursor = page.request_cursor;
  await failure(await run(dir, { http: true, env: local.env, cursor: page.request_cursor }));
});


test('HTTP accepts exactly the row cap, preserving every row and its input order', async t => {
  const dir = await workspace(t);
  const page = { request_cursor: null, next_cursor: 'bounded-page', rows:
    Array.from({ length: MAX_PAGE_RECORDS }, (_, index) => ({ ...structuredClone(page1.rows[1]), external_id: index })) };
  const local = await loopback(t, (_req, res) => respond(res, page));
  const snapshot = await success(await run(dir, { http: true, env: local.env }));
  assert.equal(snapshot.records.length, MAX_PAGE_RECORDS);
  assert.deepEqual(snapshot.records.map(r => r.id), page.rows.map(r => stableId('generic-crm', 'customer', r.external_id)));
  assert.equal(local.requests.length, 1);
});
