'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const reader = require('../../scripts/api-docs');
const root = path.resolve(__dirname, '../..');
const evidence = path.join(root, '.runtime/tests/mcp-depth/provenance');
fs.mkdirSync(evidence, {recursive: true});

function fixture(body) {
  const dir = fs.mkdtempSync(path.join(evidence, 'checkout-'));
  try {
    for (const rel of ['docs/api', 'types', 'scripts']) fs.mkdirSync(path.join(dir, rel), {recursive: true});
    fs.cpSync(path.join(root, 'docs/api'), path.join(dir, 'docs/api'), {recursive: true});
    fs.cpSync(path.join(root, 'types'), path.join(dir, 'types'), {recursive: true});
    for (const file of ['api-docs.js', 'api-docs-map.js', 'api-docs-mcp.js']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(dir, 'scripts', file));
    body(dir);
  } finally {
    for (const key of Object.keys(require.cache)) if (key.startsWith(dir + path.sep)) delete require.cache[key];
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// Deterministic filesystem interleaving, restricted to disposable checkouts.
function changeAfterRead(target, body) {
  const original = fs.readFileSync;
  let changed = false;
  fs.readFileSync = function(file, ...args) {
    const value = original.call(this, file, ...args);
    if (!changed && String(file) === target) {
      changed = true;
      fs.appendFileSync(target, '\n/* concurrent source edit */\n');
    }
    return value;
  };
  try { body(); assert.equal(changed, true, 'mutation seam was reached'); }
  finally { fs.readFileSync = original; }
}

test('packet rejects a type changed between exact-member and public-closure reads', () => fixture(dir => {
  changeAfterRead(path.join(dir, 'types/File.d.ts'), () => {
    assert.throws(() => reader.readContract(dir, 'file', 'File.readJSON', true), /SOURCE_CHANGED/);
  });
}));

test('packet rejects changes to selected source and required public dependency', () => {
  for (const [rel, doc, selector] of [['docs/api/file.md', 'file', 'File.readJSON'], ['docs/api/accessibility.md', 'desktop-ui', 'UI.getValue']]) fixture(dir => {
    changeAfterRead(path.join(dir, rel), () => {
      assert.throws(() => reader.readContract(dir, doc, selector), /SOURCE_CHANGED/);
    });
  });
});

test('catalog refuses a source changed while preparing its output', () => fixture(dir => {
  changeAfterRead(path.join(dir, 'docs/api/file.md'), () => {
    assert.throws(() => reader.catalog(dir, 'data'), /SOURCE_CHANGED/);
  });
}));

test('packet rechecks sources after collecting checkout revision', () => fixture(dir => {
  const original = cp.execFileSync;
  cp.execFileSync = function(...args) {
    fs.appendFileSync(path.join(dir, 'docs/api/file.md'), '\nlate source edit\n');
    return original.apply(this, args);
  };
  try { assert.throws(() => reader.readContract(dir, 'file', 'File.readJSON'), /SOURCE_CHANGED/); }
  finally { cp.execFileSync = original; }
}));

test('MCP catalog rechecks the toolchain after reading contracts', () => fixture(dir => {
  const adapter = require(path.join(dir, 'scripts/api-docs-mcp.js'));
  const original = fs.readFileSync;
  let changed = false;
  fs.readFileSync = function(file, ...args) {
    const bytes = original.call(this, file, ...args);
    if (!changed && String(file) === path.join(dir, 'docs/api/file.md')) {
      changed = true;
      fs.appendFileSync(path.join(dir, 'scripts/api-docs-map.js'), '\n// edited during catalog read\n');
    }
    return bytes;
  };
  try {
    assert.throws(() => adapter.query({action: 'catalog', group: 'data'}), /READER_SOURCE_CHANGED/);
    assert.equal(changed, true);
  } finally { fs.readFileSync = original; }
}));

test('MCP refuses cached reader/map/adapter code whose disk identity changed', () => {
  for (const name of ['api-docs.js', 'api-docs-map.js', 'api-docs-mcp.js']) fixture(dir => {
    const adapter = require(path.join(dir, 'scripts/api-docs-mcp.js'));
    fs.appendFileSync(path.join(dir, 'scripts', name), '\n// changed after module load\n');
    for (const request of [{action: 'catalog'}, {action: 'catalog', group: 'data'}, {action: 'read', doc: 'file', selector: 'File.readJSON'}]) {
      assert.throws(() => adapter.query(request), /READER_SOURCE_CHANGED/);
    }
  });
});

test('complete report is mandatory and every top-level field is verified', () => {
  const packet = reader.readContract(root, 'file', 'File.readJSON', true);
  assert.equal(reader.verifyPacket(root, packet.output, packet.report).ok, true);
  assert.throws(() => reader.verifyPacket(root, packet.output), /INVALID_PACKET_PLAN/);
  for (const key of Object.keys(packet.report)) {
    const deleted = structuredClone(packet.report);
    delete deleted[key];
    assert.throws(() => reader.verifyPacket(root, packet.output, deleted), /INVALID_PACKET_PLAN|PACKET_/ , key);
    const changed = structuredClone(packet.report);
    changed[key] = key === 'selection' ? {...changed[key], withTypes: false} : 'tampered';
    assert.throws(() => reader.verifyPacket(root, packet.output, changed), /INVALID_PACKET_PLAN|PACKET_/, key);
  }
  fs.writeFileSync(path.join(evidence, 'packet.json'), JSON.stringify(packet, null, 2) + '\n');
});

test('independent convenience/handle H2 contracts retain their canonical owners', () => fixture(dir => {
  const methods = ['http.get', 'http.post', 'axios.get', 'axios.post', 'axios.put', 'axios.patch', 'axios.delete', 'axios.defaults', 'axios.interceptors'];
  fs.writeFileSync(path.join(dir, 'docs/api/http.md'), '# HTTP\n\n## http.request(options)\nHTTP_OWNER_CONTRACT\n\n## axios.request(config)\nAXIOS_OWNER_CONTRACT\n\n' + methods.map(name => `## ${name}\nSELECTED_${name}\n`).join('\n') + '\n## http / axios：错误行为\nERROR_CONTRACT\n\n## axios：实现边界\nBOUNDARY_CONTRACT\n');
  for (const method of methods) {
    const packet = reader.readContract(dir, 'http', method);
    assert.match(packet.output, new RegExp(method.startsWith('http.') ? 'HTTP_OWNER_CONTRACT' : 'AXIOS_OWNER_CONTRACT'));
    assert(packet.output.includes(`SELECTED_${method}`));
    assert.match(packet.output, /ERROR_CONTRACT/);
    assert.match(packet.output, /BOUNDARY_CONTRACT/);
    assert.equal(reader.verifyPacket(dir, packet.output, packet.report).ok, true);
  }
  const handles = ['handle.name', 'handle.url', 'handle.requestHeaders', 'handle.close'];
  fs.writeFileSync(path.join(dir, 'docs/api/webhook.md'), '# Webhook\n\n## Webhook.listen(name, handler, options?)\nLISTEN_OWNER_CONTRACT\n\n' + handles.map(name => `## ${name}\nSELECTED_${name}\n`).join('\n') + '\n## 生命周期与运行入口\nLIFECYCLE_CONTRACT\n');
  for (const method of handles) {
    const packet = reader.readContract(dir, 'webhook', method);
    assert(packet.output.includes(`SELECTED_${method}`));
    assert.match(packet.output, /LISTEN_OWNER_CONTRACT/);
    assert.match(packet.output, /LIFECYCLE_CONTRACT/);
  }
  fs.writeFileSync(path.join(dir, 'docs/api/sqlite.md'), '# SQLite\n\n## SQLite.open(options)\nOPEN_OWNER_CONTRACT\n\n## db.query(sql, params?, options?)\nQUERY_CONTRACT\n\n## 公共约束\nDATABASE_COMMON_CONTRACT\n');
  const database = reader.readContract(dir, 'sqlite', 'db.query');
  for (const marker of ['OPEN_OWNER_CONTRACT', 'QUERY_CONTRACT', 'DATABASE_COMMON_CONTRACT']) assert(database.output.includes(marker));
}));

test('axios reads native buffering/default headers while download keeps its own error contract', () => {
  for (const selector of ['axios.get', 'axios.post', 'axios.request', 'axios.defaults', 'axios.interceptors']) {
    const packet = reader.readContract(root, 'http', selector, true);
    assert.match(packet.output, /10 MiB/);
    assert.match(packet.output, /common/);
    assert.match(packet.output, /x-www-form-urlencoded/);
    assert.match(packet.output, /## axios.defaults/);
    assert.match(packet.output, /## http.request/);
    assert.equal(reader.verifyPacket(root, packet.output, packet.report).ok, true);
  }
  const download = reader.readContract(root, 'http', 'http.download', true);
  assert.match(download.output, /HTTPDownloadError/);
  assert.doesNotMatch(download.output, /以 `HTTP request canceled` 开头/);
  assert.doesNotMatch(download.output, /## http \/ axios：错误行为/);
});
