'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

// VM memory simulations only: no OpenDesk process, desktop, clipboard or OS writes.
// Evaluate the SAME complete production script, replacing only its terminal entry.
const mainPath = path.resolve(__dirname, '../../examples/custom-ui/codex-prompt-shortcuts/main.js');
const source = fs.readFileSync(mainPath, 'utf8');
const entry = /await main\(\);\s*$/;
assert.ok(entry.test(source), 'expected terminal entry point');
const executable = source.replace(entry, '');
const clone = value => JSON.parse(JSON.stringify(value));
const error = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });
const prompt = { id: 'ps_12345678', body: '你好', label: '你好', name: '测试', enabled: true, order: 0 };
const library = () => ({ schemaVersion: 1, revision: 0, prompts: [clone(prompt)],
  settings: { appBundleId: '', offsetX: 0, offsetY: 0 } });
const codex = () => ({ id: 'mac:101:501', pid: 101, handle: 501, title: 'Codex',
  x: 100, y: 100, width: 1000, height: 800, isForeground: true });

async function harness(initial = library()) {
  const root = '/virtual/.runtime/examples/custom-ui/codex-prompt-shortcuts';
  const file = root + '/library.json', lock = root + '/library.lock';
  const files = new Map([[file, JSON.stringify(initial)]]);
  const calls = { reads: [], writes: [], creates: [], removes: [], copies: [],
    logs: [], toasts: [], confirms: [], appGets: [], current: [], gets: [], moves: [], hides: [] };
  const hooks = {};
  const panels = [];
  const timers = new Map();
  const events = new Map();
  let timerId = 0;
  const env = { active: codex(), applications: [{ bundleId: 'com.openai.codex' }],
    group: { pids: [101], instances: [{ pid: 101 }] }, answers: [] };
  function on(listeners, type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
    return { unsubscribe() { listeners.set(type, listeners.get(type).filter(f => f !== fn)); } };
  }
  async function emit(listeners, type, payload) {
    for (const fn of listeners.get(type) || []) await fn(payload);
  }
  function makePanel(spec) {
    const listeners = new Map(), controls = new Map();
    const state = { id: spec.id, hostPid: 900, nativeWindowId: 700 + panels.length,
      visible: false, onScreen: false, status: 'hidden',
      bounds: clone(spec.position.bounds || { x: 0, y: 0, ...spec.position.size }) };
    const panel = { spec, state,
      on: (type, fn) => on(listeners, type, fn),
      getState: async () => clone(state),
      show: async () => { Object.assign(state, { visible: true, onScreen: true, status: 'visible' });
        if (hooks.show) await hooks.show(panel); return clone(state); },
      hide: async () => { calls.hides.push(spec.id);
        return Object.assign(state, { visible: false, onScreen: false, status: 'hidden' }); },
      setPosition: async (x, y) => { calls.moves.push({ id: spec.id, x, y });
        if (hooks.move) await hooks.move(panel, x, y);
        else Object.assign(state.bounds, { x, y });
        return clone(state); },
      close: async () => {
        Object.assign(state, { visible: false, onScreen: false, status: 'closed' });
        await emit(listeners, 'close', { type: 'close', windowId: spec.id, reason: 'native' });
      },
      waitUntilClosed: async () => {},
      control(id) {
        // Reject misspelled/nonexistent controls instead of manufacturing a passing fake.
        assert.ok(spec.content.html.includes('id="' + id + '"'), 'unknown control ' + id);
        if (!controls.has(id)) {
          const handlers = new Map();
          const value = { value: '', checked: id === 'enabled', disabled: false };
          controls.set(id, { state: value,
            update: async patch => Object.assign(value, clone(patch)),
            getState: async () => clone(value),
            on: (type, fn) => on(handlers, type, fn),
            async emit(type, payload = {}) {
              if ('value' in payload) value.value = payload.value;
              if ('checked' in payload) value.checked = payload.checked;
              await emit(handlers, type, { type, windowId: spec.id, targetId: id, ...payload });
            } });
        }
        return controls.get(id);
      } };
    panels.push(panel);
    return panel;
  }
  function NativeToolbar(options) {
    const panel = makePanel({ id: 'nativeBar' + panels.length, kind: 'floating', native: true,
      options: clone(options), position: { bounds: { x: options.position.x, y: options.position.y,
        width: 60, height: 284 } } }); // Simulated native geometry, not a Runtime claim.
    const buttons = new Map();
    panel.buttons = buttons;
    panel.addButton = (id, label, icon, callback) => {
      assert.ok(buttons.size < 5, 'native vertical capacity');
      assert.ok(!buttons.has(id));
      buttons.set(id, { label, icon: clone(icon), callback, disabled: false });
    };
    panel.updateButton = async (id, patch) => {
      assert.ok(buttons.has(id));
      if ('label' in patch) assert.ok(Array.from(patch.label).length > 0 &&
        Array.from(patch.label).length <= 60, 'native label must contain 1–60 Unicode characters');
      if (hooks.updateButton) await hooks.updateButton(panel, id, patch);
      Object.assign(buttons.get(id), clone(patch));
    };
    panel.click = async id => {
      const button = buttons.get(id); assert.ok(button);
      if (!button.disabled) await button.callback();
    };
    panel.onError = callback => { panel.errorHandler = callback; };
    return panel;
  }
  const context = {
    File: {
      cwd: () => '/virtual', join: (...parts) => path.posix.join(...parts), ensureDir() {},
      exists: target => files.has(target),
      async readJSON(target, options = {}) {
        calls.reads.push(target);
        if (hooks.readJSON) return clone(await hooks.readJSON(target, options));
        if (!files.has(target)) {
          if ('defaultValue' in options) return clone(options.defaultValue);
          throw error('FILE_NOT_FOUND');
        }
        return JSON.parse(files.get(target));
      },
      async writeJSON(target, value, options) {
        calls.writes.push({ target, value: clone(value), options: clone(options) });
        if (hooks.writeJSON) return hooks.writeJSON(target, clone(value));
        files.set(target, JSON.stringify(value));
      },
      writeNew(target, text) {
        calls.creates.push({ target, text });
        if (hooks.writeNew) return hooks.writeNew(target, text);
        if (files.has(target)) throw error('ALREADY_EXISTS');
        files.set(target, text);
      },
      read(target) {
        if (hooks.read) return hooks.read(target);
        if (!files.has(target)) throw error('FILE_NOT_FOUND');
        return files.get(target);
      },
      remove(target) {
        calls.removes.push(target);
        if (hooks.remove) return hooks.remove(target);
        files.delete(target);
      }
    },
    ui: { createWindow: async spec => {
      if(hooks.createWindow)await hooks.createWindow(spec);
      return makePanel(spec);
    },
      getCapabilities: () => ({ enabled: true, available: true }),
      toast: async value => calls.toasts.push(clone(value)),
      closeAll: async () => { for (const panel of panels.slice()) await panel.close(); } },
    FloatingWindow: NativeToolbar,
    System: { delay: async ms => { if (hooks.delay) await hooks.delay(ms); } },
    App: { list: () => clone(env.applications), get: target => {
      calls.appGets.push(clone(target));
      return env.group && clone(env.group);
    } },
    window: {
      getActiveWindow: async () => clone(env.active),
      get: async target => { calls.gets.push(clone(target));
        return hooks.get ? hooks.get(target) : clone(env.active); },
      current: async target => { calls.current.push(clone(target));
        return hooks.current ? hooks.current(target) : clone(target); }
    },
    Events: { on: (type, fn) => on(events, type, fn) },
    Screen: { getDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }] },
    Dialog: { confirm: async options => {
      calls.confirms.push(clone(options));
      return env.answers.length ? env.answers.shift() : false;
    } },
    clipboard: { copy: text => calls.copies.push(text) },
    console: { log: value => calls.logs.push(String(value)), error: value => calls.logs.push(String(value)) },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id), URL, TextEncoder, crypto: webcrypto
  };
  const api = await vm.runInNewContext('(async()=>{\n' + executable + `\nreturn {
    empty, verified, importBackup, frame, html, managerHTML,
    persist, reconcile, rebuild, openManager, copy, codexWindow, main, sync,
    drag: event => drag(event,barId),
    allowDrag: () => {lastProgrammaticMove=0;expectedPosition=null;},
    exportBackup: typeof exportBackup === 'function' ? exportBackup : undefined,
    state: () => ({data, baseline, writing, editDirty, editId, draft, resolution}),
    manager: () => manager, bar: () => bar
  };})()`, context, { filename: mainPath, timeout: 2000 });
  return { api, calls, hooks, env, panels, files, file, lock, timers, events,
    disk: () => JSON.parse(files.get(file)),
    setDisk: value => files.set(file, JSON.stringify(value)),
    panel: () => panels.findLast(p => p.spec.kind === 'normal' && p.state.status !== 'closed') };
}
const model = harness();
const change = next => { next.prompts[0].body = '已修改'; };
async function blocked(h) {
  const writes = h.calls.writes.length, creates = h.calls.creates.length;
  let invoked = false;
  for (let i = 0; i < 2; i++) {
    await assert.rejects(h.api.persist(() => { invoked = true; }), { code: 'RECONCILE_REQUIRED' });
  }
  assert.equal(invoked, false, 'blocked writes must not execute the mutation');
  assert.equal(h.calls.writes.length, writes);
  assert.equal(h.calls.creates.length, creates, 'gate must precede acquiring a new lock');
  assert.equal(h.api.state().writing, false);
}
async function input(panel, key, value) {
  await panel.control(key).emit(key === 'enabled' ? 'change' : 'input',
    key === 'enabled' ? { checked: value } : { value });
}
async function fillDraft(panel) {
  const draft = { body: '尚未保存\n完整正文', label: '草稿', name: '待保存名称', enabled: false,
    bundleId: 'com.example.codex', backup: '/virtual/backup.json' };
  for (const [key, value] of Object.entries(draft)) await input(panel, key, value);
  return draft;
}
async function assertDraft(h, panel, expected) {
  for (const [key, value] of Object.entries(expected)) {
    const state = await panel.control(key).getState();
    assert.equal(key === 'enabled' ? state.checked : state.value, value, key);
  }
  assert.deepEqual(clone(h.api.state().draft), expected);
  assert.equal(h.api.state().editDirty, true);
}

test('empty schema accepted', async () => {
  const { api } = await model;
  assert.equal(api.verified(api.empty()).revision, 0);
});
test('invalid schemas, duplicate IDs and blank bodies rejected', async () => {
  const { api } = await model;
  for (const value of [{ ...library(), schemaVersion: 99 },
    { ...library(), prompts: [prompt, prompt] },
    { ...library(), prompts: [{ ...prompt, body: ' ' }] }]) assert.throws(() => api.verified(value));
});
test('browser v1 text imported with fresh local identity', async () => {
  const { api } = await model;
  const result = api.importBackup({ format: 'opendesk.prompt-shortcuts', version: 1, items: [{ body: '你好' }] });
  assert.equal(result.prompts.length, 1);
  assert.equal(result.prompts[0].body, '你好');
  assert.equal(result.images.length, 0);
});
test('browser v2 image downgraded with explicit notice metadata', async () => {
  const { api } = await model;
  const result = api.importBackup({ format: 'opendesk.prompt-shortcuts', version: 2,
    items: [{ body: '你好', appearance: 'image', imageUrl: 'https://example.com/image.png' }] });
  assert.equal(result.prompts.length, 1);
  assert.deepEqual(Array.from(result.images), [1]);
});
test('browser duplicate order and unknown format rejected', async () => {
  const { api } = await model;
  assert.throws(() => api.importBackup({ format: 'opendesk.prompt-shortcuts', version: 1,
    items: [{ body: 'a', order: 0 }, { body: 'b', order: 0 }] }));
  assert.throws(() => api.importBackup({ format: 'different', version: 2, items: [{ body: 'abc' }] }));
});
test('negative display coordinates retained and clipped', async () => {
  const { api } = await model;
  const result = api.frame({ x: -1600, y: -100, width: 1100, height: 900 }, 200,
    { offsetX: 0, offsetY: 0 }, [{ x: -1920, y: -120, width: 1920, height: 1080 }]);
  assert.ok(result.x < 0);
  assert.ok(result.y >= -112);
});
test('HTML tooltip escaped', async () => {
  assert.equal((await model).api.html('<b title="x">'), '&lt;b title=&quot;x&quot;&gt;');
});
test('manager HTML uses Custom UI v1 supported elements', async () => {
  const contract = fs.readFileSync(path.resolve(__dirname, '../../pkg/customui/validate.go'), 'utf8');
  const table = contract.match(/var allowedElements = map\[string\]bool\{([\s\S]*?)\n\}/);
  assert.ok(table, 'native allowedElements contract located');
  const allowed = new Set(Array.from(table[1].matchAll(/"([a-z]+)":\s*true/g), m => m[1]));
  assert.ok(allowed.size > 10, 'contract parsed');
  const { api } = await model;
  for (const markup of [api.managerHTML]) {
    const tags = Array.from(markup.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi), m => m[1].toLowerCase());
    assert.ok(tags.length > 0);
    for (const tag of tags) assert.ok(allowed.has(tag), 'unsupported Custom UI v1 element: ' + tag);
  }
});

test('successful persist commits once, reads back, releases own lock and allows next save', async () => {
  const h = await harness();
  await h.api.persist(change);
  assert.equal(h.disk().revision, 1);
  assert.equal(h.api.state().data.prompts[0].body, '已修改');
  assert.deepEqual(JSON.parse(h.api.state().baseline), h.disk());
  assert.equal(h.calls.reads.filter(p => p === h.file).length, 3);
  assert.equal(h.calls.writes.length, 1);
  assert.deepEqual(h.calls.removes, [h.lock]);
  assert.equal(h.files.has(h.lock), false);
  await h.api.persist(next => { next.settings.offsetX = 8; });
  assert.equal(h.disk().revision, 2);
});
test('write rejection committed:true becomes UNCERTAIN and blocks repeat mutations', async () => {
  const h = await harness();
  h.hooks.writeJSON = async (target, value) => {
    h.files.set(target, JSON.stringify(value));
    throw error('CANCELED', { committed: true });
  };
  await assert.rejects(h.api.persist(change), { code: 'UNCERTAIN' });
  assert.equal(h.disk().revision, 1, 'fault occurs after the simulated commit');
  assert.equal(h.api.state().data.revision, 0);
  assert.equal(h.api.state().resolution.kind, 'UNCERTAIN');
  assert.deepEqual(clone(h.api.state().resolution.expected), h.disk());
  await blocked(h);
});
for (const mode of ['mismatch', 'read failure', 'invalid readback']) {
  test('post-commit ' + mode + ' blocks blind retry', async () => {
    const h = await harness();
    h.hooks.writeJSON = async (target, value) => {
      h.files.set(target, JSON.stringify(value));
      h.hooks.readJSON = async () => {
        if (mode === 'read failure') throw error('IO_FAILED');
        return mode === 'invalid readback' ? { broken: true } : library();
      };
    };
    await assert.rejects(h.api.persist(change), { code: 'UNCERTAIN' });
    assert.equal(h.api.state().data.revision, 0);
    assert.equal(h.api.state().resolution.kind, 'UNCERTAIN');
    await blocked(h);
  });
}
test('STALE keeps previous baseline/data and repeated saves remain blocked', async () => {
  const h = await harness();
  const before = clone(h.api.state().data), baseline = h.api.state().baseline;
  const foreign = library(); foreign.revision = 1; foreign.prompts[0].body = '另一实例'; h.setDisk(foreign);
  await assert.rejects(h.api.persist(change), { code: 'STALE' });
  assert.deepEqual(clone(h.api.state().data), before);
  assert.equal(h.api.state().baseline, baseline);
  assert.equal(h.calls.writes.length, 0);
  await blocked(h);
  await h.api.reconcile();
  assert.equal(h.api.state().data.prompts[0].body, '另一实例');
  await h.api.persist(change);
  assert.equal(h.disk().revision, 2);
});
test('existing exclusive lock is preserved and mutation is never invoked', async () => {
  const h = await harness(); h.files.set(h.lock, 'other-owner');
  let invoked = false;
  await assert.rejects(h.api.persist(() => { invoked = true; }), { code: 'ALREADY_EXISTS' });
  assert.equal(invoked, false);
  assert.equal(h.calls.writes.length, 0);
  assert.deepEqual(h.calls.removes, []);
  assert.equal(h.files.get(h.lock), 'other-owner');
  assert.equal(h.api.state().writing, false);
});
test('concurrent persist gets BUSY without acquiring another lock', async () => {
  const h = await harness();
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  h.hooks.writeJSON = async (target, value) => {
    entered(); await new Promise(resolve => { release = resolve; });
    h.files.set(target, JSON.stringify(value));
  };
  const pending = h.api.persist(change);
  await ready;
  try {
    await assert.rejects(h.api.persist(change), { code: 'BUSY' });
    await assert.rejects(h.api.reconcile(), { code: 'BUSY' });
    assert.equal(h.calls.creates.length, 1);
  } finally { release(); await pending; }
});
for (const fault of ['remove failure', 'owner read failure', 'changed owner']) {
  test('lock release ' + fault + ' blocks writes and never deletes foreign lock', async () => {
    const h = await harness();
    if (fault === 'remove failure') h.hooks.remove = () => { throw error('PERMISSION_DENIED'); };
    if (fault === 'owner read failure') h.hooks.read = () => { throw error('IO_FAILED'); };
    if (fault === 'changed owner') h.hooks.writeJSON = async (target, value) => {
      h.files.set(target, JSON.stringify(value)); h.files.set(h.lock, 'new-owner');
    };
    await assert.rejects(h.api.persist(change), { code: 'LOCK_CLEANUP' });
    assert.equal(h.api.state().resolution.kind, 'LOCK_CLEANUP');
    assert.equal(h.disk().revision, 1);
    assert.equal(h.files.has(h.lock), true);
    if (fault !== 'remove failure') assert.deepEqual(h.calls.removes, []);
    if (fault === 'changed owner') assert.equal(h.files.get(h.lock), 'new-owner');
    await blocked(h);
    await assert.rejects(h.api.reconcile(), { code: 'LOCKED' });
    assert.equal(h.files.has(h.lock), true);
    assert.equal(h.api.state().resolution.kind, 'LOCK_CLEANUP');
  });
}
test('precommit failure releases own lock and permits a deliberate later save', async () => {
  const h = await harness();
  h.hooks.writeJSON = async () => { throw error('IO_FAILED', { committed: false }); };
  await assert.rejects(h.api.persist(change), { code: 'IO_FAILED' });
  assert.equal(h.api.state().resolution, null);
  assert.equal(h.files.has(h.lock), false);
  assert.equal(h.disk().revision, 0);
  delete h.hooks.writeJSON;
  await h.api.persist(change);
  assert.equal(h.disk().revision, 1);
});
for (const accepted of ['expected', 'original']) {
  test('reconcile explicitly reads ' + accepted + ' version before unblocking UNCERTAIN', async () => {
    const h = await harness();
    h.hooks.writeJSON = async (target, value) => {
      h.files.set(target, JSON.stringify(value));
      throw error('CANCELED', { committed: true });
    };
    await assert.rejects(h.api.persist(change), { code: 'UNCERTAIN' });
    await blocked(h);
    // Another writer may restore the original version after an uncertain commit.
    if (accepted === 'original') h.setDisk(library());
    delete h.hooks.writeJSON;
    const reads = h.calls.reads.length;
    await h.api.reconcile();
    assert.equal(h.calls.reads.length, reads + 1);
    assert.equal(h.api.state().resolution, null);
    assert.deepEqual(JSON.parse(h.api.state().baseline), h.disk());
    await h.api.persist(change);
    assert.equal(h.disk().revision, accepted === 'expected' ? 2 : 1);
  });
}
test('reconcile rejects a third-party version and preserves draft while gate remains closed', async () => {
  const h = await harness(); await h.api.openManager();
  const draft = await fillDraft(h.panel());
  h.hooks.writeJSON = async () => { throw error('CANCELED', { committed: true }); };
  await assert.rejects(h.api.persist(change), { code: 'UNCERTAIN' });
  const foreign = library(); foreign.revision = 7; h.setDisk(foreign);
  h.env.answers.push(true);
  await assert.rejects(h.api.reconcile(), { code: 'UNCERTAIN' });
  await assertDraft(h, h.panel(), draft);
  await blocked(h);
});
test('cancelled reconciliation preserves draft and performs no disk read', async () => {
  const h = await harness(); await h.api.openManager();
  const draft = await fillDraft(h.panel());
  const foreign = library(); foreign.revision = 1; h.setDisk(foreign);
  await assert.rejects(h.api.persist(change), { code: 'STALE' });
  const reads = h.calls.reads.length;
  h.env.answers.push(false); await h.api.reconcile();
  assert.equal(h.calls.reads.length, reads);
  await assertDraft(h, h.panel(), draft);
  await blocked(h);
});
test('failed reconciliation read keeps existing resolution and draft', async () => {
  const h = await harness(); await h.api.openManager();
  const draft = await fillDraft(h.panel());
  const foreign = library(); foreign.revision = 1; h.setDisk(foreign);
  await assert.rejects(h.api.persist(change), { code: 'STALE' });
  h.env.answers.push(true); h.hooks.readJSON = async () => { throw error('IO_FAILED'); };
  await assert.rejects(h.api.reconcile(), { code: 'IO_FAILED' });
  await assertDraft(h, h.panel(), draft);
  await blocked(h);
});
test('native manager close reopens and restores every draft field without writing', async () => {
  const h = await harness(); await h.api.openManager();
  const old = h.panel(), draft = await fillDraft(old);
  await old.close();
  assert.notEqual(h.panel(), old);
  assert.equal(h.api.manager(), h.panel());
  await assertDraft(h, h.panel(), draft);
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.calls.confirms.length, 0);
  assert.equal(h.api.state().data.prompts[0].body, prompt.body);
});
test('app settings save and position reset retain unsaved prompt draft and backup path', async () => {
  const h = await harness(); await h.api.openManager();
  const panel = h.panel(), draft = await fillDraft(panel);
  await panel.control('appSave').emit('click');
  assert.equal(h.disk().settings.appBundleId, draft.bundleId);
  assert.equal(h.disk().prompts[0].body, prompt.body);
  assert.equal(h.calls.writes.length, 1);
  await assertDraft(h, panel, draft);
  await panel.control('reset').emit('click');
  assert.equal(h.calls.writes.length, 2);
  await assertDraft(h, panel, draft);
});
test('cancelled explicit close keeps manager and draft; confirmed close can discard', async () => {
  const h = await harness(); await h.api.openManager();
  const panel = h.panel(), draft = await fillDraft(panel);
  h.env.answers.push(false); await panel.control('close').emit('click');
  assert.equal(h.panel(), panel); await assertDraft(h, panel, draft);
  h.env.answers.push(true); await panel.control('close').emit('click');
  assert.equal(h.api.manager(), null);
  assert.equal(h.api.state().editDirty, false);
  assert.equal(h.calls.writes.length, 0);
});
test('import cancelled at discard confirmation does not read backup or lose draft', async () => {
  const h = await harness(); await h.api.openManager();
  const panel = h.panel(), draft = await fillDraft(panel), reads = h.calls.reads.length;
  h.env.answers.push(false); await panel.control('import').emit('click');
  assert.equal(h.calls.reads.length, reads);
  assert.equal(h.calls.writes.length, 0);
  await assertDraft(h, panel, draft);
});
test('failed new-item save retains stable ID and cannot duplicate after uncertain commit', async () => {
  const h = await harness(); await h.api.openManager();
  const panel = h.panel(); await fillDraft(panel);
  h.hooks.writeJSON = async (target, value) => {
    h.files.set(target, JSON.stringify(value)); throw error('CANCELED', { committed: true });
  };
  await panel.control('save').emit('click');
  const id = h.api.state().editId;
  assert.ok(id); assert.equal(h.disk().prompts.length, 2);
  assert.equal(h.disk().prompts[1].id, id);
  await panel.control('save').emit('click');
  assert.equal(h.calls.writes.length, 1);
  assert.equal(h.api.state().editId, id);
  h.env.answers.push(true); delete h.hooks.writeJSON; await h.api.reconcile();
  await panel.control('save').emit('click');
  assert.equal(h.disk().prompts.length, 2);
  assert.equal(h.disk().prompts[1].id, id);
});
test('edits arriving during pending save remain dirty and survive native close', async () => {
  const h = await harness(); await h.api.openManager();
  const panel = h.panel(); await input(panel, 'body', '保存快照');
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  h.hooks.writeJSON = async (target, value) => {
    entered(); await new Promise(resolve => { release = resolve; });
    h.files.set(target, JSON.stringify(value));
  };
  const pending = panel.control('save').emit('click'); await ready;
  await input(panel, 'body', '保存期间继续编辑');
  release(); await pending;
  assert.equal(h.disk().prompts.at(-1).body, '保存快照');
  assert.equal((await panel.control('body').getState()).value, '保存期间继续编辑');
  assert.equal(h.api.state().editDirty, true);
  await panel.close();
  assert.equal((await h.panel().control('body').getState()).value, '保存期间继续编辑');
});

async function hostReady() {
  const h = await harness(); await h.api.rebuild();
  const bar = h.api.bar();
  h.env.active = { ...codex(), id: 'host:toolbar', pid: bar.state.hostPid,
    handle: bar.state.nativeWindowId };
  h.hooks.current = target => ({ ...clone(target), isForeground: false });
  return h;
}
test('toolbar reuses quick-replies native FloatingWindow with five fixed buttons', async () => {
  const h = await harness(); await h.api.rebuild();
  const bar = h.api.bar();
  assert.equal(bar.spec.native, true);
  assert.equal(bar.spec.options.orientation, 'vertical');
  assert.equal(bar.spec.options.draggable, true);
  assert.equal(bar.spec.options.theme, 'dark');
  assert.equal(bar.buttons.size, 5);
  assert.deepEqual(bar.buttons.get('settings').icon, {text:'管理'});
  assert.match(bar.buttons.get('settings').label, /管理提示词/);
  assert.deepEqual(bar.buttons.get('p0').icon, {text:'你好'});
  assert.deepEqual(bar.buttons.get('p1').icon, {text:'空'});
  assert.deepEqual(bar.buttons.get('next').icon, {text:'下一'});
  for (const button of bar.buttons.values()) {
    assert.ok(button.icon.text, 'all five actions have visible centered text');
    assert.ok(button.badge == null, 'text never uses a red badge');
    assert.equal(button.icon.path, undefined, 'no raster image');
  }
  assert.equal(bar.buttons.get('p1').disabled, true);
  assert.equal(bar.buttons.get('next').disabled, true);
  assert.equal(bar.spec.content, undefined, 'native bar has no handwritten HTML');
});
test('native paging wraps and copies the displayed prompt without creating another window', async () => {
  const doc = library();
  doc.prompts = Array.from({ length: 80 }, (_, i) => ({ ...prompt, id: 'ps_item_' + i,
    body: '正文' + i, label: '项' + i, order: i }));
  const h = await harness(doc); await h.api.rebuild(); const bar = h.api.bar();
  await bar.click('p0');
  await bar.click('next'); await bar.click('p0');
  assert.deepEqual(h.calls.copies, ['正文0', '正文3']);
  for (let i = 1; i < 26; i++) await bar.click('next');
  assert.match(bar.buttons.get('next').label, /27\/27/);
  assert.equal(bar.buttons.get('next').badge, null);
  assert.match(bar.buttons.get('p1').label, /正文79/);
  assert.equal(bar.buttons.get('p2').disabled, true);
  await bar.click('next'); await bar.click('p0');
  assert.equal(h.calls.copies.at(-1), '正文0');
  assert.equal(h.panels.length, 1);
});
test('native save updates existing buttons and retains toolbar identity', async () => {
  const h = await harness(); await h.api.rebuild(); const bar = h.api.bar();
  await h.api.persist(next => { next.prompts[0].body = '新正文'; next.prompts[0].label = '新词'; });
  assert.equal(h.api.bar(), bar);
  assert.deepEqual(bar.buttons.get('p0').icon, {text:'新词'});
  await bar.click('p0'); assert.deepEqual(h.calls.copies, ['新正文']);
  assert.equal(h.panels.length, 1);
});
test('native tooltips stay within 60 Unicode characters while copying the entire long body', async () => {
  const doc=library(); doc.prompts[0].body='🚀完整正文'.repeat(800);
  doc.prompts[0].name='长'.repeat(60);
  const h=await harness(doc); await h.api.rebuild();
  assert.equal(Array.from(h.api.bar().buttons.get('p0').label).length,60);
  assert.match(h.api.bar().buttons.get('p0').label,/仅复制/);
  await h.api.bar().click('p0'); assert.deepEqual(h.calls.copies,[doc.prompts[0].body]);
});
test('prompt callbacks are suppressed during a partial native button refresh', async () => {
  const h = await harness(); await h.api.rebuild();
  h.hooks.updateButton = async panel => { await panel.click('p0'); };
  await h.api.rebuild(); assert.deepEqual(h.calls.copies, []);
});
test('failed partial native refresh stays hidden and blocked until a complete refresh succeeds', async () => {
  const h = await harness(); await h.api.rebuild(); const bar = h.api.bar();
  h.hooks.updateButton = async (panel, id) => { if (id === 'p1') throw error('UI_DRIVER_FAILURE'); };
  await assert.rejects(h.api.rebuild(), { code: 'UI_DRIVER_FAILURE' });
  await h.api.sync(); await bar.click('p0');
  assert.equal(bar.state.visible, false);
  assert.deepEqual(h.calls.copies, []);
  delete h.hooks.updateButton; await h.api.rebuild(); await bar.click('p0');
  assert.equal(bar.state.visible, true);
  assert.deepEqual(h.calls.copies, [prompt.body]);
});
test('an older pending sync cannot reveal a toolbar after partial refresh failure', async () => {
  const h=await harness(); await h.api.rebuild(); h.env.active.x+=100;
  let release,started; const ready=new Promise(resolve=>{started=resolve;});
  h.hooks.move=async (panel,x,y)=>{started(); await new Promise(resolve=>{release=resolve;});
    Object.assign(panel.state.bounds,{x,y});};
  const pending=h.api.sync(); await ready;
  h.hooks.updateButton=async()=>{throw error('UI_DRIVER_FAILURE');};
  await assert.rejects(h.api.rebuild(),{code:'UI_DRIVER_FAILURE'});
  release(); await pending;
  assert.equal(h.api.bar().state.visible,false);
});
test('main can start with missing Codex before the lazy native toolbar has been shown', async () => {
  const h = await harness(); h.env.applications = [];
  await h.api.main();
  assert.equal(h.api.bar().state.visible, false);
  assert.ok(h.panel(), 'manager provides an entry while native toolbar stays unshown');
  assert.ok(h.events.size > 0, 'documented Events subscriptions retain execution');
});
test('show waits for native frame settling and revalidates foreground afterward', async () => {
  const h = await harness();
  h.hooks.show = async panel => { if (panel.spec.native) panel.state.bounds.y += 3; };
  h.hooks.delay = async ms => {
    assert.equal(ms, 100);
    if (h.api.bar().state.bounds.y % 1 === 0 && !h.hooks.settled) {
      h.api.bar().state.bounds.y -= 3; h.hooks.settled = true;
    }
  };
  await h.api.rebuild(); assert.equal(h.api.bar().state.visible, true);
  h.api.bar().state.visible = false;
  h.hooks.delay = async () => { h.env.active = { ...codex(), pid: 999 }; };
  await h.api.sync(); assert.equal(h.api.bar().state.visible, false);
});
test('native toolbar close releases the terminal handle and exposes the existing manager', async () => {
  const h = await harness(); await h.api.rebuild(); const old = h.api.bar();
  await old.close(); await h.api.sync();
  assert.equal(h.api.bar(), null);
  assert.ok(h.panel());
  await h.api.persist(change);
  assert.ok(h.api.bar()); assert.notEqual(h.api.bar(), old);
  assert.equal(h.api.bar().state.visible, true);
});
test('native close during a pending refresh cancels stale updates and permits recovery', async () => {
  for (const rejected of [false,true]) {
    const h=await harness();await h.api.rebuild();const old=h.api.bar();
    let updates=0;
    h.hooks.updateButton=async panel=>{
      updates++;await panel.close();
      if(rejected)throw error('UI_WINDOW_CLOSED');
    };
    await h.api.rebuild();
    assert.equal(updates,1,'closed toolbar must not receive the next update');
    assert.equal(h.api.bar(),null);assert.ok(h.panel());
    delete h.hooks.updateButton;await h.api.rebuild();
    assert.notEqual(h.api.bar(),old);
    await h.api.bar().click('p0');assert.deepEqual(h.calls.copies,['你好']);
  }
});
test('closing during failed-refresh cleanup cancels stale hide failures', async () => {
  const h=await harness();await h.api.rebuild();const old=h.api.bar();
  h.hooks.updateButton=async()=>{throw error('ORIGINAL_UPDATE_FAILURE');};
  old.hide=async()=>{await old.close();throw error('UI_WINDOW_CLOSED');};
  await h.api.rebuild();assert.equal(h.api.bar(),null);assert.ok(h.panel());
});
test('failed-refresh cleanup preserves the original error on a live window', async () => {
  const h=await harness();await h.api.rebuild();const old=h.api.bar();
  h.hooks.updateButton=async()=>{throw error('ORIGINAL_UPDATE_FAILURE');};
  old.hide=async()=>{throw error('HIDE_FAILURE');};
  await assert.rejects(h.api.rebuild(),{code:'ORIGINAL_UPDATE_FAILURE'});
  assert.ok(h.calls.logs.some(line=>line.includes('HIDE_FAILURE')));
});
test('closing the clean recovery manager after native toolbar close releases event subscriptions', async () => {
  const h=await harness(); await h.api.main();
  await h.api.bar().close(); await h.panel().close();
  assert.ok(Array.from(h.events.values()).every(handlers=>handlers.length===0));
  assert.equal(h.api.manager(),null); assert.equal(h.api.bar(),null);
});
test('settings creation concurrent with native toolbar close shares one manager', async () => {
  const h=await harness(); await h.api.rebuild(); const bar=h.api.bar();
  let release,started;const ready=new Promise(resolve=>{started=resolve;});
  h.hooks.createWindow=async spec=>{
    if(spec.kind==='normal'){started();await new Promise(resolve=>{release=resolve;});}
  };
  const settings=bar.click('settings');await ready;
  const closed=bar.close();release();await Promise.all([settings,closed]);
  const managers=h.panels.filter(p=>p.spec.kind==='normal');
  assert.equal(managers.length,1);assert.equal(managers[0],h.api.manager());
  assert.equal(managers[0].state.visible,true);
});
test('manager creation failure releases its pending state so the existing entry can retry', async () => {
  const h=await harness();h.hooks.createWindow=async()=>{throw error('UI_DRIVER_FAILURE');};
  await assert.rejects(h.api.openManager(),{code:'UI_DRIVER_FAILURE'});
  delete h.hooks.createWindow;await h.api.openManager();
  assert.equal(h.panels.length,1);assert.ok(h.api.manager());
});
test('native close during first manager show defers recovery until creation settles', async () => {
  const h=await harness();let once=true,expected;
  h.hooks.show=async panel=>{
    if(panel.spec.kind==='normal'&&once){
      once=false;expected=await fillDraft(panel);await panel.close();
    }
  };
  await h.api.openManager();
  assert.equal(h.panels.length,2);
  assert.equal(h.api.manager().state.visible,true);
  await assertDraft(h,h.api.manager(),expected);
  assert.equal(h.calls.writes.length,0);
});
test('reset cancels queued and already-started drag persistence', async () => {
  for(const started of [false,true]){
    const h=await harness(); await h.api.rebuild(); await h.api.openManager(); h.api.allowDrag();
    const b=h.api.bar().state.bounds;
    await h.api.drag({bounds:{...b,x:b.x+100,y:b.y+20}});
    assert.equal(h.timers.size,1);
    const callback=Array.from(h.timers.values())[0];
    let release;
    if(started){
      let ready; const began=new Promise(resolve=>{ready=resolve;});
      h.hooks.current=async target=>{ready();await new Promise(resolve=>{release=resolve;});return clone(target);};
      callback(); await began;
      // Reset's follow synchronization must be independent of the blocked drag.
      delete h.hooks.current;
    }
    await h.panel().control('reset').emit('click');
    if(started)release();else callback();
    for(let i=0;i<20;i++)await Promise.resolve();
    assert.equal(h.disk().settings.offsetX,0);
    assert.equal(h.disk().settings.offsetY,0);
    assert.equal(h.calls.writes.length,1,'discarded drag must not save over reset');
  }
});
test('position driver failure hides a previously visible toolbar and does not retry identical geometry', async () => {
  const h = await harness(); await h.api.rebuild();
  h.env.active.x += 120;
  h.hooks.move = async () => { throw error('UI_DRIVER_FAILURE'); };
  await h.api.sync();
  assert.equal(h.api.bar().state.visible, false);
  assert.ok(h.calls.logs.some(s => s.includes('UI_DRIVER_FAILURE')));
  const moves = h.calls.moves.length;
  await h.api.sync();
  assert.equal(h.calls.moves.length, moves, 'unchanged failed request must not loop');
  delete h.hooks.move; h.env.active.x += 30;
  await h.api.sync();
  assert.equal(h.api.bar().state.visible, true, 'changed target geometry can recover');
});
test('incorrect native bounds readback hides toolbar instead of trusting successful receipt', async () => {
  const h = await harness();
  h.hooks.move = async panel => { panel.state.bounds.x = -999; };
  await h.api.rebuild();
  assert.equal(h.api.bar().state.visible, false);
  assert.ok(h.calls.logs.some(s => s.includes('POSITION_UNCONFIRMED')));
});
test('bounds drift caused by show is rejected before the toolbar can be used', async () => {
  const h = await harness();
  h.hooks.show = async panel => { if (panel.spec.kind === 'floating') panel.state.bounds.x += 12; };
  await h.api.rebuild();
  assert.equal(h.api.bar().state.visible, false);
  assert.ok(h.calls.logs.some(s => s.includes('POSITION_UNCONFIRMED')));
});
test('switching away during a pending move does not reveal toolbar in the unrelated app', async () => {
  const h = await harness();
  h.hooks.move = async (panel, x, y) => {
    Object.assign(panel.state.bounds, { x, y });
    h.env.active = { ...codex(), pid: 999, handle: 888, id: 'other' };
  };
  await h.api.rebuild();
  assert.equal(h.api.bar().state.visible, false);
});
test('copy from exact visible toolbar Host PID/nativeWindowId succeeds once', async () => {
  const h = await hostReady(); await h.api.copy(prompt.id);
  assert.deepEqual(h.calls.copies, [prompt.body]);
  assert.equal(h.calls.current.at(-1).handle, 501);
});
for (const variant of ['other Host window', 'wrong PID', 'missing handle', 'hidden', 'offscreen', 'manager']) {
  test('copy rejects ' + variant + ' even when a previous Codex window was cached', async () => {
    const h = await hostReady(), state = h.api.bar().state;
    if (variant === 'other Host window') h.env.active.handle++;
    if (variant === 'wrong PID') h.env.active.pid++;
    if (variant === 'missing handle') delete h.env.active.handle;
    if (variant === 'hidden') state.visible = false;
    if (variant === 'offscreen') state.onScreen = false;
    if (variant === 'manager') {
      await h.api.openManager();
      h.env.active.handle = h.panel().state.nativeWindowId;
    }
    await h.api.copy(prompt.id);
    assert.deepEqual(h.calls.copies, []);
  });
}
for (const variant of ['pid', 'handle', 'id', 'membership']) {
  test('Host copy rejects cached Codex identity change: ' + variant, async () => {
    const h = await hostReady();
    h.hooks.current = target => {
      if (variant === 'membership') h.env.group = { pids: [] };
      return { ...clone(target), ...(variant === 'pid' ? { pid: 202 } : {}),
        ...(variant === 'handle' ? { handle: 502 } : {}),
        ...(variant === 'id' ? { id: 'replacement' } : {}) };
    };
    await h.api.copy(prompt.id); assert.deepEqual(h.calls.copies, []);
  });
}
test('active Codex copy revalidates exact identity and foreground before copying', async () => {
  const h = await harness(); await h.api.copy(prompt.id);
  assert.deepEqual(h.calls.copies, [prompt.body]);
  assert.deepEqual(h.calls.current, [codex()]);
  assert.deepEqual(h.calls.appGets, [{ bundleId: 'com.openai.codex' }, { bundleId: 'com.openai.codex' }]);
});
for (const variant of ['pid', 'handle', 'id', 'foreground', 'membership']) {
  test('active Codex second observation rejects changed ' + variant, async () => {
    const h = await harness();
    h.hooks.current = target => {
      if (variant === 'membership') h.env.group = { pids: [] };
      return { ...clone(target), ...(variant === 'pid' ? { pid: 202 } : {}),
        ...(variant === 'handle' ? { handle: 502 } : {}),
        ...(variant === 'id' ? { id: 'replacement' } : {}),
        ...(variant === 'foreground' ? { isForeground: false } : {}) };
    };
    await h.api.copy(prompt.id); assert.deepEqual(h.calls.copies, []);
    assert.equal(h.calls.current.length, 1);
  });
}
test('missing observed bundle ID and disabled or missing prompts cannot copy', async () => {
  const h = await harness(); h.env.applications = [];
  await h.api.copy(prompt.id); assert.deepEqual(h.calls.copies, []);
  assert.equal(h.calls.appGets.length, 0);
  const disabled = library(); disabled.prompts[0].enabled = false;
  const d = await harness(disabled); await d.api.copy(prompt.id); await d.api.copy('unknown');
  assert.deepEqual(d.calls.copies, []); assert.equal(d.calls.current.length, 0);
});
test('failed native observation cannot copy or silently fall back', async () => {
  const h = await harness(); h.hooks.current = async () => { throw error('STALE_TARGET'); };
  await assert.rejects(h.api.copy(prompt.id), { code: 'STALE_TARGET' });
  assert.deepEqual(h.calls.copies, []); assert.equal(h.calls.gets.length, 0);
});

// Optional external oracle: opt in explicitly. Normal repo tests never require a
// sibling checkout or treat its absence as a failure. Run independently with:
// OPENDESK_BROWSER_MODEL=/absolute/path/to/trusted/model.js node --test --test-name-pattern='optional Browser oracle' tests/custom-ui/codex-prompt-shortcuts.test.cjs
const oraclePath = process.env.OPENDESK_BROWSER_MODEL;
const backup = (item = { body: '你好' }, version = 2, extra = {}) => ({
  format: 'opendesk.prompt-shortcuts', version, items: [item], ...extra
});
// Self-contained fixtures for the formal Browser backup contract. These do not
// import a sibling checkout; the optional oracle below checks this same matrix.
const backupFixtures = [
  { name: 'minimal v1', value: backup({ body: '原文\n保留' }, 1), valid: true },
  { name: 'manual two graphemes', value: backup({ body: '正文', label: 'e\u0301👩‍💻',
    name: '手动名称', shape: 'round', enabled: false, labelAuto: false, nameAuto: false }), valid: true },
  { name: 'auto flags', value: backup({ body: '你好正文', label: '旧值', name: '旧名称',
    labelAuto: true, nameAuto: true }), valid: true },
  { name: 'image downgrade', value: backup({ body: '图片正文', appearance: 'image',
    imageUrl: 'https://example.com/image.png' }, 2, { imageSize: 'compact' }), valid: true },
  { name: 'unknown item field', value: backup({ body: '正文', arbitrary: true }) },
  { name: 'local asset field is not portable', value: backup({ body: '正文', imageAssetId: 'psa_' + 'a'.repeat(32) }) },
  { name: 'v1 appearance field', value: backup({ body: '正文', appearance: 'text' }, 1) },
  { name: 'v1 image size', value: backup({ body: '正文' }, 1, { imageSize: 'large' }) },
  { name: 'invalid v2 image size', value: backup({ body: '正文' }, 2, { imageSize: 'huge' }) },
  { name: 'wrong boolean enabled', value: backup({ body: '正文', enabled: 'false' }) },
  { name: 'wrong boolean labelAuto', value: backup({ body: '正文', labelAuto: 1 }) },
  { name: 'wrong boolean nameAuto', value: backup({ body: '正文', nameAuto: 'true' }) },
  { name: 'invalid shape', value: backup({ body: '正文', shape: 'triangle' }) },
  { name: 'invalid appearance', value: backup({ body: '正文', appearance: 'video' }) },
  { name: 'oversize manual label', value: backup({ body: '正文', label: '三个字' }) },
  { name: 'invalid ignored auto label', value: backup({ body: '正文', label: '三个字', labelAuto: true }) },
  { name: 'invisible label', value: backup({ body: '正文', label: '\u200b' }) },
  { name: 'invisible body', value: backup({ body: '\u200b\u200d' }) },
  { name: 'NUL body', value: backup({ body: '正文\0' }) },
  { name: 'oversize name', value: backup({ body: '正文', name: '名'.repeat(61) }) },
  { name: 'non-string label', value: backup({ body: '正文', label: 3 }) },
  { name: 'fractional order', value: backup({ body: '正文', order: 0.5 }) },
  { name: 'negative order', value: backup({ body: '正文', order: -1 }) },
  { name: 'duplicate order', value: { ...backup(), items: [{ body: 'a', order: 1 }, { body: 'b', order: 1 }] } },
  { name: 'empty items', value: { ...backup(), items: [] } },
  { name: 'too many items', value: { ...backup(), items: Array.from({ length: 81 }, () => ({ body: '正文' })) } },
  { name: 'missing image URL', value: backup({ body: '正文', appearance: 'image' }) },
  { name: 'insecure image URL', value: backup({ body: '正文', appearance: 'image', imageUrl: 'http://example.com/a.png' }) },
  { name: 'credentialed image URL', value: backup({ body: '正文', appearance: 'image', imageUrl: 'https://user:pass@example.com/a.png' }) },
  { name: 'SVG image URL', value: backup({ body: '正文', appearance: 'image', imageUrl: 'https://example.com/a.SVG?raw=1' }) },
  { name: 'non-string image URL', value: backup({ body: '正文', appearance: 'image', imageUrl: 42 }) }
];
for (const fixture of backupFixtures) {
  test('strict backup fixture: ' + fixture.name, async () => {
    const { api } = await model;
    const before = clone(fixture.value);
    if (fixture.valid) {
      const result = api.importBackup(clone(fixture.value));
      assert.equal(result.prompts[0].body, fixture.value.items[0].body);
      assert.equal(result.prompts[0].enabled, fixture.value.items[0].enabled !== false);
    } else assert.throws(() => api.importBackup(clone(fixture.value)));
    assert.deepEqual(fixture.value, before);
  });
}
test('import sorts without truncating text, ignores imported IDs and honors auto flags', async () => {
  const { api } = await model;
  const result = api.importBackup({ ...backup(), items: [
    { id: prompt.id, body: '后面\n  原样', order: 9, label: '标签', enabled: false },
    { id: prompt.id, body: '前面', order: 1, label: '旧值', labelAuto: true, name: '旧名称', nameAuto: true }
  ] });
  assert.deepEqual(Array.from(result.prompts, p => p.body), ['前面', '后面\n  原样']);
  assert.equal(result.prompts[0].label, ''); assert.equal(result.prompts[0].name, '');
  assert.equal(result.prompts[1].label, '标签'); assert.equal(result.prompts[1].enabled, false);
  assert.equal(new Set(result.prompts.map(p => p.id)).size, 2);
  for (const p of result.prompts) assert.notEqual(p.id, prompt.id);
});
test('oversize import and export reject rather than creating truncated backups', async () => {
  const { api } = await model;
  assert.throws(() => api.importBackup(backup({ body: 'a'.repeat(8193) })));
  const huge = library();
  huge.prompts = Array.from({ length: 40 }, (_, i) => ({ ...prompt,
    id: 'ps_large_' + i, body: '字'.repeat(8192), order: i }));
  assert.throws(() => api.importBackup({ ...backup(), items: huge.prompts.map(p => ({ body: p.body })) }));
  assert.throws(() => api.exportBackup(huge));
  assert.throws(() => api.exportBackup(api.empty()));
});
test('export blocks an unknown commit instead of exporting the old snapshot', async () => {
  const h = await harness(); await h.api.openManager();
  h.hooks.writeJSON = async (file, value) => {
    h.files.set(file, JSON.stringify(value)); throw error('IO_ERROR', { committed: true });
  };
  await assert.rejects(h.api.persist(change), { code: 'UNCERTAIN' });
  const before = h.calls.creates.length;
  await h.panel().control('export').emit('click');
  assert.equal(h.calls.creates.length, before);
  assert.ok(h.calls.logs.some(line => line.includes('RECONCILE_REQUIRED')));
});
test('export refreshes disk and blocks a stale baseline', async () => {
  const h = await harness(); await h.api.openManager();
  const external = h.disk(); external.revision++; external.prompts[0].body = '外部更新';
  h.setDisk(external);
  await h.panel().control('export').emit('click');
  assert.equal(h.calls.creates.length, 0);
  assert.equal(h.api.state().resolution.kind, 'STALE');
  assert.ok(h.calls.logs.some(line => line.includes('STALE')));
});
test('export writes a verified current snapshot without modifying the library', async () => {
  const h = await harness(); await h.api.openManager();
  await h.panel().control('export').emit('click');
  assert.equal(h.calls.creates.length, 1);
  const exported = JSON.parse(h.calls.creates[0].text);
  assert.equal(exported.items[0].body, prompt.body);
  assert.equal(h.calls.writes.length, 0);
  assert.ok(h.calls.reads.filter(file => file === h.file).length >= 2);
});
test('export preserves auto flags, body, names, enabled and logical order', async () => {
  const { api } = await model;
  const doc = library();
  doc.prompts.push({ ...prompt, id: 'ps_abcdefgh', body: '👩‍💻e\u0301末尾', label: '', name: '', enabled: false });
  const parsed = JSON.parse(api.exportBackup(doc));
  assert.equal(parsed.version, 2); assert.equal(parsed.format, 'opendesk.prompt-shortcuts');
  assert.equal(parsed.items[0].name, prompt.name);
  assert.equal(parsed.items[0].labelAuto, false); assert.equal(parsed.items[0].nameAuto, false);
  assert.equal(parsed.items[1].body, doc.prompts[1].body);
  assert.equal(parsed.items[1].labelAuto, true); assert.equal(parsed.items[1].nameAuto, true);
  assert.equal(parsed.items[1].label, '👩‍💻e\u0301'); assert.equal(parsed.items[1].enabled, false);
  assert.deepEqual(parsed.items.map(p => p.order), [0, 1]);
});
test('optional Browser oracle accepts local exported text backup', { skip: !oraclePath }, async () => {
  const browserContext = { URL, TextEncoder, crypto: webcrypto };
  vm.runInNewContext(fs.readFileSync(oraclePath, 'utf8'), browserContext, { filename: oraclePath, timeout: 2000 });
  const browser = browserContext.OpenDeskPromptShortcutsModel;
  assert.equal(typeof browser.backupParse, 'function');
  const { api } = await harness(); assert.equal(typeof api.exportBackup, 'function');
  const parsed = browser.backupParse(api.exportBackup(library()));
  assert.equal(parsed.length, 1); assert.equal(parsed[0].body, prompt.body);
});
test('optional Browser oracle validates the standalone strict fixture matrix', { skip: !oraclePath }, async () => {
  const browserContext = { URL, TextEncoder, crypto: webcrypto };
  vm.runInNewContext(fs.readFileSync(oraclePath, 'utf8'), browserContext, { filename: oraclePath, timeout: 2000 });
  const parse = browserContext.OpenDeskPromptShortcutsModel.backupParse;
  for (const fixture of backupFixtures) {
    const run = () => parse(JSON.stringify(fixture.value));
    if (fixture.valid) assert.ok(run().length > 0, fixture.name);
    else assert.throws(run, undefined, fixture.name);
  }
});
