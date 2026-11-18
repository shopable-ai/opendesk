'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {once} = require('node:events');
const {setTimeout: delay} = require('node:timers/promises');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'tests/runtime-api/mcp-truncate-timeout.js'), 'utf8');
const terminal = new Set(['succeeded', 'failed', 'timed_out', 'canceled']);
const sha = value => createHash('sha256').update(value).digest('hex');

test('MCP truncate validation and positive fractional HTTP deadlines', {
  skip: !process.env.OPENDESK_MCP_BINARY && 'set OPENDESK_MCP_BINARY',
  timeout: 30_000,
}, async t => {
  const binary = fs.realpathSync(process.env.OPENDESK_MCP_BINARY);
  const base = path.join(root, '.runtime/tests/mcp-truncate-timeout');
  fs.mkdirSync(base, {recursive: true});
  const cwd = fs.mkdtempSync(path.join(base, 'run-'));
  t.diagnostic(`evidence: ${cwd}`);
  const recorder = new EvidenceRecorder(cwd, 'truncate-timeout');
  recorder.writeJSON('provenance.json', {binary, binarySha256: sha(fs.readFileSync(binary)), scriptSha256: sha(script)});
  const client = new MCPStdioClient({binary, args: ['--allow-script-execution'], cwd, recorder,
    runName: 'truncate-timeout', stdoutPath: path.join(cwd, 'stdout.ndjson'), stderrPath: path.join(cwd, 'stderr.log'), timeoutMs: 5000});

  async function call(name, args) {
    const frame = await client.request('tools/call', {name, arguments: args});
    return JSON.parse(frame.content[0].text);
  }
  async function run(scenario, input = {}) {
    const started = await call('tm_script_start', {script, input: {scenario, ...input}, timeoutMs: 5000});
    assert.equal(typeof started.executionId, 'string', JSON.stringify(started));
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const result = await call('tm_script_status', {executionId: started.executionId});
      if (terminal.has(result.status)) {
        recorder.writeJSON(scenario + '.json', result);
        return result;
      }
      await delay(20);
    }
    assert.fail('execution did not terminate: ' + scenario);
  }

  try {
    await client.start();
    await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'truncate-timeout', version: '1'}});
    await client.notify('notifications/initialized');
    const original = Buffer.from('abcdefgh');

    await t.test('invalid truncate preserves the independently seeded file', async () => {
      const target = path.join(cwd, 'reject.txt');
      fs.writeFileSync(target, original);
      const result = await run('truncate-reject');
      const actual = fs.readFileSync(target);
      recorder.writeJSON('reject-oracle.json', {before: original.toString('hex'), after: actual.toString('hex')});
      assert.deepEqual(actual, original);
      assert.equal(result.status, 'succeeded', JSON.stringify(result));
    });

    await t.test('valid truncate shortens, extends, and clears independent fixtures', async () => {
      const expected = {
        'shorten.txt': original.subarray(0, 4),
        'extend.txt': Buffer.concat([original, Buffer.alloc(2)]),
        'zero.txt': Buffer.alloc(0),
      };
      for (const name of Object.keys(expected)) fs.writeFileSync(path.join(cwd, name), original);
      const result = await run('truncate-valid');
      const actual = Object.fromEntries(Object.keys(expected).map(name => [name, fs.readFileSync(path.join(cwd, name))]));
      recorder.writeJSON('valid-oracle.json', Object.fromEntries(Object.entries(actual).map(([name, bytes]) => [name, bytes.toString('hex')])));
      assert.deepEqual(actual, expected);
      assert.equal(result.status, 'succeeded', JSON.stringify(result));
    });

    await t.test('fractional deadlines refuse delayed loopback replies through HTTP and axios', async () => {
      const accepted = [], completed = [], disconnected = [];
      const server = http.createServer((request, response) => {
        const route = request.url;
        accepted.push(route);
        const timer = setTimeout(() => response.end(route), 350);
        response.on('finish', () => completed.push(route));
        response.on('close', () => {
          clearTimeout(timer);
          if (!response.writableFinished) disconnected.push(route);
        });
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      try {
        const result = await run('http-timeout', {base: `http://127.0.0.1:${server.address().port}`});
        recorder.writeJSON('http-oracle.json', {accepted, completed, disconnected});
        assert.deepEqual(completed, ['/zero', '/negative', '/positive']);
        for (const route of accepted.filter(route => route.startsWith('/fraction-') || route === '/integer-timeout')) {
          assert(disconnected.includes(route), 'timed out while server still held ' + route);
        }
        assert.equal(result.status, 'succeeded', JSON.stringify(result));
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    });
  } finally {
    assert.equal((await client.close()).code, 0);
    assert.deepEqual(client.protocolViolations, []);
  }
});
