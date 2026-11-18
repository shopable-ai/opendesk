'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {setTimeout: delay} = require('node:timers/promises');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const {verifyPacket} = require('../../scripts/api-docs.js');
const root = path.resolve(__dirname, '../..');
const binaryInput = process.env.OPENDESK_MCP_BINARY;
const scriptPath = path.join(root, 'tests/runtime-api/mcp-persistence.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const terminal = new Set(['succeeded', 'failed', 'timed_out', 'canceled']);

async function call(client, name, args = {}) {
  const response = await client.request('tools/call', {name, arguments: args});
  assert.notEqual(response.isError, true, JSON.stringify(response));
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0].type, 'text');
  const value = JSON.parse(response.content[0].text);
  assert.equal(value.ok, true, JSON.stringify(value));
  return value;
}

async function run(client, input, recorder) {
  const started = await call(client, 'tm_script_start', {script, input, timeoutMs: 15_000});
  assert.equal(started.status, 'running');
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await client.request('tools/call', {
      name: 'tm_script_status', arguments: {executionId: started.executionId},
    });
    const status = JSON.parse(response.content[0].text);
    if (terminal.has(status.status)) {
      recorder.writeJSON(input.phase + '-result.json', status);
      assert.equal(status.status, 'succeeded', JSON.stringify(status));
      assert.notEqual(response.isError, true);
      assert.equal(status.result.executionId, started.executionId);
      assert.equal(status.summary.executionId, started.executionId);
      assert.equal(status.result.scriptHash, sha(script));
      const disk = JSON.parse(fs.readFileSync(path.resolve(client.cwd, status.result.artifacts.agentSummaryPath), 'utf8'));
      assert.equal(disk.executionId, started.executionId);
      assert.equal(disk.status, 'succeeded');
      const reports = status.summary.scriptLogs.flatMap(row => {
        try {
          const report = JSON.parse(row.message);
          return report.test === 'mcp-persistence' ? [report] : [];
        } catch { return []; }
      });
      assert.equal(reports.length, 1);
      const report = reports[0];
      assert.equal(report.ok, true);
      assert.equal(report.phase, input.phase);
      assert.equal(report.executionId, started.executionId);
      return {id: started.executionId, report};
    }
    await delay(25);
  }
  assert.fail('persistence execution did not terminate');
}

// Separate process and standard-library driver: no Runtime query result is
// used to decide whether the database really committed or rolled back.
function oracle(fixture) {
  const output = execFileSync(process.env.PYTHON || 'python3', ['-c', [
    'import json, sqlite3, sys',
    'from pathlib import Path',
    'uri = Path(sys.argv[1]).resolve().as_uri() + "?mode=ro"',
    'with sqlite3.connect(uri, uri=True) as db:',
    '  rows = db.execute("SELECT id, title, hex(payload), CAST(exact AS TEXT) FROM records ORDER BY id").fetchall()',
    '  integrity = db.execute("PRAGMA integrity_check").fetchall()',
    'print(json.dumps({"rows": rows, "integrity": integrity}, ensure_ascii=False))',
  ].join('\n'), path.join(fixture, 'state.sqlite')], {encoding: 'utf8'});
  return JSON.parse(output);
}

test('real MCP multi-execution JSON and SQLite persistence', {
  skip: !binaryInput && 'set OPENDESK_MCP_BINARY to a current real MCP binary',
  timeout: 120_000,
}, async t => {
  const binary = fs.realpathSync(path.resolve(binaryInput));
  fs.accessSync(binary, fs.constants.X_OK);
  const base = path.join(root, '.runtime/tests/mcp-depth/persistence');
  fs.mkdirSync(base, {recursive: true});
  const evidence = fs.mkdtempSync(path.join(base, 'run-'));
  const fixture = path.join(evidence, 'fixture');
  fs.mkdirSync(fixture);
  fs.writeFileSync(path.join(fixture, 'malformed.json'), '{"broken":');
  const token = crypto.randomUUID();
  const recorder = new EvidenceRecorder(evidence, 'persistence');
  t.diagnostic('evidence: ' + evidence);
  recorder.writeJSON('provenance.json', {binary, binarySha256: sha(fs.readFileSync(binary)),
    scriptPath, scriptSha256: sha(script), docsRoot: root,
    docs: Object.fromEntries(['sqlite', 'file'].map(doc =>
      [doc, sha(fs.readFileSync(path.join(root, 'docs/api', doc + '.md')))])),
    startedAt: new Date().toISOString()});

  async function session(name, sqlite, body) {
    const cwd = path.join(evidence, name);
    fs.mkdirSync(cwd);
    const args = ['--allow-script-execution', '--api-docs-root=' + root];
    if (sqlite) args.push('--script-capabilities=sqlite');
    const client = new MCPStdioClient({binary, args, cwd, recorder, runName: name,
      stdoutPath: path.join(cwd, 'stdout.ndjson'), stderrPath: path.join(cwd, 'stderr.log'), timeoutMs: 25_000});
    try {
      await client.start();
      await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: {name: 'mcp-persistence', version: '1'}});
      await client.notify('notifications/initialized');
      const caps = await call(client, 'tm_runtime_capabilities');
      assert.equal(caps.scripts.capabilities.sqlite, sqlite);
      recorder.writeJSON(name + '-capabilities.json', caps);
      await body(client);
    } finally {
      const exit = await client.close();
      recorder.writeJSON(name + '-exit.json', {exit, protocolViolations: client.protocolViolations});
      assert.deepEqual(client.protocolViolations, []);
      assert.equal(exit.code, 0);
      const events = fs.readFileSync(recorder.ndjsonPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
      assert(!events.some(row => row.run === name && ['shutdown_timeout', 'process_terminate'].includes(row.event)));
    }
  }

  await session('sqlite-authorized', true, async client => {
    await t.test('canonical SQLite and File JSON packets via real MCP', async () => {
      for (const [doc, methods] of [
        ['sqlite', ['SQLite.open', 'db.exec', 'db.query', 'db.batch', 'db.close']],
        ['file', ['File.readJSON', 'File.writeJSON']],
      ]) {
        for (const selector of methods) for (const withTypes of [false, true]) {
          const packet = await call(client, 'tm_api_read', {doc, selector, withTypes});
          assert.equal(packet.report.packetSha256, sha(packet.output));
          assert.equal(packet.report.returned.bytes, Buffer.byteLength(packet.output));
          assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
          if (doc === 'sqlite') {
            assert.match(packet.output, /^## .*$/m);
            for (const label of ['签名', '参数', '返回值', '行为与错误', '示例']) {
              assert(packet.output.includes('**' + label + '**'), selector + ': ' + label);
            }
          }
          recorder.writeJSON('packet-' + selector + (withTypes ? '-types' : '') + '.json', packet);
        }
      }
    });
    const ids = [];
    let original;
    await t.test('seed commits JSON and a successful two-statement batch', async () => {
      ids.push((await run(client, {phase: 'seed', root: fixture, token}, recorder)).id);
      original = fs.readFileSync(path.join(fixture, 'state.json'));
      assert.deepEqual(JSON.parse(original), {token, revision: 1, text: '持久化', values: [null, false, 0]});
      assert(!fs.existsSync(path.join(fixture, 'absent.json')));
      const disk = oracle(fixture);
      recorder.writeJSON('seed-oracle.json', disk);
      assert.deepEqual(disk, {rows: [[1, token, '0080FF', '9007199254740993'], [2, '持久化', '', null]], integrity: [['ok']]});
    });
    await t.test('new execution reads prior data and exercises rollback, ro, cancellation and JSON preservation', async () => {
      const result = await run(client, {phase: 'exercise', root: fixture, token}, recorder);
      ids.push(result.id);
      assert.equal(result.report.errors.length, 15);
      assert.deepEqual(fs.readFileSync(path.join(fixture, 'state.json')), original);
      assert.equal(fs.readFileSync(path.join(fixture, 'malformed.json'), 'utf8'), '{"broken":');
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'next.json'), 'utf8')),
        {token, revision: 2, text: '持久化', values: [null, false, 0]});
      const disk = oracle(fixture);
      recorder.writeJSON('exercise-oracle.json', disk);
      assert.deepEqual(disk, {rows: [[1, token, '0080FF', '9007199254740993'], [2, '已更新', '', null]], integrity: [['ok']]});
    });
    await t.test('third execution reopens persisted JSON and database', async () => {
      ids.push((await run(client, {phase: 'verify', root: fixture, token}, recorder)).id);
      assert.equal(new Set(ids).size, 3);
      assert.deepEqual(fs.readFileSync(path.join(fixture, 'state.json')), original);
      recorder.writeJSON('final-oracle.json', oracle(fixture));
      assert.deepEqual(fs.readdirSync(fixture).sort(), ['malformed.json', 'next.json', 'state.json', 'state.sqlite']);
    });
  });
  await t.test('SQLite authorization does not carry into another host session', async () => {
    await session('ordinary', false, client => run(client, {phase: 'disabled', root: fixture}, recorder));
  });
});
