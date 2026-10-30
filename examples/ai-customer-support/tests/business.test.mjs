import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const built = await build({ entryPoints: [resolve(import.meta.dirname, '../src/domain/business.ts')], bundle: true,
  write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
const b = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text + '\n//# sourceURL=business-test-bundle.mjs').toString('base64'));
const copy = value => JSON.parse(JSON.stringify(value));
const fresh = b.createBusinessState;
const key = (store = 'store-demo', source = 'demo') => JSON.stringify([store, source]);
const record = (s, kind, id) => copy(s.records.find(e => e.storeId === 'store-demo' && e.kind === kind && (!id || e.id === id)));
const advance = e => ({ ...copy(e), version: e.version + 1, updatedAt: '2026-10-30T00:00:00.000Z' });
const snapshot = (records = [], extra = {}) => ({ schemaVersion: 1, storeId: 'store-demo', sourceId: 'demo',
  previousCursor: 'demo-v1', cursor: 'page-2', records, ...extra });
const apply = (s, snap) => b.applyBusinessImport(s, b.previewBusinessImport(s, snap));
const localCustomer = (id = 'local-c') => ({ storeId: 'store-demo', sourceId: 'local', kind: 'customer', id,
  version: 1, updatedAt: '2026-10-30T00:00:00.000Z', deleted: false,
  data: { name: '本地客户', conversationId: null, tags: [], notes: '' } });

test('same-cursor polling validates unchanged state, without claiming original page identity', () => {
  const s = fresh(), product = record(s, 'product');
  for (const records of [[], [product]]) for (const previousCursor of [null, 'older-page', 'demo-v1']) {
    assert.equal(apply(s, snapshot(records, { previousCursor, cursor: 'demo-v1' })), s);
  }
  unchangedOnError(s, () => apply(s, snapshot([advance(product)], { cursor: 'demo-v1' })));
  unchangedOnError(s, () => apply(s, snapshot([], { previousCursor: 'wrong', cursor: 'next' })));
});

test('UTF-8 snapshot byte limit distinguishes bounded ASCII from multibyte customer notes', () => {
  const records = Array.from({ length: 500 }, (_, i) => ({ ...localCustomer('unicode-' + i), sourceId: 'demo', data: {
    name: '客户', conversationId: null, tags: [], notes: 'a'.repeat(1000)
  } }));
  const ascii = JSON.stringify(snapshot(records));
  assert.ok(Buffer.byteLength(ascii) < b.BUSINESS_LIMITS.maxSnapshotBytes);
  assert.doesNotThrow(() => b.parseBusinessSnapshot(ascii));
  for (const e of records) e.data.notes = '汉'.repeat(1000);
  const multibyte = JSON.stringify(snapshot(records));
  assert.ok(Buffer.byteLength(multibyte) > b.BUSINESS_LIMITS.maxSnapshotBytes);
  assert.throws(() => b.parseBusinessSnapshot(multibyte), /byte limit/);
});
function unchangedOnError(s, fn) {
  const before = JSON.stringify(s);
  assert.throws(fn);
  assert.equal(JSON.stringify(s), before, 'rejected operation must not mutate source state');
}

test('two fictitious stores reuse IDs without data or mutation leakage', () => {
  const s = fresh();
  assert.deepEqual(s.stores.map(x => x.name), ['示例旗舰店', '示例分店']);
  assert.equal(b.effectiveEntities(s, 'store-demo', 'product').length, 6);
  assert.equal(b.effectiveEntities(s, 'store-demo', 'order').length, 8);
  assert.equal(b.effectiveEntities(s, 'store-demo', 'image').length, 12);
  assert.equal(b.effectiveEntities(s, 'store-outlet', 'product').length, 1);
  assert.equal(b.effectiveEntities(s, 'store-outlet', 'order').length, 1);
  assert.ok(s.records.every(e => e.updatedAt === '2026-10-28T00:00:00.000Z'));
  const e = advance(record(s, 'product')); e.data.name = '旗舰更新';
  const next = apply(s, snapshot([e]));
  assert.equal(b.effectiveEntities(next, 'store-demo', 'product')[0].data.name, '旗舰更新');
  assert.notEqual(b.effectiveEntities(next, 'store-outlet', 'product')[0].data.name, '旗舰更新');
  const detached = b.effectiveEntities(next, 'store-demo'); detached[0].data.name = 'mutated';
  assert.notEqual(next.records[0].data.name, 'mutated');
  assert.equal(b.entityKey(e), JSON.stringify(['store-demo', 'product', e.id]));
});

test('strict snapshot schema rejects hostile keys, values, dates, enums and limits', () => {
  const s = fresh(), product = record(s, 'product'), order = record(s, 'order');
  const invalid = [
    { ...snapshot(), unexpected: true }, { ...snapshot(), schemaVersion: 2 },
    { ...snapshot(), records: [product, product] },
    snapshot([{ ...product, storeId: 'store-outlet' }]), snapshot([{ ...product, sourceId: 'other' }]),
    snapshot([{ ...product, version: 0 }]), snapshot([{ ...product, version: 1.5 }]),
    snapshot([{ ...product, kind: 'script' }]), snapshot([{ ...product, deleted: 'false' }]),
    snapshot([{ ...product, updatedAt: '2026-02-30T00:00:00.000Z' }]),
    snapshot([{ ...product, updatedAt: '2026-10-30T00:00:00+00:00' }]),
    snapshot([{ ...product, deleted: true }]), snapshot([{ ...product, data: null }]),
    snapshot([{ ...product, data: { ...product.data, id: 'wrong' } }]),
    snapshot([{ ...product, data: { ...product.data, extra: 'script' } }]),
    snapshot([{ ...product, data: { ...product.data, price: 'NaN' } }]),
    snapshot([{ ...product, data: { ...product.data, imageType: 'svg' } }]),
    snapshot([{ ...product, data: { ...product.data, name: 'x'.repeat(2001) } }]),
    snapshot([{ ...product, data: { ...product.data, images: [product.data.images[0], product.data.images[0]] } }]),
    snapshot([{ ...order, data: { ...order.data, amount: -1 } }]),
    snapshot([{ ...order, data: { ...order.data, amount: 1.001 } }]),
    snapshot([{ ...order, data: { ...order.data, status: 'fake' } }]),
    snapshot([{ ...order, data: { ...order.data, items: [{ ...order.data.items[0], quantity: 0 }] } }]),
    snapshot(Array(1001).fill(product))
  ];
  for (const bad of invalid) assert.throws(() => b.parseBusinessSnapshot(JSON.stringify(bad)));
  for (const bad of ['{"__proto__":{}}', '{"constructor":{}}', '{"a":{"prototype":1}}', '[]', 'null', 'NaN', '{'])
    assert.throws(() => b.parseBusinessSnapshot(bad));
  assert.throws(() => b.parseBusinessSnapshot(' '.repeat(4 * 1024 * 1024 + 1)));
  assert.throws(() => b.previewBusinessImport(s, Object.assign(snapshot(), { records: [{ ...product, data: { ...product.data, amount: Infinity } }] })));
  const deep = {}; let cursor = deep; for (let i = 0; i < 22; i++) cursor = cursor.nested = {};
  assert.throws(() => b.parseBusinessSnapshot(JSON.stringify(deep)));
  assert.throws(() => b.previewBusinessImport(s, { ...snapshot(), records: [{ ...product, get data() { throw Error('getter'); } }] }));
});

test('atomic preview/apply; exact replay, reordered keys and cursor-only changes are idempotent', () => {
  const s = fresh(), p = advance(record(s, 'product')); p.data.name = 'new';
  const snap = snapshot([p]), preview = b.previewBusinessImport(s, snap);
  assert.equal(preview.updated, 1); assert.equal(s.revision, 0);
  snap.records[0].data.name = 'caller mutation';
  const next = b.applyBusinessImport(s, preview);
  assert.equal(next.revision, 1); assert.equal(next.cursors[key()], 'page-2');
  assert.equal(next.records.find(e => b.entityKey(e) === b.entityKey(p)).data.name, 'new');
  assert.equal(apply(next, preview.snapshot), next);
  const reordered = copy(preview.snapshot); reordered.records = reordered.records.map(e => Object.fromEntries(Object.entries(e).reverse()));
  assert.equal(apply(next, reordered), next);
  const cursorOnly = apply(next, snapshot([], { previousCursor: 'page-2', cursor: 'page-3' }));
  assert.equal(cursorOnly.revision, 2);
  assert.equal(apply(cursorOnly, snapshot([], { previousCursor: 'page-2', cursor: 'page-3' })), cursorOnly);
  unchangedOnError(next, () => b.applyBusinessImport(next, preview));
  const forged = b.previewBusinessImport(s, snapshot([p])); forged.updated = 10;
  unchangedOnError(s, () => b.applyBusinessImport(s, forged));
  unchangedOnError(s, () => apply(s, snapshot([{ ...p, version: 0 }])));
  unchangedOnError(next, () => apply(next, snapshot([], { previousCursor: 'demo-v1', cursor: 'page-4' })));
  unchangedOnError(next, () => apply(next, snapshot([{ ...p, version: 3 }])));
});

test('rollback, same-version content and ownership conflicts reject the entire delta', () => {
  const s = fresh(), p = record(s, 'product'), other = advance(record(s, 'customer'));
  other.data.notes = 'must not apply';
  for (const bad of [
    { ...p, data: { ...p.data, name: 'same-version conflict' } },
    { ...p, version: 0 }, { ...p, version: 2, updatedAt: '2026-10-27T00:00:00.000Z' }
  ]) unchangedOnError(s, () => apply(s, snapshot([other, bad])));
  const collision = { ...p, sourceId: 'crm' };
  unchangedOnError(s, () => apply(s, snapshot([collision], { sourceId: 'crm', previousCursor: null })));
  assert.throws(() => b.parseBusinessSnapshot(JSON.stringify(snapshot([], { sourceId: 'local', previousCursor: null }))));
});

test('references resolve against the complete final dataset, never another store/source', () => {
  const s = fresh(), p = record(s, 'product'), c = record(s, 'customer'), o = record(s, 'order');
  const source = 'crm';
  const importedP = { ...p, id: 'crm:product', sourceId: source, data: { ...p.data, id: 'crm:product' } };
  const importedC = { ...c, id: 'crm:external-customer', sourceId: source, data: { ...c.data, conversationId: null } };
  const importedO = { ...o, id: 'crm:order', sourceId: source, data: { ...o.data, orderId: 'crm:order', customerId: importedC.id,
    items: [{ ...o.data.items[0], productId: importedP.id }] } };
  const snap = snapshot([importedO, importedC, importedP], { sourceId: source, previousCursor: null });
  const next = apply(s, snap);
  assert.equal(next.records.filter(e => e.sourceId === 'crm').length, 3);
  for (const bad of [
    { ...importedO, data: { ...importedO.data, customerId: 't1' } },
    { ...importedO, data: { ...importedO.data, customerId: 'missing' } },
    { ...importedO, data: { ...importedO.data, items: [{ ...importedO.data.items[0], productId: p.id }] } },
    { ...importedO, data: { ...importedO.data, items: [{ ...importedO.data.items[0], sku: 'WRONG' }] } }
  ]) unchangedOnError(s, () => apply(s, { ...snap, records: [importedP, importedC, bad] }));
  const outletOnly = copy(s); outletOnly.records = outletOnly.records.filter(e => !(e.storeId === 'store-demo' && e.kind === 'product' && e.id === p.id));
  unchangedOnError(outletOnly, () => apply(outletOnly, snapshot()));
});

test('tombstones block dangling deletion; whole graph deletion, replay and resurrection work', () => {
  const s = fresh(), p = record(s, 'product');
  unchangedOnError(s, () => apply(s, snapshot([{ ...advance(p), deleted: true, data: null }])));
  const batch = s.records.filter(e => e.storeId === 'store-demo').map(e => ({ ...advance(e), deleted: true, data: null }));
  const snap = snapshot(batch), next = apply(s, snap);
  assert.equal(b.effectiveEntities(next, 'store-demo').length, 0);
  assert.equal(b.effectiveEntities(next, 'store-outlet', 'order').length, 1);
  assert.equal(next.records.filter(e => e.deleted).length, batch.length);
  assert.equal(apply(next, snap), next);
  unchangedOnError(next, () => apply(next, snapshot([p], { previousCursor: 'page-2', cursor: 'page-3' })));
  const resurrect = { ...p, version: 3, updatedAt: '2026-10-31T00:00:00.000Z' };
  assert.equal(apply(next, snapshot([resurrect], { previousCursor: 'page-2', cursor: 'page-3' })).records.find(e => b.entityKey(e) === b.entityKey(p)).deleted, false);
});

test('local overlays retain source/version, reject upstream conflict and clear safely', () => {
  const s = fresh(), c = record(s, 'customer'); c.data.notes = '人工备注';
  const next = b.saveLocalEntity(s, c);
  assert.equal(next.overrides.length, 1); assert.equal(next.revision, 1);
  assert.equal(b.effectiveEntities(next, 'store-demo', 'customer')[0].data.notes, '人工备注');
  assert.equal(next.records.find(e => b.entityKey(e) === b.entityKey(c)).data.notes, '');
  assert.equal(b.saveLocalEntity(next, c), next);
  unchangedOnError(next, () => apply(next, snapshot([advance(record(s, 'customer'))])));
  assert.equal(apply(next, snapshot([record(s, 'customer')])).overrides.length, 1, 'unchanged upstream can advance cursor');
  const cleared = b.clearLocalOverride(next, b.entityKey(c));
  assert.equal(cleared.overrides.length, 0);
  assert.equal(b.effectiveEntities(cleared, 'store-demo', 'customer')[0].data.notes, '');
  assert.equal(b.clearLocalOverride(cleared, b.entityKey(c)), cleared);
  for (const bad of [{ ...c, sourceId: 'other' }, { ...c, version: 2 }, { ...c, updatedAt: '2026-10-27T00:00:00.000Z' }, record(s, 'order')])
    unchangedOnError(s, () => b.saveLocalEntity(s, bad));
  unchangedOnError(s, () => b.saveLocalEntity(s, { ...c, deleted: true, data: null }));
});

test('local create/update/removal validates references and customer slot uniqueness', () => {
  const s = fresh(), c = localCustomer();
  const added = b.saveLocalEntity(s, c);
  assert.equal(added.records.length, s.records.length + 1);
  assert.equal(b.saveLocalEntity(added, c), added);
  assert.equal(b.clearLocalOverride(added, b.entityKey(c)).records.length, s.records.length);
  for (const bad of [{ ...c, sourceId: 'external' }, { ...c, version: 2 }, { ...c, data: { ...c.data, conversationId: 't1' } },
    { ...c, data: { ...c.data, conversationId: 'native-user' } }]) unchangedOnError(s, () => b.saveLocalEntity(s, bad));
  const p = record(s, 'product'); p.sourceId = 'local'; p.id = p.data.id = 'local-product';
  let next = b.saveLocalEntity(s, p);
  const image = { ...localCustomer('local-image'), kind: 'image', data: { productId: p.id, imageId: 'front', label: '本地图片', dataUrl: null } };
  next = b.saveLocalEntity(next, image);
  unchangedOnError(next, () => b.clearLocalOverride(next, b.entityKey(p)));
  const cleared = b.clearLocalOverride(b.clearLocalOverride(next, b.entityKey(image)), b.entityKey(p));
  assert.equal(cleared.records.length, s.records.length);
  unchangedOnError(next, () => b.saveLocalEntity(next, { ...image, id: 'second-image' }));
  unchangedOnError(s, () => b.saveLocalEntity(s, { ...image, data: { ...image.data, productId: 'demo-jacket' } }));
});

test('bitmap uploads are bounded base64 PNG/JPEG/WebP with matching magic; null demo remains valid', () => {
  const s = fresh(), image = record(s, 'image');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1kAAAAASUVORK5CYII=';
  const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
  const webp = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=';
  for (const value of [null, 'data:image/png;base64,' + png, 'data:image/jpeg;base64,' + jpeg, 'data:image/webp;base64,' + webp]) {
    const e = copy(image); e.data.dataUrl = value;
    assert.doesNotThrow(() => b.saveLocalEntity(s, e));
  }
  for (const value of ['https://example.test/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,PHN2Zz4=',
    'data:image/jpeg;base64,' + png, 'data:image/png;base64,abc', 'data:image/png;base64,!!!!',
    'data:image/png;base64,' + Buffer.alloc(512 * 1024 + 1).toString('base64')]) {
    const e = copy(image); e.data.dataUrl = value;
    unchangedOnError(s, () => b.saveLocalEntity(s, e));
  }
  const invalid = copy(image); invalid.data.imageId = 'missing';
  unchangedOnError(s, () => b.saveLocalEntity(s, invalid));
});

test('backup is a distinct, explicit, strict round trip preserving overlays/tombstones/cursors', () => {
  const s = fresh(), c = record(s, 'customer'); c.data.notes = '本地修改';
  let next = b.saveLocalEntity(s, c); next = b.saveLocalEntity(next, localCustomer());
  const dead = { ...localCustomer('removed-external'), sourceId: 'crm', deleted: true, data: null };
  next = apply(next, snapshot([dead], { sourceId: 'crm', previousCursor: null }));
  const exported = b.exportBusinessBackup(next), doc = JSON.parse(exported);
  assert.equal(doc.format, 'opendesk.ai-customer-support.business-backup');
  assert.deepEqual(b.parseBusinessBackup(exported), next);
  const restored = b.parseBusinessBackup(exported); restored.records[0].data.name = 'isolated';
  assert.notEqual(next.records[0].data.name, 'isolated');
  assert.throws(() => b.parseBusinessSnapshot(exported));
  assert.throws(() => b.parseBusinessBackup(JSON.stringify(snapshot())));
});

test('hostile or inconsistent backups reject atomically without replacing current state', () => {
  const s = fresh(), base = JSON.parse(b.exportBusinessBackup(s));
  const invalid = [
    { ...base, format: 'other' }, { ...base, schemaVersion: 2 }, { ...base, revision: -1 },
    { ...base, grants: ['native'] }, { ...base, chats: [] }, { ...base, hooks: 'code' }, { ...base, secrets: {} },
    { ...base, stores: [base.stores[0], base.stores[0]] }, { ...base, stores: [{ ...base.stores[0], extra: true }] },
    { ...base, records: [...base.records, base.records[0]] },
    { ...base, records: base.records.slice(1) },
    { ...base, overrides: [record(s, 'order')] },
    { ...base, overrides: [{ ...record(s, 'customer'), sourceId: 'other' }] },
    { ...base, overrides: [{ ...record(s, 'customer'), version: 2 }] },
    { ...base, overrides: [localCustomer()] },
    { ...base, cursors: { 'not-json': 'cursor' } },
    { ...base, cursors: { '["missing","demo"]': 'cursor' } },
    { ...base, cursors: { '["store-demo","local"]': 'cursor' } },
    { ...base, cursors: { '["store-demo", "demo"]': 'cursor' } },
    { ...base, cursors: { [key()]: '' } }
  ];
  for (const bad of invalid) unchangedOnError(s, () => b.parseBusinessBackup(JSON.stringify(bad)));
  assert.throws(() => b.parseBusinessBackup('{"__proto__":{}}'));
  const bad = copy(base); bad.records[0].data.specs[0].constructor = 'attack';
  unchangedOnError(s, () => b.parseBusinessBackup(JSON.stringify(bad)));
  assert.throws(() => b.exportBusinessBackup({ ...s, stores: [{ id: 'missing', name: 'bad' }] }));
});

test('whole store cap includes earlier pages, tombstones and all sources', () => {
  const s = fresh(), count = s.records.filter(e => e.storeId === 'store-demo').length;
  const records = Array.from({ length: 1000 - count }, (_, i) => ({ ...localCustomer('crm:' + i), sourceId: 'crm', deleted: true, data: null }));
  const full = apply(s, snapshot(records, { sourceId: 'crm', previousCursor: null }));
  assert.equal(full.records.filter(e => e.storeId === 'store-demo').length, 1000);
  unchangedOnError(full, () => apply(full, snapshot([{ ...localCustomer('other:1'), sourceId: 'other' }], { sourceId: 'other', previousCursor: null })));
  unchangedOnError(full, () => b.saveLocalEntity(full, localCustomer()));
  const backup = JSON.parse(b.exportBusinessBackup(full)); backup.records.push({ ...localCustomer('overflow'), sourceId: 'crm' });
  assert.throws(() => b.parseBusinessBackup(JSON.stringify(backup)));
});

test('direct API hostile objects cannot execute accessors or hide extra array properties', () => {
  const s = fresh(); let called = false;
  const hostile = snapshot();
  Object.defineProperty(hostile, 'records', { enumerable: true, get() { called = true; return []; } });
  assert.throws(() => b.previewBusinessImport(s, hostile));
  assert.equal(called, false);
  const hostileArray = [];
  Object.defineProperty(hostileArray, '0', { enumerable: true, get() { called = true; return record(s, 'product'); } });
  assert.throws(() => b.previewBusinessImport(s, snapshot(hostileArray)));
  assert.equal(called, false);
  const extra = []; extra.hidden = true;
  assert.throws(() => b.previewBusinessImport(s, snapshot(extra)));
  assert.throws(() => b.previewBusinessImport(s, snapshot(new Array(2))));
});

test('product slots need no asset; replacing an existing image is a source-preserving overlay', () => {
  const s = fresh(), p = record(s, 'product');
  p.id = p.data.id = 'local-product'; p.sourceId = 'local';
  p.data.images = [{ id: 'front', label: '正面' }];
  const next = b.saveLocalEntity(s, p);
  assert.equal(b.effectiveEntities(next, 'store-demo', 'image').length, 12);
  assert.equal(b.effectiveEntities(next, 'store-demo', 'product').length, 7);
  const image = record(s, 'image'); image.data.label = '上传替换';
  const overlay = b.saveLocalEntity(next, image);
  assert.equal(overlay.overrides[0].sourceId, 'demo');
  assert.equal(overlay.overrides[0].version, image.version);
  assert.equal(b.effectiveEntities(overlay, 'store-demo', 'image').find(e => e.id === image.id).data.label, '上传替换');
});

test('clearing mapping overrides cannot restore a duplicate conversation slot', () => {
  const s = fresh();
  const first = record(s, 'customer', 't1'); first.data.conversationId = null;
  const second = record(s, 'customer', 't2'); second.data.conversationId = 't1';
  const next = b.saveLocalEntity(b.saveLocalEntity(s, first), second);
  unchangedOnError(next, () => b.clearLocalOverride(next, b.entityKey(first)));
  const restored = b.clearLocalOverride(b.clearLocalOverride(next, b.entityKey(second)), b.entityKey(first));
  assert.equal(restored.overrides.length, 0);
  const bad = JSON.parse(b.exportBusinessBackup(s));
  bad.records.find(e => e.storeId === 'store-demo' && e.kind === 'customer' && e.id === 't2').data.conversationId = 't1';
  assert.throws(() => b.parseBusinessBackup(JSON.stringify(bad)));
});

test('preview revalidation catches final reference conflicts and stale revisions after local edits', () => {
  const s = fresh(), p = advance(record(s, 'product'));
  const preview = b.previewBusinessImport(s, snapshot([p]));
  preview.snapshot.records[0].data.sku = 'conflicts-with-existing-orders';
  unchangedOnError(s, () => b.applyBusinessImport(s, preview));
  const good = b.previewBusinessImport(s, snapshot([p]));
  const next = b.saveLocalEntity(s, localCustomer());
  unchangedOnError(next, () => b.applyBusinessImport(next, good));
  const old = JSON.parse(b.exportBusinessBackup(s));
  old.records[0].version = 0;
  unchangedOnError(next, () => b.parseBusinessBackup(JSON.stringify(old)));
});

test('user-defined stores validate IDs/names/caps and support isolated imports and backups', () => {
  const s = fresh(), next = b.addBusinessStore(s, 'merchant-3', '我的测试店');
  assert.equal(s.stores.length, 2); assert.equal(next.stores.length, 3);
  assert.equal(next.revision, s.revision + 1);
  assert.deepEqual(b.effectiveEntities(next, 'merchant-3'), []);
  const customer = { ...localCustomer('external-c'), storeId: 'merchant-3', sourceId: 'crm' };
  const imported = apply(next, snapshot([customer], { storeId: 'merchant-3', sourceId: 'crm', previousCursor: null }));
  assert.equal(b.effectiveEntities(imported, 'merchant-3', 'customer').length, 1);
  assert.equal(b.effectiveEntities(imported, 'store-demo', 'customer').length, 3);
  assert.deepEqual(b.parseBusinessBackup(b.exportBusinessBackup(imported)), imported);
  for (const [id, name] of [['store-demo', '重复'], ['__proto__', '坏键'], ['contains spaces', '坏标识'],
    ['valid', ''], ['valid', 'x'.repeat(201)], ['valid', 'null\0byte']])
    unchangedOnError(s, () => b.addBusinessStore(s, id, name));
  let full = s;
  for (let i = 2; i < 20; i++) full = b.addBusinessStore(full, 'store-' + i, '店 ' + i);
  unchangedOnError(full, () => b.addBusinessStore(full, 'overflow', '第21店'));
});

test('serialized caps include overlays per store and across the entire workspace', () => {
  function largeState(storeCount, perStore) {
    const s = { revision: 0, stores: [], records: [], overrides: [], cursors: {} };
    for (let i = 0; i < storeCount; i++) {
      const storeId = 'large-' + i;
      s.stores.push({ id: storeId, name: storeId });
      s.cursors[JSON.stringify([storeId, 'crm'])] = 'one';
      for (let j = 0; j < perStore; j++) {
        const e = { ...localCustomer('customer-' + j), storeId, sourceId: 'crm' };
        e.data.notes = 'n'.repeat(10000);
        s.records.push(e);
        s.overrides.push({ ...e, data: { ...e.data, notes: 'o'.repeat(10000) } });
      }
    }
    return s;
  }
  const perStore = largeState(1, 320);
  assert.doesNotThrow(() => b.exportBusinessBackup({ ...perStore, overrides: [] }));
  assert.throws(() => b.exportBusinessBackup(perStore), /whole store limit/);
  const global = largeState(2, 220);
  assert.doesNotThrow(() => b.exportBusinessBackup({ ...global, overrides: [] }));
  assert.throws(() => b.exportBusinessBackup(global), /JSON byte limit/);
});

test('safe revision counters reject overflow; fixed CNY amounts round-trip through integer fen', () => {
  const s = fresh(), max = { ...s, revision: Number.MAX_SAFE_INTEGER };
  unchangedOnError(max, () => b.addBusinessStore(max, 'new-store', '新店'));
  unchangedOnError(max, () => b.saveLocalEntity(max, localCustomer()));
  unchangedOnError(max, () => b.previewBusinessImport(max, snapshot()));
  for (const revision of [1.1, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => b.exportBusinessBackup({ ...s, revision }));
  }
  for (const amount of [0, 0.01, 0.29, 999999999.99, 1000000000]) {
    const order = advance(record(s, 'order')); order.data.amount = amount;
    assert.doesNotThrow(() => b.parseBusinessSnapshot(JSON.stringify(snapshot([order]))));
  }
  for (const amount of [0.001, 1e9 + 1, Number.MAX_SAFE_INTEGER, -0.01]) {
    const order = advance(record(s, 'order')); order.data.amount = amount;
    assert.throws(() => b.parseBusinessSnapshot(JSON.stringify(snapshot([order]))));
  }
});

// Small static bitmap fixtures; tests need no imaging library.
const bitmaps = {"png": "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGO8kyLCwMDAxAAGABDiAVjFpGe9AAAAAElFTkSuQmCC", "jpeg": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBKKKK+KPvD/9k=", "vp8": "UklGRjwAAABXRUJQVlA4IDAAAAAwAgCdASoCAAIAAUAmJaACdLoB+AH4AAToAAD+Ex/6yq+So/gz/+yr4TI/9OAAAAA=", "vp8l": "UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQsnKXov+BiOh/AAA=", "vp8x": "UklGRlwAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAAZGRkZABWUDggMAAAADACAJ0BKgIAAgABQCYloAJ0ugH4AfgABOgAAP4TH/rKr5Kj+DP/7KvhMj/04AAAAA=="};

test('all bitmap headers enforce dimensions, pixel caps and complete container framing', () => {
  const s = fresh(), image = record(s, 'image');
  function accept(name, buffer) {
    const e = copy(image), mime = name === 'png' ? 'png' : name === 'jpeg' ? 'jpeg' : 'webp';
    e.data.dataUrl = 'data:image/' + mime + ';base64,' + buffer.toString('base64');
    return () => b.saveLocalEntity(s, e);
  }
  const dimensions = (name, data, w, h) => {
    if (name === 'png') { data.writeUInt32BE(w, 16); data.writeUInt32BE(h, 20); }
    else if (name === 'jpeg') {
      const at = data.indexOf(Buffer.from([255, 192]));
      assert.ok(at > 0); data.writeUInt16BE(h, at + 5); data.writeUInt16BE(w, at + 7);
    } else if (name === 'vp8') {
      const at = data.indexOf('VP8 ') + 8; data.writeUInt16LE(w, at + 6); data.writeUInt16LE(h, at + 8);
    } else if (name === 'vp8l') {
      const at = data.indexOf('VP8L') + 9; data.writeUInt32LE((w - 1) | ((h - 1) << 14), at);
    } else {
      const at = data.indexOf('VP8X') + 8;
      data.writeUIntLE(w - 1, at + 4, 3); data.writeUIntLE(h - 1, at + 7, 3);
      const vp8 = data.indexOf('VP8 ') + 8;
      data.writeUInt16LE(w, vp8 + 6); data.writeUInt16LE(h, vp8 + 8);
    }
    return data;
  };
  for (const [name, base64] of Object.entries(bitmaps)) {
    const valid = Buffer.from(base64, 'base64');
    assert.doesNotThrow(accept(name, valid), name + ' valid static bitmap');
    assert.throws(accept(name, valid.subarray(0, valid.length - 1)), name + ' truncated ending');
    assert.throws(accept(name, valid.subarray(0, 33)), name + ' truncated header');
    for (const [w, h] of [[4097, 1], [2049, 2048]]) {
      assert.throws(accept(name, dimensions(name, Buffer.from(valid), w, h)), name + ' dimension cap');
    }
  }
  const png = Buffer.from(bitmaps.png, 'base64');
  assert.throws(accept('png', dimensions('png', png, 0, 1)));
  const webp = Buffer.from(bitmaps.vp8x, 'base64');
  webp[webp.indexOf('VP8X') + 8] |= 2;
  assert.throws(accept('vp8x', webp), 'animated WebP rejected');
  assert.equal(b.BUSINESS_LIMITS.maxImageBytes, 128 * 1024);
  assert.equal(b.BUSINESS_LIMITS.maxSnapshotBytes, 1024 * 1024);
  assert.equal(b.BUSINESS_LIMITS.maxBackupBytes, 8 * 1024 * 1024);
  assert.ok(Object.isFrozen(b.BUSINESS_LIMITS));
});
