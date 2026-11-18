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

test('artifact initialization refusal preserves session admission and real Runtime recovery', {
  skip: !binaryInput && 'set OPENDESK_MCP_BINARY to a current MCP binary', timeout: 25_000,
}, async t => {
  const base = path.join(root, '.runtime/tests/mcp-completeness/script-initialization');
  fs.mkdirSync(base, {recursive: true});
  const cwd = fs.mkdtempSync(path.join(base, 'stdio-'));
  t.diagnostic(`evidence: ${cwd}`);
  const binary = fs.realpathSync(binaryInput);
  const script = fs.readFileSync(path.join(root, 'tests/runtime-api/mcp-advanced.js'), 'utf8');
  const recorder = new EvidenceRecorder(cwd, 'script-initialization');
  const client = new MCPStdioClient({binary, args: ['--allow-script-execution'], cwd,
    recorder, runName: 'initialization', timeoutMs: 15_000,
    stdoutPath: path.join(cwd, 'stdout.ndjson'), stderrPath: path.join(cwd, 'stderr.log')});
  recorder.writeJSON('inputs.json', {binary, binarySha256: crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),
    script: 'tests/runtime-api/mcp-advanced.js', input: null});
  let session, backup, placeholder = false;
  const errors = [];
  try {
    await client.start();
    await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'script-initialization', version: '1'}});
    await client.notify('notifications/initialized');
    const statusResponse = await client.request('tools/call', {name: 'tm_status', arguments: {}});
    assert.notEqual(statusResponse.isError, true);
    const processStatus = JSON.parse(statusResponse.content[0].text);
    assert.equal(processStatus.buildIdentity.pid, client.child.pid);
    assert.equal(processStatus.buildIdentity.executable.sha256, crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'));
    assert.equal(processStatus.buildIdentity.executable.evidence, 'disk_file_at_instance_initialization_not_loaded_memory');
    recorder.writeJSON('process-identity.json', processStatus.buildIdentity);
    const sessions = fs.readdirSync(path.join(cwd, '.runtime/mcp'));
    assert.equal(sessions.length, 1);
    session = path.join(cwd, '.runtime/mcp', sessions[0]);
    const saved = `${session}.saved`;
    fs.renameSync(session, saved);
    backup = saved;
    fs.writeFileSync(session, 'controlled non-directory artifact root');
    placeholder = true;
    const refused = await client.request('tools/call', {name: 'tm_script_start', arguments: {script, input: null}});
    recorder.writeJSON('refused.json', refused);
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /create artifact dir/);
    assert(!refused.content[0].text.includes('"executionId"'));
    assert.deepEqual(fs.readdirSync(backup), []);
    assert.deepEqual(await client.request('ping'), {});
    fs.unlinkSync(session);
    placeholder = false;
    fs.renameSync(backup, session);
    backup = null;
    const accepted = await client.request('tools/call', {name: 'tm_script_start', arguments: {script, input: null}});
    assert.notEqual(accepted.isError, true);
    const started = JSON.parse(accepted.content[0].text);
    assert.equal(started.status, 'running');
    assert.match(started.executionId, /-1$/); // Refusal did not consume accepted count.
    recorder.writeJSON('accepted.json', started);
    let final;
    for (let attempt = 0; attempt < 200; attempt++) {
      const response = await client.request('tools/call', {name: 'tm_script_status', arguments: {executionId: started.executionId}});
      const status = JSON.parse(response.content[0].text);
      if (status.status !== 'running') { final = status; assert.notEqual(response.isError, true); break; }
      await delay(25);
    }
    assert(final, 'recovered Runtime must complete');
    assert.equal(final.status, 'succeeded');
    assert.equal(final.result.executionId, started.executionId);
    assert(final.summary.scriptLogs.some(row => {
      try { const value = JSON.parse(row.message); return value.test === 'mcp-advanced' && value.scenario === 'null' && value.input === null; }
      catch { return false; }
    }));
    const disk = JSON.parse(fs.readFileSync(final.result.artifacts.agentSummaryPath, 'utf8'));
    assert.equal(disk.executionId, started.executionId);
    assert.equal(disk.status, 'succeeded');
    assert.equal(fs.readdirSync(session).length, 1);
    recorder.writeJSON('recovered.json', final);
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      if (backup) {
        if (placeholder) fs.unlinkSync(session);
        fs.renameSync(backup, session);
      }
    } catch (error) {
      errors.push(error);
    } finally {
      // A failed fixture restoration must never skip detached child cleanup.
      try {
        const exit = await client.close();
        recorder.writeJSON('exit.json', {exit, protocolViolations: client.protocolViolations});
        assert.deepEqual(exit, {code: 0, signal: null});
        assert.deepEqual(client.protocolViolations, []);
        const events = fs.readFileSync(recorder.ndjsonPath, 'utf8').trim().split('\n').map(JSON.parse);
        assert(!events.some(row => ['shutdown_timeout', 'process_terminate'].includes(row.event)));
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (errors.length) throw new AggregateError(errors, 'initialization gate failed; original and cleanup errors retained');
});
