import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {createEchoServer} from './fixture-server.mjs';
import {runDesktopHttp, validateDesktopHttpProjection} from '../../examples/scrapyjs-desktop/desktop-http-adapter.mjs';

const sample = (origin, urls = [origin + '/headers']) => ({
  executionPlan: {executor: 'desktop-http', method: 'GET', targetOrigins: [origin], urls,
    limits: {maxPages: 3, maxRequests: 3, maxBytesPerPage: 32768, timeoutMs: 5000}},
  headerProfile: {headers: {'Accept': 'application/json', 'Accept-Language': 'zh-CN', 'User-Agent': 'OpenDesk-HeaderEcho/1.0'}},
});
const code = (fn, expected) => assert.throws(fn, e => e.code === expected);

function testRuntime(download) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapyjs-desktop-'));
  const File = {
    join: path.join,
    ensureDir: value => fs.mkdirSync(value, {recursive: true}),
    read: value => fs.readFileSync(value, 'utf8'),
    stat: value => { const s = fs.statSync(value); return {type: s.isFile() ? 'file' : 'other', size: s.size}; },
    writeNew: (file, data) => fs.writeFileSync(file, data, {flag: 'wx'}),
  };
  const runtime = {http: {download}, File, Execution: {id: 'node-fixture-run', artifactDir: root, scriptPath: '/trusted/local/main.mjs'}};
  return {runtime, root, cleanup: () => fs.rmSync(root, {recursive: true, force: true})};
}

function nodeLoopbackDownloader() {
  // NODE_LOOPBACK_FIXTURE only: this tests the adapter contract, NOT OpenDesk native HTTP.
  return async (url, options) => {
    assert.equal(options.allowCrossOriginRedirects, false);
    assert.equal(options.overwrite, false);
    assert.equal(options.createDirs, false);
    const response = await fetch(url, {method: 'GET', headers: options.headers, redirect: 'manual', signal: options.signal});
    if (response.status !== 200) throw Object.assign(new Error('test response rejected'), {code: 'HTTP_STATUS'});
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > options.maxBytes) throw Object.assign(new Error('test body too large'), {code: 'MAX_BYTES_EXCEEDED'});
    fs.writeFileSync(options.path, data, {flag: 'wx'});
    return {status: 200, committed: true, path: options.path, bytesWritten: data.length,
      sha256: crypto.createHash('sha256').update(data).digest('hex')};
  };
}

test('fail-closed plan, origin, method and header validation before network', () => {
  const valid = sample('https://owned.example');
  assert.equal(validateDesktopHttpProjection(valid).urls.length, 1);
  for (const forbidden of ['Cookie', 'Host', 'Origin', 'Authorization', 'Sec-Fetch-Site', 'Proxy-Authorization', 'X-Foo']) {
    const input = sample('https://owned.example');
    input.headerProfile.headers[forbidden] = 'secret';
    code(() => validateDesktopHttpProjection(input), 'E_HEADER_DENIED');
  }
  const injected = sample('https://owned.example');
  injected.headerProfile.headers.Accept = 'a\r\nX-Injected: yes';
  code(() => validateDesktopHttpProjection(injected), 'E_HEADER_VALUE');
  for (const candidate of [
    'http://169.254.169.254/metadata', 'http://192.168.1.1/admin',
    'http://localhost:43111/headers', 'http://127.1:43111/headers',
    'http://user:password@127.0.0.1:43111/headers', 'file:///etc/passwd',
    'https://other.example/headers', 'https://owned.example/a#fragment',
  ]) {
    const x = sample('https://owned.example', [candidate]);
    assert.throws(() => validateDesktopHttpProjection(x), 'Expected denial: ' + candidate);
  }
  const post = sample('https://owned.example'); post.executionPlan.method = 'POST';
  code(() => validateDesktopHttpProjection(post), 'E_PLAN_SCOPE');
  const four = sample('https://owned.example', ['https://owned.example/a', 'https://owned.example/b', 'https://owned.example/c', 'https://owned.example/d']);
  code(() => validateDesktopHttpProjection(four), 'E_PLAN_SCOPE');
  const extra = sample('https://owned.example'); extra.executionPlan.script = 'eval(1)';
  code(() => validateDesktopHttpProjection(extra), 'E_PLAN_SHAPE');
});

test('trusted local identity and explicit operator approval are required', async () => {
  const rt = testRuntime(nodeLoopbackDownloader());
  try {
    await assert.rejects(() => runDesktopHttp(sample('https://owned.example'), rt.runtime), e => e.code === 'E_TRUSTED_LOCAL_ONLY');
    rt.runtime.Execution.scriptPath = null;
    await assert.rejects(() => runDesktopHttp(sample('https://owned.example'), rt.runtime, {localOperatorApproved: true}), e => e.code === 'E_TRUSTED_LOCAL_ONLY');
  } finally { rt.cleanup(); }
});

test('NODE_LOOPBACK_FIXTURE: header echo, true file hash, JSON and HTML receipts', async () => {
  const server = createEchoServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const rt = testRuntime(nodeLoopbackDownloader());
  try {
    const input = sample(origin, [origin + '/headers', origin + '/html', origin + '/rows']);
    const result = await runDesktopHttp(input, rt.runtime, {localOperatorApproved: true});
    assert.equal(result.status, 'completed');
    assert.equal(result.completedCount, 3);
    assert.deepEqual(result.pages.map(p => p.kind), ['json', 'html', 'json']);
    assert.equal(result.pages[2].recordCount, 2);
    const echoed = result.pages[0].fixtureClaimedHeaders;
    assert.equal(echoed.accept, 'application/json');
    assert.equal(echoed['accept-language'], 'zh-CN');
    assert.equal(echoed['user-agent'], 'OpenDesk-HeaderEcho/1.0');
    assert.equal(echoed.cookiePresent, false);
    assert.equal(echoed.authorizationPresent, false);
    assert.equal(result.actualWireHeaders, 'NOT_OBSERVABLE_FROM_DESKTOP_API');
    for (const page of result.pages) {
      const bytes = fs.readFileSync(page.path);
      assert.equal(page.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
      assert.equal(page.bytes, bytes.length);
      assert.equal(path.extname(page.path), '.body');
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(result.receiptPath, 'utf8')).pages, result.pages);
  } finally { rt.cleanup(); await new Promise(resolve => server.close(resolve)); }
});

test('oversized response stops without retry or subsequent requests', async () => {
  const server = createEchoServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const rt = testRuntime(nodeLoopbackDownloader());
  try {
    const input = sample(origin, [origin + '/oversized', origin + '/rows']);
    input.executionPlan.limits.maxBytesPerPage = 1024;
    const result = await runDesktopHttp(input, rt.runtime, {localOperatorApproved: true});
    assert.equal(result.status, 'failed');
    assert.equal(result.errorCode, 'MAX_BYTES_EXCEEDED');
    assert.equal(result.requestedCount, 1);
    assert.equal(result.completedCount, 0);
  } finally { rt.cleanup(); await new Promise(resolve => server.close(resolve)); }
});

test('cancellation and native execution denial cannot be reported as success', async () => {
  for (const [nativeError, status] of [['CANCELED', 'stopped'], ['DOWNLOAD_DISABLED', 'failed'], ['REDIRECT_DENIED', 'failed']]) {
    const rt = testRuntime(async () => {throw Object.assign(new Error('no credentials'), {code: nativeError});});
    try {
      const result = await runDesktopHttp(sample('https://owned.example'), rt.runtime, {localOperatorApproved: true});
      assert.equal(result.status, status);
      assert.equal(result.errorCode, nativeError);
      assert.equal(result.requestedCount, 1);
      assert.equal(result.completedCount, 0);
    } finally { rt.cleanup(); }
  }
});
