'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const {setTimeout: delay} = require('node:timers/promises');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const {verifyPacket} = require('../../scripts/api-docs.js');
const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'tests/runtime-api/mcp-network-depth.js'), 'utf8');
const terminal = new Set(['succeeded', 'failed', 'timed_out', 'canceled']);
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
async function call(client, name, args = {}) {
  const frame = await client.request('tools/call', {name, arguments: args});
  const value = JSON.parse(frame.content[0].text);
  assert.notEqual(frame.isError, true, JSON.stringify(value));
  return value;
}
async function until(read, predicate, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(20);
  }
  assert.fail(`timeout: ${label}`);
}
async function finished(client, started, expected = 'succeeded') {
  const result = await until(async () => {
    const frame = await client.request('tools/call', {name: 'tm_script_status', arguments: {executionId: started.executionId}});
    const value = JSON.parse(frame.content[0].text);
    if (terminal.has(value.status)) assert.equal(frame.isError === true, value.status !== 'succeeded');
    return value;
  }, value => terminal.has(value.status), 'execution termination');
  assert.equal(result.status, expected, JSON.stringify(result));
  assert.equal(result.summary.executionId, started.executionId);
  assert.equal(result.result.executionId, started.executionId);
  const persisted = JSON.parse(fs.readFileSync(path.resolve(client.cwd, result.result.artifacts.agentSummaryPath)));
  assert.equal(persisted.status, expected);
  return result;
}
function post(config, body, headers = {}, raw = false) {
  return new Promise((resolve, reject) => {
    const request = http.request(config.url, {method: 'POST', headers: {...config.headers, ...headers}, agent: false}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        resolve({status: response.statusCode, body: raw ? bytes.toString('utf8') : JSON.parse(bytes)});
      });
    });
    request.setTimeout(2000, () => request.destroy(new Error('fixture timeout')));
    request.on('error', reject);
    request.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}
test('MCP network business results, deadlines and resource lifecycle', {
  skip: !process.env.OPENDESK_MCP_BINARY && 'set OPENDESK_MCP_BINARY', timeout: 180_000,
}, async t => {
  const binary = fs.realpathSync(process.env.OPENDESK_MCP_BINARY);
  const base = path.join(root, '.runtime/tests/mcp-depth/network');
  fs.mkdirSync(base, {recursive: true});
  const evidence = fs.mkdtempSync(path.join(base, `${Date.now()}-`));
  const recorder = new EvidenceRecorder(evidence, 'network-depth');
  t.diagnostic(`evidence: ${evidence}`);
  recorder.writeJSON('provenance.json', {binary, binarySha256: sha(fs.readFileSync(binary)), scriptSha256: sha(script)});
  async function session(name, body) {
    const cwd = path.join(evidence, name); fs.mkdirSync(cwd);
    const client = new MCPStdioClient({binary, args: ['--allow-script-execution', '--script-capabilities=webhook', `--api-docs-root=${root}`],
      cwd, recorder, runName: name, stdoutPath: path.join(cwd, 'stdout.ndjson'), stderrPath: path.join(cwd, 'stderr.log'), timeoutMs: 20000});
    try {
      await client.start();
      await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'network-depth', version: '1'}});
      await client.notify('notifications/initialized');
      await body(client, cwd);
    } finally {
      const exit = await client.close();
      assert.deepEqual(client.protocolViolations, []);
      assert.equal(exit.code, 0);
      recorder.writeJSON(`${name}-exit.json`, exit);
    }
  }
  await session('business', async (client, cwd) => {
    await t.test('pure business task chooses Geometry and checks independent centers', async () => {
      const catalog = await call(client, 'tm_api_catalog', {group: 'targets'});
      assert(catalog.catalog.includes('Geometry.center'));
      const packet = await call(client, 'tm_api_read', {doc: 'geometry', selector: 'Geometry.center', withTypes: true});
      assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
      recorder.writeJSON('pure-contract.json', packet);
      const result = await finished(client, await call(client, 'tm_script_start', {script, input: {scenario: 'pure',
        rectangles: [{x: -40, y: 15, width: 60, height: 20, coordinateSpace: 'screen'}, {x: 100, y: -50, width: 20, height: 40, coordinateSpace: 'screen'}]}}));
      const report = JSON.parse(result.summary.scriptLogs.find(row => row.message.includes('"mapped"')).message);
      assert.deepEqual(report.mapped, [{x: -10, y: 25, coordinateSpace: 'screen'}, {x: 110, y: -30, coordinateSpace: 'screen'}]);
      recorder.writeJSON('pure-result.json', result);
    });
    await t.test('HTTP params, native status, deadlines, signals and interceptor order', async () => {
      const records = [], disconnected = [];
      const server = http.createServer((request, response) => {
        records.push(request.url);
        if (request.url.startsWith('/slow')) { response.on('close', () => disconnected.push(request.url)); return; }
        response.setHeader('content-type', 'application/json');
        response.setHeader('X-Fixture', ['one', 'two']);
        if (request.url === '/failure') {response.statusCode = 503; response.end('{}');}
        else if (request.url === '/bytes') response.end('fixture-byte-data');
        else response.end(JSON.stringify({url: request.url}));
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        await call(client, 'tm_api_catalog', {group: 'network-ai'});
        for (const selector of ['http.request', 'http.get', 'axios.get', 'axios.interceptors']) {
          const packet = await call(client, 'tm_api_read', {doc: 'http', selector, withTypes: true});
          assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
        }
        const result = await finished(client, await call(client, 'tm_script_start', {script, input: {scenario: 'http', base: `http://127.0.0.1:${server.address().port}`}}));
        assert(!records.includes('/must-not-send'));
        assert.equal(records.filter(url => url.startsWith('/echo?')).length, 1);
        await until(() => disconnected, value => value.length === 2, 'request sockets closed');
        recorder.writeJSON('http-independent.json', {records, disconnected, result});
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    });
    await t.test('console null and undefined retain explicit identity without stopping execution', async () => {
      const started = await call(client, 'tm_script_start', {script, input: {scenario: 'console'}});
      const result = await finished(client, started);
      const disk = JSON.parse(fs.readFileSync(started.artifacts.agentSummaryPath));
      assert.equal(disk.status, 'succeeded');
      const events = fs.readFileSync(started.artifacts.eventLogPath, 'utf8').trim().split('\n').map(JSON.parse);
      const rows = events.filter(row => row.message?.startsWith('console-null-fixture'));
      assert.equal(rows.length, 5);
      for (const row of rows) assert.match(row.message, /^console-null-fixture null undefined 0 false/);
      recorder.writeJSON('console-independent.json', {status: disk.status, rows});
    });
    await t.test('conditional business chain stops before unavailable model or agent work', async () => {
      const catalog = await call(client, 'tm_api_catalog', {group: 'network-ai'});
      recorder.writeJSON('conditional-catalog.json', catalog);
      for (const [doc, selector] of [['llm', 'LLM.generate'], ['agent', 'Agent.run']]) {
        const packet = await call(client, 'tm_api_read', {doc, selector, withTypes: true});
        assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
        assert.match(packet.output, /## http.request/);
        if (doc === 'agent') assert.match(packet.output, /## Command.run/);
      }
      const started = await call(client, 'tm_script_start', {script, input: {scenario: 'conditional'}});
      const result = await finished(client, started);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(started.artifacts.runDir, 'stopped.json'))), {
        status: 'stopped', failures: [{operation: 'LLM.generate', code: 'CONFIG_MISSING'}, {operation: 'Agent.run', code: 'DISABLED'}],
      });
      recorder.writeJSON('conditional-stop.json', result);
    });
    await t.test('close inside handler and immediate reopen preserve each generation', async () => {
      const result = await finished(client, await call(client, 'tm_script_start', {script, input: {scenario: 'webhook-reopen'}}));
      const reports = result.summary.scriptLogs.map(row => {try {return JSON.parse(row.message);} catch {return {};}});
      assert(reports.some(row => row.scenario === 'webhook-reopen' && row.generations === 12));
      recorder.writeJSON('webhook-reopen.json', result);
    });
    await t.test('204 and 304 have no wire body and dedupe does not repeat handlers', async () => {
      const started = await call(client, 'tm_script_start', {script, input: {scenario: 'webhook-no-body'}});
      const ready = path.join(started.artifacts.runDir, 'webhook-ready.json');
      await until(() => fs.existsSync(ready), Boolean, 'no-body webhook handoff');
      const config = JSON.parse(fs.readFileSync(ready));
      const responses = [];
      for (const status of [204, 304]) {
        const headers = {'X-OpenDesk-Delivery-Id': `no-body-${status}`};
        const first = await post(config, {status}, headers, true);
        assert.deepEqual(first, {status, body: ''});
        assert.deepEqual(await post(config, {status}, headers, true), first);
        responses.push(first);
      }
      assert.deepEqual(await post(config, {close: true}), {status: 200, body: {processed: 2}});
      const result = await finished(client, started);
      await assert.rejects(post(config, {}));
      recorder.writeJSON('webhook-no-body-independent.json', {responses, result});
    });
    await t.test('authenticated callback, protocol rejection, dedupe, result unknown and close', async () => {
      const packet = await call(client, 'tm_api_read', {doc: 'webhook', selector: 'Webhook.listen', withTypes: true});
      assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
      const fixture = path.join(cwd, 'fixture'); fs.mkdirSync(fixture);
      const nonce = crypto.randomUUID();
      const started = await call(client, 'tm_script_start', {script, input: {scenario: 'webhook', nonce, fixture}});
      const ready = path.resolve(cwd, started.artifacts.artifactDir || path.dirname(started.artifacts.agentSummaryPath), 'webhook-ready.json');
      await until(() => fs.existsSync(ready), Boolean, 'private webhook handoff');
      const config = JSON.parse(fs.readFileSync(ready));
      const event = {nonce, kind: 'receipt', id: 'receipt-42', quantity: 7, nested: {values: [null, true, 2.5]}, text: '7'};
      assert.equal((await post(config, event, {Authorization: 'Bearer invalid'})).status, 401);
      assert.equal((await post(config, event, {Origin: 'https://denied.invalid'})).status, 403);
      assert.equal((await post(config, '{')).status, 400);
      assert.equal((await post(config, 'x'.repeat(513))).status, 413);
      assert(!fs.existsSync(path.join(fixture, 'receipt.json')));
      const headers = {'X-OpenDesk-Delivery-Id': 'delivery-1', 'X-OpenDesk-Source': 'fixture'};
      const first = await post(config, event, headers);
      assert.equal(first.status, 201);
      const again = await post(config, {...event}, headers);
      assert.deepEqual(again, first);
      assert.equal((await post(config, {...event, id: 'conflict'}, headers)).status, 409);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'receipt.json'))), first.body);
      assert.equal(first.body.processed, 1);
      const unknown = await post(config, {nonce, kind: 'slow'}, {'X-OpenDesk-Delivery-Id': 'slow'});
      assert.equal(unknown.status, 504);
      assert.equal(unknown.body.error.code, 'RESULT_UNKNOWN');
      // Never replay the unknown request. Observe its independent completion.
      await until(() => fs.existsSync(path.join(fixture, 'slow-finished.json')), Boolean, 'unknown handler settlement');
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'slow-finished.json'))), {aborted: true, processed: 1});
      const closed = await post(config, {nonce, kind: 'close'});
      assert.deepEqual(closed, {status: 200, body: {closed: true, processed: 1}});
      const result = await finished(client, started);
      await assert.rejects(post(config, event));
      assert(!JSON.stringify(result).includes(config.headers.Authorization));
      recorder.writeJSON('webhook-independent.json', {first, again, unknown, closed, result});
    });
  });
  for (const mode of ['cancel', 'eof']) await session(`http-${mode}`, async client => {
    await t.test(`in-flight HTTP ${mode} disconnects transport`, async () => {
      let accepted = false, disconnected = false;
      const server = http.createServer((request, response) => {accepted = true; response.on('close', () => {disconnected = true;});});
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const started = await call(client, 'tm_script_start', {script, input: {scenario: 'http-pending', base: `http://127.0.0.1:${server.address().port}`}, timeoutMs: 30000});
        await until(() => accepted, Boolean, 'server accepted HTTP');
        if (mode === 'cancel') {
          await call(client, 'tm_script_cancel', {executionId: started.executionId});
          recorder.writeJSON('http-canceled.json', await finished(client, started, 'canceled'));
          await finished(client, await call(client, 'tm_script_start', {script, input: {scenario: 'pure', rectangles: []}}));
        } else {
          assert.equal((await client.close()).code, 0);
          const disk = JSON.parse(fs.readFileSync(path.resolve(client.cwd, started.artifacts.agentSummaryPath)));
          assert.equal(disk.status, 'canceled');
        }
        await until(() => disconnected, Boolean, 'independent socket closure');
      } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
    });
  });
  for (const mode of ['cancel', 'eof']) await session(`webhook-body-${mode}`, async (client, cwd) => {
    await t.test(`closed webhook retains incomplete-body cleanup responsibility on ${mode}`, async () => {
      const fixture = path.join(cwd, 'fixture'); fs.mkdirSync(fixture);
      const nonce = crypto.randomUUID();
      const started = await call(client, 'tm_script_start', {script, input: {scenario: 'webhook', nonce, fixture, hold: true}, timeoutMs: 30000});
      const ready = path.join(started.artifacts.runDir, 'webhook-ready.json');
      await until(() => fs.existsSync(ready), Boolean, 'webhook body fixture handoff');
      const config = JSON.parse(fs.readFileSync(ready));
      let closed = false;
      const request = http.request(config.url, {method: 'POST', agent: false,
        headers: {...config.headers, Expect: '100-continue', 'Content-Length': '256'}});
      request.on('error', () => {});
      request.on('socket', socket => socket.on('close', () => {closed = true;}));
      try {
        const reading = new Promise(resolve => request.once('continue', resolve));
        request.flushHeaders();
        await Promise.race([reading, delay(2000).then(() => assert.fail('server did not begin body read'))]);
        request.write('{'); // Keep the authenticated request's body incomplete.
        assert.equal((await post(config, {nonce, kind: 'close'})).status, 200);
        if (mode === 'cancel') {
          await call(client, 'tm_script_cancel', {executionId: started.executionId});
          await finished(client, started, 'canceled');
        } else {
          assert.equal((await client.close()).code, 0);
          assert.equal(JSON.parse(fs.readFileSync(started.artifacts.agentSummaryPath)).status, 'canceled');
        }
        await until(() => closed, Boolean, 'accepted incomplete-body socket released');
        if (mode === 'cancel') await finished(client, await call(client, 'tm_script_start', {script, input: {scenario: 'pure', rectangles: []}}));
        recorder.writeJSON(`webhook-body-${mode}-oracle.json`, {acceptedBodyRead: true, listenerClosed: true, socketClosed: closed});
      } finally {request.destroy();}
    });
  });
});
