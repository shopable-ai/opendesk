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
const scriptPath = path.join(root, 'tests/runtime-api/mcp-image-depth.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const terminal = new Set(['succeeded', 'failed', 'timed_out', 'canceled']);

// Independent PNG writer: Python standard library only. Every opaque RGB
// pixel and rectangle is caller-owned, with hand-known expected coordinates.
const fixtureGenerator = String.raw`
import json, struct, sys, zlib
from pathlib import Path
root = Path(sys.argv[1])
def png(name, width, height, rectangles):
    pixels = [[(255, 255, 255) for x in range(width)] for y in range(height)]
    for x, y, w, h, color in rectangles:
        for row in range(y, y+h):
            for col in range(x, x+w):
                pixels[row][col] = color
    raw = b"".join(b"\0" + bytes(v for pixel in row for v in pixel) for row in pixels)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind+data) & 0xffffffff)
    output = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    output += chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    (root / (name + ".png")).write_bytes(output)
red, blue, green = (255,0,0), (0,0,255), (0,255,0)
png("blocks", 32, 24, [(8,6,8,6,red), (24,16,6,6,red)])
png("blue", 4, 4, [(0,0,4,4,blue)])
png("green", 4, 4, [(0,0,4,4,green)])
png("near-blue", 4, 4, [(0,0,4,4,(1,0,255))])
png("tie-y", 32, 24, [(20,14,4,4,blue), (3,2,4,4,green)])
png("tie-x", 32, 24, [(20,2,4,4,blue), (3,2,4,4,green)])
png("single", 32, 24, [(20,14,4,4,blue), (18,2,4,4,blue), (12,2,4,4,blue)])
png("scale-position", 32, 24, [(2,2,2,2,blue), (20,14,4,4,blue)])
print(json.dumps({"generator": "python-stdlib-png", "size": [32,24],
                  "blocks": [[8,6,8,6,48],[24,16,6,6,36]],
                  "blue": [0,0,255], "green": [0,255,0]}))
`;

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
      recorder.writeJSON(input.scenario + '-result.json', status);
      assert.equal(status.result.executionId, started.executionId);
      assert.equal(status.summary.executionId, started.executionId);
      assert.equal(status.result.scriptHash, sha(script));
      const disk = JSON.parse(fs.readFileSync(path.resolve(client.cwd, status.result.artifacts.agentSummaryPath), 'utf8'));
      assert.equal(disk.executionId, started.executionId);
      assert.equal(disk.status, status.status);
      const reports = status.summary.scriptLogs.flatMap(row => {
        try {
          const report = JSON.parse(row.message);
          return report.test === 'mcp-image-depth' ? [report] : [];
        } catch { return []; }
      });
      assert.equal(reports.length, 1, 'formal JS must retain its pixel observations even on failure');
      recorder.writeJSON(input.scenario + '-observations.json', reports[0]);
      assert.equal(status.status, 'succeeded', JSON.stringify(reports[0]));
      assert.notEqual(response.isError, true);
      assert.equal(reports[0].ok, true);
      assert.equal(reports[0].executionId, started.executionId);
      assert.equal(reports[0].scenario, input.scenario);
      return reports[0];
    }
    await delay(25);
  }
  assert.fail('image execution did not terminate');
}

test('real MCP synthetic-image coordinates, template priority and layout compatibility', {
  skip: !binaryInput && 'set OPENDESK_MCP_BINARY to a current real MCP binary',
  timeout: 120_000,
}, async t => {
  const binary = fs.realpathSync(path.resolve(binaryInput));
  fs.accessSync(binary, fs.constants.X_OK);
  const base = path.join(root, '.runtime/tests/mcp-depth/image');
  fs.mkdirSync(base, {recursive: true});
  const evidence = fs.mkdtempSync(path.join(base, 'run-'));
  const fixture = path.join(evidence, 'fixture');
  fs.mkdirSync(fixture);
  const recorder = new EvidenceRecorder(evidence, 'image-depth');
  t.diagnostic('evidence: ' + evidence);
  const generated = execFileSync(process.env.PYTHON || 'python3', ['-c', fixtureGenerator, fixture], {encoding: 'utf8'});
  recorder.writeJSON('fixture-oracle.json', JSON.parse(generated));
  fs.writeFileSync(path.join(evidence, 'fixture-generator.py'), fixtureGenerator);
  const fixtureHashes = () => Object.fromEntries(fs.readdirSync(fixture).sort().map(file =>
    [file, sha(fs.readFileSync(path.join(fixture, file)))]));
  const before = fixtureHashes();
  recorder.writeJSON('provenance.json', {binary, binarySha256: sha(fs.readFileSync(binary)),
    scriptPath, scriptSha256: sha(script), fixtureHashes: before,
    sourceHashes: Object.fromEntries(['automation/imageColor.go', 'automation/image_template.go',
      'automation/image_layout.go', 'docs/api/image-color.md'].map(file =>
      [file, sha(fs.readFileSync(path.join(root, file)))])), startedAt: new Date().toISOString()});
  const client = new MCPStdioClient({binary, args: ['--allow-script-execution', '--api-docs-root=' + root],
    cwd: evidence, recorder, runName: 'image-depth', stdoutPath: path.join(evidence, 'stdout.ndjson'),
    stderrPath: path.join(evidence, 'stderr.log'), timeoutMs: 25_000});
  try {
    await client.start();
    await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: {name: 'mcp-image-depth', version: '1'}});
    await client.notify('notifications/initialized');
    const caps = await call(client, 'tm_runtime_capabilities');
    recorder.writeJSON('capabilities.json', caps);
    assert.equal(caps.scripts.enabled, true);
    assert(Object.values(caps.scripts.capabilities).every(value => value === false));

    await t.test('color-block coordinates stay image-relative for nonzero and clipped ROIs', async () => {
      const report = await run(client, {root: fixture, scenario: 'blocks'}, recorder);
      assert.equal(report.checkCount, 15);
    });
    await t.test('array order wins equal confidence while single-template tie breaking is retained', async () => {
      const report = await run(client, {root: fixture, scenario: 'templates'}, recorder);
      assert.equal(report.checkCount, 10);
    });
    await t.test('layout profile is ignored with a warning and canonical docs disclose compatibility', async () => {
      const report = await run(client, {root: fixture, scenario: 'layout'}, recorder);
      assert.equal(report.checkCount, 5);
      const packet = await call(client, 'tm_api_read', {doc: 'image-color', selector: 'ImageColor.analyzeLayout'});
      recorder.writeJSON('layout-contract.json', packet);
      assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
      assert(packet.output.includes('兼容字段') && packet.output.includes('忽略'),
        'profile must be documented as an ignored compatibility field');
    });
    await t.test('canonical packets preserve complete provenance for the repaired image APIs', async () => {
      for (const selector of ['ImageColor.findColorBlocks', 'ImageColor.findImage', 'ImageColor.findImages']) {
        for (const withTypes of [false, true]) {
          const packet = await call(client, 'tm_api_read', {doc: 'image-color', selector, withTypes});
          assert.equal(packet.report.packetSha256, sha(packet.output));
          assert.equal(packet.report.returned.bytes, Buffer.byteLength(packet.output));
          assert.equal(verifyPacket(root, packet.output, packet.report).ok, true);
          if (selector === 'ImageColor.findImages') {
            assert.match(packet.output, /## ImageColor\.findImage\(source, template, options\?\)/);
            assert.match(packet.output, /默认 `0\.85`/);
            assert.match(packet.output, /只接受单个模板/);
          }
          recorder.writeJSON('packet-' + selector + (withTypes ? '-types' : '') + '.json', packet);
        }
      }
    });
    assert.deepEqual(fixtureHashes(), before, 'image operations must leave all source fixtures unchanged');
  } finally {
    const exit = await client.close();
    recorder.writeJSON('exit.json', {exit, protocolViolations: client.protocolViolations});
    assert.deepEqual(client.protocolViolations, []);
    assert.equal(exit.code, 0);
    const events = fs.readFileSync(recorder.ndjsonPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert(!events.some(row => ['shutdown_timeout', 'process_terminate'].includes(row.event)));
  }
});
