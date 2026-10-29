// Host orchestration regression tests. These mocks do not count as Mac evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const adapterSource = fs.readFileSync(path.join(root, 'examples/ai-customer-support/desktop/native-adapter.js'), 'utf8');
const hostSource = fs.readFileSync(path.join(root, 'examples/ai-customer-support/native-demo.js'), 'utf8');
const fillSource = hostSource.slice(hostSource.indexOf('async function receipt('), hostSource.indexOf('\nfunction enqueue('));
const observeSource = hostSource.slice(hostSource.indexOf('async function observe('), hostSource.indexOf('\nasync function receipt('));

function harness(options = {}) {
  const receipts = [], actions = [], released = [];
  const target = {pid: 42, exePath: '/test/support-chat'};
  const win = {...target, handle: 80, isForeground: true};
  let draft = '', snapshots = 0;
  const snapshot = () => ({complete: true, truncated: false, backend: 'mock', requestId: 'mock-only', root: {children: [
    {identifier: 'support.session', value: 't1 · 林女士'},
    {identifier: 'support.draft.t1', value: draft},
    {identifier: 'support.message.t1-m1.customer', value: '客户 · t1-m1\n退款进度？'},
  ]}});
  const ctx = vm.createContext({closed: false, revoked: false, paused: false, target, evidence: '/mock',
    requestIds: new Set(), panel: {postMessage: async value => receipts.push(value)},
    log() {}, File: {join: (...parts) => parts.join('/'), writeJSON: async () => {}},
    freshTarget: async () => win, sameWindow: w => w === win,
    window: {getAppWindow: async () => win}, publish: async () => {},
    exactSnapshot: async () => { snapshots++; return options.snapshot?.(ctx, snapshots, snapshot()) || snapshot(); },
    Accessibility: {
      find: async () => ({mockRef: true}),
      read: async () => {
        options.onRead?.(ctx);
        return {properties: {identifier: 'support.draft.t1', value: draft}};
      },
      perform: async (ref, action) => {
        actions.push(action);
        if (options.performError) throw Error('native outcome unknown');
        draft = options.corruptReadback ? 'different native value' : action.value;
        return {actionState: 'acknowledged'};
      },
      release: async ref => released.push(ref),
    },
  });
  vm.runInContext(adapterSource, ctx);
  ctx.adapter = ctx.OpenDeskSupportNative.create(target);
  ctx.adapter.accept(win, snapshot());
  ctx.invalidate = async reason => ctx.adapter.invalidate(reason);
  vm.runInContext(fillSource, ctx);
  const request = {type: 'support.fillDraft', requestId: 'request-1', binding: ctx.adapter.current.binding,
    text: '人工选择的回复', expectedDraft: ''};
  return {ctx, request, receipts, actions, released};
}

for (const flag of ['closed', 'paused', 'revoked']) {
  test(`${flag} while AX read is pending prevents the native write and releases its reference`, async () => {
    const h = harness({onRead: ctx => {ctx[flag] = true;}});
    await h.ctx.fill(h.request);
    assert.equal(h.actions.length, 0);
    assert.equal(h.released.length, 1);
    if (flag === 'closed') assert.equal(h.receipts.length, 0);
    else assert.equal(h.receipts[0].status, 'refused');
  });
}

test('fresh final snapshot detects a changed customer before input', async () => {
  const h = harness({snapshot: (_ctx, n, snap) => {
    if (n === 2) snap.root.children[0].value = 't2 · 陈先生';
    return snap;
  }});
  await h.ctx.fill(h.request);
  assert.equal(h.actions.length, 0);
  assert.equal(h.receipts[0].status, 'refused');
  assert.equal(h.released.length, 1);
});

for (const options of [{performError: true}, {corruptReadback: true}]) {
  test(`uncertain action/readback stops observation and does not retry: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    await h.ctx.fill(h.request);
    assert.equal(h.actions.length, 1);
    assert.equal(h.ctx.paused, true);
    assert.equal(h.ctx.adapter.current.observing, false);
    assert.equal(h.receipts.at(-1).status, 'unknown');
    await h.ctx.fill(h.request);
    assert.equal(h.actions.length, 1);
  });
}

test('verified receipt carries the exact request ID and observed text; duplicate request cannot write again', async () => {
  const h = harness();
  await h.ctx.fill(h.request);
  assert.equal(h.actions.length, 1);
  assert.equal(h.receipts[0].status, 'verified');
  assert.equal(h.receipts[0].requestId, h.request.requestId);
  assert.equal(h.receipts[0].draft, h.request.text);
  await h.ctx.fill(h.request);
  assert.equal(h.actions.length, 1);
  assert.equal(h.receipts.at(-1).status, 'refused');
});

test('pause during an in-flight tree read stops acceptance without hiding the resume control', async () => {
  const h = harness({snapshot: (ctx, _n, snap) => {ctx.paused = true; return snap;}});
  const invalidations = [];
  h.ctx.invalidate = async (reason, hide) => {invalidations.push({reason, hide}); h.ctx.adapter.invalidate(reason);};
  vm.runInContext(observeSource, h.ctx);
  await h.ctx.observe('mock-only');
  assert.deepEqual(invalidations, [{reason: '已暂停观察', hide: false}]);
  assert.equal(h.ctx.adapter.current.observing, false);
});

test('revocation during a tree read retains the revoked generation and reason', async () => {
  const h = harness({snapshot: (ctx, _n, snap) => {ctx.revoked = true; ctx.adapter.revoke(); return snap;}});
  vm.runInContext(observeSource, h.ctx);
  await h.ctx.observe('mock-only');
  assert.equal(h.ctx.adapter.current.observing, false);
  assert.equal(h.ctx.adapter.current.reason, '观察授权已撤销');
  assert.equal(h.ctx.adapter.current.revision, 2);
});

test('revoked lifecycle checks hide a missing bound window without reading chat contents', async () => {
  const h = harness({snapshot: () => {throw Error('revoked chat read');}});
  let hidden = 0;
  h.ctx.revoked = true; h.ctx.bound = {handle: 80}; h.ctx.visible = true;
  h.ctx.adapter.revoke();
  h.ctx.window.current = async () => null;
  h.ctx.panel.hide = async () => {hidden++;};
  h.ctx.panel.getState = async () => ({visible: false});
  vm.runInContext(observeSource, h.ctx);
  await h.ctx.observe('mock-only');
  assert.equal(hidden, 1);
  assert.equal(h.ctx.adapter.current.reason, '观察授权已撤销');
  assert.equal(h.ctx.adapter.current.observing, false);
});
