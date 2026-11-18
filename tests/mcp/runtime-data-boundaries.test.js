'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {setTimeout: delay} = require('node:timers/promises');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'tests/runtime-api/mcp-data-boundaries.js'), 'utf8');
test('MCP file limits, path constants and crypto views', {skip: !process.env.OPENDESK_MCP_BINARY, timeout: 30000}, async t => {
  const binary = fs.realpathSync(process.env.OPENDESK_MCP_BINARY);
  const base = path.join(root, '.runtime/tests/mcp-depth/data-boundaries'); fs.mkdirSync(base, {recursive: true});
  const cwd = fs.mkdtempSync(path.join(base, 'run-')); t.diagnostic(`evidence: ${cwd}`);
  const recorder = new EvidenceRecorder(cwd, 'data-boundaries');
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  recorder.writeJSON('provenance.json', {binary, binarySha256: sha(fs.readFileSync(binary)), scriptSha256: sha(script)});
  const client = new MCPStdioClient({binary, args: ['--allow-script-execution'], cwd, recorder, runName: 'data-boundaries',
    stdoutPath: path.join(cwd, 'stdout.ndjson'), stderrPath: path.join(cwd, 'stderr.log'), timeoutMs: 5000});
  try {
    await client.start();
    await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'data-boundaries', version: '1'}});
    await client.notify('notifications/initialized');
    const call = async (name, args) => JSON.parse((await client.request('tools/call', {name, arguments: args})).content[0].text);
    for (const scenario of ['file-handle', 'path', 'crypto']) await t.test(scenario, async () => {
      const started = await call('tm_script_start', {script, input: {scenario}, timeoutMs: 5000});
      let result;
      const deadline = Date.now() + 8000;
      do {
        result = await call('tm_script_status', {executionId: started.executionId});
        if (['succeeded', 'failed', 'canceled', 'timed_out'].includes(result.status)) break;
        await delay(20);
      } while (Date.now() < deadline);
      recorder.writeJSON(`${scenario}.json`, result);
      assert.equal(result.status, 'succeeded', JSON.stringify(result));
      const report = result.summary.scriptLogs.map(row => { try { return JSON.parse(row.message); } catch { return {}; } })
        .find(row => row.test === 'mcp-data-boundaries');
      if (scenario === 'path') assert.deepEqual(report.observed, {sep: path.sep, delimiter: path.delimiter});
      else if (scenario === 'file-handle') { assert.equal(report.rejected, 24); assert.equal(fs.readFileSync(path.join(cwd, 'limit.txt'), 'utf8'), 'x'); }
      else { assert.deepEqual(report.bytes.slice(0, 4), [90, 90, 90, 90]); assert.deepEqual(report.bytes.slice(8), [90, 90, 90, 90]); }
    });
  } finally {
    assert.equal((await client.close()).code, 0);
    assert.deepEqual(client.protocolViolations, []);
  }
});
