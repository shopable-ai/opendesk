#!/usr/bin/env node
'use strict';

// Thin read-only transport adapter. The canonical reader and navigation retain
// ownership of contracts, dependencies and source-integrity metadata.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = () => Object.fromEntries(['scripts/api-docs.js', 'scripts/api-docs-map.js', 'scripts/api-docs-mcp.js'].map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
const loadedIdentity = identity();
const reader = require('./api-docs');
const config = require('./api-docs-map');
function assertReaderStable() {
  if (JSON.stringify(identity()) !== JSON.stringify(loadedIdentity)) throw new Error('READER_SOURCE_CHANGED');
}

function query(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('INVALID_REQUEST');
  const allowed = request.action === 'catalog' ? ['action', 'group'] : ['action', 'doc', 'selector', 'withTypes'];
  if (Object.keys(request).some(key => !allowed.includes(key))) throw new Error('UNKNOWN_FIELD');
  if (request.withTypes !== undefined && typeof request.withTypes !== 'boolean') throw new Error('INVALID_WITH_TYPES');
  assertReaderStable();
  const toolchain = {...loadedIdentity};
  if (request.action === 'catalog') {
    if (!request.group) return {groups: config.groups.map(({id, title, purpose}) => ({id, title, purpose})), toolchain, executed: false};
    if (!config.groups.some(group => group.id === request.group)) throw new Error('UNKNOWN_GROUP');
    const catalog = reader.catalog(root, request.group);
    assertReaderStable();
    return {group: request.group, catalog, toolchain, executed: false};
  }
  if (request.action === 'read') {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(request.doc || '') || typeof request.selector !== 'string' || !request.selector.trim() || request.selector.length > 256) throw new Error('INVALID_SELECTION');
    const packet = reader.readContract(root, request.doc, request.selector, request.withTypes === true);
    reader.boundedOutput(packet, 384 * 1024); // Never return a partial contract.
    if (!reader.verifyPacket(root, packet.output, packet.report).ok) throw new Error('PACKET_INTEGRITY_FAILED');
    assertReaderStable();
    return {...packet, toolchain, executed: false};
  }
  throw new Error('UNKNOWN_ACTION');
}

module.exports = {query};
if (require.main === module) {
  try {
    const input = require('node:fs').readFileSync(0, 'utf8');
    if (Buffer.byteLength(input) > 4096) throw new Error('REQUEST_TOO_LARGE');
    process.stdout.write(JSON.stringify(query(JSON.parse(input))));
  } catch (error) {
    process.stderr.write(`API_DOC_READ_ERROR ${error.message}\n`);
    process.exitCode = 1;
  }
}
