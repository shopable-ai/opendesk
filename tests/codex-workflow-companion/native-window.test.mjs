import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

test('failed state and diagnostic bridge delivery stays distinct from an owner outage', async () => {
  const source = fs.readFileSync(new URL('../../examples/codex-workflow-companion/native-window.js', import.meta.url), 'utf8');
  const events = [], logs = [];
  let cleared = false;
  const panel = {
    on: () => {}, show: async () => {},
    getState: async () => ({ hostPid: 1, nativeWindowId: 2 }),
    postMessage: async value => { events.push(value); throw Error('SYNTHETIC_BRIDGE_FAILURE'); },
    waitUntilClosed: async () => {},
  };
  await vm.runInNewContext('(async () => {\n' + source + '\n})()', {
    File: { join: path.join, readJSON: async () => ({ protocol: 'od.codex-workflow.v1', url: 'http://127.0.0.1:1234' }) },
    System: { getEnv: () => undefined }, Execution: { scriptDir: '/synthetic' },
    Command: { run: async () => ({ stdout: 'a'.repeat(64) + '  preview/index.html' }) },
    ui: { createTrustedWindow: async () => panel },
    http: { get: async () => ({ status: 200, data: { state: { revision: 1 } } }) },
    console: { log: line => logs.push(line) },
    setInterval: () => 1, clearInterval: () => { cleared = true; },
  });
  assert.deepEqual(events.map(e => e.type), ['state', 'notice']);
  assert.ok(logs.includes('CWF_NATIVE_BRIDGE_UNAVAILABLE'));
  assert.equal(logs.includes('CWF_NATIVE_OWNER_UNAVAILABLE'), false);
  assert.equal(cleared, true, 'both failed deliveries still allow orderly window teardown');
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function harness({ get, post, deliver } = {}) {
  const source = fs.readFileSync(new URL('../../examples/codex-workflow-companion/native-window.js', import.meta.url), 'utf8');
  const ready = deferred(), closed = deferred();
  const events = [], logs = [], gets = [], posts = [];
  let handler, tick, cleared = false;
  let owner = { protocol: 'od.codex-workflow.v1', url: 'http://127.0.0.1:1234', headers: { Authorization: 'Bearer synthetic-a' } };
  const running = vm.runInNewContext('(async () => {\n' + source + '\n})()', {
    File: { join: path.join, readJSON: async () => owner },
    System: { getEnv: () => undefined }, Execution: { scriptDir: '/synthetic' },
    Command: { run: async () => ({ stdout: 'a'.repeat(64) + '  preview/index.html' }) },
    ui: { createTrustedWindow: async () => ({
      on: (_, fn) => { handler = fn; }, show: async () => {},
      getState: async () => ({ hostPid: 1, nativeWindowId: 2 }),
      postMessage: async value => { events.push(value); await deliver?.(value); },
      waitUntilClosed: () => closed.promise,
    }) },
    http: {
      get: async (url, options) => { gets.push({ url, options }); return get ? get(gets.length) : state(1); },
      post: async (url, data, options) => { posts.push({ url, data, options }); return post ? post() : { status: 200, data: { ok: true, state: { revision: 11 } } }; },
    },
    console: { log: line => logs.push(line) },
    setInterval: fn => { tick = fn; ready.resolve(); return 1; },
    clearInterval: () => { cleared = true; },
  });
  await ready.promise;
  return { events, logs, gets, posts, send: value => handler({ value }), tick: () => tick(),
    rotate: value => { owner = value; },
    close: async () => { closed.resolve(); await running; assert.equal(cleared, true); } };
}
function state(revision) { return { status: 200, data: { state: { revision } } }; }
const turn = () => new Promise(resolve => setImmediate(resolve));

test('accepted operator request survives failed success and diagnostic notices without replay', async () => {
  const h = await harness({ deliver: value => { if (value.type === 'notice') throw Error('SYNTHETIC_BRIDGE_FAILURE'); } });
  try {
    await assert.doesNotReject(h.send({ type: 'action', action: 'pause' }));
    assert.equal(h.posts.length, 1);
    assert.equal(h.gets.length, 2, 'accepted mutation still requests fresh state');
    assert.ok(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION ')));
    assert.ok(h.logs.includes('CWF_NATIVE_ACTION_ACCEPTED_NO_REPLAY pause'));
    assert.ok(h.logs.includes('CWF_NATIVE_BRIDGE_UNAVAILABLE'));
    assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION_REJECTED')), false);
    assert.equal(h.logs.includes('CWF_NATIVE_OWNER_UNAVAILABLE'), false);
  } finally { await h.close(); }
});

test('HTTP 200 ok:true remains accepted even without an optional state snapshot', async () => {
  const h = await harness({ post: () => ({ status: 200, data: { ok: true } }) });
  try {
    await h.send({ type: 'action', action: 'resume' });
    assert.ok(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION ')));
    assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION_REJECTED')), false);
    assert.equal(h.gets.length, 2);
  } finally { await h.close(); }
});

test('overlapping refreshes serialize and retain a refresh requested after mutation', async () => {
  const first = deferred();
  const h = await harness({ get: count => count === 2 ? first.promise : state(count === 1 ? 9 : 11) });
  try {
    const refresh = h.send({ type: 'refresh' });
    await turn();
    h.tick();
    const action = h.send({ type: 'action', action: 'pause' });
    await turn();
    const callsWhileBlocked = h.gets.length;
    first.resolve(state(10));
    await Promise.all([refresh, action]);
    assert.equal(callsWhileBlocked, 2, 'only one state request may be in flight');
    assert.equal(h.gets.length, 3, 'overlap is coalesced into one subsequent refresh');
    assert.deepEqual(h.events.filter(e => e.type === 'state').map(e => e.state.revision), [9, 10, 11]);
    assert.equal(h.posts.length, 1);
  } finally { first.resolve(state(10)); await h.close(); }
});

test('owner rotation discards the old response and reads new URL and credentials', async () => {
  const first = deferred();
  const h = await harness({ get: count => count === 2 ? first.promise : state(count === 1 ? 9 : 1) });
  try {
    const refresh = h.send({ type: 'refresh' });
    await turn();
    h.rotate({ protocol: 'od.codex-workflow.v1', url: 'http://127.0.0.1:5678', headers: { Authorization: 'Bearer synthetic-b' } });
    first.resolve(state(10));
    await refresh;
    assert.deepEqual(h.events.filter(e => e.type === 'state').map(e => e.state.revision), [9, 1]);
    assert.equal(h.gets.at(-1).url, 'http://127.0.0.1:5678/api/state?view=compact');
    assert.equal(h.gets.at(-1).options.headers.Authorization, 'Bearer synthetic-b');
    await h.send({ type: 'action', action: 'pause' });
    assert.equal(h.posts[0].url, 'http://127.0.0.1:5678/api/operator');
    assert.equal(h.posts[0].options.headers.Authorization, 'Bearer synthetic-b');
  } finally { first.resolve(state(10)); await h.close(); }
});

test('actual operator rejection stays rejected even when its diagnostic bridge fails', async () => {
  const h = await harness({ post: () => ({ status: 403, data: { ok: false, error: 'ACTION_DENIED' } }),
    deliver: value => { if (value.type === 'notice') throw Error('SYNTHETIC_BRIDGE_FAILURE'); } });
  try {
    await assert.doesNotReject(h.send({ type: 'action', action: 'pause' }));
    assert.ok(h.logs.includes('CWF_NATIVE_ACTION_REJECTED ACTION_DENIED'));
    assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION ')), false);
    assert.equal(h.posts.length, 1);
  } finally { await h.close(); }
});

test('refresh serialization includes pending bridge delivery', async () => {
  const delivery = deferred();
  const h = await harness({ get: count => state(count + 8),
    deliver: value => value.type === 'state' && value.state.revision === 10 ? delivery.promise : undefined });
  try {
    const first = h.send({ type: 'refresh' });
    await turn();
    const second = h.send({ type: 'refresh' });
    await turn();
    const blockedCalls = h.gets.length;
    delivery.resolve();
    await Promise.all([first, second]);
    assert.equal(blockedCalls, 2, 'state delivery must finish before the next request');
    assert.deepEqual(h.events.filter(e => e.type === 'state').map(e => e.state.revision), [9, 10, 11]);
  } finally { delivery.resolve(); await h.close(); }
});

test('credential-only owner rotation also discards the old response', async () => {
  const first = deferred();
  const h = await harness({ get: count => count === 2 ? first.promise : state(count === 1 ? 9 : 1) });
  try {
    const refresh = h.send({ type: 'refresh' });
    await turn();
    h.rotate({ protocol: 'od.codex-workflow.v1', url: 'http://127.0.0.1:1234', headers: { Authorization: 'Bearer synthetic-b' } });
    first.resolve(state(10));
    await refresh;
    assert.deepEqual(h.events.filter(e => e.type === 'state').map(e => e.state.revision), [9, 1]);
    assert.equal(h.gets.at(-1).options.headers.Authorization, 'Bearer synthetic-b');
  } finally { first.resolve(state(10)); await h.close(); }
});

test('failed reconnect notice is a presentation failure and polling continues', async () => {
  const h = await harness({ get: count => {
    if (count === 2) throw Error('SYNTHETIC_OWNER_FAILURE');
    return state(count);
  }, deliver: value => {
    if (value.type === 'notice') throw Error('SYNTHETIC_BRIDGE_FAILURE');
  } });
  try {
    await h.send({ type: 'refresh' });
    await h.send({ type: 'refresh' });
    await h.send({ type: 'refresh' });
    assert.equal(h.logs.filter(line => line === 'CWF_NATIVE_OWNER_UNAVAILABLE').length, 1);
    assert.deepEqual(h.events.filter(e => e.type === 'state').map(e => e.state.revision), [1, 3, 4]);
    assert.ok(h.logs.includes('CWF_NATIVE_BRIDGE_UNAVAILABLE'));
    assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION_REJECTED')), false);
  } finally { await h.close(); }
});

for (const bridgeFails of [false, true]) {
  test(`applied POST with lost response is unknown without replay (bridge fails: ${bridgeFails})`, async () => {
    let applied = 0;
    const h = await harness({
      post: () => { applied++; throw Error('HTTP request timed out'); },
      get: () => state(applied ? 11 : 10),
      deliver: value => { if (bridgeFails && value.type === 'notice') throw Error('SYNTHETIC_BRIDGE_FAILURE'); },
    });
    try {
      await assert.doesNotReject(h.send({ type: 'action', action: 'pause' }));
      assert.equal(applied, 1);
      assert.equal(h.posts.length, 1, 'never replay a mutation whose outcome is unknown');
      assert.ok(h.logs.includes('CWF_NATIVE_ACTION_UNKNOWN_NO_REPLAY pause'));
      assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION_REJECTED')), false);
      assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION ')), false);
      assert.ok(h.events.some(e => e.type === 'notice' && /结果未知/.test(e.message) && /请勿重复操作/.test(e.message)));
      assert.equal(h.gets.length, 2, 'read-only refresh runs even when the unknown notice fails');
      assert.deepEqual(h.events.filter(e => e.type === 'state').map(e => e.state.revision), [10, 11]);
      if (bridgeFails) assert.ok(h.logs.includes('CWF_NATIVE_BRIDGE_UNAVAILABLE'));
    } finally { await h.close(); }
  });
}

test('failure before POST is not a server rejection or an unknown applied mutation', async () => {
  const h = await harness();
  try {
    h.rotate({ protocol: 'invalid', url: 'http://127.0.0.1:1234' });
    await h.send({ type: 'action', action: 'pause' });
    assert.equal(h.posts.length, 0);
    assert.ok(h.logs.includes('CWF_NATIVE_ACTION_FAILED ENDPOINT_INVALID'));
    assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION_REJECTED')), false);
    assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION_UNKNOWN_NO_REPLAY')), false);
  } finally { await h.close(); }
});

test('response without an explicit acceptance or refusal leaves mutation outcome unknown', async () => {
  const h = await harness({ post: () => ({ status: 500, data: {} }) });
  try {
    await h.send({ type: 'action', action: 'pause' });
    assert.equal(h.posts.length, 1);
    assert.ok(h.logs.includes('CWF_NATIVE_ACTION_UNKNOWN_NO_REPLAY pause'));
    assert.equal(h.logs.some(line => line.startsWith('CWF_NATIVE_ACTION_REJECTED')), false);
    assert.equal(h.gets.length, 2);
  } finally { await h.close(); }
});
