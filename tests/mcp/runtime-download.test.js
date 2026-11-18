'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {setTimeout: delay} = require('node:timers/promises');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const root = path.resolve(__dirname, '../..');
const binaryInput = process.env.OPENDESK_MCP_BINARY;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const terminal = new Set(['succeeded', 'failed', 'canceled', 'timed_out']);
const script = fs.readFileSync(path.join(root, 'tests/runtime-api/mcp-download.js'), 'utf8');

async function call(client, name, args = {}) {
  const frame = await client.request('tools/call', {name, arguments: args});
  const value = JSON.parse(frame.content[0].text);
  assert.equal(value.ok, true, JSON.stringify(frame));
  return value;
}

async function until(action, predicate, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const value = await action();
    if (predicate(value)) return value;
    await delay(20);
  }
  assert.fail(message);
}

test('http.download through real MCP: authority, bytes, failed commit and cleanup', {
  skip: !binaryInput && 'set OPENDESK_MCP_BINARY to a freshly built MCP binary', timeout: 120000,
}, async t => {
  const binary = fs.realpathSync(binaryInput);
  const base = path.join(root, '.runtime/tests/mcp-depth/download');
  fs.mkdirSync(base, {recursive: true});
  const evidence = fs.mkdtempSync(path.join(base, 'run-'));
  t.diagnostic(`evidence: ${evidence}`);
  const recorder = new EvidenceRecorder(evidence, 'download');
  const bytes = Buffer.from(Array.from({length: 131083}, (_, i) => (i * 37) % 256));
  const requests = [];
  const slow = new Set();
  const barriers = new Map();
  const server = http.createServer((req, res) => {
    requests.push({url: req.url, headers: req.headers});
    if (req.url.startsWith('/barrier/')) {
      const count = Number(req.url.split('/').pop());
      if (slow.size >= count) res.end('ready');
      else barriers.set(res, count);
      res.on('close', () => barriers.delete(res));
      return;
    }
    if (req.url === '/slow' || req.url === '/gzip-header') {
      res.writeHead(200, req.url === '/gzip-header' ? {'Content-Encoding': 'gzip'} : {});
      res.flushHeaders();
      if (req.url === '/slow') res.write(bytes.subarray(0, 100));
      slow.add(res);
      res.on('close', () => slow.delete(res));
      for (const [barrier, count] of barriers) if (slow.size >= count) {
        barrier.end('ready'); barriers.delete(barrier);
      }
      return;
    }
    if (req.url === '/truncated') {
      res.writeHead(200, {'Content-Length': bytes.length + 10, Connection: 'close'});
      res.end(bytes);
      return;
    }
    if (req.url === '/gzip-bad') {
      const compressed = zlib.gzipSync(bytes);
      compressed[compressed.length - 8] ^= 1;
      res.writeHead(200, {'Content-Encoding': 'gzip'}); res.end(compressed); return;
    }
    if (req.url === '/gzip') {
      res.writeHead(200, {'Content-Encoding': 'gzip'}); res.end(zlib.gzipSync(bytes)); return;
    }
    if (req.url === '/partial') { res.writeHead(206); res.end(bytes); return; }
    res.writeHead(200, {'Content-Length': bytes.length}); res.end(bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  recorder.writeJSON('provenance.json', {binary, binarySha256: digest(fs.readFileSync(binary)),
    scriptSha256: digest(script), fixtureSha256: digest(bytes), baseURL});

  function noTemps(cwd) {
    assert.deepEqual(fs.readdirSync(cwd).filter(name => name.startsWith('.opendesk-download-')), []);
  }
  function verifyFile(file, result) {
    const actual = fs.readFileSync(file);
    assert.deepEqual(actual, bytes);
    assert.equal(digest(actual), digest(bytes));
    assert.equal(result.path, file);
    assert.equal(result.bytesWritten, bytes.length);
    assert.equal(result.sha256, digest(actual));
    assert.equal(result.committed, true);
  }
  async function session(name, capabilities, body) {
    const cwd = path.join(evidence, name); fs.mkdirSync(cwd);
    const args = ['--allow-script-execution'];
    if (capabilities) args.push('--script-capabilities=download');
    const client = new MCPStdioClient({binary, args, cwd, recorder, runName: name,
      stdoutPath: path.join(cwd, 'stdout.ndjson'), stderrPath: path.join(cwd, 'stderr.log'), timeoutMs: 20000});
    try {
      await client.start();
      await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'download-test', version: '1'}});
      await client.notify('notifications/initialized');
      await body(client, cwd);
    } finally {
      const exit = await client.close();
      recorder.writeJSON(`${name}-exit.json`, {exit, protocolViolations: client.protocolViolations});
      assert.deepEqual(client.protocolViolations, []);
      assert.equal(exit.code, 0);
      const events = fs.readFileSync(recorder.ndjsonPath, 'utf8').trim().split('\n').map(JSON.parse);
      assert(!events.some(row => row.run === name && ['shutdown_timeout', 'process_terminate'].includes(row.event)));
      noTemps(cwd);
    }
  }
  async function start(client, input, timeoutMs = 10000) {
    return (await call(client, 'tm_script_start', {script, input: {baseURL, ...input}, timeoutMs})).executionId;
  }
  async function finish(client, id, expected = 'succeeded') {
    const status = await until(async () => {
      const frame = await client.request('tools/call', {name: 'tm_script_status', arguments: {executionId: id}});
      return JSON.parse(frame.content[0].text);
    }, value => terminal.has(value.status), 'execution did not terminate');
    recorder.writeJSON(`${id}.json`, status);
    assert.equal(status.status, expected, JSON.stringify(status));
    const persisted = JSON.parse(fs.readFileSync(path.resolve(client.cwd, status.result.artifacts.agentSummaryPath), 'utf8'));
    assert.equal(persisted.status, expected);
    assert.equal(persisted.executionId, id);
    return status;
  }
  async function run(client, input) {
    const status = await finish(client, await start(client, input));
    const reports = status.summary.scriptLogs.flatMap(row => {
      try { const value = JSON.parse(row.message); return value.test === 'mcp-download' ? [value] : []; }
      catch { return []; }
    });
    assert.equal(reports.length, 1);
    noTemps(client.cwd);
    return reports[0].result;
  }
  try {
    await t.test('host authority is required before any network or file effects', () => session('disabled', false, async (client, cwd) => {
      const before = requests.length;
      const destination = path.join(cwd, 'forbidden/nested.bin');
      const result = await run(client, {path: destination, options: {createDirs: true}, expectedError: 'DOWNLOAD_DISABLED'});
      assert.equal(result.status, 0);
      assert.equal(requests.length, before);
      assert(!fs.existsSync(path.dirname(destination)));
    }));
    await session('authorized', true, async (client, cwd) => {
      await t.test('throwing options reject a structured Promise before any effects', async () => {
        for (const field of ['path', 'headers', 'timeout', 'signal']) {
          const before = requests.length;
          const destination = path.join(cwd, `getter-${field}`);
          const result = await run(client, {mode: 'getter', field, path: destination});
          assert.equal(result.status, 0);
          assert.equal(requests.length, before);
          assert(!fs.existsSync(destination));
        }
        const destination = path.join(cwd, 'after-getters');
        verifyFile(destination, await run(client, {path: destination}));
      });
      await t.test('complete binary and gzip bytes match independent disk SHA-256', async () => {
        for (const [name, endpoint, headers] of [
          ['bytes', '/bytes', {}], ['gzip-auto', '/gzip', {}],
          ['gzip-native', '/gzip', {'Accept-Encoding': 'gzip'}],
        ]) {
          const destination = path.join(cwd, name);
          const result = await run(client, {endpoint, path: path.basename(destination), options: {sha256: digest(bytes), headers}});
          verifyFile(destination, result);
        }
      });
      await t.test('failures preserve an existing target and remove temporary files', async () => {
        const destination = path.join(cwd, 'preserved');
        const sentinel = Buffer.from('old target must survive'); fs.writeFileSync(destination, sentinel);
        for (const [endpoint, options, expectedError] of [
          ['/bytes', {sha256: '0'.repeat(64)}, 'SHA256_MISMATCH'],
          ['/bytes', {maxBytes: 10}, 'MAX_BYTES_EXCEEDED'],
          ['/gzip', {maxBytes: 1000}, 'MAX_BYTES_EXCEEDED'],
          ['/truncated', {}, 'IO_FAILED'], ['/gzip-bad', {}, 'IO_FAILED'], ['/partial', {}, 'HTTP_STATUS'],
          ['/slow', {timeout: 100}, 'TIMEOUT'],
          ['/gzip-header', {timeout: 100, headers: {'Accept-Encoding': 'gzip'}}, 'TIMEOUT'],
        ]) {
          const result = await run(client, {endpoint, path: destination, options: {overwrite: true, ...options}, expectedError});
          assert.equal(result.status, endpoint === '/partial' ? 206 : 200);
          assert.deepEqual(fs.readFileSync(destination), sentinel);
        }
        await run(client, {path: destination, expectedError: 'TARGET_EXISTS'});
      });
      await t.test('empty Range and If-Range are rejected before network effects', async () => {
        for (const [header, value] of [['Range', ''], ['iF-rAnGe', ''], ['range', 'bytes=0-9'], ['If-Range', 'etag']]) {
          const before = requests.length;
          const destination = path.join(cwd, `header-${header}`);
          const result = await run(client, {path: destination, options: {headers: {[header]: value}}, expectedError: 'INVALID_ARGUMENT'});
          assert.equal(result.status, 0);
          assert.equal(requests.length, before);
          assert(!fs.existsSync(destination));
        }
      });
      await t.test('gzip header cancellation retains CANCELED and releases the slot', async () => {
        await until(() => slow.size, count => count === 0, 'old slow response not closed');
        const destination = path.join(cwd, 'gzip-abort');
        const result = await run(client, {mode: 'abort', endpoint: '/gzip-header', path: destination,
          options: {headers: {'Accept-Encoding': 'gzip'}}});
        assert(!fs.existsSync(destination + '0'));
        assert.equal(result.canceled[0].status, 200);
        verifyFile(destination + 'reused', result.reused);
      });
      await t.test('four in-flight downloads cancel, clean up and reuse slots', async () => {
        await until(() => slow.size, count => count === 0, 'old slow response not closed');
        const destination = path.join(cwd, 'slots');
        const result = await run(client, {mode: 'slots', endpoint: '/slow', path: destination});
        for (let i = 0; i < 4; i++) assert(!fs.existsSync(destination + i));
        assert(!fs.existsSync(destination + 'overflow'));
        verifyFile(destination + 'reused', result.reused);
      });
      await t.test('transport cancel cleans a real partial file and releases execution slot', async () => {
        const destination = path.join(cwd, 'transport-cancel');
        const sentinel = Buffer.from('preserve on cancel'); fs.writeFileSync(destination, sentinel);
        const id = await start(client, {endpoint: '/slow', path: destination, options: {overwrite: true, timeout: 0}});
        await until(() => fs.readdirSync(cwd).filter(name => name.startsWith('.opendesk-download-')).length,
          count => count > 0, 'download never created its temporary file');
        await call(client, 'tm_script_cancel', {executionId: id});
        await finish(client, id, 'canceled'); noTemps(cwd);
        assert.deepEqual(fs.readFileSync(destination), sentinel);
        const next = path.join(cwd, 'after-cancel');
        verifyFile(next, await run(client, {path: next}));
      });
      await t.test('execution deadline cleans a partial download and releases execution slot', async () => {
        const destination = path.join(cwd, 'execution-deadline');
        const id = await start(client, {endpoint: '/slow', path: destination, options: {timeout: 0}}, 500);
        await until(() => fs.readdirSync(cwd).some(name => name.startsWith('.opendesk-download-')), Boolean, 'no partial file before deadline');
        await finish(client, id, 'timed_out'); noTemps(cwd);
        assert(!fs.existsSync(destination));
        const next = path.join(cwd, 'after-deadline');
        verifyFile(next, await run(client, {path: next}));
      });
    });
    await t.test('stdin EOF drains active download and removes its partial file', async () => {
      let destination;
      let summaryPath;
      let executionId;
      await session('eof', true, async (client, cwd) => {
        destination = path.join(cwd, 'never-committed');
        executionId = await start(client, {endpoint: '/slow', path: destination, options: {timeout: 0}});
        await until(() => fs.readdirSync(cwd).some(name => name.startsWith('.opendesk-download-')), Boolean, 'no partial file before EOF');
        const running = await call(client, 'tm_script_status', {executionId});
        summaryPath = path.resolve(cwd, running.result.artifacts.agentSummaryPath);
      });
      assert(!fs.existsSync(destination));
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      assert.equal(summary.status, 'canceled');
      assert.equal(summary.executionId, executionId);
      assert(summary.finishedAt);
      recorder.writeJSON('eof-summary.json', summary);
      await until(() => slow.size, count => count === 0, 'EOF did not close HTTP body');
    });
  } finally {
    recorder.writeJSON('requests.json', requests);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
