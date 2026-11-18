'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {setTimeout: delay} = require('node:timers/promises');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const root = path.resolve(__dirname, '../..');
const binaryInput = process.env.OPENDESK_MCP_BINARY;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const script = fs.readFileSync(path.join(root, 'tests/runtime-api/mcp-stream-depth.js'), 'utf8');

test('stream completion and abort listener isolation through real MCP', {
  skip: !binaryInput && 'set OPENDESK_MCP_BINARY to a real MCP candidate', timeout: 60000,
}, async t => {
  const binary = fs.realpathSync(binaryInput);
  const base = path.join(root, '.runtime/tests/mcp-depth/streams');
  fs.mkdirSync(base, {recursive: true});
  const cwd = fs.mkdtempSync(path.join(base, 'run-'));
  const recorder = new EvidenceRecorder(cwd, 'streams');
  t.diagnostic(`evidence: ${cwd}`);
  recorder.writeJSON('provenance.json', {binary, binarySha256: hash(fs.readFileSync(binary)), scriptSha256: hash(script),
    polyfills: Object.fromEntries(['001-web-streams.js', '004-axios.js'].map(file =>
      [file, hash(fs.readFileSync(path.join(root, 'polyfills', file)))]))});
  const client = new MCPStdioClient({binary, args: ['--allow-script-execution'], cwd, recorder, runName: 'streams',
    stdoutPath: path.join(cwd, 'stdout.ndjson'), stderrPath: path.join(cwd, 'stderr.log'), timeoutMs: 15000});
  async function call(name, args = {}) {
    const frame = await client.request('tools/call', {name, arguments: args});
    const value = JSON.parse(frame.content[0].text);
    assert.equal(value.ok, true, JSON.stringify(frame));
    return value;
  }
  async function run(scenario) {
    const started = await call('tm_script_start', {script, input: {case: scenario}, timeoutMs: 3000});
    const deadline = Date.now() + 10000;
    let status;
    while (Date.now() < deadline) {
      const frame = await client.request('tools/call', {name: 'tm_script_status', arguments: {executionId: started.executionId}});
      status = JSON.parse(frame.content[0].text);
      if (['succeeded', 'failed', 'canceled', 'timed_out'].includes(status.status)) break;
      await delay(20);
    }
    recorder.writeJSON(`${scenario}.json`, status);
    assert.equal(status.status, 'succeeded', JSON.stringify(status));
    const disk = JSON.parse(fs.readFileSync(path.resolve(cwd, status.result.artifacts.agentSummaryPath), 'utf8'));
    assert.equal(disk.executionId, started.executionId);
    assert.equal(disk.status, 'succeeded');
    const reports = status.summary.scriptLogs.flatMap(row => {
      try { const parsed = JSON.parse(row.message); return parsed.test === 'mcp-stream-depth' ? [parsed] : []; }
      catch { return []; }
    });
    assert.equal(reports.length, 1);
    assert.equal(reports[0].case, scenario);
    return {status, result: reports[0].result};
  }
  try {
    await client.start();
    await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'streams-test', version: '1'}});
    await client.notify('notifications/initialized');
    await t.test('accepted writes finish in order before close', async () => {
      const {result} = await run('queued-close');
      assert.deepEqual(result.received, [{id: 'A', total: 21}, {id: 'B', total: 22}]);
      assert.deepEqual(result.trace, ['begin:A', 'end:A', 'begin:B', 'end:B', 'close']);
      assert.deepEqual(result.operations.map(row => row.state), ['fulfilled', 'fulfilled', 'fulfilled', 'rejected', 'fulfilled']);
    });
    await t.test('transformed business records, flush total and both closed termini', async () => {
      const {result} = await run('transform-success');
      assert.deepEqual(result.transformed, [{id: 'A', total: 21}, {id: 'B', total: 22}, {sum: 43}]);
      assert.deepEqual(result.operations.map(row => row.state), Array(6).fill('fulfilled'));
    });
    for (const scenario of ['transform-throw', 'transform-reject', 'flush-throw', 'flush-reject',
      'controller-error', 'start-error', 'start-reject']) {
      await t.test(`${scenario} rejects the operation, pending read and both closed promises`, async () => {
        const {result} = await run(scenario);
        assert.deepEqual(result, Array.from({length: 4}, () => ({state: 'rejected', sameReason: true})));
      });
    }
    await t.test('async abort failures retain fixed private-free diagnostics and execution survives', async () => {
      const {result, status} = await run('abort-listeners');
      assert.deepEqual(result, {calls: ['onabort', 'async', 'next', 'late'], aborted: true, sameReason: true, alive: true});
      const errors = status.summary.errors;
      assert.equal(errors.length, 3);
      assert(errors.every(row => row.message === 'AbortSignal listener failed'));
      assert(!JSON.stringify(status).includes('PRIVATE_ASYNC_'), 'listener details must not enter Runtime output');
      assert.deepEqual(await client.request('ping'), {});
      assert.equal((await run('transform-success')).result.transformed[2].sum, 43);
    });
  } finally {
    const exit = await client.close();
    recorder.writeJSON('exit.json', {exit, protocolViolations: client.protocolViolations});
    assert.equal(exit.code, 0);
    assert.deepEqual(client.protocolViolations, []);
    const events = fs.readFileSync(recorder.ndjsonPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert(!events.some(row => ['shutdown_timeout', 'process_terminate'].includes(row.event)));
  }
});
