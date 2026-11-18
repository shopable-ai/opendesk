'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {MCPStdioClient, EvidenceRecorder} = require('./tools/macos-smoke/main.js');
const {verifyPacket} = require('../../scripts/api-docs');
const root = path.resolve(__dirname, '../..');
const binaryInput = process.env.OPENDESK_MCP_BINARY;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

test('real MCP keeps checkout packet integrity separate from unverified Runtime provenance', {
  skip: !binaryInput && 'set OPENDESK_MCP_BINARY to a current MCP binary', timeout: 30_000,
}, async t => {
  const base = path.join(root, '.runtime/tests/mcp-depth/provenance');
  fs.mkdirSync(base, {recursive: true});
  const evidence = fs.mkdtempSync(path.join(base, 'stdio-'));
  t.diagnostic(`evidence: ${evidence}`);
  const checkout = path.join(evidence, 'checkout');
  for (const rel of ['docs/api', 'types', 'scripts']) fs.mkdirSync(path.join(checkout, rel), {recursive: true});
  for (const rel of ['docs/api', 'types']) fs.cpSync(path.join(root, rel), path.join(checkout, rel), {recursive: true});
  for (const name of ['api-docs.js', 'api-docs-map.js', 'api-docs-mcp.js']) fs.copyFileSync(path.join(root, 'scripts', name), path.join(checkout, 'scripts', name));
  // Deliberately distinct documentation, with no claim that a binary implements it.
  fs.appendFileSync(path.join(checkout, 'docs/api/file.md'), '\n<!-- provenance fixture: checkout differs from source -->\n');
  const binary = fs.realpathSync(path.resolve(binaryInput));
  const recorder = new EvidenceRecorder(evidence, 'runtime-provenance');
  recorder.writeJSON('inputs.json', {binary, binarySha256: hash(fs.readFileSync(binary)), checkout,
    originalDocSha256: hash(fs.readFileSync(path.join(root, 'docs/api/file.md'))),
    checkoutDocSha256: hash(fs.readFileSync(path.join(checkout, 'docs/api/file.md')))});
  const client = new MCPStdioClient({binary, args: [`--api-docs-root=${checkout}`], cwd: evidence,
    recorder, runName: 'provenance', timeoutMs: 15_000,
    stdoutPath: path.join(evidence, 'stdout.ndjson'), stderrPath: path.join(evidence, 'stderr.log')});
  async function call(name, args = {}) {
    const response = await client.request('tools/call', {name, arguments: args});
    assert.notEqual(response.isError, true, JSON.stringify(response));
    const value = JSON.parse(response.content[0].text);
    assert.equal(value.ok, true);
    recorder.writeJSON(`${name}.json`, value);
    return value;
  }
  function check(value) {
    assert.equal(value.checkoutRoot, fs.realpathSync(checkout));
    assert.equal(value.runtimeMatchVerified, false);
    assert.match(value.warning, /running binary.*source or API compatibility/);
    assert.match(value.warning, /before execution/);
    assert.equal(typeof value.runtimeRevision, 'string');
    assert.equal(typeof value.checkoutRevision, 'string');
  }
  try {
    await client.start();
    await client.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'runtime-provenance', version: '1'}});
    await client.notify('notifications/initialized');
    const capabilities = await call('tm_runtime_capabilities');
    assert.equal(capabilities.scripts.enabled, false);
    check(capabilities.documentation.provenance);
    check((await call('tm_api_catalog')).provenance);
    check((await call('tm_api_catalog', {group: 'data'})).provenance);
    const packet = await call('tm_api_read', {doc: 'file', selector: 'File.readJSON', withTypes: true});
    check(packet.provenance);
    assert.equal(verifyPacket(checkout, packet.output, packet.report).ok, true);
    assert.throws(() => verifyPacket(root, packet.output, packet.report), /PACKET_SOURCE_OR_PLAN_CHANGED/);
    const changed = structuredClone(packet.report);
    delete changed.programReads;
    assert.throws(() => verifyPacket(checkout, packet.output, changed), /PACKET_SOURCE_OR_PLAN_CHANGED/);
    assert.equal(packet.executed, false);
    // A hostile checkout may even assert a different revision. This tests the
    // warning, never treats Git metadata as proof of its actual file contents.
    assert(packet.provenance.runtimeRevision, 'candidate must retain VCS build metadata');
    const assertedRevision = packet.provenance.runtimeRevision === 'a'.repeat(40) ? 'b'.repeat(40) : 'a'.repeat(40);
    const git = path.join(checkout, '.git');
    fs.mkdirSync(path.join(git, 'objects'), {recursive: true});
    fs.mkdirSync(path.join(git, 'refs'), {recursive: true});
    fs.writeFileSync(path.join(git, 'HEAD'), assertedRevision + '\n');
    fs.writeFileSync(path.join(git, 'config'), '[core]\nrepositoryformatversion = 0\nbare = false\n');
    const mismatch = await call('tm_runtime_capabilities');
    assert.equal(mismatch.documentation.provenance.knownRevisionMismatch, true);
    assert.equal(mismatch.documentation.provenance.checkoutRevision, assertedRevision);
    assert.equal(mismatch.documentation.provenance.runtimeMatchVerified, false);
    assert.match(mismatch.documentation.provenance.warning, /different VCS revisions/);
    assert.deepEqual(await client.request('ping'), {});
  } finally {
    const exit = await client.close();
    assert.equal(exit.code, 0);
    assert.equal(exit.signal, null);
  }
});
