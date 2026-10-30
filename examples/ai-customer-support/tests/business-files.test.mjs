import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const source = fs.readFileSync(new URL('../desktop/business-files.js', import.meta.url), 'utf8');
// Host-side real-fs shim tests JS bridge policy and framing, not native Runtime conformance.
// Canonical domain validation is exercised separately in workspace-files.test.mjs;
// this framing suite injects a validator to allow synthetic maximum-size payloads.
vm.runInThisContext(source);
const backup = JSON.stringify({ schemaVersion: 1, format: 'opendesk.ai-customer-support.business-backup',
  revision: 0, stores: [], records: [], overrides: [], cursors: {} });
function fixture(t, overrides = {}) {
  // Keep test outputs in the repository's disposable runtime domain.
  const base = path.resolve(import.meta.dirname, '../../../.runtime/tests/business-files');
  fs.mkdirSync(base, { recursive: true });
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(base, 'case-')));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  let reads = 0, calls = 0;
  const File = {
    cwd: () => cwd, join: path.join, realPath: fs.realpathSync,
    stat(file) {
      try { const s = fs.statSync(file); return { type: s.isFile() ? 'file' : s.isDirectory() ? 'directory' : 'other', size: s.isFile() ? s.size : null }; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    ensureDir: file => fs.mkdirSync(file, { recursive: true }),
    read: file => { reads++; return fs.readFileSync(file, 'utf8'); },
    readBytes: file => { reads++; return Uint8Array.from(fs.readFileSync(file)).buffer; },
    // Shim reproduces exclusive create + 0600, not Runtime's atomic publish implementation.
    writeNew: (file, text) => fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 }),
    ...overrides
  };
  for (const key of Object.keys(File)) {
    const fn = File[key]; File[key] = (...args) => { calls++; return fn(...args); };
  }
  const bridge = OpenDeskSupportBusinessFiles.create(File, { validateBackup: () => {} });
  const root = path.join(cwd, '.runtime/business-sync');
  const put = (name, content) => { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, name), content); };
  const request = (operation, extra = {}) => ({ type: 'support.businessFile', requestId: 'req-1', operation, ...extra });
  return { cwd, root, File, bridge, put, request, reads: () => reads, calls: () => calls };
}
function error(result, code) {
  assert.equal(result.status, 'error');
  if (code) assert.equal(result.code, code);
  assert.deepEqual(Object.keys(result).sort(), ['code', 'requestId', 'status', 'type']);
}
test('creation is inert and missing name cancels without any filesystem call', t => {
  const f = fixture(t); assert.equal(f.calls(), 0);
  assert.equal(f.bridge.handle(f.request('snapshot')).status, 'canceled');
  assert.equal(f.calls(), 0); assert.equal(fs.existsSync(f.root), false);
});
test('strict request keys, prototypes, descriptors, operations and IDs reject before IO', t => {
  const f = fixture(t);
  const bad = [null, [], Object.create(f.request('snapshot')), { ...f.request('snapshot'), unknown: 1 },
    f.request('snapshot', { path: '/secret' }), f.request('snapshot', { text: '{}' }),
    f.request('backup', { name: 'a.json', text: backup }), f.request('__proto__'), f.request('constructor'), f.request(['snapshot']), f.request(null),
    f.request('snapshot', { requestId: '' }), f.request('snapshot', { requestId: 'x'.repeat(41) }),
    f.request('snapshot', { requestId: '中' }), f.request('snapshot', { requestId: '\n' }),
    { ...f.request('snapshot'), [Symbol('extra')]: true },
    Object.defineProperty(f.request('snapshot'), 'name', { get() { throw Error('must not execute getter'); } })];
  for (const request of bad) error(f.bridge.handle(request), 'INVALID_REQUEST');
  assert.equal(f.calls(), 0);
});
test('rejects traversal, bad basenames, unknown extensions and non-string names', t => {
  const f = fixture(t);
  for (const name of ['', '.', '..', 'a..json', '../a.json', 'a/b.json', 'a\\b.json', 'a b.json', '中.json', 'a'.repeat(129), 'a.txt', 'json', 'png', 'a.json\0', 1]) {
    error(f.bridge.handle(f.request('snapshot', { name })), 'INVALID_NAME');
  }
  for (const name of ['x.svg', 'x.gif', 'x.GIF', 'x.json', 'x.png.exe', 'x.constructor']) error(f.bridge.handle(f.request('image', { name })), 'INVALID_NAME');
  assert.equal(f.calls(), 0);
});
test('snapshot and restore readback retain JSON as text, with basename only', t => {
  const f = fixture(t); f.put('multistore-v1.json', '{"data":"你好"}'); f.put('backup.json', backup);
  for (const [operation, name, text] of [['snapshot', 'multistore-v1.json', '{"data":"你好"}'], ['restore', 'backup.json', backup]]) {
    assert.deepEqual(f.bridge.handle(f.request(operation, { name })), {
      type: 'support.businessFileResult', requestId: 'req-1', status: 'ok', name, text
    });
  }
});
test('JSON is parsed, never evaluated, and dangerous nested keys/outer fields reject', t => {
  const f = fixture(t);
  for (const text of ['globalThis.executed=true', '{bad', '{"__proto__":{}}', '{"a":[{"constructor":1}]}', '{"prototype":1}', '1e999', '['.repeat(129) + '0' + ']'.repeat(129)]) {
    f.put('a.json', text); error(f.bridge.handle(f.request('snapshot', { name: 'a.json' })), 'INVALID_JSON');
  }
  for (const value of [{ ...JSON.parse(backup), extra: true }, { ...JSON.parse(backup), format: 'wrong' },
    { ...JSON.parse(backup), schemaVersion: 2 }, { ...JSON.parse(backup), revision: -1 },
    { ...JSON.parse(backup), records: {} }, { ...JSON.parse(backup), cursors: [] }]) {
    error(f.bridge.handle(f.request('backup', { text: JSON.stringify(value) })), 'INVALID_BACKUP');
  }
  assert.equal(globalThis.executed, undefined);
});
test('symlinks in root, parent or leaf cannot read or write outside workspace', t => {
  for (const part of ['.runtime', 'business-sync', 'leaf']) {
    const f = fixture(t); const outside = path.join(f.cwd, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'a.json'), backup);
    if (part === '.runtime') fs.symlinkSync(outside, path.join(f.cwd, '.runtime'));
    else if (part === 'business-sync') { fs.mkdirSync(path.join(f.cwd, '.runtime')); fs.symlinkSync(outside, f.root); }
    else { fs.mkdirSync(f.root, { recursive: true }); fs.symlinkSync(path.join(outside, 'a.json'), path.join(f.root, 'a.json')); }
    error(f.bridge.handle(f.request('snapshot', { name: 'a.json' })), 'UNSAFE_PATH'); assert.equal(f.reads(), 0);
    if (part !== 'leaf') error(f.bridge.handle(f.request('backup', { text: backup })), 'UNSAFE_PATH');
    assert.deepEqual(fs.readdirSync(outside), ['a.json']);
  }
});
test('missing files and directories fail without leaking paths or contents', t => {
  const f = fixture(t, { read: () => { throw Error('/private/absolute-path SECRET_CONTENT'); } });
  error(f.bridge.handle(f.request('snapshot', { name: 'missing.json' })));
  f.put('a.json', '{}'); const r = f.bridge.handle(f.request('snapshot', { name: 'a.json' })); error(r, 'FILE_UNAVAILABLE');
  assert.ok(!JSON.stringify(r).includes('private')); assert.ok(!JSON.stringify(r).includes('SECRET'));
  fs.mkdirSync(path.join(f.root, 'directory.json')); error(f.bridge.handle(f.request('snapshot', { name: 'directory.json' })), 'FILE_UNAVAILABLE');
});
test('stat limits reject before read, for snapshot restore and image', t => {
  for (const [operation, name, limit] of [['snapshot', 'a.json', 1024 * 1024], ['restore', 'a.json', 8 * 1024 * 1024], ['image', 'a.png', 128 * 1024]]) {
    const f = fixture(t); f.put(name, Buffer.alloc(limit + 1));
    error(f.bridge.handle(f.request(operation, { name })), 'FILE_TOO_LARGE'); assert.equal(f.reads(), 0);
  }
});
test('post-read byte budgets reject growth and multibyte UTF8', t => {
  for (const operation of ['snapshot', 'restore', 'image']) {
    const max = operation === 'snapshot' ? 1024 * 1024 : operation === 'restore' ? 8 * 1024 * 1024 : 128 * 1024;
    const f = fixture(t, operation === 'image' ? { readBytes: () => Array(max + 1).fill(1) } : { read: () => '中'.repeat(Math.floor(max / 3) + 1) });
    const name = operation === 'image' ? 'a.png' : 'a.json'; f.put(name, '{}');
    error(f.bridge.handle(f.request(operation, { name })), 'FILE_TOO_LARGE');
  }
  const f = fixture(t); error(f.bridge.handle(f.request('backup', { text: '中'.repeat(3 * 1024 * 1024) })), 'FILE_TOO_LARGE');
  assert.equal(f.calls(), 0);
});
test('exclusive backup exports are private, unique, and can be restored', t => {
  const f = fixture(t); const first = f.bridge.handle(f.request('backup', { text: backup }));
  const second = f.bridge.handle(f.request('backup', { text: backup }));
  assert.equal(first.status, 'ok'); assert.match(first.name, /^business-backup-\d+-\d+\.json$/);
  assert.notEqual(first.name, second.name); assert.equal(own(first, 'text'), false);
  assert.equal(fs.readFileSync(path.join(f.root, first.name), 'utf8'), backup);
  if (os.platform() !== 'win32') assert.equal(fs.statSync(path.join(f.root, first.name)).mode & 0o777, 0o600);
  assert.equal(f.bridge.handle(f.request('restore', { name: first.name })).text, backup);
});
const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
test('existing export cannot be overwritten even on generated name collision', t => {
  const f = fixture(t); fs.mkdirSync(f.root, { recursive: true });
  const now = Date.now; Date.now = () => 123;
  try {
    f.put('business-backup-123-1.json', 'PRIVATE_EXISTING');
    error(f.bridge.handle(f.request('backup', { text: backup })), 'FILE_UNAVAILABLE');
    assert.equal(fs.readFileSync(path.join(f.root, 'business-backup-123-1.json'), 'utf8'), 'PRIVATE_EXISTING');
  } finally { Date.now = now; }
});
test('image dataURL uses reliable base64 for every tail length and image whitelist', t => {
  const f = fixture(t);
  for (const [extension, mime] of [['png', 'png'], ['jpg', 'jpeg'], ['jpeg', 'jpeg'], ['webp', 'webp']]) {
    for (const size of [0, 1, 2, 3, 4, 255, 128 * 1024]) {
      const bytes = Buffer.from(Array.from({ length: size }, (_, i) => i % 256)); const name = `image.${extension}`; f.put(name, bytes);
      const r = f.bridge.handle(f.request('image', { name })); assert.equal(r.status, 'ok');
      assert.equal(r.text, `data:image/${mime};base64,${bytes.toString('base64')}`);
    }
  }
});
// The web bridge receives a JSON string as its TrustedJSON value (double JSON).
// Native replies are objects. Check the actual UTF-8 budgets in both directions.
function transport(f) {
  const bridge = OpenDeskSupportBusinessFiles.createTransport(f.File, { validateBackup: () => {} });
  let serial = 0, largestRequest = 0, largestResponse = 0;
  function send(operation, extra = {}, requestId = 'transport-' + (++serial)) {
    const request = f.request(operation, { ...extra, requestId });
    const encoded = JSON.stringify(request);
    const size = Buffer.byteLength(JSON.stringify(encoded));
    largestRequest = Math.max(largestRequest, size); assert.ok(size <= 65536, `request ${size}`);
    const response = bridge.handle(JSON.parse(JSON.parse(JSON.stringify(encoded))));
    const replySize = Buffer.byteLength(JSON.stringify(response));
    largestResponse = Math.max(largestResponse, replySize); assert.ok(replySize <= 65536, `response ${replySize}`);
    assert.equal(response.requestId, requestId);
    return response;
  }
  function read(operation, name) {
    const initial = send(operation, { name }); assert.equal(initial.status, 'ok');
    const chunks = [initial.text]; let offset = initial.text.length;
    while (offset < initial.total) {
      const chunk = send('readChunk', { transferId: initial.transferId, offset });
      assert.equal(chunk.status, 'ok'); assert.equal(chunk.offset, offset); assert.equal(chunk.total, initial.total);
      assert.equal(chunk.name, name); assert.ok(chunk.text.length <= 8192);
      chunks.push(chunk.text); offset += chunk.text.length;
    }
    error(send('readChunk', { transferId: initial.transferId, offset }), 'INVALID_REQUEST');
    return chunks.join('');
  }
  function upload(text) {
    const initial = send('backupStart', { total: text.length }); assert.equal(initial.status, 'ok');
    const transferId = initial.transferId;
    assert.equal(initial.offset, 0); assert.equal(initial.total, text.length);
    for (let offset = 0; offset < text.length; offset += 8192) {
      const chunk = text.slice(offset, offset + 8192);
      const ack = send('backupChunk', { transferId, offset, text: chunk });
      assert.deepEqual(ack, { type: 'support.businessFileResult', requestId: ack.requestId, status: 'ok',
        transferId, offset: offset + chunk.length, total: text.length });
    }
    return send('backupCommit', { transferId });
  }
  return { bridge, send, read, upload, budget: () => ({ largestRequest, largestResponse }) };
}
test('transport near-8MiB escaped/multibyte backup fits both wire directions and roundtrips', t => {
  const f = fixture(t), wire = transport(f);
  const value = JSON.parse(backup);
  // JSON strings containing escaped controls, literal multibyte text and surrogate pairs.
  const pattern = '\u0000\n\t"\\中🙂';
  value.records = [pattern.repeat(390000)];
  const text = JSON.stringify(value);
  assert.ok(Buffer.byteLength(text) > 7 * 1024 * 1024 && Buffer.byteLength(text) <= 8 * 1024 * 1024);
  const saved = wire.upload(text); assert.equal(saved.status, 'ok');
  assert.deepEqual(Object.keys(saved).sort(), ['name', 'requestId', 'status', 'type']);
  assert.equal(fs.readFileSync(path.join(f.root, saved.name), 'utf8'), text);
  assert.equal(wire.read('restore', saved.name), text);
  assert.ok(wire.budget().largestRequest < 65536); assert.ok(wire.budget().largestResponse < 65536);
});
test('transport worst escaping and split surrogate chunks stay within JSON limits', t => {
  const f = fixture(t), wire = transport(f);
  // Lone surrogates are six-byte JSON escapes, seven with the outer string encoding.
  const text = '\ud800'.repeat(8192);
  const start = wire.send('backupStart', { total: text.length });
  assert.equal(wire.send('backupChunk', { transferId: start.transferId, offset: 0, text }).status, 'ok');
  assert.ok(wire.budget().largestRequest > 57000);
  error(wire.send('backupCommit', { transferId: start.transferId }), 'INVALID_JSON');
  assert.equal(f.calls(), 0);
  const value = JSON.parse(backup); value.records = ['a'.repeat(8001) + '🙂'.repeat(12000)];
  const valid = JSON.stringify(value); assert.equal(wire.upload(valid).status, 'ok');
  f.put('emoji.json', valid);
  let response = wire.send('restore', { name: 'emoji.json' });
  let sawShortBoundary = false, readback = '';
  while (true) {
    const last = response.text.charCodeAt(response.text.length - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff), 'read frame must not end inside an emoji');
    sawShortBoundary ||= response.text.length === 8191;
    readback += response.text;
    if (readback.length === response.total) break;
    response = wire.send('readChunk', { transferId: response.transferId, offset: readback.length });
    assert.equal(response.status, 'ok');
  }
  assert.equal(readback, valid); assert.equal(sawShortBoundary, true);

});
test('transport image over 64KiB and large snapshot use sequential bounded reads', t => {
  const f = fixture(t), wire = transport(f);
  const bytes = Buffer.alloc(128 * 1024, 255); f.put('large.webp', bytes);
  assert.equal(wire.read('image', 'large.webp'), 'data:image/webp;base64,' + bytes.toString('base64'));
  const text = JSON.stringify({ text: '中\\\n"'.repeat(40000) }); f.put('large.json', text);
  assert.equal(wire.read('snapshot', 'large.json'), text);
  f.put('small.json', '{}');
  assert.deepEqual(wire.send('snapshot', { name: 'small.json' }, 'small'), {
    type: 'support.businessFileResult', requestId: 'small', status: 'ok', name: 'small.json',
    text: '{}', transferId: 'small', offset: 0, total: 2
  });
});
test('transport validates the entire read body before releasing any chunk', t => {
  const f = fixture(t), wire = transport(f);
  f.put('invalid.json', '{"a":"' + 'a'.repeat(20000) + '"');
  error(wire.send('snapshot', { name: 'invalid.json' }), 'INVALID_JSON');
  f.put('invalid.json', '{"a":"' + 'a'.repeat(20000) + '","constructor":{}}');
  error(wire.send('snapshot', { name: 'invalid.json' }), 'INVALID_JSON');
  f.put('invalid.json', '{}'); error(wire.send('restore', { name: 'invalid.json' }), 'INVALID_BACKUP');
});
test('transport read replacement, exact offsets, immutable names and absolute expiry', t => {
  const f = fixture(t), wire = transport(f); f.put('a.json', JSON.stringify('a'.repeat(30000)));
  const clock = Date.now; let now = 1000; Date.now = () => now;
  try {
    const first = wire.send('snapshot', { name: 'a.json' });
    error(wire.send('readChunk', { transferId: first.transferId, offset: 0 }), 'INVALID_REQUEST');
    error(wire.send('readChunk', { transferId: first.transferId, offset: 8192, name: 'other.json' }), 'INVALID_REQUEST');
    const second = wire.send('snapshot', { name: 'a.json' });
    error(wire.send('readChunk', { transferId: first.transferId, offset: 8192 }), 'INVALID_REQUEST');
    now += 119999;
    assert.equal(wire.send('readChunk', { transferId: second.transferId, offset: 8192 }).status, 'ok');
    now++;
    error(wire.send('readChunk', { transferId: second.transferId, offset: 16384 }), 'INVALID_REQUEST');
  } finally { Date.now = clock; }
});
test('transport upload remains inert until complete commit, replacement and invalid chunks discard state', t => {
  const f = fixture(t), wire = transport(f);
  error(wire.send('backup', { text: backup }), 'INVALID_REQUEST');
  for (const total of [0, -1, 8 * 1024 * 1024 + 1, 1.1, '1', null]) error(wire.send('backupStart', { total }), 'INVALID_REQUEST');
  let start = wire.send('backupStart', { total: backup.length });
  const old = start; start = wire.send('backupStart', { total: backup.length });
  error(wire.send('backupChunk', { transferId: old.transferId, offset: 0, text: backup }), 'INVALID_REQUEST');
  assert.equal(wire.send('backupChunk', { transferId: start.transferId, offset: 0, text: '' }).offset, 0);
  error(wire.send('backupCommit', { transferId: start.transferId }), 'INVALID_REQUEST');
  error(wire.send('backupChunk', { transferId: start.transferId, offset: 0, text: backup }), 'INVALID_REQUEST');
  for (const bad of [{ offset: 1, text: backup }, { offset: 0, text: 'a'.repeat(8193) },
    { offset: 0, text: backup + ' ' }, { offset: 0, text: backup, unknown: true }, { offset: -1, text: '' }]) {
    start = wire.send('backupStart', { total: backup.length });
    error(wire.send('backupChunk', { transferId: start.transferId, ...bad }), 'INVALID_REQUEST');
    error(wire.send('backupCommit', { transferId: start.transferId }), 'INVALID_REQUEST');
  }
  assert.equal(f.calls(), 0); assert.equal(fs.existsSync(f.root), false);
  start = wire.send('backupStart', { total: backup.length });
  assert.equal(wire.send('backupChunk', { transferId: start.transferId, offset: 0, text: backup }).status, 'ok');
  assert.equal(f.calls(), 0);
  assert.equal(wire.send('backupCommit', { transferId: start.transferId }).status, 'ok');
  error(wire.send('backupCommit', { transferId: start.transferId }), 'INVALID_REQUEST');
});
test('transport strict envelopes reject getters, prototypes and unknown keys with safe correlation', t => {
  const f = fixture(t), wire = transport(f);
  const bad = [null, [], Object.create(f.request('backupStart', { total: 1 })),
    f.request('backupStart', { total: 1, requestId: '中' }), f.request('backupStart', { total: 1, requestId: 'a'.repeat(41) }),
    f.request('backupStart', { total: 1, requestId: '\n' }),
    f.request('backupStart', { total: 1, [Symbol('x')]: 1 }), f.request('constructor'), f.request('__proto__'),
    f.request('backupCommit', { transferId: 'x', path: '/private' })];
  for (const key of ['requestId', 'type', 'operation', 'total']) {
    bad.push(Object.defineProperty(f.request('backupStart', { total: 1 }), key, { get() { throw Error('getter ran'); } }));
  }
  for (const request of bad) error(wire.bridge.handle(request), 'INVALID_REQUEST');
  const start = wire.send('backupStart', { total: 1 });
  const request = Object.defineProperty(f.request('backupChunk', { transferId: start.transferId, offset: 0 }), 'text', { get() { throw Error('getter ran'); } });
  const result = wire.bridge.handle(request); error(result, 'INVALID_REQUEST'); assert.equal(result.requestId, 'req-1');
  error(wire.send('backupCommit', { transferId: start.transferId }), 'INVALID_REQUEST');
  assert.equal(f.calls(), 0);
});
test('transport upload expires after 120 seconds even with chunk activity and validates final bytes/schema', t => {
  const f = fixture(t), wire = transport(f), clock = Date.now; let now = 1000; Date.now = () => now;
  try {
    const start = wire.send('backupStart', { total: backup.length }); now += 119999;
    assert.equal(wire.send('backupChunk', { transferId: start.transferId, offset: 0, text: backup }).status, 'ok');
    now++; error(wire.send('backupCommit', { transferId: start.transferId }), 'INVALID_REQUEST');
  } finally { Date.now = clock; }
  error(wire.upload('{}'), 'INVALID_BACKUP');
  const tooLarge=wire.send('backupStart',{total:3*1024*1024});
  let rejected;
  for(let offset=0;offset<3*1024*1024;offset+=8192){
    rejected=wire.send('backupChunk',{transferId:tooLarge.transferId,offset,text:'中'.repeat(8192)});
    if(rejected.status==='error')break;
  }
  error(rejected,'INVALID_REQUEST');
  assert.equal(f.calls(), 0);
});

test('trusted workdir override is deferred, canonical and independent of App File.cwd', t => {
  const f = fixture(t, { cwd() { throw Error('App cwd must not be used with a host override'); } });
  const direct = OpenDeskSupportBusinessFiles.create(f.File, { workdir: f.cwd, validateBackup: () => {} });
  const wire = OpenDeskSupportBusinessFiles.createTransport(f.File, { workdir: f.cwd, validateBackup: () => {} });
  assert.equal(f.calls(), 0);
  assert.equal(wire.handle(f.request('snapshot')).status, 'canceled'); assert.equal(f.calls(), 0);
  f.put('a.json', '{}');
  assert.equal(direct.handle(f.request('snapshot', { name: 'a.json' })).text, '{}');
  assert.equal(wire.handle(f.request('snapshot', { name: 'a.json' })).text, '{}');
  const alias = path.join(f.cwd, 'alias'); fs.symlinkSync(f.cwd, alias);
  for (const build of [OpenDeskSupportBusinessFiles.create, OpenDeskSupportBusinessFiles.createTransport]) {
    const unsafe = build(f.File, { workdir: alias });
    error(unsafe.handle(f.request('snapshot', { name: 'a.json' })), 'UNSAFE_PATH');
  }
});
