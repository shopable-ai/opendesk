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
const binaryInput = process.env.OPENDESK_MCP_BINARY;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const terminal = new Set(['succeeded', 'failed', 'timed_out', 'canceled']);
// Regression selections for this repair, not a public method catalog.
const selections = {
  file: ['appendBytes', 'create', 'createIfNotExists', 'getExtension', 'getHumanReadableSize', 'getName',
    'getNameWithoutExtension', 'getSimplifiedPath', 'remove', 'removeDir', 'rename', 'renameWithoutExtension'].map(x => `File.${x}`),
  'image-color': ['findBlueChannel', 'findGreenChannel', 'findRedChannel', 'toHSL', 'toHSLA', 'toRGB', 'toRGBA'].map(x => `ImageColor.${x}`),
  page: ['page.ensureMacPermissions', 'page.waitForNavigation'],
  system: ['System.getNetworkInterfaces', 'System.getPowerInfo'],
  sound: ['playback.isPlaying', 'playback.startedAt'],
  ui: ['FloatingWindow.id'], http: ['axios.defaults', 'axios.request'], webhook: ['handle.name'],
};

async function call(client, name, args = {}) {
  const response = await client.request('tools/call', {name, arguments: args});
  assert.notEqual(response.isError, true, JSON.stringify(response));
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0].type, 'text');
  const value = JSON.parse(response.content[0].text);
  assert.equal(value.ok, true);
  return value;
}

async function run(client, file, input) {
  const script = fs.readFileSync(path.join(root, 'tests/runtime-api', file), 'utf8');
  const started = await call(client, 'tm_script_start', {script, input, timeoutMs: 10_000});
  assert.equal(started.status, 'running');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await client.request('tools/call', {name: 'tm_script_status', arguments: {executionId: started.executionId}});
    const status = JSON.parse(response.content[0].text);
    if (terminal.has(status.status)) {
      assert.equal(status.status, 'succeeded', JSON.stringify(status));
      assert.notEqual(response.isError, true);
      assert.equal(status.result.executionId, started.executionId);
      assert.equal(status.summary.executionId, started.executionId);
      // Independently read the persisted owner result, beyond MCP's response.
      const disk = JSON.parse(fs.readFileSync(path.resolve(client.cwd, status.result.artifacts.agentSummaryPath), 'utf8'));
      assert.equal(disk.executionId, started.executionId);
      assert.equal(disk.status, 'succeeded');
      const marker = path.basename(file, '.js');
      assert(status.summary.scriptLogs.some(row => {
        try { return JSON.parse(row.message).test === marker; } catch { return false; }
      }), `missing ${marker} completion report`);
      return status;
    }
    await delay(25);
  }
  assert.fail('Runtime did not terminate');
}

test('repaired canonical contracts through real MCP and safe Runtime fixtures', {
  skip: !binaryInput && 'set OPENDESK_MCP_BINARY to a current real MCP binary', timeout: 180_000,
}, async t => {
  const binary = fs.realpathSync(binaryInput);
  const base = path.join(root, '.runtime/tests/mcp-contracts');
  fs.mkdirSync(base, {recursive: true});
  const evidence = fs.mkdtempSync(path.join(base, `${Date.now()}-`));
  const recorder = new EvidenceRecorder(evidence, 'runtime-contracts');
  t.diagnostic(`evidence: ${evidence}`);
  const scripts = ['mcp-file.js', 'mcp-image-color.js', 'mcp-system.js', 'mcp-http-webhook.js',
    'mcp-resource-boundaries.js', 'mcp-floating-id.js', 'mcp-page-wait.js'];
  recorder.writeJSON('provenance.json', {binary, binarySha256: sha(fs.readFileSync(binary)), docsRoot: root,
    scripts: Object.fromEntries(scripts.map(file => [file, sha(fs.readFileSync(path.join(root, 'tests/runtime-api', file)))])),
    startedAt: new Date().toISOString()});

  async function session(name, capabilities, body) {
    const cwd = path.join(evidence, name);
    fs.mkdirSync(cwd);
    const args = ['--allow-script-execution', `--api-docs-root=${root}`];
    if (capabilities) args.push(`--script-capabilities=${capabilities}`);
    const client = new MCPStdioClient({binary, args, cwd, recorder, runName: name,
      stdoutPath: path.join(cwd, 'stdout.ndjson'), stderrPath: path.join(cwd, 'stderr.log'), timeoutMs: 20_000});
    try {
      await client.start();
      await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'runtime-contracts', version: '1'}});
      await client.notify('notifications/initialized');
      await body(client, cwd);
    } finally {
      const exit = await client.close();
      recorder.writeJSON(`${name}-exit.json`, {exit, protocolViolations: client.protocolViolations});
      assert.deepEqual(client.protocolViolations, []);
      assert.equal(exit.code, 0);
      const events = fs.readFileSync(recorder.ndjsonPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      assert(!events.some(row => row.run === name && ['shutdown_timeout', 'process_terminate'].includes(row.event)));
    }
  }

  await session('ordinary', '', async (client, cwd) => {
    await t.test('all 29 repaired selections return complete canonical packets', async () => {
      assert.equal(Object.values(selections).flat().length, 29);
      for (const [doc, methods] of Object.entries(selections)) {
        for (const selector of methods) for (const withTypes of [false, true]) {
          const packet = await call(client, 'tm_api_read', {doc, selector, withTypes});
          assert.equal(packet.report.packetSha256, sha(packet.output));
          assert.equal(packet.report.returned.bytes, Buffer.byteLength(packet.output));
          assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
          assert(packet.output.includes(`## ${selector}`), selector);
          recorder.writeJSON(`packet-${selector}${withTypes ? '-types' : ''}.json`, packet);
        }
      }
    });
    await t.test('FloatingWindow packets include their shared error declaration', async () => {
      const selectors = ['close', 'getState', 'hide', 'onError', 'run', 'setAlwaysOnTop',
        'setDraggable', 'setPlacement', 'setPosition', 'show', 'waitUntilClosed'];
      for (const member of selectors) {
        const selector = `FloatingWindow.${member}`;
        const packet = await call(client, 'tm_api_read', {doc: 'ui', selector, withTypes: true});
        assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
        assert.match(packet.output, /interface ClawdeskUIError extends Error/);
        recorder.writeJSON(`packet-${selector}-types.json`, packet);
      }
    });
    await t.test('File mutations, errors and independent filesystem postconditions', async () => {
      const fixture = path.join(cwd, 'fixture');
      fs.mkdirSync(fixture);
      fs.mkdirSync(path.join(fixture, 'directory-referent'));
      fs.writeFileSync(path.join(fixture, 'directory-referent/kept'), 'unchanged');
      fs.writeFileSync(path.join(fixture, 'file-referent'), 'unchanged');
      fs.writeFileSync(path.join(fixture, 'copy-source'), 'copy-fixture-original');
      fs.writeFileSync(path.join(fixture, 'copy-destination'), 'longer previous destination content');
      fs.linkSync(path.join(fixture, 'copy-source'), path.join(fixture, 'copy-hard-link'));
      fs.symlinkSync(path.join(fixture, 'copy-source'), path.join(fixture, 'copy-symbolic-link'));
      fs.symlinkSync(path.join(fixture, 'file-referent'), path.join(fixture, 'file-link'));
      fs.symlinkSync(path.join(fixture, 'directory-referent'), path.join(fixture, 'directory-link'), 'dir');
      const status = await run(client, 'mcp-file.js', {root: fixture});
      recorder.writeJSON('file-result.json', status);
      assert.deepEqual([...fs.readFileSync(path.join(fixture, 'kept.bin'))], [1, 2, 128, 255, 0, 65]);
      assert.deepEqual([...fs.readFileSync(path.join(fixture, 'renamed.final'))], [9, 8]);
      assert.equal(fs.statSync(path.join(fixture, 'created.txt')).size, 0);
      assert.equal(fs.statSync(path.join(fixture, 'empty.bin')).size, 0);
      assert(fs.statSync(path.join(fixture, 'directory-after')).isDirectory());
      for (const removed of ['source.tar.gz', 'renamed.gz', 'removed-file', 'removed-empty-dir', 'tree', 'removeDir-file', 'file-link', 'directory-link']) {
        assert(!fs.existsSync(path.join(fixture, removed)), removed);
      }
      assert.equal(fs.readFileSync(path.join(fixture, 'file-referent'), 'utf8'), 'unchanged');
      for (const file of ['copy-source', 'copy-hard-link', 'copy-symbolic-link', 'copy-destination']) {
        assert.equal(fs.readFileSync(path.join(fixture, file), 'utf8'), 'copy-fixture-original');
      }
      assert.equal(fs.statSync(path.join(fixture,'copy-source')).ino,fs.statSync(path.join(fixture,'copy-hard-link')).ino);
      assert.equal(fs.readFileSync(path.join(fixture, 'directory-referent/kept'), 'utf8'), 'unchanged');
    });
    await t.test('ImageColor pure data contracts', async () => {
      recorder.writeJSON('image-color-result.json', await run(client, 'mcp-image-color.js', {}));
    });
    await t.test('System information without retaining interface identifiers', async () => {
      recorder.writeJSON('system-result.json', await run(client, 'mcp-system.js', {}));
    });
    await t.test('page navigation compatibility timeout without a desktop action', async () => {
      recorder.writeJSON('page-wait-result.json', await run(client, 'mcp-page-wait.js', {}));
    });
    await t.test('axios request and defaults against an independent loopback HTTP fixture', async () => {
      const requests = [];
      const server = http.createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const row = {method: request.method, url: request.url, body: raw ? JSON.parse(raw) : null,
            header: request.headers['x-contract-fixture']};
          requests.push(row);
          response.writeHead(request.url === '/failure' ? 503 : 200, {'content-type': 'application/json'});
          response.end(JSON.stringify(row));
        });
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        recorder.writeJSON('http-result.json', await run(client, 'mcp-http-webhook.js',
          {case: 'http', baseURL: `http://127.0.0.1:${server.address().port}`}));
        assert.equal(requests.length, 7);
        recorder.writeJSON('http-independent-requests.json', requests);
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    });
    await t.test('conditional resource authorization remains distinct from availability', async () => {
      const caps = await call(client, 'tm_runtime_capabilities');
      for (const name of ['custom-ui', 'native-extensions']) {
        assert.equal(caps.scripts.capabilities[name], false);
        assert.equal(caps.scripts.conditionalCapabilities[name].enabled, false);
        assert.equal(caps.scripts.conditionalCapabilities[name].checked, false);
        assert(!Object.hasOwn(caps.scripts.conditionalCapabilities[name], 'available'));
      }
      recorder.writeJSON('resources-disabled.json', await run(client, 'mcp-resource-boundaries.js', {enabled: false}));
    });
  });
  await session('resources-authorized', 'custom-ui,native-extensions', async client => {
    await t.test('FloatingWindow IDs in an authorized execution without creating native windows', async () => {
      recorder.writeJSON('floating-id-result.json', await run(client, 'mcp-floating-id.js', {}));
    });
    await t.test('authorized resources report unprobed and support inert diagnostics', async () => {
      const caps = await call(client, 'tm_runtime_capabilities');
      for (const name of ['custom-ui', 'native-extensions']) {
        assert.equal(caps.scripts.capabilities[name], true);
        assert.equal(caps.scripts.conditionalCapabilities[name].enabled, true);
        assert.equal(caps.scripts.conditionalCapabilities[name].checked, false);
        assert(!Object.hasOwn(caps.scripts.conditionalCapabilities[name], 'available'));
      }
      recorder.writeJSON('resources-authorized.json', await run(client, 'mcp-resource-boundaries.js', {enabled: true}));
    });
  });
  await session('webhook-authorized', 'webhook', async client => {
    await t.test('Webhook handle name normalization, collision and close lifecycle', async () => {
      recorder.writeJSON('webhook-result.json', await run(client, 'mcp-http-webhook.js',
        {case: 'webhook', webhookHostAuthorized: true}));
    });
  });
});
