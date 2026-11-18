'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {query} = require('../../scripts/api-docs-mcp');
const {groups} = require('../../scripts/api-docs-map');
const reader = require('../../scripts/api-docs');
const root = require('node:path').resolve(__dirname, '../..');

test('MCP discovers every current group dynamically, including Browser', () => {
  const result = query({action: 'catalog'});
  assert.deepEqual(result.groups.map(g => g.id), groups.map(g => g.id));
  assert(result.groups.some(g => g.id === 'browser'));
  for (const group of result.groups) {
    assert.equal(query({action: 'catalog', group: group.id}).catalog, reader.catalog(root, group.id));
  }
});

test('MCP reading keeps canonical public dependencies and exact types intact', () => {
  for (const selection of [
    {doc: 'geometry', selector: 'Geometry.rect'},
    {doc: 'path', selector: 'path.resolve', withTypes: true},
    {doc: 'http', selector: 'http.get'},
    {doc: 'runtime', selector: '#异步完成与取消'},
  ]) {
    const result = query({action: 'read', ...selection});
    assert.equal(result.output, reader.readContract(root, selection.doc, selection.selector, selection.withTypes).output);
    assert.equal(result.report.packetSha256, crypto.createHash('sha256').update(result.output).digest('hex'));
    assert.equal(result.report.returned.bytes, Buffer.byteLength(result.output));
    assert.match(result.output, /END_API_READING_PACKET/);
    assert.equal(result.executed, false);
    for (const [file, hash] of Object.entries(result.toolchain)) assert.equal(hash, crypto.createHash('sha256').update(fs.readFileSync(require('node:path').join(root, file))).digest('hex'));
  }
});

test('MCP docs rejects traversal, invented contracts, command injection and unknown fields', () => {
  for (const request of [
    {action: 'generate'}, {action: 'catalog', group: '../../'},
    {action: 'catalog', root: '/tmp'}, {action: 'read', doc: '../file', selector: 'File.read'},
    {action: 'read', doc: 'file', selector: 'File.invented'},
    {action: 'read', doc: 'path', selector: 'path.resolve', withTypes: 'true'},
  ]) assert.throws(() => query(request));
});

test('method discovery reads the canonical method before a shared options heading', () => {
  const result = query({action: 'read', doc: 'command', selector: 'Command.run'});
  assert.match(result.output, /## Command\.run\(command, args\?, options\?\)/);
  assert.match(result.output, /OpenDeskCommandResult/);
  assert.match(result.output, /COMMAND_DISABLED/);
  assert.match(result.output, /### Command\.run\(\) options/);
});
