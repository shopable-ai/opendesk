import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import fs from 'node:fs';

const source = await readFile(resolve(import.meta.dirname, '../desktop/app-host.js'), 'utf8');
async function fixture({ sha = 'a'.repeat(64), showError = false, File, businessWorkdir } = {}) {
  const listeners = new Map(), posted = [], logs = [];
  let spec, action, released = 0, closed = 0;
  const panel = {
    on: (type, handler) => { listeners.set(type, handler); return () => { listeners.delete(type); released++; }; },
    postMessage: async value => { assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 65536); posted.push(value); },
    show: async () => { if (showError) throw Error('host unavailable'); },
    getState: async () => ({ visible: true, hostPid: 123, nativeWindowId: 456 }),
    close: async () => { closed++; listeners.get('close')?.(); }
  };
  const start = vm.runInNewContext(source, {
    ui: { createTrustedWindow: async value => { spec = value; return panel; } },
    automation: { app: { onAction: handler => { action = handler; return () => { action = null; released++; }; } } },
    console: { log: line => logs.push(JSON.parse(line.slice('SUPPORT_APP '.length))) },
    File,
    Execution: { id: 'owned-execution' }
  });
  const launch = () => start({ root: '/relocated/package', integrity: { previewSha256: sha }, businessWorkdir });
  return { launch, panel, posted, logs, listeners, action: () => action,
    spec: () => spec, released: () => released, closed: () => closed,
    send: async value => listeners.get('message')?.({ value }) };
}

test('App adapter loads the existing hashed React and confirms bridge without a fabricated binding', async () => {
  const f = await fixture(); await f.launch();
  assert.equal(f.spec().id, 'supportReactR23');
  assert.equal(f.spec().content.file, 'preview/index.html');
  assert.equal(f.spec().content.basePath, '/relocated/package');
  assert.equal(f.spec().content.sha256, 'a'.repeat(64));
  await f.send(JSON.stringify({ type: 'support.ready' }));
  assert.deepEqual(JSON.parse(JSON.stringify(f.posted)), [{ type: 'support.hostReady', protocol: 1, mode: 'disconnected' }]);
  await f.send({ type: 'support.clientReady', protocol: 1 });
  assert.ok(f.logs.some(log => log.type === 'bridge-confirmed'));
  assert.ok(!f.posted.some(message => 'binding' in message || message.type === 'support.receipt'));
});

test('untrusted messages cannot activate a provider, fill, quit, evaluate or grant permission', async () => {
  const f = await fixture(); await f.launch();
  const invalid = ['{', null, [], { type: 'eval', code: 'throw Error()' },
    { type: 'support.ready', extra: true }, { type: 'support.fillDraft', text: 'do not write' },
    { type: 'support.observation' }, { type: 'quit' }, { type: 'support.settings', permission: true },
    { type: 'support.settings', paused: 'false' }];
  for (const message of invalid) await f.send(message);
  assert.equal(f.logs.filter(log => log.type === 'rejected-message').length, invalid.length);
  assert.equal(f.posted.length, 0); assert.equal(f.closed(), 0);
  await f.send({ type: 'support.settings', paused: false, follow: true });
  assert.equal(f.logs.at(-1).type, 'settings'); assert.equal(f.posted.length, 0);
});

test('close unregisters its listeners and failed show releases the owned window', async () => {
  const f = await fixture(); await f.launch();
  f.action()({ id: 'opendesk.open', source: 'second-instance' });
  assert.equal(f.logs.at(-1).source, 'second-instance');
  await f.panel.close();
  assert.equal(f.released(), 3); assert.equal(f.listeners.size, 0); assert.equal(f.action(), null);
  const failed = await fixture({ showError: true });
  await assert.rejects(failed.launch(), /host unavailable/);
  assert.equal(failed.closed(), 1); assert.equal(failed.released(), 3);
  const missing = await fixture({ sha: '' });
  await assert.rejects(missing.launch(), /Missing preview integrity/);
  assert.equal(missing.spec(), undefined);
});


test('business file requests lazily load the shared helper and return without chat authority', async t => {
  const base = resolve(import.meta.dirname, '../../../.runtime/tests/business-files');
  fs.mkdirSync(base, { recursive: true });
  const cwd = fs.realpathSync(fs.mkdtempSync(join(base, 'host-')));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const helper = resolve(import.meta.dirname, '../desktop/business-files.js');
  const validator = resolve(import.meta.dirname, '../desktop/business-validator.generated.js');
  let calls = 0, loaded = 0;
  const File = {
    cwd: () => join(cwd, 'different-staged-package'), join,
    read: file => { calls++; if (file === '/relocated/package/desktop/business-files.js') { loaded++; return fs.readFileSync(helper, 'utf8'); } if (file === '/relocated/package/desktop/business-validator.generated.js') return fs.readFileSync(validator, 'utf8'); return fs.readFileSync(file, 'utf8'); },
    realPath: file => { calls++; return fs.realpathSync(file); },
    stat: file => { calls++; try { const s = fs.statSync(file); return { type: s.isFile() ? 'file' : 'directory', size: s.isFile() ? s.size : null }; } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    ensureDir: file => { calls++; fs.mkdirSync(file, { recursive: true }); },
    writeNew: (file, text) => { calls++; fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 }); }
  };
  const f = await fixture({ File, businessWorkdir: cwd }); await f.launch();
  assert.equal(calls, 0); assert.equal(fs.existsSync(join(cwd, '.runtime')), false);
  const business = join(cwd, '.runtime/business-sync'); fs.mkdirSync(business, { recursive: true });
  fs.writeFileSync(join(business, 'multistore-v1.json'), '{"schemaVersion":1}');
  await f.send(JSON.stringify({ type: 'support.businessFile', requestId: 'r1', operation: 'snapshot', name: 'multistore-v1.json' }));
  assert.deepEqual(JSON.parse(JSON.stringify(f.posted.at(-1))), { type: 'support.businessFileResult', requestId: 'r1', status: 'ok', name: 'multistore-v1.json', text: '{"schemaVersion":1}', transferId: 'r1', offset: 0, total: 19 });
  await f.send(JSON.stringify({ type: 'support.businessFile', requestId: 'r2', operation: 'snapshot', path: '/private' }));
  assert.equal(f.posted.at(-1).code, 'INVALID_REQUEST'); assert.equal(loaded, 1);
  assert.ok(!f.logs.some(log => log.type === 'rejected-message'));
  // Exercise the actual host dispatch with web postMessage(JSON.stringify(request)).
  let serial = 0;
  async function send(operation, extra = {}) {
    const text = JSON.stringify({ type: 'support.businessFile', requestId: 'host-' + (++serial), operation, ...extra });
    assert.ok(Buffer.byteLength(JSON.stringify(text)) <= 65536);
    await f.send(JSON.parse(JSON.stringify(text)));
    const response = f.posted.at(-1); assert.equal(response.requestId, 'host-' + serial);
    return response;
  }
  // Exercise the real canonical parser with a legal large business backup.
  // Each customer stays within notes limits; the aggregate exceeds one frame.
  const text = JSON.stringify({ schemaVersion: 1, format: 'opendesk.ai-customer-support.business-backup',
    revision: 0, stores: [{ id: 'fixture-store', name: '测试门店' }],
    records: Array.from({ length: 20 }, (_, i) => ({
      storeId: 'fixture-store', sourceId: 'fixture-source', kind: 'customer', id: 'customer-' + i,
      version: 1, updatedAt: '2026-10-30T00:00:00.000Z', deleted: false,
      data: { name: '客户' + i, conversationId: null, tags: [], notes: '中\\\n"'.repeat(1000) }
    })), overrides: [], cursors: {} });
  assert.ok(Buffer.byteLength(text) > 65536);
  const start = await send('backupStart', { total: text.length });
  const before = calls;
  for (let offset = 0; offset < text.length; offset += 8192) {
    const ack = await send('backupChunk', { transferId: start.transferId, offset, text: text.slice(offset, offset + 8192) });
    assert.equal(ack.status, 'ok');
  }
  assert.equal(calls, before);
  const committed = await send('backupCommit', { transferId: start.transferId }); assert.equal(committed.status, 'ok');
  const first = await send('restore', { name: committed.name });
  const chunks = [first.text]; let offset = first.text.length;
  while (offset < first.total) {
    const part = await send('readChunk', { transferId: first.transferId, offset });
    assert.equal(part.status, 'ok'); chunks.push(part.text); offset += part.text.length;
  }
  assert.equal(chunks.join(''), text);
  assert.equal((await send('backup', { text: '{}' })).code, 'INVALID_REQUEST');
  assert.equal(f.closed(), 0); assert.equal(typeof f.action(), 'function');
  await f.send({ type: 'support.ready' }); assert.equal(f.posted.at(-1).mode, 'disconnected');
});

test('helper load failure returns a fixed error without filesystem details', async () => {
  const f = await fixture({ File: { join, read() { throw Error('/private/secret-file'); } } }); await f.launch();
  await f.send({ type: 'support.businessFile', requestId: 'r1', operation: 'snapshot', name: 'a.json' });
  assert.deepEqual(JSON.parse(JSON.stringify(f.posted)), [{ type: 'support.businessFileResult', requestId: 'r1', status: 'error', code: 'FILE_UNAVAILABLE' }]);
});
