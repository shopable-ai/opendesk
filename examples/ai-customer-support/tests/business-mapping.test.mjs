import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve, join } from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '../..');
const bundled = await build({ entryPoints: [join(root, 'src/domain/business-mapping.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
const m = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const businessBundle = await build({ entryPoints: [join(root, 'src/domain/business.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
const b = await import('data:text/javascript;base64,' + Buffer.from(businessBundle.outputFiles[0].text).toString('base64'));
function fixture(kind = 'product') {
  const plan = m.createMappingPlan(kind, 'store-a');
  const rows = JSON.parse(m.mappingSample(kind));
  const context = { storeId: plan.storeId, sourceId: plan.sourceId, previousCursor: null, cursor: 'page-1' };
  return { plan, rows, context, run: () => m.runMappingPlan(plan, JSON.stringify(rows), context) };
}

test('product/customer defaults, detached plans and fictional samples satisfy business DTO', () => {
  for (const kind of ['product', 'customer']) {
    const f = fixture(kind), s = f.run(), e = s.records[0];
    assert.equal(f.plan.sourceId, `mapping-${kind === 'product' ? 'products' : 'customers'}`);
    assert.match(f.plan.name, /字段映射/);
    assert.deepEqual(m.parseMappingPlan(JSON.stringify(f.plan)), f.plan);
    assert.deepEqual(Object.keys(f.plan.fields), m.mappingFields[kind].map(f => f.key));
    assert.equal(e.kind, kind); assert.equal(e.version, 1);
    assert.equal(e.updatedAt, '2026-10-30T00:00:00.000Z');
    assert.equal(e.id, f.rows[0].id);
    assert.deepEqual(m.mapBusinessRow(f.plan, f.rows[0], f.context), e);
    if (kind === 'product') {
      assert.equal(e.id, 'mapped-mug-1'); assert.equal(e.data.price, '¥39.90');
      assert.deepEqual(e.data.images, []); assert.deepEqual(e.data.specs, []);
    } else { assert.equal(e.data.conversationId, null); assert.deepEqual(e.data.tags, []); }
    s.records[0].data.name = 'mutated'; assert.notEqual(f.run().records[0].data.name, 'mutated');
  }
});

test('renamed top-level fields and literal strings do not execute code', () => {
  const f = fixture();
  f.plan.fields.name = '商品标题'; f.rows[0]['商品标题'] = 'globalThis.mappingInjected = true'; delete f.rows[0].title;
  assert.equal(f.run().records[0].data.name, 'globalThis.mappingInjected = true');
  assert.equal(globalThis.mappingInjected, undefined);
  for (const selector of ['__proto__', 'prototype', 'constructor', 'x'.repeat(81), '', '  ', 'line\nname', 'name\u0085']) {
    const p = { ...f.plan, fields: { ...f.plan.fields, name: selector } };
    assert.throws(() => m.parseMappingPlan(JSON.stringify(p)), /检查配置.*name/);
  }
});

test('original column labels including spaces and expression-like text are literal own-property keys', () => {
  for (const selector of ['Product Name', '商品 名称', '价格(元)', 'x.y', 'x[0]', 'x()',
    'globalThis.mappingInjected = true', ' original label ']) {
    const f = fixture();
    f.plan.fields.name = selector;
    delete f.rows[0].title;
    f.rows[0][selector] = '虚构商品原文';
    f.rows[0].extra = { ignored: true };
    assert.deepEqual(m.parseMappingPlan(JSON.stringify(f.plan)), f.plan);
    assert.equal(f.run().records[0].data.name, '虚构商品原文');
    assert.equal(globalThis.mappingInjected, undefined);
    delete f.rows[0][selector]; f.rows[0].x = { y: 'nested must not match' };
    assert.throws(f.run, /选择字段.*name/);
  }
  const f = fixture(); f.plan.fields.price = '价格(元)';
  f.rows[0]['价格(元)'] = f.rows[0].price; delete f.rows[0].price;
  assert.equal(f.run().records[0].data.price, '¥39.90');
});

function statefulFixture(kind) {
  const state = b.createBusinessState();
  const base = state.records.find(e => e.storeId === 'store-demo' && e.kind === kind && !e.deleted);
  const f = fixture(kind);
  f.plan.storeId = f.context.storeId = base.storeId;
  f.plan.sourceId = f.context.sourceId = base.sourceId;
  f.context.previousCursor = 'demo-v1';
  f.rows[0].id = base.id; f.rows[0].version = base.version + 1;
  f.rows[0].updatedAt = '2026-10-31T00:00:00.000Z';
  return { ...f, state, base, run: () => m.runMappingPlan(f.plan, JSON.stringify(f.rows), f.context, state) };
}

test('stateful customer update preserves conversation and tags from base records, not overrides', () => {
  const f = statefulFixture('customer');
  f.base.data.tags = ['关联客户', '保留标签'];
  const state = b.parseBusinessBackup(b.exportBusinessBackup(f.state));
  const before = JSON.stringify(state);
  const s = m.runMappingPlan(f.plan, JSON.stringify(f.rows), f.context, state);
  assert.deepEqual(s.records[0].data, { ...f.base.data, name: f.rows[0].name, notes: f.rows[0].notes });
  assert.equal(s.records[0].version, f.rows[0].version);
  assert.equal(s.records[0].updatedAt, f.rows[0].updatedAt);
  assert.equal(b.previewBusinessImport(state, s).updated, 1);
  assert.equal(JSON.stringify(state), before);
  s.records[0].data.tags.push('detached'); assert.equal(JSON.stringify(state), before);
  const override = { ...structuredClone(f.base), data: { ...f.base.data, tags: ['本地覆盖'], conversationId: null } };
  const overridden = b.saveLocalEntity(state, override);
  const preserved = m.runMappingPlan(f.plan, JSON.stringify(f.rows), f.context, overridden);
  assert.deepEqual(preserved.records[0].data.tags, f.base.data.tags);
  assert.equal(preserved.records[0].data.conversationId, f.base.data.conversationId);
  assert.throws(() => b.previewBusinessImport(overridden, preserved), /upstream\/local conflict/);
});

test('stateful product update retains all unmapped fields and image relationships', () => {
  const f = statefulFixture('product');
  // Keep linked order SKU valid; the independent test below exercises SKU replacement.
  f.rows[0].sku = f.base.data.sku;
  const before = JSON.stringify(f.state), s = f.run(), e = s.records[0];
  const expected = { ...f.base.data, id: f.rows[0].id, name: f.rows[0].title,
    sku: f.rows[0].sku, price: f.rows[0].price, summary: f.rows[0].summary,
    updated: f.rows[0].updatedAt.slice(0, 10) };
  assert.ok(expected.images.length); assert.ok(expected.specs.length);
  assert.deepEqual(e.data, expected);
  assert.equal(e.version, f.rows[0].version); assert.equal(e.updatedAt, f.rows[0].updatedAt);
  assert.notEqual(f.base.data.updated, '2026-10-31');
  assert.equal(e.data.updated, '2026-10-31');
  assert.equal(b.previewBusinessImport(f.state, s).updated, 1);
  assert.equal(JSON.stringify(f.state), before);
  e.data.images[0].label = 'detached'; assert.equal(JSON.stringify(f.state), before);
  const isolated = { ...f.state, records: [f.base] };
  f.rows[0].sku = 'NEW-MAPPED-SKU';
  const changed = m.runMappingPlan(f.plan, JSON.stringify(f.rows), f.context, isolated);
  assert.equal(changed.records[0].data.sku, 'NEW-MAPPED-SKU');
  assert.equal(b.previewBusinessImport(isolated, changed).updated, 1);
  const stateless = m.runMappingPlan(f.plan, JSON.stringify(f.rows), f.context);
  assert.deepEqual(stateless.records[0].data.images, []);
  assert.deepEqual(stateless.records[0].data.specs, []);
});

test('state preservation matches exact owner/kind/id and uses defaults for tombstones', () => {
  for (const kind of ['product', 'customer']) {
    const f = statefulFixture(kind);
    const expected = m.runMappingPlan(f.plan, JSON.stringify(f.rows), f.context);
    for (const changes of [{ storeId: 'other-store' }, { sourceId: 'other-source' },
      { kind: kind === 'product' ? 'customer' : 'product' }, { id: 'other-id' }, { deleted: true, data: null }]) {
      const state = { ...f.state, records: [{ ...f.base, ...changes }], overrides: [f.base] };
      assert.deepEqual(m.runMappingPlan(f.plan, JSON.stringify(f.rows), f.context, state), expected);
    }
  }
});

test('strict plan keys, types, owner and UTF-8 limits', () => {
  const f = fixture();
  for (const p of [null, [], { ...f.plan, extra: true }, { ...f.plan, schemaVersion: 2 },
    { ...f.plan, kind: 'order' }, { ...f.plan, fields: { ...f.plan.fields, extra: 'x' } },
    { ...f.plan, fields: { id: 'id' } }, { ...f.plan, name: '' },
    { ...f.plan, storeId: '__proto__' }, { ...f.plan, sourceId: 'local' }, { ...f.plan, sourceId: 3 }]) {
    assert.throws(() => m.parseMappingPlan(JSON.stringify(p)), /字段映射/);
  }
  assert.throws(() => m.parseMappingPlan(' '.repeat(8193)), /读取配置/);
  const multi = ' '.repeat(8000) + '中'.repeat(100);
  assert.ok(multi.length < 8192); assert.throws(() => m.parseMappingPlan(multi), /读取配置/);
  assert.throws(() => m.parseMappingPlan('{"__proto__":{}}'), /检查配置/);
  assert.throws(() => m.parseMappingPlan('{'), /读取配置/);
  for (const key of ['storeId', 'sourceId']) {
    assert.throws(() => m.runMappingPlan(f.plan, '[]', { ...f.context, [key]: 'other' }), /检查归属/);
  }
  assert.throws(() => m.runMappingPlan(f.plan, '[]', { ...f.context, cursor: '' }), /归属与游标/);
});

test('each bad output field reports Chinese step, row and field without sensitive values', () => {
  for (const kind of ['product', 'customer']) {
    const original = fixture(kind);
    const cases = { id: ['bad id SECRET', null], name: ['', 123], version: [0, 1.5, '1'],
      updatedAt: ['SECRET-date', '2026-02-30T00:00:00.000Z'] };
    Object.assign(cases, kind === 'product' ? { sku: ['bad sku SECRET'], price: ['USD SECRET', 39.9], summary: ['', false] } : { notes: [false, 'SECRET'.repeat(2000)] });
    for (const [field, invalids] of Object.entries(cases)) for (const invalid of invalids) {
      const f = fixture(kind);
      f.rows.push({ ...f.rows[0], id: 'second', [f.plan.fields[field]]: invalid });
      assert.throws(f.run, error => {
        assert.match(error.message, new RegExp(`第 2 行，输出字段 ${field} 无效`));
        assert.ok(!error.message.includes('SECRET')); return true;
      });
    }
    for (const { key } of m.mappingFields[kind]) {
      const f = fixture(kind); delete f.rows[0][f.plan.fields[key]];
      assert.throws(f.run, new RegExp(`选择字段.*第 1 行.*${key}`));
    }
    assert.equal(original.run().records.length, 1);
  }
});

test('external product/customer lists ignore unselected columns without leaking them into output', () => {
  for (const kind of ['product', 'customer']) {
    const f = fixture(kind), expected = f.run();
    Object.assign(f.rows[0], { externalSecret: 'SECRET', stock: 42,
      metadata: { constructor: 'data only', nested: [{ expression: 'globalThis.mappingInjected = true' }] } });
    assert.deepEqual(f.run(), expected);
    assert.ok(!JSON.stringify(f.run()).includes('SECRET'));
    assert.equal(globalThis.mappingInjected, undefined);
  }
});

test('unselected nested content is never traversed or serialized; row accessors remain forbidden', () => {
  const f = fixture(), expected = m.mapBusinessRow(f.plan, f.rows[0], f.context);
  let calls = 0;
  const extra = { get nested() { calls++; throw Error('must not read'); },
    toJSON() { calls++; throw Error('must not serialize'); } };
  extra.self = extra;
  assert.deepEqual(m.mapBusinessRow(f.plan, { ...f.rows[0], extra }, f.context), expected);
  assert.equal(calls, 0);
  assert.throws(() => m.mapBusinessRow(f.plan, { ...f.rows[0],
    get unselected() { calls++; return 'SECRET'; } }, f.context), /读取数据行.*第 1 行/);
  assert.equal(calls, 0);
});

test('input array, count/UTF-8 size, prototype fields and ownership fail atomically', () => {
  const f = fixture();
  for (const input of ['{}', 'null', '{', JSON.stringify(Array(101).fill(f.rows[0])),
    ' '.repeat(65537), JSON.stringify([{ ...f.rows[0], summary: '中'.repeat(22000) }])]) {
    assert.throws(() => m.runMappingPlan(f.plan, input, f.context), /字段映射/);
  }
  for (const row of [null, [],
    { ...f.rows[0], storeId: 'other' }, { ...f.rows[0], sourceId: 'other' },
    { ...f.rows[0], title: { constructor: 'SECRET' } }]) {
    assert.throws(() => m.runMappingPlan(f.plan, JSON.stringify([row]), f.context), /第 1 行/);
  }
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const row = JSON.stringify(f.rows[0]).replace(/}$/, `,${JSON.stringify(key)}:"SECRET"}`);
    assert.throws(() => m.runMappingPlan(f.plan, `[${row}]`, f.context), /第 1 行/);
  }
  f.rows[0].storeId = f.context.storeId; f.rows[0].sourceId = f.context.sourceId;
  assert.equal(f.run().records.length, 1);
  f.rows.push({ ...f.rows[0] }); assert.throws(f.run, /重复记录.*第 2 行.*id/);
  // A separate empty batch is valid; it cannot return any partial failed batch.
  assert.deepEqual(m.runMappingPlan(f.plan, '[]', f.context).records, []);
  const hundred = Array.from({ length: 100 }, (_, i) => ({ ...f.rows[0], id: `item-${i}` }));
  assert.equal(m.runMappingPlan(f.plan, JSON.stringify(hundred), f.context).records.length, 100);
});

test('direct helper rejects getters, inherited prototypes and non-JSON properties without executing getters', () => {
  const f = fixture(); let calls = 0;
  const row = { ...f.rows[0], get title() { calls++; return 'SECRET'; } };
  assert.throws(() => m.mapBusinessRow(f.plan, row, f.context)); assert.equal(calls, 0);
  assert.throws(() => m.mapBusinessRow(f.plan, Object.create(f.rows[0]), f.context));
  assert.throws(() => m.mapBusinessRow(f.plan, { ...f.rows[0], [Symbol('secret')]: 1 }, f.context));
  const plan = { ...f.plan, fields: { ...f.plan.fields, get name() { calls++; return 'title'; } } };
  assert.throws(() => m.runMappingPlan(plan, '[]', f.context)); assert.equal(calls, 0);
  for (const key of ['storeId', 'sourceId', 'previousCursor', 'cursor']) {
    const context = { ...f.context, [key]: { toJSON() { calls++; return 'SECRET'; } } };
    assert.throws(() => m.runMappingPlan(f.plan, '[]', context));
  }
  assert.equal(calls, 0);
});

async function cli(t, mode) {
  await mkdir(join(repo, '.runtime/tests/business-mapping'), { recursive: true });
  const dir = await mkdtemp(join(repo, '.runtime/tests/business-mapping/run-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let adapter = join(root, 'integrations/mapped-demo-adapter.mjs');
  if (mode !== 'normal') {
    const url = pathToFileURL(adapter).href;
    adapter = join(dir, 'adapter.mjs');
    await writeFile(adapter, `import demo from ${JSON.stringify(url)}; export default {...demo,${mode === 'timeout'
      ? 'pull(){while(true){}}' : 'async pull(c){const p=await demo.pull(c);p.records[0].version=0;return p;}'}};`);
  }
  const output = join(dir, 'snapshot.json');
  const args = [join(root, 'scripts/sync-business.mjs'), '--adapter', adapter, '--store', 'store-a',
    '--source', 'mapping-products', '--out', output, '--timeout-ms', mode === 'timeout' ? '1500' : '10000'];
  const result = await new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('CLI deadline exceeded')); }, 15000);
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', status => { clearTimeout(timer); accept({ status, stdout, stderr }); });
  });
  assert.equal(result.stderr, '');
  if (mode === 'normal') {
    assert.equal(result.status, 0, result.stdout); assert.equal(JSON.parse(result.stdout).code, 'PUBLISHED');
    const s = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(s.records[0].id, 'mapped-mug-1'); assert.equal(s.sourceId, 'mapping-products');
    assert.equal(s.previousCursor, null); assert.equal(s.cursor, 'mapped-v1');
  } else {
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).code, mode === 'timeout' ? 'TIMEOUT' : 'SCHEMA');
    await assert.rejects(access(output));
  }
}
test('mapped adapter real CLI worker + parent publication', t => cli(t, 'normal'));
test('mapped adapter real CLI interrupts trusted synchronous customization timeout', t => cli(t, 'timeout'));
test('mapped adapter real CLI rejects invalid final DTO', t => cli(t, 'invalid'));
