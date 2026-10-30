'use strict';

// Offline regression of the actual Desktop bundle/adapter. This is not native
// Runtime, UI loading, visual, clipboard, or real desktop PASS evidence.
// From the repository root:
// node --test tests/custom-ui/ai-customer-support-desktop.test.cjs
// The owning build task must refresh core.generated.js/core-inputs.json first;
// this test deliberately never builds or writes application artifacts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { inflateSync } = require('node:zlib');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const example = path.join(root, 'examples/ai-customer-support');
const desktop = path.join(example, 'desktop');
const read = file => fs.readFileSync(path.join(desktop, file), 'utf8');
const fixture = name => JSON.parse(fs.readFileSync(path.join(example, 'fixtures', name + '-demo.json'), 'utf8'));
const fixtures = {
  knowledge: fixture('knowledge'), history: fixture('customer-history'),
  products: fixture('products'), orders: fixture('orders')
};
const bundle = read('core.generated.js');
const adapter = read('adapter.js');
const plain = value => JSON.parse(JSON.stringify(value)); // VM realm normalization only.

function load(saved) {
  // No injected structuredClone, React mock, reducer substitute or host APIs.
  const context = vm.createContext({});
  vm.runInContext(bundle, context, { filename: 'core.generated.js', timeout: 5000 });
  vm.runInContext(adapter, context, { filename: 'adapter.js', timeout: 5000 });
  const core = context.OpenDeskSupportCore;
  return { core, model: context.OpenDeskSupportAdapter.create(core, saved) };
}

const drafts = model => plain(model.state.threads.map(t => t.draft));
const threads = model => plain(model.state.threads);
const setting = (model, key, value) => model.dispatch({ type: 'SETTING', key, value });

test('offline: built core contains all records from the four real fixtures', () => {
  const { core, model } = load();
  assert.deepEqual(plain(core.products), fixtures.products.products);
  assert.deepEqual(plain(core.allOrders), fixtures.orders.orders);
  const imported = model.state.knowledge.filter(k => k.source === 'knowledge-demo.json');
  assert.equal(imported.length, fixtures.knowledge.entries.length);
  for (const row of fixtures.knowledge.entries) {
    const k = imported.find(k => k.question === row.question);
    assert.ok(k, row.question);
    assert.equal(k.a, row.answer);
    assert.deepEqual(plain(k.aliases), row.aliases);
    assert.deepEqual(plain(k.keys), row.keywords);
    assert.equal(k.enabled, row.enabled);
    assert.equal(k.scope, row.scope);
    assert.equal(k.category, row.category);
    assert.equal(k.eligible, false);
  }
  for (const customer of fixtures.history.customers) {
    for (const session of customer.sessions) {
      assert.deepEqual(plain(model.state.history[customer.customerId].find(s => s.sessionId === session.sessionId)), session);
    }
    const facts = model.state.facts.filter(f => f.customerId === customer.customerId && f.sessionId.startsWith('demo-'));
    assert.ok(facts.length > 0, customer.customerId + ' fixture facts');
    for (const fact of facts) {
      const message = customer.sessions.find(s => s.sessionId === fact.sessionId).messages.find(m => m.messageId === fact.messageId);
      assert.equal(message.role, 'customer');
      assert.equal(fact.evidence, message.text);
      assert.equal(fact.status, 'candidate');
    }
  }
});

test('offline: refund progress matches exactly with three distinct strategies and no import eligibility', () => {
  const { core, model } = load();
  const row = fixtures.knowledge.entries.find(k => k.question === '退款申请提交后如何查询进度？');
  assert.ok(row);
  for (const text of [row.question, ...row.aliases]) {
    model.dispatch({ type: 'RECEIVE', id: 't1', text });
    const hit = core.activeHit(model.state);
    assert.equal(hit.exact, true);
    assert.equal(hit.k.a, row.answer);
    assert.equal(hit.k.source, 'knowledge-demo.json');
    assert.equal(hit.k.eligible, false);
    const options = core.activeOptions(model.state);
    assert.deepEqual(plain(options.map(o => o.id)), ['accurate', 'verify', 'human']);
    assert.equal(new Set(options.map(o => o.text)).size, 3);
    assert.ok(options[0].text.includes(row.answer));
    assert.ok(options[1].text.includes(row.answer));
    assert.match(options[1].text, /订单号.*人工核对/);
    assert.match(options[2].text, /人工客服核实/);
    assert.ok(model.state.threads.every(t => !t.sent.length && t.messages.every(m => m.who === 'customer')));
  }
});

test('offline: conflicting, disabled and scoped knowledge cannot produce an unsafe answer', () => {
  const { core, model } = load();
  const row = fixtures.knowledge.entries[1];
  const extra = core.parseKnowledgeFile(JSON.stringify({ entries: [{ ...row, answer: '互相冲突的答案' }] }), 'conflict.json', model.state.knowledge.length, 100);
  model.dispatch({ type: 'IMPORT_KNOWLEDGE', entries: extra, epoch: model.state.knowledgeImportEpoch });
  assert.equal(core.matchKnowledge(row.question, model.state.knowledge, true), null);
  assert.deepEqual(plain(core.replyOptions(null).map(o => o.id)), ['clarify', 'human']);
  const excluded = model.state.knowledge.filter(k => !k.enabled || k.scope);
  assert.ok(excluded.some(k => !k.enabled) && excluded.some(k => k.scope));
  for (const k of excluded) {
    for (const text of [k.question, ...k.aliases]) {
      assert.equal(core.matchKnowledge(text, [k], true), null, k.id);
      const hit = core.matchKnowledge(text, model.state.knowledge, true);
      assert.notEqual(hit?.k.id, k.id);
      for (const option of core.replyOptions(hit)) assert.ok(!option.text.includes(k.a), k.id);
    }
  }
  assert.equal(core.matchKnowledge(row.question, model.state.knowledge, false), null);
});

test('offline: orders remain isolated across all three customers and require authorization', () => {
  const { core, model } = load();
  for (const id of ['t1', 't2', 't3']) {
    model.dispatch({ type: 'SET_THREAD', id });
    assert.equal(model.state.orderSelected, null);
    const expected = fixtures.orders.orders.filter(o => o.customerId === id);
    assert.ok(expected.length);
    assert.deepEqual(plain(core.ordersForCustomer(id, true)), expected);
    assert.deepEqual(plain(core.ordersForCustomer(id, false)), []);
    for (const order of fixtures.orders.orders) {
      assert.deepEqual(plain(core.orderForCustomer(id, order.orderId, true)), order.customerId === id ? order : null);
      assert.equal(core.orderForCustomer(id, order.orderId, false), null);
      model.dispatch({ type: 'CLOSE_ORDER' });
      model.dispatch({ type: 'OPEN_ORDER', orderId: order.orderId });
      assert.equal(model.state.orderSelected, order.customerId === id ? order.orderId : null);
    }
    model.dispatch({ type: 'OPEN_ORDER', orderId: expected[0].orderId });
    setting(model, 'permission', false);
    assert.equal(model.state.orderSelected, null);
    model.dispatch({ type: 'OPEN_ORDER', orderId: expected[0].orderId });
    assert.equal(model.state.orderSelected, null);
    setting(model, 'permission', true);
  }
  assert.deepEqual(plain(core.ordersForCustomer('unknown', true)), []);
});

test('offline: fill succeeds without sending and protects an occupied draft', () => {
  const { model } = load();
  const identity = model.token(), before = threads(model);
  model.fill('人工草稿', identity);
  assert.equal(model.state.threads[0].draft, '人工草稿');
  assert.deepEqual(threads(model).map(t => t.messages), before.map(t => t.messages));
  model.fill('试图覆盖', identity);
  assert.deepEqual(drafts(model), ['人工草稿', '', '']);
  assert.match(model.state.receipt, /未覆盖/);
  model.fill('人工草稿', identity);
  assert.deepEqual(drafts(model), ['人工草稿', '', '']);
  assert.ok(model.state.threads.every(t => !t.sent.length));
  for (const type of ['SEND', 'AUTO_REQUEST', 'AUTO_CONFIRM', 'AUTO_CANCEL', 'AUTO_DISABLE']) {
    const before = threads(model);
    assert.throws(() => model.dispatch({ type, id: 't1', messageId: identity.messageId }), /不提供发送或托管入口/);
    assert.deepEqual(threads(model), before);
  }
  assert.equal(model.state.auto, false);
  assert.equal(model.state.consented, false);
});

test('offline: missing, wrong and late tokens never fill any customer draft', () => {
  const { model } = load();
  const token = model.token();
  for (const identity of [null, {}, { ...token, id: 't2' }, { ...token, messageId: 'wrong' }, { ...token, generation: token.generation + 1 }]) {
    const before = threads(model);
    assert.equal(model.current(identity), false);
    model.fill('不应填入', identity);
    assert.deepEqual(threads(model), before);
  }
  model.dispatch({ type: 'RECEIVE', id: 't1', text: '新的客户问题' });
  const before = threads(model);
  assert.notEqual(model.token().messageId, token.messageId);
  model.fill('迟到回复', token);
  assert.deepEqual(threads(model), before);
  model.fill('当前回复', model.token());
  assert.deepEqual(drafts(model), ['当前回复', '', '']);
});

for (const [name, actions] of [
  ['permission off-on', [{ type: 'SETTING', key: 'permission', value: false }, { type: 'SETTING', key: 'permission', value: true }]],
  ['pause on-off', [{ type: 'SETTING', key: 'paused', value: true }, { type: 'SETTING', key: 'paused', value: false }]],
  ['customer round trip', [{ type: 'SET_THREAD', id: 't2' }, { type: 'SET_THREAD', id: 't1' }]],
  ['RESET', [{ type: 'RESET' }]]
]) {
  test('offline: ' + name + ' ABA invalidates the old token even with the same customer/message', () => {
    const { model } = load();
    const old = model.token();
    for (const action of actions) {
      model.dispatch(action);
      const before = threads(model);
      model.fill('过期事件', old);
      assert.deepEqual(threads(model), before);
    }
    assert.equal(model.token().id, old.id);
    assert.equal(model.token().messageId, old.messageId);
    assert.notEqual(model.token().generation, old.generation);
    assert.equal(model.current(old), false);
    const before = threads(model);
    model.fill('ABA 迟到事件', old);
    assert.deepEqual(threads(model), before);
    model.fill('新身份可填入', model.token());
    assert.deepEqual(drafts(model), ['新身份可填入', '', '']);
  });
}

test('offline: serialized state restores drafts/messages but defaults to revoked and paused', () => {
  const { model } = load();
  for (const id of ['t1', 't2', 't3']) {
    model.dispatch({ type: 'SET_DRAFT', id, text: id + ' 的草稿' });
  }
  model.dispatch({ type: 'SET_THREAD', id: 't3' });
  model.dispatch({ type: 'RECEIVE', id: 't3', text: '需要继续核实' });
  model.dispatch({ type: 'TAB', tab: 'orders' });
  model.dispatch({ type: 'TAB', tab: 'settings' });
  model.ui.theme = 'dark'; model.ui.zoom = '200';
  const saved = plain(model.save());
  // Persisted/foreign privilege fields must never restore authorization.
  Object.assign(saved, { permission: true, paused: false, auto: true, consented: true, consentPending: true });
  const { core, model: restored } = load(saved);
  assert.deepEqual(drafts(restored), ['t1 的草稿', 't2 的草稿', 't3 的草稿']);
  assert.deepEqual(threads(restored).map(t => t.messages), threads(model).map(t => t.messages));
  assert.equal(restored.state.threadId, 't3');
  assert.equal(restored.state.tab, 'orders');
  assert.equal(restored.ui.theme, 'dark'); assert.equal(restored.ui.zoom, '200');
  assert.equal(restored.state.permission, false); assert.equal(restored.state.paused, true);
  assert.equal(restored.state.auto, false); assert.equal(restored.state.consented, false);
  assert.equal(restored.state.consentPending, false);
  assert.equal(core.activeHit(restored.state), null);
  assert.deepEqual(plain(core.ordersForCustomer('t3', restored.state.permission)), []);
  restored.dispatch({ type: 'SET_DRAFT', id: 't3', text: '' });
  restored.fill('恢复后不可直接操作', restored.token());
  assert.equal(restored.state.threads[2].draft, '');
  setting(restored, 'permission', true);
  restored.fill('仍然暂停', restored.token());
  assert.equal(restored.state.threads[2].draft, '');
  setting(restored, 'paused', false);
  restored.fill('重新授权并恢复', restored.token());
  assert.equal(restored.state.threads[2].draft, '重新授权并恢复');
  const ids = new Set(restored.state.threads.flatMap(t => t.messages.map(m => m.id)));
  restored.dispatch({ type: 'RECEIVE', id: 't3', text: '恢复后的下一条消息' });
  assert.ok(!ids.has(core.latestCustomerMessage(core.currentThread(restored.state)).id));
});

test('offline: malformed persisted state fails closed without modifying the supplied data', () => {
  const valid = plain(load().model.save());
  const cases = [null, false, 0, '', true, 'broken JSON data', [], {}, { ...valid, schemaVersion: 2 }];
  for (const change of [
    s => s.threads.pop(), s => { s.threads[0].id = 't2'; },
    s => { s.threads[0].draft = 1; }, s => { s.threads[0].draft = 'x'.repeat(4001); },
    s => { s.threads[0].messages = null; }, s => { s.threads[0].messages = Array(101).fill(s.threads[0].messages[0]); },
    s => { s.threads[0].messages[0] = null; }, s => { s.threads[0].messages[0].who = 'system'; },
    s => { s.threads[0].messages[0].id = 'x'.repeat(101); },
    s => { s.threads[0].messages[0].text = 'x'.repeat(4001); },
    s => { s.threads[0].messages[0].text = {}; }
  ]) {
    const saved = plain(valid); change(saved); cases.push(saved);
  }
  for (const saved of cases) {
    const before = JSON.stringify(saved);
    assert.throws(() => load(saved), /保存状态无效/);
    assert.equal(JSON.stringify(saved), before);
  }
});

test('offline: all twelve fixture PNGs have valid chunks, bounded dimensions and complete zlib rows', () => {
  const names = fixtures.products.products.flatMap(p => p.images.map(i => p.id + '-' + i.id + '.png')).sort();
  assert.equal(names.length, 12);
  assert.deepEqual(fs.readdirSync(path.join(desktop, 'assets')).filter(n => n.endsWith('.png')).sort(), names);
  for (const name of names) {
    const png = fs.readFileSync(path.join(desktop, 'assets', name));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), name);
    let offset = 8, header, ended = false;
    const data = [];
    while (offset < png.length) {
      assert.ok(offset + 12 <= png.length, name + ' truncated chunk');
      const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
      assert.ok(offset + length + 12 <= png.length, name + ' chunk bounds');
      const bytes = png.subarray(offset + 8, offset + 8 + length);
      if (offset === 8) assert.equal(type, 'IHDR', name);
      if (type === 'IHDR') { assert.equal(header, undefined); assert.equal(length, 13); header = bytes; }
      if (type === 'IDAT') data.push(bytes);
      offset += length + 12;
      if (type === 'IEND') { assert.equal(length, 0); ended = true; break; }
    }
    assert.equal(ended, true, name + ' missing IEND');
    assert.equal(offset, png.length, name + ' trailing data');
    const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
    assert.ok(width >= 320 && width <= 1280 && height >= 240 && height <= 1280, name + ' dimensions');
    assert.equal(header[8], 8, name + ' bit depth');
    assert.ok([2, 6].includes(header[9]), name + ' RGB/RGBA');
    assert.deepEqual([...header.subarray(10)], [0, 0, 0], name + ' noninterlaced standard compression');
    assert.ok(data.length > 0, name + ' missing IDAT');
    const stride = width * (header[9] === 6 ? 4 : 3) + 1;
    const raw = inflateSync(Buffer.concat(data), { maxOutputLength: stride * height });
    assert.equal(raw.length, stride * height, name + ' decoded size');
    for (let y = 0; y < height; y++) assert.ok(raw[y * stride] <= 4, name + ' row filter ' + y);
    assert.ok(new Set(raw).size > 16, name + ' implausibly empty image');
  }
});

test('offline: HTML exposes unique stable controls and only inert local asset URLs', () => {
  const html = read('panel.html');
  assert.doesNotMatch(html, /<\s*(?:script|iframe|object|embed|base|meta|link|svg|form)\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|\bsrcdoc\s*=/i);
  const ids = [...html.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  const stable = ['app', 'status', 'settings', 'settings-back', 'bound-customer', 'question', 'simulate',
    'latest-message', 'match-source', 'reply-editor', 'copy-reply', 'fill-reply', 'draft', 'read-draft', 'receipt',
    'knowledge-query', 'knowledge-category', 'knowledge-detail', 'profile-customer', 'history-text',
    'fact-choice', 'fact-confirm', 'fact-ignore', 'product-query', 'product-category', 'product-images',
    'product-copy', 'image-product', 'order-query', 'order-status', 'copy-order', 'fill-order',
    'permission', 'paused', 'theme', 'zoom', 'notice'];
  for (const tab of ['reply', 'knowledge', 'customer', 'products', 'images', 'orders']) stable.push('tab-' + tab, 'view-' + tab);
  for (const [prefix, count] of [['choice-', 3], ['reply-', 3], ['knowledge-open-', 24], ['product-open-', 6], ['image-open-', 12], ['order-open-', 8]]) {
    for (let i = 0; i < count; i++) stable.push(prefix + i);
  }
  for (const id of stable) assert.ok(ids.includes(id), 'missing stable control ' + id);
  for (const match of html.matchAll(/<(button|input|select|textarea)\b([^>]*)>/gi)) {
    assert.match(match[2], /\bid="[-\w]+"/, match[0] + ' needs a stable id');
    if (match[1].toLowerCase() === 'button') assert.match(match[2], /\btype="button"/);
  }
  for (const match of html.matchAll(/\b(href|src|action|formaction|xlink:href|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    assert.equal(match[1].toLowerCase(), 'src', 'no navigation or remote URLs');
    const url = match[2] ?? match[3] ?? match[4];
    assert.match(url, /^assets\/[-a-z0-9]+\.png$/, 'unsafe asset URL: ' + url);
    assert.ok(fs.statSync(path.join(desktop, url)).isFile());
  }
});

test('offline: bundle input SHA-256 manifest matches the current shared sources and four fixtures', () => {
  const manifest = JSON.parse(read('core-inputs.json'));
  assert.equal(manifest.schemaVersion, 1);
  const required = ['desktop/core-entry.ts', 'desktop/history-clone.ts', 'src/state.tsx',
    'src/domain/catalog.ts', 'src/domain/knowledge.ts', 'src/domain/history.ts',
    'fixtures/knowledge-demo.json', 'fixtures/customer-history-demo.json',
    'fixtures/products-demo.json', 'fixtures/orders-demo.json'].map(p => 'examples/ai-customer-support/' + p);
  for (const file of required) assert.ok(Object.hasOwn(manifest.inputs, file), 'missing bundle input ' + file);
  for (const [file, expected] of Object.entries(manifest.inputs)) {
    assert.ok(file.startsWith('examples/ai-customer-support/') && !file.split('/').includes('..'), file);
    assert.match(expected, /^[a-f0-9]{64}$/);
    const actual = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    assert.equal(actual, expected, file + ': stale bundle input; owning build task must refresh (this test never builds)');
  }
});
