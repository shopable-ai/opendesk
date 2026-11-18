'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { MCPStdioClient, EvidenceRecorder } = require('./tools/macos-smoke/main.js');
const { readContract } = require('../../scripts/api-docs.js');

const root = path.resolve(__dirname, '../..');
const binaryInput = process.env.OPENDESK_MCP_BINARY;
const script = fs.readFileSync(path.join(root, 'tests/runtime-api/mcp-advanced.js'), 'utf8');
const scriptTools = ['tm_script_start', 'tm_script_status', 'tm_script_cancel'];
const terminal = new Set(['succeeded', 'failed', 'timed_out', 'canceled']);
const payload = {
  nested: { text: '中文 fixture', number: 42, flag: false, nil: null },
  array: [0, '', true, null, { value: '001' }],
};

async function frame(client, name, args = {}) {
  return client.request('tools/call', { name, arguments: args });
}

function unpack(response) {
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0].type, 'text');
  return JSON.parse(response.content[0].text);
}

async function call(client, name, args = {}) {
  const response = await frame(client, name, args);
  assert.notEqual(response.isError, true, JSON.stringify(response));
  const value = unpack(response);
  assert.equal(value.ok, true, JSON.stringify(value));
  return value;
}

async function rejected(client, name, args) {
  // Domain refusals are tool errors, not malformed JSON-RPC arguments.
  const response = await frame(client, name, args);
  assert.equal(response.isError, true, JSON.stringify(response));
}

async function waitStatus(client, executionId, predicate = value => terminal.has(value.status)) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await frame(client, 'tm_script_status', { executionId });
    const value = unpack(response);
    assert.equal(value.executionId, executionId);
    if (terminal.has(value.status)) {
      assert.equal(value.ok, value.status === 'succeeded');
      assert.equal(response.isError === true, value.status !== 'succeeded');
      assert.equal(value.result.status, value.status);
      assert.equal(value.summary.status, value.status);
      assert.equal(value.result.executionId, executionId);
      assert.equal(value.summary.executionId, executionId);
    }
    if (predicate(value)) return value;
    assert(!terminal.has(value.status), `execution ended before expected observation: ${JSON.stringify(value)}`);
    await delay(30);
  }
  assert.fail(`execution ${executionId} did not reach expected state in 15s`);
}

async function start(client, input, timeoutMs = 10_000) {
  const value = await call(client, 'tm_script_start', { script, input, timeoutMs });
  assert.equal(value.status, 'running');
  assert.equal(typeof value.executionId, 'string');
  assert(value.executionId.length > 0);
  return value.executionId;
}

function reports(value) {
  return (value.summary.scriptLogs || []).flatMap(log => {
    try {
      const parsed = JSON.parse(log.message);
      return parsed.test === 'mcp-advanced' ? [parsed] : [];
    } catch { return []; }
  });
}

test('advanced MCP real binary and formal Runtime contracts', {
  skip: !binaryInput && 'set OPENDESK_MCP_BINARY to a current real MCP binary',
  timeout: 180_000,
}, async t => {
  const binary = fs.realpathSync(path.resolve(binaryInput));
  fs.accessSync(binary, fs.constants.X_OK);
  const evidenceBase = path.join(root, '.runtime/tests/mcp-advanced');
  fs.mkdirSync(evidenceBase, { recursive: true });
  const evidence = fs.mkdtempSync(path.join(evidenceBase, `${Date.now()}-${process.pid}-`));
  t.diagnostic(`evidence: ${evidence}`);
  const recorder = new EvidenceRecorder(evidence, 'advanced-runtime');
  recorder.writeJSON('provenance.json', { binary, binarySha256: hash(fs.readFileSync(binary)),
    scriptSha256: hash(script), docsRoot: root, startedAt: new Date().toISOString() });
  const authorized = ['--allow-script-execution', '--script-capabilities=sqlite', `--api-docs-root=${root}`];

  async function session(name, args, body) {
    const cwd = path.join(evidence, name);
    fs.mkdirSync(cwd);
    const client = new MCPStdioClient({ binary, args, cwd, timeoutMs: 20_000,
      runName: name, recorder, stdoutPath: path.join(cwd, 'stdout.ndjson'),
      stderrPath: path.join(cwd, 'stderr.log') });
    try {
      await client.start();
      const initialized = await client.request('initialize', { protocolVersion: '2024-11-05',
        capabilities: {}, clientInfo: { name: 'mcp-advanced-test', version: '1.0.0' } });
      assert(initialized.serverInfo);
      await client.notify('notifications/initialized');
      await body(client, cwd);
    } finally {
      const exit = await client.close();
      recorder.writeJSON(`${name}-exit.json`, { exit, protocolViolations: client.protocolViolations });
      assert.deepEqual(client.protocolViolations, [], 'stdout must contain only valid JSON-RPC frames');
      assert.equal(exit.code, 0, 'server must exit cleanly on EOF without forced termination');
      assert(!fs.readFileSync(recorder.ndjsonPath, 'utf8').split('\n').filter(Boolean)
        .map(line => JSON.parse(line)).some(row => row.run === name &&
          ['shutdown_timeout', 'process_terminate'].includes(row.event)), 'EOF cleanup must not require a signal');
    }
  }

  for (const [name, args] of [['default', []], ['readonly', ['--read-only']]]) {
    await t.test(`${name} cannot discover or invoke scripts`, () => session(name, args, async client => {
      const names = (await client.request('tools/list')).tools.map(tool => tool.name);
      for (const tool of scriptTools) assert(!names.includes(tool));
      assert(!names.includes('tm_api_read') && !names.includes('tm_api_catalog'));
      const capabilities = await call(client, 'tm_runtime_capabilities');
      assert.equal(capabilities.scripts.enabled, false);
      assert.equal(capabilities.documentation.configured, false);
      for (const [tool, args] of [
        ['tm_script_start', { script }], ['tm_script_status', { executionId: 'unknown' }],
        ['tm_script_cancel', { executionId: 'unknown' }],
      ]) await assert.rejects(frame(client, tool, args), { code: -32602 });
    }));
  }

  await t.test('read-only host can discover canonical docs without gaining script execution', () =>
    session('readonly-docs', ['--read-only', `--api-docs-root=${root}`], async client => {
      const names = (await client.request('tools/list')).tools.map(tool => tool.name);
      assert(names.includes('tm_api_catalog') && names.includes('tm_api_read'));
      for (const tool of scriptTools) assert(!names.includes(tool));
      const caps = await call(client, 'tm_runtime_capabilities');
      assert.equal(caps.documentation.configured, true);
      assert.equal(caps.scripts.enabled, false);
      assert((await call(client, 'tm_api_catalog')).groups.some(group => group.id === 'data'));
      const packet = await call(client, 'tm_api_read', { doc: 'path', selector: 'path.resolve' });
      assert.equal(packet.output, readContract(root, 'path', 'path.resolve').output);
      await assert.rejects(frame(client, 'tm_script_start', { script, input: null }), { code: -32602 });
    }));

  await t.test('capabilities, discovery, canonical packets and hostile selections', () =>
    session('docs', authorized, async client => {
      const tools = (await client.request('tools/list')).tools;
      for (const name of [...scriptTools, 'tm_api_read', 'tm_api_catalog', 'tm_runtime_capabilities']) {
        const tool = tools.find(tool => tool.name === name);
        assert(tool, name);
        assert.equal(tool.inputSchema.additionalProperties, false);
      }
      const caps = await call(client, 'tm_runtime_capabilities');
      assert.equal(caps.scripts.enabled, true);
      assert.equal(caps.scripts.capabilities.sqlite, true);
      assert.equal(caps.scripts.capabilities.command, false);
      assert.equal(caps.scripts.capabilities.accessibility, false);
      assert.equal(caps.scripts.maxActive, 1);
      assert.equal(caps.scripts.maxExecutionsPerSession, 64);
      assert.equal(caps.scripts.maxScriptBytes, 128 * 1024);
      assert.equal(caps.scripts.defaultTimeoutMs, 30_000);
      assert.equal(caps.documentation.configured, true);
      const catalog = await call(client, 'tm_api_catalog');
      assert(catalog.groups.length > 0);
      assert.equal(new Set(catalog.groups.map(group => group.id)).size, catalog.groups.length);
      for (const group of catalog.groups) {
        for (const field of ['id', 'title', 'purpose']) assert.equal(typeof group[field], 'string');
      }
      assert(catalog.groups.some(group => group.id === 'data'));
      const data = await call(client, 'tm_api_catalog', { group: 'data' });
      assert.equal(typeof data.catalog, 'string');
      assert.match(data.catalog, /File.readJSON/);
      for (const selection of [
        { doc: 'file', selector: 'File.readJSON' },
        { doc: 'path', selector: 'path.resolve', withTypes: true },
      ]) {
        const packet = await call(client, 'tm_api_read', selection);
        assert.match(packet.output, /<!-- END_API_READING_PACKET: only a packet with this marker is complete -->\s*$/);
        assert.equal(hash(packet.output), packet.report.packetSha256);
        assert.equal(Buffer.byteLength(packet.output), packet.report.returned.bytes);
        // JSON-RPC object key order is immaterial (Go reorders report keys).
        const canonical = readContract(root, selection.doc, selection.selector, selection.withTypes === true);
        assert.equal(packet.output, canonical.output);
        assert.deepEqual(packet.report, canonical.report);
        assert.equal(Object.keys(packet.toolchain).length, 3);
        for (const [file, digest] of Object.entries(packet.toolchain)) {
          assert(['scripts/api-docs.js', 'scripts/api-docs-map.js', 'scripts/api-docs-mcp.js'].includes(file));
          assert.equal(hash(fs.readFileSync(path.join(root, file))), digest);
        }
        recorder.writeJSON(`packet-${selection.doc}.json`, packet);
      }
      for (const [name, args] of [
        ['tm_api_catalog', { group: 'unknown-group' }], ['tm_api_catalog', { group: '../data' }],
        ['tm_api_read', { doc: '../file', selector: 'File.readJSON' }],
        ['tm_api_read', { doc: 'unknown-doc', selector: '#unknown' }],
        ['tm_api_read', { doc: 'file', selector: 'File.invented' }],
      ]) await rejected(client, name, args);
      for (const [name, args] of [
        ['tm_runtime_capabilities', { sqlite: true }], ['tm_api_catalog', { root }],
        ['tm_api_read', { doc: 'file', selector: 'File.readJSON', withTypes: 'true' }],
      ]) await assert.rejects(frame(client, name, args), { code: -32602 });
    }));

  await t.test('formal Runtime JS and artifact provenance', () =>
    session('runtime', authorized, async (client, cwd) => {
      const id = await start(client, { scenario: 'runtime', payload });
      const result = await waitStatus(client, id);
      assert.equal(result.status, 'succeeded', JSON.stringify(result));
      const [report] = reports(result);
      assert(report && report.ok);
      assert.equal(report.executionId, id);
      assert.deepEqual(report.input, payload);
      const fixture = path.resolve(cwd, report.fixture);
      const artifactDir = path.resolve(cwd, report.artifactDir);
      assert.equal(path.dirname(fixture), artifactDir);
      assert(artifactDir.startsWith(`${cwd}${path.sep}`));
      assert.deepEqual(JSON.parse(fs.readFileSync(fixture, 'utf8')), payload);
      assert.equal(result.result.scriptHash, hash(script));
      recorder.writeJSON('runtime-result.json', result);
    }));

  await t.test('a separate execution preserves explicit JSON null input', () =>
    session('null-input', authorized, async client => {
      const result = await waitStatus(client, await start(client, null));
      recorder.writeJSON('null-input-result.json', result);
      assert.equal(result.status, 'succeeded', JSON.stringify(result));
      assert.deepEqual(reports(result), [{ test: 'mcp-advanced', scenario: 'null', input: null }]);
    }));

  await t.test('JS failures and deadline produce real unsuccessful terminal results', () =>
    session('failures', authorized, async client => {
      for (const [scenario, expected, marker] of [
        ['sync-error', 'failed', 'mcp-advanced-sync-error'],
        ['rejection', 'failed', 'mcp-advanced-rejection'], ['timeout', 'timed_out'],
      ]) {
        const id = await start(client, { scenario }, scenario === 'timeout' ? 500 : 10_000);
        const value = await waitStatus(client, id);
        assert.equal(value.status, expected, JSON.stringify(value));
        if (marker) assert.match(JSON.stringify({ error: value.result.error, errors: value.summary.errors }), new RegExp(marker));
        recorder.writeJSON(`${scenario}-result.json`, value);
      }
    }));

  await t.test('SQLite requires the host capability switch', () =>
    session('sqlite-disabled', ['--allow-script-execution'], async client => {
      const caps = await call(client, 'tm_runtime_capabilities');
      assert.equal(caps.scripts.capabilities.sqlite, false);
      const value = await waitStatus(client, await start(client, { scenario: 'sqlite-disabled' }));
      assert.equal(value.status, 'succeeded', JSON.stringify(value));
      assert.deepEqual(reports(value), [{ test: 'mcp-advanced', scenario: 'sqlite-disabled', sqliteEnabled: false }]);
    }));

  await t.test('summary persistence failure retains its ID, terminates and releases the active slot', () =>
    session('finalize-error', authorized, async (client, cwd) => {
      const id = await start(client, { scenario: 'finalize-error' });
      const value = await waitStatus(client, id);
      assert.equal(value.status, 'failed', JSON.stringify(value));
      assert.equal(value.executionId, id);
      assert.equal(value.result.executionId, id);
      assert.equal(value.summary.executionId, id);
      assert(value.result.finishedAt && value.summary.finishedAt);
      assert.match(value.result.error, /agent_summary\.json/);
      const summaryPath = path.resolve(cwd, value.result.artifacts.agentSummaryPath);
      assert(summaryPath.startsWith(`${cwd}${path.sep}`));
      assert(fs.statSync(summaryPath).isDirectory(), 'fixture really blocks the summary file path');
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(summaryPath, 'block.json'), 'utf8')), { test: true });
      assert(reports(value).some(row => row.scenario === 'finalize-error' && row.ready && row.executionId === id));
      recorder.writeJSON('finalize-error-result.json', value);
      const nextID = await start(client, { scenario: 'runtime', payload });
      assert.notEqual(nextID, id);
      assert.equal((await waitStatus(client, nextID)).status, 'succeeded');
      assert.equal((await waitStatus(client, id)).status, 'failed', 'failure remains terminal after later execution');
      // session's finally verifies EOF exit 0 with no termination signal.
    }));

  await t.test('default Command options use empty execution env rather than MCP host env', async () => {
    const key = 'OPENDESK_MCP_TEST_SENTINEL';
    const hadKey = Object.hasOwn(process.env, key);
    const previous = process.env[key];
    try {
      // MCPStdioClient spawns the real binary with process.env. Only this
      // synthetic variable changes, and the original value is never logged.
      process.env[key] = `mcp-advanced-synthetic-${crypto.randomUUID()}`;
      await session('command-env', ['--allow-script-execution', '--script-capabilities=command'], async client => {
        const caps = await call(client, 'tm_runtime_capabilities');
        assert.equal(caps.scripts.capabilities.command, true);
        const value = await waitStatus(client, await start(client, { scenario: 'command-env' }));
        assert.equal(value.status, 'succeeded', JSON.stringify(value));
        assert.deepEqual(reports(value), [{ test: 'mcp-advanced', scenario: 'command-env',
          exitCode: 0, stdout: 'unset', stderr: '' }]);
        recorder.writeJSON('command-env-result.json', value);
      });
    } finally {
      if (hadKey) process.env[key] = previous;
      else delete process.env[key];
    }
  });

  for (const scenario of ['agent-finalize-script-error', 'legacy-finalize-script-error']) {
    await t.test(`${scenario} retains both script and persistence errors`, () =>
      session(scenario, authorized, async client => {
        const id = await start(client, { scenario });
        const value = await waitStatus(client, id);
        assert.equal(value.status, 'failed');
        assert.match(value.result.error, /mcp-advanced-primary-script-error/);
        const filename = scenario.startsWith('legacy') ? 'summary.json' : 'agent_summary.json';
        assert(value.result.error.includes(filename), value.result.error);
        assert(value.summary.errors.some(error => error.message.includes('mcp-advanced-primary-script-error')));
        assert(value.summary.errors.some(error => error.message.includes(filename)));
        assert.equal((await waitStatus(client, await start(client, null))).status, 'succeeded');
        recorder.writeJSON(`${scenario}-result.json`, value);
      }));
  }

  await t.test('oversized successful output is refused whole and leaves protocol responsive', () =>
    session('output-budget', authorized, async client => {
      const id = await start(client, { scenario: 'large-output' });
      const deadline = Date.now() + 15_000;
      let value;
      while (Date.now() < deadline) {
        const response = await frame(client, 'tm_script_status', { executionId: id });
        value = unpack(response);
        assert.equal(value.executionId, id);
        if (terminal.has(value.status)) {
          assert.equal(value.status, 'succeeded');
          assert.equal(response.isError, true);
          assert.equal(value.ok, false);
          assert.match(value.error, /^script result exceeds response budget/);
          assert(value.artifacts.agentSummaryPath);
          assert(!Object.hasOwn(value, 'summary'), 'no partial summary');
          assert(!Object.hasOwn(value, 'result'), 'no partial result');
          break;
        }
        await delay(30);
      }
      assert(value && value.status === 'succeeded', 'large output did not finish');
      assert.deepEqual(await client.request('ping'), {});
      recorder.writeJSON('output-budget-result.json', value);
    }));

  await t.test('unknown IDs and caller authorization fields are refused', () =>
    session('validation', authorized, async client => {
      for (const name of ['tm_script_status', 'tm_script_cancel']) {
        await rejected(client, name, { executionId: 'not-owned-by-this-session' });
      }
      for (const [field, value] of Object.entries({ capabilities: { command: true },
        allowCommand: true, allowSQLite: true, scriptCapabilities: ['command'],
        env: { TEST: 'forbidden' }, workdir: root, artifactDir: root, scriptPath: '/tmp/never.js' })) {
        await assert.rejects(frame(client, 'tm_script_start', { script, [field]: value }), { code: -32602 });
      }
      for (const timeoutMs of [1.5, '100']) {
        await assert.rejects(frame(client, 'tm_script_start', { script, timeoutMs }), { code: -32602 });
      }
      for (const timeoutMs of [0, -1, 300001]) {
        await rejected(client, 'tm_script_start', { script, timeoutMs });
      }
      for (const args of [{ script: '' }, { script: ' '.repeat(128 * 1024 + 1) },
        { script, input: 'x'.repeat(128 * 1024) }]) {
        await rejected(client, 'tm_script_start', args);
      }
    }));

  await t.test('CPU cancellation, busy refusal, and session ownership', () =>
    session('cancel', authorized, async client => {
      const id = await start(client, { scenario: 'cancel' }, 30_000);
      await waitStatus(client, id, value => reports(value).some(row => row.ready));
      await rejected(client, 'tm_script_start', { script, input: null });
      await session('foreign-session', authorized, async other => {
        for (const name of ['tm_script_status', 'tm_script_cancel']) {
          await rejected(other, name, { executionId: id });
        }
      });
      const canceled = await call(client, 'tm_script_cancel', { executionId: id });
      assert.equal(canceled.executionId, id);
      assert.equal(typeof canceled.cancelRequested, 'boolean');
      assert(canceled.status === 'canceling' || terminal.has(canceled.status));
      const result = await waitStatus(client, id);
      assert.equal(result.status, 'canceled', JSON.stringify(result));
      recorder.writeJSON('cancel-result.json', result);
      const repeated = await call(client, 'tm_script_cancel', { executionId: id });
      assert.equal(repeated.status, 'canceled');
      const nextID = await start(client, { scenario: 'runtime', payload });
      assert.notEqual(nextID, id);
      assert.equal((await waitStatus(client, nextID)).status, 'succeeded');
    }));

  await t.test('session execution limit refuses new work and retains previous terminal records', () =>
    session('session-limit', ['--allow-script-execution'], async client => {
      const caps = await call(client, 'tm_runtime_capabilities');
      assert.equal(caps.scripts.maxExecutionsPerSession, 64);
      const ids = [];
      for (let index = 0; index < 64; index++) {
        const id = await start(client, null);
        assert(!ids.includes(id), 'each accepted execution has a fresh ID');
        ids.push(id);
        assert.equal((await waitStatus(client, id)).status, 'succeeded');
      }
      const refusal = await frame(client, 'tm_script_start', { script, input: null });
      assert.equal(refusal.isError, true);
      assert.match(refusal.content[0].text, /session execution limit/);
      assert.equal((await waitStatus(client, ids[0])).status, 'succeeded');
      assert.equal((await waitStatus(client, ids[63])).status, 'succeeded');
      assert.deepEqual(await client.request('ping'), {});
      recorder.writeJSON('session-limit-result.json', { ids, refusal });
    }));

  await t.test('stdin EOF cancels CPU work and persists completed cleanup summaries', async () => {
    let artifactPaths;
    let executionId;
    let cwd;
    await session('eof', authorized, async (client, workingDirectory) => {
      cwd = workingDirectory;
      executionId = await start(client, { scenario: 'eof' }, 30_000);
      const ready = await waitStatus(client, executionId, value => reports(value).some(row => row.ready));
      artifactPaths = ready.result.artifacts;
      assert(artifactPaths.agentSummaryPath && artifactPaths.summaryPath);
      // session.close sends EOF. No explicit cancel and no shutdown signal.
    });
    const summary = JSON.parse(fs.readFileSync(path.resolve(cwd, artifactPaths.agentSummaryPath), 'utf8'));
    const legacy = JSON.parse(fs.readFileSync(path.resolve(cwd, artifactPaths.summaryPath), 'utf8'));
    assert.equal(summary.executionId, executionId);
    assert.equal(summary.status, 'canceled');
    assert(summary.finishedAt);
    assert.equal(legacy.execution_id, executionId);
    assert.equal(legacy.status, 'canceled');
    assert.equal(legacy.success, false);
    recorder.writeJSON('eof-cleanup.json', { summary, legacy });
  });
});

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
