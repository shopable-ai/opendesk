// Host-only VM regressions: no model, network or desktop calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, 'examples/ai-customer-support', name), 'utf8');
const host = read('native-demo.js');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};
function snapshot(customer = 't1', message = 1) {
  const id = `${customer}-m${message}`;
  return {complete: true, truncated: false, backend: 'mock', requestId: 'mock-only', root: {children: [
    {identifier: 'support.session', value: `${customer} · ${customer === 't1' ? '林女士' : '陈先生'}`},
    {identifier: `support.draft.${customer}`, value: ''},
    {identifier: `support.message.${id}.customer`, value: `客户 · ${id}\n退款进度？`},
  ]}};
}
function harness() {
  const calls = [], results = [], events = new Map();
  const target = {pid: 42, exePath: '/mock/support-chat'};
  const win = {...target, handle: 80, isForeground: true};
  let live = win, tree = snapshot(), snapshots = 0;
  const h = {calls, results, win, readHook: null, windowHook: null, httpHook: null};
  const ctx = vm.createContext({target, log() {},
    panel: {on: (name, handler) => {events.set(name, handler); return () => {};},
      postMessage: async result => results.push(result)},
    freshTarget: async () => live,
    sameWindow: w => w.pid === win.pid && w.exePath === win.exePath && w.handle === win.handle,
    window: {getAppWindow: async () => h.windowHook ? h.windowHook() : live},
    exactSnapshot: async () => {
      const captured = tree;
      snapshots++;
      if (h.readHook) await h.readHook(snapshots);
      return captured;
    },
    http: {post: async (url, payload, options) => {
      calls.push({url, payload, options});
      if (h.httpHook) await h.httpHook();
      return {status: 200, data: {code: 0, message: 'ok', data: {
        request_id: payload.request_id, product_slug: payload.product_slug,
        delivery_mode_applied: 'draft', delivery_status: 'draft_only', direct_reply_allowed: false,
        selected_answer_strategy: 'context_http', review_answer: '请人工核实退款进度。',
        coverage_status: 'full', coverage: {status: 'full', locked_hits: [
          {knowledge_id: 'synthetic-faq', answer_hash: 'a'.repeat(64)}]},
        model_call_counts: {total_provider_requests: 1}, model_provider: 'openai-compatible',
      }}};
    }},
    publish: async () => {}, observe: async () => {},
  });
  vm.runInContext(read('desktop/native-adapter.js'), ctx);
  vm.runInContext(read('desktop/query-api-adapter.js'), ctx);
  ctx.adapter = ctx.OpenDeskSupportNative.create(target);
  ctx.adapter.accept(win, tree);
  ctx.queryConfig = ctx.OpenDeskSupportQueryAPI.config({port: 12345, projectId: 'support', modelProvider: 'http'});
  ctx.invalidate = async reason => ctx.adapter.invalidate(reason);
  vm.runInContext(host.slice(host.indexOf('let bound='), host.indexOf('\nconst log=')), ctx);
  vm.runInContext(host.slice(host.indexOf('async function askAI('), host.indexOf('\nconst subscription=')), ctx);
  h.ctx = ctx;
  h.request = {type: 'support.aiQuery', requestId: 'query-1', binding: {...ctx.adapter.current.binding}};
  h.ask = (request = h.request) => ctx.askAI(request);
  h.settings = value => events.get('message')({value: {type: 'support.settings', ...value}});
  h.close = () => events.get('close')();
  h.set = code => vm.runInContext(code, ctx);
  h.live = value => {live = value;};
  h.currentWindow = () => live;
  h.change = (customer, message = 1, accept = true) => {
    tree = snapshot(customer, message);
    if (accept) ctx.adapter.accept(win, tree);
  };
  h.idle = () => vm.runInContext('queue', ctx);
  return h;
}
const changes = {
  closed: h => h.close(),
  revoked: h => h.settings({permission: false}),
  paused: h => h.settings({paused: true}),
  'pause-resume before queued invalidation': h => {h.settings({paused: true}); h.settings({paused: false});},
  'binding invalidated': h => h.ctx.adapter.invalidate('mock disconnect'),
  'customer changed': h => h.change('t2'),
  'new message': h => h.change('t1', 2),
  'foreground lost': h => h.live({...h.win, isForeground: false}),
  'window replaced': h => h.live({...h.win, handle: 81}),
  'process replaced': h => h.live({...h.win, pid: 43}),
  'executable replaced': h => h.live({...h.win, exePath: '/mock/other'}),
  disconnected: h => h.live(null),
};
for (const [name, change] of Object.entries(changes)) {
  test(`AX pending: ${name} prevents customer text dispatch`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    h.readHook = async n => {if (n === 1) {entered.resolve(); await release.promise;}};
    const work = h.ask();
    await entered.promise;
    change(h);
    release.resolve();
    await work;
    assert.equal(h.calls.length, 0, 'customer text must not reach HTTP');
    assert.equal(h.results.length, 0);
  });
  test(`HTTP pending: ${name} prevents stale result publication`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    h.httpHook = async () => {entered.resolve(); await release.promise;};
    const work = h.ask();
    await entered.promise;
    change(h);
    release.resolve();
    await work;
    assert.equal(h.calls.length, 1);
    assert.equal(h.results.length, 0);
    assert.equal(h.set('aiInflight.size'), 0);
  });
}
for (const flag of ['closed', 'revoked', 'paused']) {
  test(`result AX pending: ${flag} is rechecked after asynchronous reads`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    h.readHook = async n => {if (n === 2) {entered.resolve(); await release.promise;}};
    const work = h.ask();
    await entered.promise;
    // Exercise the flag check independently of adapter generation invalidation.
    h.set(`${flag}=true`);
    release.resolve();
    await work;
    assert.equal(h.calls.length, 1);
    assert.equal(h.results.length, 0);
  });
}
for (const [name, change] of Object.entries(changes)) {
  test(`dispatch window lookup pending: ${name} prevents HTTP`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    let lookups = 0;
    h.windowHook = async () => {
      if (++lookups === 2) {entered.resolve(); await release.promise;}
      return h.currentWindow();
    };
    const work = h.ask();
    await entered.promise;
    change(h);
    // Window changes are returned by the pending independent lookup.
    h.windowHook = null;
    release.resolve();
    await work;
    assert.equal(h.calls.length, 0);
    assert.equal(h.results.length, 0);
  });
}
for (const [customer, message] of [['t2', 1], ['t1', 2]]) {
  test(`HTTP pending: fresh AX detects ${customer}/${message} before adapter observation catches up`, async () => {
    const h = harness(), entered = deferred(), release = deferred();
    h.httpHook = async () => {entered.resolve(); await release.promise;};
    const work = h.ask();
    await entered.promise;
    h.change(customer, message, false);
    release.resolve();
    await work;
    assert.equal(h.calls.length, 1);
    assert.equal(h.results.length, 0);
  });
}
test('permission changes during the final window lookup prevent dispatch', async () => {
  const h = harness();
  h.windowHook = async () => {h.settings({paused: true}); h.settings({paused: false}); return h.win;};
  await h.ask();
  assert.equal(h.calls.length, 0);
});
test('duplicate requests during and after HTTP cannot dispatch twice', async () => {
  const h = harness(), entered = deferred(), release = deferred();
  h.httpHook = async () => {entered.resolve(); await release.promise;};
  const work = h.ask();
  await entered.promise;
  await h.ask();
  release.resolve();
  await work;
  await h.ask();
  assert.equal(h.calls.length, 1);
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0].requestId, h.request.requestId);
  assert.equal(h.results[0].status, 'ready');
  assert.equal(h.calls[0].payload.query, '退款进度？');
  assert.equal(h.set('aiInflight.size'), 0);
});
test('HTTP disconnect produces a current bound error without retry', async () => {
  const h = harness();
  h.httpHook = async () => {throw Error('mock connection closed');};
  await h.ask();
  assert.equal(h.calls.length, 1);
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0].errorCode, 'QUERY_UNAVAILABLE');
  assert.equal(h.set('aiInflight.size'), 0);
});
