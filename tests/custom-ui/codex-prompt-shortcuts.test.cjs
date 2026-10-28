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
  exePath:'/fixture/Codex',x: 100, y: 100, width: 1000, height: 800, isForeground: true });

async function harness(initial = library(), follow = true, mode, shared) {
  const root = '/virtual/.runtime/examples/custom-ui/codex-prompt-shortcuts';
  const file = root + '/library.json', lock = root + '/library.lock';
  const files = shared?.files || new Map([[file, JSON.stringify(initial)], ['/virtual/scripts/message-demo.json',
    fs.readFileSync(path.join(path.dirname(mainPath), 'message-demo.json'), 'utf8')],
    ['/virtual/scripts/targets.js', fs.readFileSync(path.join(path.dirname(mainPath), 'targets.js'), 'utf8')],
    ['/virtual/scripts/lock.js', fs.readFileSync(path.join(path.dirname(mainPath), 'lock.js'), 'utf8')],
    ['/virtual/scripts/recovery.js', fs.readFileSync(path.join(path.dirname(mainPath), 'recovery.js'), 'utf8')]]);
  const leases = shared?.leases || new Set();
  const calls = { reads: [], writes: [], creates: [], removes: [], copies: [],
    logs: [], toasts: [], notices: [], inserts: [], inserterOptions: [], discovers: [], confirms: [], appGets: [], current: [], gets: [], moves: [], hides: [] };
  const hooks = {};
  const panels = [];
  const timers = new Map(),timerDelays=new Map(),watchers=new Map();
  const events = new Map();
  let timerId = 0;
  const env = { active: codex(), applications: [{ bundleId: 'com.openai.codex' }],
    group: { identity:{kind:'bundleId',value:'com.openai.codex'},pids: [101], instances: [{ pid: 101 }] }, answers: [] };
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
      waitUntilClosed: async () => {if(hooks.waitUntilClosed)await hooks.waitUntilClosed(panel);},
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
    panel.addSeparator = () => {};
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
      listDir: target => Array.from(files.keys()).filter(p=>path.posix.dirname(p)===target).map(p=>path.posix.basename(p)),
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
      open(target, mode) {
        if (!files.has(target)) {
          if (mode === 'r') throw error('FILE_NOT_FOUND');
          files.set(target, '');
        }
        let closed = false, owned = false;
        const check = () => { if (closed) throw error('HANDLE_CLOSED'); };
        return {
          tryLock() { check(); if (owned) return true;
            if (leases.has(target)) return false;
            leases.add(target); owned = true; return true; },
          read(max) { check(); if (hooks.lockRead) return hooks.lockRead(target);
            const value = files.get(target);
            if (Buffer.byteLength(value) > max) throw error('READ_LIMIT');
            return value; },
          truncate(size) { check(); files.set(target, Buffer.from(files.get(target)).subarray(0, size).toString()); },
          write(value) { check(); if (hooks.lockWrite) hooks.lockWrite(target, value);
            files.set(target, files.get(target) + value); },
          sync() { check(); if (hooks.lockSync) hooks.lockSync(target); },
          close() { if (closed) return; closed = true;
            if (owned) leases.delete(target);
            if (hooks.lockClose) hooks.lockClose(target); }
        };
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
      toast: async value => {
        if(hooks.toast)await hooks.toast(value);
        calls.toasts.push(clone(value));
        const handle={options:clone(value),closed:false,updates:[],
          update:async patch=>{
            if(hooks.noticeUpdate)await hooks.noticeUpdate(handle,patch);
            if(handle.closed)return {applied:false,reason:'closed',state:{status:'closed'}};
            Object.assign(handle.options,clone(patch));handle.updates.push(clone(patch));
            calls.toasts.push(clone(handle.options));return {applied:true,state:{status:'visible'}};
          },close:async()=>{handle.closed=true;return {status:'closed'};}};
        calls.notices.push(handle);return handle;
      },
      closeAll: async () => { for (const panel of panels.slice()) await panel.close(); } },
    FloatingWindow: NativeToolbar,
    Execution: {scriptDir:'/virtual/scripts',env:{OPENDESK_CODEX_SHORTCUTS_MODE:mode}},
    // Persistent path selection and real migration are tested in storage.test;
    // keep these manager/interaction tests on their existing in-memory library.
    OpenDeskPromptStorage:{initialize:async ({verified,empty})=>({dir:root,file,lockPath:lock,
      status:'loaded',lockRecovery:[],data:verified(await context.File.readJSON(file,{defaultValue:empty()}))})},
    OpenDeskPromptInsertion: {
      discoverRuntimeEditor: async options => { calls.discovers.push(clone(options));
        if(hooks.discover)return hooks.discover(options);
        return {editorSelector:{role:'textField',identifier:'fixture-composer'},layout:{window:clone(env.active)}}; },
      calibrateRuntimeEditor: async () => { env.calibrated=true;if(hooks.calibrate)return hooks.calibrate();
        return {editorSelector:{role:'textField',identifier:'fixture-composer'},layout:{window:clone(env.active)}}; },
      createRuntimeInserter: options => { (calls.liveInserterOptions??=[]).push(options);
        calls.inserterOptions.push(clone(options));hooks.inserterOptions?.(options);return {insert: async body => {
        calls.inserts.push(body); return hooks.insert ? hooks.insert() : env.calibrated?{status:'inserted',verified:true,actionState:'acknowledged'}:
          {status:'rejected',code:'INPUT_STATE_UNVERIFIABLE',actionState:'not_started'};
      }};}
    },
    Accessibility:{snapshot:async options=>{
      assert.equal(options.properties.includes('value'),false);
      if(hooks.composer)return hooks.composer(options);
      return {complete:true,truncated:false,root:{role:'window',children:[{
        role:'textField',identifier:'fixture-composer',enabled:true,children:[],
        bounds:{x:env.active.x+100,y:env.active.y+env.active.height-130,width:600,height:100,coordinateSpace:'screen'}}]}};
    }},
    System: { delay: async ms => { if (hooks.delay) await hooks.delay(ms); } },
    App: { list: () => clone(env.applications), get: target => {
      calls.appGets.push(clone(target));
      if(hooks.appGet)return hooks.appGet(target);
      if(!env.applications.some(a=>a.bundleId===target.bundleId))return null;
      return env.group && clone(env.group);
    } },
    window: {
      getActiveWindow: async () => {if(hooks.forbidGlobal)assert.fail('global active');return clone(env.active);},
      getAppWindow: async scope => {if(hooks.scoped)return hooks.scoped(clone(scope));
        assert.deepEqual(clone(scope),{pid:101,exePath:'/fixture/Codex'});return clone(env.active);},
      get: async target => { calls.gets.push(clone(target));
        return hooks.get ? hooks.get(target) : clone(env.active); },
      current: async target => { if(hooks.forbidGlobal)assert.fail('global current');calls.current.push(clone(target));
        return hooks.current ? hooks.current(target) : clone(target); }
    },
    Events: { on: (type, fn) => on(events, type, fn) },
    Screen: { getDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }] },
    Dialog: { confirm: async options => {
      calls.confirms.push(clone(options));
      return env.answers.length ? env.answers.shift() : false;
    } },
    clipboard: { copy: text => { calls.copies.push(text); env.clipboard=text; },
      paste: () => hooks.clipboardRead ? hooks.clipboardRead() : env.clipboard },
    console: { log: value => calls.logs.push(String(value)), error: value => calls.logs.push(String(value)) },
    Date:class extends Date {static now(){return env.now??Date.now();}},
    setTimeout: (fn,ms) => { const id = ++timerId; timers.set(id, fn);timerDelays.set(id,ms); return id; },
    clearTimeout: id => {timers.delete(id);timerDelays.delete(id);}, URL, TextEncoder, crypto: webcrypto
  };
  const api = await vm.runInNewContext('(async()=>{\n' + executable + (follow===null?'':`\nfollowing=${follow};`) + `\nreturn {
    empty, verified, importBackup, frame, html, managerHTML, demoOptions, notice,
    persist, reconcile, rebuild, openManager, copy, codexWindow:targetWindow, initializeRecovery, checkpointRecovery,
    closeRecovery:()=>recovery?.close(), main: keepAlive => main(keepAlive===true), sync, setFollowing,
    drag: event => drag(event,barId),
    allowDrag: () => {expectedPosition=null;},
    exportBackup: typeof exportBackup === 'function' ? exportBackup : undefined,
    state: () => ({data, baseline, writing, editDirty, editId, draft, resolution, following,pendingWrite,
      composerSample,composerPending:!!composerPending,codeScene,sceneVersion,sceneVerifiedVersion,sceneVerifiedAt}),
    manager: () => manager, bar: () => bar
  };})()`, context, { filename: mainPath, timeout: 2000 });
  return { api, calls, hooks, env, executionEnv:context.Execution.env, panels, files, file, lock, leases, timers, timerDelays,events,watchers,
    installWatcher(){context.window.watchAppWindow=(scope,callback)=>{
      if(hooks.watch)return hooks.watch(scope,callback);
      watchers.set(scope.pid,callback);
      return {capabilities:{backend:'test-native'},unsubscribe(){watchers.delete(scope.pid);}};
    };},
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
test('cross-screen placement selects the content screen even when the sidebar dominates the other screen', async () => {
  const {api}=await model;
  const displays=[{x:-1000,y:0,width:1000,height:1000},{bounds:{x:0,y:0,width:1000,height:1000}}];
  for(const screens of [displays,displays.slice().reverse()]){
    const p=api.frame({x:-300,y:100,width:500,height:700},280,
      {offsetX:0,offsetY:0},screens);
    assert.deepEqual(clone(p),{x:16,y:310});
  }
});
test('cross-screen placement ignores a larger intersection that cannot contain toolbar height', async () => {
  const {api}=await model;
  const profile={contentArea:()=>({x:0,y:0,width:1000,height:500})};
  const p=api.frame({x:-800,y:-100,width:1000,height:500},280,
    {offsetX:-10000,offsetY:-10000},[
      {x:-1000,y:-100,width:1000,height:220},
      {x:0,y:-300,width:1000,height:1000}
    ],profile);
  assert.deepEqual(clone(p),{x:8,y:-100});
});
test('cross-screen narrow fragments cannot be combined to hold a toolbar', async () => {
  const {api}=await model;
  const profile={contentArea:()=>({x:0,y:0,width:100,height:500})};
  assert.throws(()=>api.frame({x:-50,y:-100,width:100,height:500},280,
    {offsetX:0,offsetY:0},[{x:-1000,y:-300,width:1000,height:1000},
      {x:0,y:-300,width:1000,height:1000}],profile),{code:'TARGET_TOO_SMALL'});
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
  assert.deepEqual(h.calls.removes, []);
  assert.match(h.files.get(h.lock), /"state":"released"/);
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
  await assert.rejects(h.api.persist(() => { invoked = true; }), { code: 'LEGACY_LOCK' });
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
for (const fault of ['release write failure', 'owner read failure', 'changed owner']) {
  test('lock release ' + fault + ' blocks writes and preserves recovery evidence', async () => {
    const h = await harness();
    h.hooks.writeJSON = async (target, value) => {
      h.files.set(target, JSON.stringify(value));
      if (fault === 'release write failure') h.hooks.lockWrite = (path, text) => {
        if (text.includes('"state":"released"')) throw error('PERMISSION_DENIED');
      };
      if (fault === 'owner read failure') h.hooks.lockRead = () => { throw error('IO_FAILED'); };
      if (fault === 'changed owner') h.files.set(h.lock, 'new-owner');
    };
    await assert.rejects(h.api.persist(change), { code: 'LOCK_CLEANUP' });
    assert.equal(h.api.state().resolution.kind, 'LOCK_CLEANUP');
    assert.equal(h.disk().revision, 1);
    assert.equal(h.files.has(h.lock), true);
    assert.equal(h.leases.size, 0, 'even receipt failure closes the OS handle');
    assert.deepEqual(h.calls.removes, []);
    if (fault === 'changed owner') assert.equal(h.files.get(h.lock), 'new-owner');
    await blocked(h);
    await assert.rejects(h.api.reconcile(), { code: fault === 'changed owner' ? 'LEGACY_LOCK' :
      fault === 'owner read failure' ? 'IO_FAILED' : 'LOCK_CLEANUP' });
    assert.equal(h.api.state().resolution.kind, 'LOCK_CLEANUP');
    if (fault !== 'changed owner') {
      delete h.hooks.lockRead; delete h.hooks.lockWrite;
      await h.api.reconcile();
      assert.equal(h.api.state().resolution, null);
      assert.equal(h.disk().revision, 1, 'recovery reads committed data, never replays it');
    }
  });
}
test('precommit failure releases own lock and permits a deliberate later save', async () => {
  const h = await harness();
  h.hooks.writeJSON = async () => { throw error('IO_FAILED', { committed: false }); };
  await assert.rejects(h.api.persist(change), { code: 'IO_FAILED' });
  assert.equal(h.api.state().resolution, null);
  assert.match(h.files.get(h.lock), /"state":"released"/);
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
  const panel = h.panel(); await panel.control('new').emit('click'); await fillDraft(panel);
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
test('toolbar focus never activates a remembered target for an unavailable append transport', async () => {
  const h=await hostReady();await h.api.bar().click('p0');
  assert.deepEqual(h.calls.inserts,[]);
  assert.deepEqual(h.calls.copies,[prompt.body]);
  const receipt=JSON.parse(h.calls.logs.find(s=>s.startsWith('CODEX_SHORTCUT_INSERT=')).split('=')[1]);
  assert.equal(receipt.code,'NOT_FOREGROUND');assert.equal(receipt.actionState,'not_started');
});
test('toolbar reuses quick-replies native FloatingWindow with five fixed buttons', async () => {
  const h = await harness(); await h.api.rebuild();
  const bar = h.api.bar();
  assert.equal(bar.spec.native, true);
  assert.equal(bar.spec.options.orientation, 'vertical');
  assert.equal(bar.spec.options.draggable, true);
  assert.equal(bar.spec.options.theme, 'dark');
  assert.equal(bar.buttons.size, 5);
  assert.deepEqual(bar.buttons.get('settings').icon, {path:'assets/opendesk-logo.png',renderingMode:'original'});
  assert.equal([...bar.buttons.keys()][0], 'settings');
  assert.match(bar.buttons.get('settings').label, /管理提示词/);
  assert.deepEqual(bar.buttons.get('p0').icon, {text:'你好'});
  assert.deepEqual(bar.buttons.get('p1').icon, {text:'空'});
  assert.deepEqual(bar.buttons.get('next').icon, {text:'一页'});
  for (const button of bar.buttons.values()) {
    assert.ok(button.icon.text || button.icon.path, 'every action has visible content');
    assert.ok(button.badge == null, 'text never uses a red badge');
    if (button !== bar.buttons.get('settings')) assert.equal(button.icon.path, undefined);
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
  const h=await harness(doc,true,'copy'); await h.api.rebuild();
  assert.equal(Array.from(h.api.bar().buttons.get('p0').label).length,60);
  assert.match(h.api.bar().buttons.get('p0').label,/点击复制全文/);
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
test('explicit copy-only startup opens manager then exposes the real bar without desktop observation', async () => {
  const h = await harness(library(), null, 'copy'); h.env.applications = [];
  await h.api.main();
  assert.equal(h.api.bar().state.visible, false);
  assert.equal(h.panel().state.visible, true);
  assert.equal(h.calls.appGets.length, 0);
  assert.equal(h.calls.current.length, 0);
  assert.equal(h.events.size, 0);
  await h.panel().control('close').emit('click');
  assert.equal(h.api.bar().state.visible, true);
  await h.api.bar().click('p0');
  assert.deepEqual(h.calls.copies, [prompt.body]);
  assert.equal(h.api.bar().buttons.get('p0').icon.text, prompt.label);
});
test('clipboard mismatch never reports success and a disabled item never copies', async () => {
  const h = await harness(library(), false); await h.api.rebuild();
  h.hooks.clipboardRead = () => 'different';
  await assert.rejects(h.api.copy(prompt.id), {code:'CLIPBOARD_CHANGED'});
  assert.ok(!h.calls.logs.some(s => s.startsWith('CODEX_SHORTCUT_COPIED=')));
  assert.notEqual(h.api.bar().buttons.get('p0').icon.text, '已复制');
  await h.api.bar().click('p1');
  assert.equal(h.calls.copies.length, 1);
});
test('copy feedback never mutates button labels or schedules a reset across pages', async () => {
  const doc = library(); doc.prompts = Array.from({length:4}, (_,i) => ({...prompt,id:'ps_more_'+i,body:'正文'+i,label:'项'+i}));
  const h = await harness(doc, false); await h.api.rebuild();
  const original=clone(h.api.bar().buttons.get('p0').icon);
  h.hooks.updateButton=async()=>{throw error('COPY_MUST_NOT_UPDATE_BUTTON');};
  await h.api.bar().click('p0');
  assert.deepEqual(h.api.bar().buttons.get('p0').icon, original);
  assert.equal(h.timers.size,0);
  delete h.hooks.updateButton;
  await h.api.bar().click('next');
  assert.equal(h.api.bar().buttons.get('p0').icon.text, '项3');
  await h.api.bar().click('p0'); assert.equal(h.calls.copies.at(-1), '正文3');
});
test('verified copying survives notification failure; manager copy ignores target focus and status', async()=>{
  const h=await harness();await h.api.rebuild();await h.api.openManager();
  h.env.active={id:'other',pid:999,handle:888};
  h.hooks.toast=async()=>{throw error('UI_FEEDBACK_FAILED');};
  const status=clone(h.panel().control('status').state);
  await h.panel().control('copySelected').emit('click');
  assert.deepEqual(h.calls.copies,[prompt.body]);
  assert.ok(h.calls.logs.some(s=>s.startsWith('CODEX_SHORTCUT_COPIED=')));
  assert.ok(!h.calls.toasts.some(t=>t.message.includes('操作未完成')));
  assert.deepEqual(h.panel().control('status').state,status);
  await input(h.panel(),'body','未保存正文');
  await h.panel().control('copySelected').emit('click');
  assert.equal(h.calls.copies.length,1);
});
test('copy and image ad are separate reusable right-bottom native messages',async()=>{
  const h=await harness(library(),false,'copy');await h.api.rebuild();
  for(let i=0;i<12;i++)await h.api.bar().click('p0');
  assert.equal(h.calls.notices.length,2);
  const [feedback,ad]=h.calls.notices;
  assert.match(feedback.options.message,/^已复制 · /);
  assert.match(feedback.options.caption,/完整正文/);
  assert.equal(feedback.options.timeoutMs,2600);
  assert.equal(feedback.options.image,undefined);
  assert.match(ad.options.message,/^广告演示 · /);
  assert.equal(ad.options.image.path,'assets/opendesk-logo.png');
  assert.equal(ad.options.timeoutMs,5000);
  assert.equal(ad.options.timeoutProgress,true);
  assert.deepEqual(ad.options.position,feedback.options.position);
  assert.deepEqual(ad.options.position,{mode:'anchor',horizontal:'right',vertical:'bottom',margin:24,display:'active'});
  assert.equal(feedback.updates.length,11);assert.equal(ad.updates.length,11);
  feedback.closed=true;ad.closed=true;
  await h.api.bar().click('p0');
  assert.equal(h.calls.notices.length,4);
  assert.equal(h.calls.notices.filter(n=>!n.closed).length,2);
});
test('notification replacement is coalesced while native update is pending',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.bar().click('p0');
  let release,started;const ready=new Promise(resolve=>{started=resolve;});
  h.hooks.noticeUpdate=async()=>{started();await new Promise(resolve=>{release=resolve;});delete h.hooks.noticeUpdate;};
  const first=h.api.notice('feedback',{message:'first',timeoutMs:2600});await ready;
  const pending=Array.from({length:30},(_,i)=>h.api.notice('feedback',{message:'latest-'+i,timeoutMs:2600}));
  release();await Promise.all([first,...pending]);
  assert.equal(h.calls.notices.length,2);
  assert.equal(h.calls.notices[0].options.message,'latest-29');
  assert.equal(h.calls.notices[0].updates.length,2);
});
test('slow native feedback never discards a later prompt click',async()=>{
  const doc=library();doc.prompts.push({...prompt,id:'ps_second_1',name:'第二条',body:'第二条完整正文',order:1});
  const h=await harness(doc,false,'copy');await h.api.rebuild();
  let release,started;const ready=new Promise(resolve=>{started=resolve;});
  h.hooks.toast=async()=>{started();await new Promise(resolve=>{release=resolve;});delete h.hooks.toast;};
  const first=h.api.bar().click('p0');await ready;
  const second=h.api.bar().click('p1');
  assert.deepEqual(h.calls.copies,[prompt.body,doc.prompts[1].body]);
  release();await Promise.all([first,second]);
  assert.match(h.calls.notices[0].options.message,/第二条/);
  assert.equal(h.calls.notices.length,2);
});
test('a notification submitted during drain completion is never stranded',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.bar().click('p0');
  let later;
  h.hooks.noticeUpdate=async()=>{
    delete h.hooks.noticeUpdate;
    later=Promise.resolve().then(()=>{}).then(()=>{}).then(()=>{}).then(()=>
      h.api.notice('feedback',{message:'latest',timeoutMs:2600}));
  };
  await h.api.notice('feedback',{message:'first',timeoutMs:2600});await later;
  assert.equal(h.calls.notices[0].options.message,'latest');
});
test('quit closes both native message channels and creates no feedback timers',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.bar().click('p0');
  await h.api.openManager();await h.panel().control('quit').emit('click');
  assert.ok(h.calls.notices.every(n=>n.closed));assert.equal(h.timers.size,0);
});
test('quit during native message creation closes the late result and suppresses the ad',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.openManager();
  let release,started;const ready=new Promise(resolve=>{started=resolve;});
  h.hooks.toast=async()=>{started();await new Promise(resolve=>{release=resolve;});};
  const copying=h.panel().control('copySelected').emit('click');await ready;
  const quitting=h.panel().control('quit').emit('click');release();
  await Promise.all([copying,quitting]);
  assert.equal(h.calls.notices.length,1);assert.ok(h.calls.notices[0].closed);
  assert.equal(h.calls.copies[0],prompt.body);
});
test('ad demo configuration is bounded, local, explicitly demo and optionally disabled',async()=>{
  const h=await harness();const config={schemaVersion:1,enabled:true,title:'标题',text:'说明',image:'assets/local.jpg'};
  assert.match(h.api.demoOptions(config).message,/广告演示/);
  assert.equal(h.api.demoOptions({...config,enabled:false}),null);
  for(const patch of [{image:'https://example.com/ad.png'},{image:'assets/../secret.png'},
      {image:'assets/file.svg'},{title:''},{text:'x'.repeat(241)},{title:'bad\0title'},{enabled:'true'}])
    assert.throws(()=>h.api.demoOptions({...config,...patch}),{code:'INVALID_AD_DEMO'});
});
test('copy mode cancels calibration even when the measurement is pending',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.openManager();
  let release,started;const ready=new Promise(resolve=>{started=resolve;});
  h.hooks.calibrate=async()=>{started();return new Promise(resolve=>{release=resolve;});};
  const manager=h.panel(),pending=manager.control('calibrate').emit('click');await ready;
  await manager.control('copyMode').emit('click');release({});await pending;
  await manager.control('close').emit('click');await h.api.bar().click('p0');
  assert.deepEqual(h.calls.inserts,[]);assert.deepEqual(h.calls.copies,[prompt.body]);
});
for(const follow of [false,true])test('pending sync cannot reveal toolbar over newly opened management: '+follow,async()=>{
  const h=await harness(library(),follow);await h.api.rebuild();const bar=h.api.bar();
  bar.state.visible=false;
  let release,started;const ready=new Promise(resolve=>{started=resolve;});
  const get=bar.getState;let once=true;
  bar.getState=async()=>{if(once){once=false;started();await new Promise(resolve=>{release=resolve;});}return get();};
  const pending=h.api.sync();await ready;await h.api.openManager();release();await pending;
  assert.equal(h.panel().state.visible,true);assert.equal(bar.state.visible,false);
});
test('real keepalive waits for asynchronous recovery management before exiting',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();const bar=h.api.bar();
  let releaseBar,releaseManager,barStarted,managerStarted;
  const barReady=new Promise(resolve=>{barStarted=resolve;});
  const managerReady=new Promise(resolve=>{managerStarted=resolve;});
  h.hooks.waitUntilClosed=async panel=>new Promise(resolve=>{
    if(panel===bar){releaseBar=resolve;barStarted();}else{releaseManager=resolve;managerStarted();}
  });
  let createRelease,createStarted;const creating=new Promise(resolve=>{createStarted=resolve;});
  h.hooks.createWindow=async()=>{createStarted();await new Promise(resolve=>{createRelease=resolve;});};
  let finished=false;const running=h.api.main(true).then(()=>{finished=true;});await barReady;
  releaseBar();const closing=bar.close();await creating;
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);
  createRelease();await closing;await managerReady;assert.equal(finished,false);
  await h.panel().close();releaseManager();await running;assert.equal(finished,true);
});
test('explicit calibration hides own manager, records candidate target, and copy mode restores ordinary copying', async () => {
  const h = await harness(library(), false); await h.api.rebuild(); await h.api.openManager();
  const manager=h.panel(), bar=h.api.bar();
  assert.equal(manager.state.visible,true); assert.equal(bar.state.visible,false);
  await manager.control('calibrate').emit('click');
  assert.equal(manager.state.visible,false); assert.equal(bar.state.visible,true);
  await bar.click('p0');
  assert.deepEqual(h.calls.inserts,[prompt.body]); assert.deepEqual(h.calls.copies,[]);
  await bar.click('settings');
  assert.match(manager.control('deliveryMode').state.text,/点击检查追加条件.*失败复制全文/);
  assert.equal(bar.state.visible,false);
  await manager.control('copyMode').emit('click');
  await manager.control('close').emit('click');
  assert.equal(bar.state.visible,true); await bar.click('p0');
  assert.deepEqual(h.calls.copies,[prompt.body]);
});
test('failed calibration restores manager; uncertain insertion preserves clipboard and never retries input', async () => {
  const h=await harness(library(),false); await h.api.rebuild(); await h.api.openManager();
  const manager=h.panel(); h.hooks.calibrate=()=>{throw error('MISSING_FIELD');};
  await manager.control('calibrate').emit('click');
  assert.equal(manager.state.visible,true); assert.equal(h.api.bar().state.visible,false);
  delete h.hooks.calibrate; await manager.control('calibrate').emit('click');
  h.hooks.insert=()=>({status:'blocked',code:'READBACK_MISMATCH',actionState:'unknown'});
  await h.api.bar().click('p0'); await h.api.bar().click('p0');
  assert.equal(h.calls.inserts.length,1); assert.deepEqual(h.calls.copies,[]);
  assert.ok(h.calls.toasts.some(t=>/结果未确认.*先检查草稿.*保留剪贴板.*不自动重试/.test(t.message)));
  await h.api.bar().click('settings');
  assert.equal(manager.control('calibrate').state.disabled,true);
  await manager.control('copyMode').emit('click');
  await manager.control('copySelected').emit('click');
  assert.deepEqual(h.calls.copies,[prompt.body]);
});
test('show waits for native frame settling and revalidates foreground afterward', async () => {
  const h = await harness();
  h.hooks.show = async panel => { if (panel.spec.native) panel.state.bounds.y += 3; };
  h.hooks.delay = async ms => {
    assert.ok(ms>0&&ms<=50,'foreground and geometry must be rechecked promptly');
    if (h.api.bar().state.bounds.y % 1 === 0 && !h.hooks.settled) {
      h.api.bar().state.bounds.y -= 3; h.hooks.settled = true;
    }
  };
  await h.api.rebuild(); assert.equal(h.api.bar().state.visible, true);
  h.api.bar().state.visible = false;
  h.hooks.delay = async () => { h.env.active = { ...codex(), pid: 999 }; };
  await h.api.sync(); assert.equal(h.api.bar().state.visible, false);
});
test('stable native show leaves most of the 500ms follow budget for actual observations',async()=>{
  const h=await harness();let wait=0,samples=0;
  h.hooks.delay=async ms=>{wait+=ms;samples++;};
  await h.api.rebuild();
  assert.equal(h.api.bar().state.visible,true);
  assert.ok(samples>=2,'immediate read plus two spaced reads retain successive matching frames');
  assert.ok(wait<=64,'stable show leaves the follow budget for native observations');
});
test('follow consumes earlier events only after final readbacks, and reruns for events during those readbacks',async()=>{
  const baseline=await harness();await baseline.api.rebuild();
  const count=baseline.calls.current.length;
  for(const late of [false,true]){
    const h=await harness();let reads=0;
    h.hooks.current=target=>{
      if(++reads===(late?count:1))void h.api.sync();
      return clone(target);
    };
    await h.api.rebuild();
    assert.equal(h.api.bar().state.visible,true);
    if(late)assert.ok(h.calls.current.length>count,'event during final readback must trigger fresh verification');
    else assert.equal(h.calls.current.length,count,'covered earlier event must not replay a whole synchronization');
  }
});
test('returning from a hidden inset frame accepts the verified final-height center',async()=>{
  const h=await harness();await h.api.rebuild();const panel=h.api.bar(),final=clone(panel.state.bounds);
  Object.assign(panel.state,{visible:false,onScreen:false,status:'hidden'});
  Object.assign(panel.state.bounds,{height:final.height-6,y:final.y+3});
  h.hooks.show=async p=>{if(p===panel)Object.assign(p.state.bounds,final);};
  await h.api.sync();
  assert.equal(panel.state.visible,true,'a verified full-height center must not fail against the hidden animation height');
  assert.deepEqual(panel.state.bounds,final);
  assert.equal(h.calls.logs.some(s=>s.includes('POSITION_UNCONFIRMED')),false);
});
const composerTree=(win,y,height)=>({complete:true,truncated:false,root:{role:'window',children:[{
  role:'textField',identifier:'fixture-composer',enabled:true,children:[],
  bounds:{x:win.x+100,y:win.y+y,width:600,height,coordinateSpace:'screen'}}]}});
async function armComposer(h){
  await h.api.rebuild();await h.api.openManager();await h.panel().control('calibrate').emit('click');
  await new Promise(resolve=>setImmediate(resolve));await h.api.sync();
}
async function pollComposer(h){
  const callbacks=Array.from(h.timers.values());h.timers.clear();
  for(const callback of callbacks)callback();
  await new Promise(resolve=>setImmediate(resolve));await h.api.sync();
}
test('calibrated composer grows without a window event and toolbar stays above its measured bounds',async()=>{
  const h=await harness();let y=680;
  h.hooks.composer=async()=>composerTree(h.env.active,y,100);
  await armComposer(h);const bar=h.api.bar(),first=clone(bar.state.bounds);
  assert.equal(bar.state.visible,true);assert.ok(h.api.state().composerSample);
  y=440;await pollComposer(h);
  assert.equal(bar.state.visible,true);assert.ok(bar.state.bounds.y<first.y);
  assert.ok(bar.state.bounds.y+bar.state.bounds.height<=h.env.active.y+y-12);
  assert.equal(h.calls.writes.length,0,'layout observations never persist or touch the library');
});
test('stale or incomplete composer hides; late observation cannot revive the toolbar behind manager',async()=>{
  const h=await harness();await armComposer(h);const bar=h.api.bar();
  let release,entered;const ready=new Promise(resolve=>{entered=resolve;});
  const pending=new Promise(resolve=>{release=resolve;});
  h.hooks.composer=async()=>{entered();await pending;return composerTree(h.env.active,670,100);};
  const callback=Array.from(h.timers.values())[0];h.timers.clear();callback();await ready;
  h.api.state().composerSample.time-=401;
  await h.api.sync();assert.equal(bar.state.visible,false,'must not wait for a slow AX request');
  await h.api.openManager();release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bar.state.visible,false);assert.equal(h.api.state().composerSample,null);
  delete h.hooks.composer;await h.panel().control('close').emit('click');
  // Closing starts a background single-flight sync; wait for its native-read
  // microtasks and the fresh composer observation instead of racing its entry.
  for(let i=0;i<3&&!bar.state.visible;i++){
    await new Promise(resolve=>setImmediate(resolve));await h.api.sync();
  }
  assert.equal(bar.state.visible,true,JSON.stringify({state:h.api.state(),logs:h.calls.logs}));
  h.hooks.composer=async()=>({complete:false,truncated:true,root:{children:[]}});
  await pollComposer(h);assert.equal(bar.state.visible,false);
});
test('composer measurement is scoped to the calibrated window; new handle requires fresh calibration',async()=>{
  const h=await harness();await armComposer(h);
  h.env.active={...h.env.active,id:'mac:101:502',handle:502};
  await pollComposer(h);assert.equal(h.api.bar().state.visible,false);
  assert.equal(h.api.state().composerSample,null);assert.equal(h.calls.writes.length,0);
});
test('native target animation changing its final frame resynchronizes without another external event', async()=>{
  const h=await harness();let moved=false;
  h.hooks.delay=async()=>{if(!moved){moved=true;h.env.active.x++;h.env.active.width+=2;}};
  await h.api.rebuild();
  assert.equal(h.api.bar().state.visible,true);
  const expected=h.api.frame(h.env.active,h.api.bar().state.bounds.height,h.api.state().data.settings,
    [{bounds:{x:0,y:0,width:1920,height:1080}}]);
  assert.ok(Math.abs(h.api.bar().state.bounds.x-expected.x)<=1);
});
for(const change of ['geometry','window'])test('changed target '+change+' during show hides and requalifies before showing again',async()=>{
  const h=await harness();let shows=0,moved=false;
  h.hooks.show=async panel=>{if(panel.spec.native)shows++;};
  h.hooks.delay=async()=>{if(!moved){moved=true;
    h.env.active={...h.env.active,x:330,width:920,
      ...(change==='window'?{id:'mac:101:502',handle:502}:{})};}};
  await h.api.rebuild();
  assert.equal(h.api.bar().state.visible,true);
  assert.equal(shows,2,'known obsolete geometry must hide before the replacement is qualified');
  const b=h.api.bar().state.bounds,expected=h.api.frame(h.env.active,b.height,h.api.state().data.settings,
    [{bounds:{x:0,y:0,width:1920,height:1080}}]);
  assert.equal(b.x,expected.x);assert.equal(b.y,expected.y);
  assert.equal((await h.api.codexWindow()).handle,h.env.active.handle);
});
test('native toolbar close releases the terminal handle and exposes the existing manager', async () => {
  const h = await harness(); await h.api.rebuild(); const old = h.api.bar();
  await old.close(); await h.api.sync();
  assert.equal(h.api.bar(), null);
  assert.ok(h.panel());
  await h.api.persist(change);
  assert.ok(h.api.bar()); assert.notEqual(h.api.bar(), old);
  assert.equal(h.api.bar().state.visible, false);
  await h.panel().control('close').emit('click');
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
    const h=await harness(); await h.api.rebuild();h.api.allowDrag();
    const b=h.api.bar().state.bounds;
    Object.assign(b,{x:b.x+100,y:b.y+20});
    await h.api.drag({bounds:clone(b)});
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
    await h.api.openManager();await h.panel().control('reset').emit('click');
    if(started)release();else callback();
    for(let i=0;i<20;i++)await Promise.resolve();
    assert.equal(h.disk().settings.offsetX,0);
    assert.equal(h.disk().settings.offsetY,0);
    assert.equal(h.calls.writes.length,1,'discarded drag must not save over reset');
  }
});
test('reset also cancels a drag whose first native readback is still in flight', async () => {
  const h=await harness();await h.api.rebuild();h.api.allowDrag();
  const bar=h.api.bar(),b=bar.state.bounds;
  Object.assign(b,{x:b.x+100,y:b.y+20});
  const stale=clone(bar.state),get=bar.getState;
  let release,entered;const ready=new Promise(resolve=>{entered=resolve;});
  bar.getState=async()=>{bar.getState=get;entered();
    await new Promise(resolve=>{release=resolve;});return stale;};
  const pending=h.api.drag({bounds:clone(b)});await ready;
  await h.api.openManager();await h.panel().control('reset').emit('click');
  release();await pending;
  assert.equal(h.timers.size,0,'canceled native readback must not schedule a new drag');
  assert.equal(h.disk().settings.offsetX,0);assert.equal(h.disk().settings.offsetY,0);
  assert.equal(h.calls.writes.length,1);
});
test('latest drag owns persistence even when an older native readback finishes first', async () => {
  const h=await harness();await h.api.rebuild();h.api.allowDrag();
  const bar=h.api.bar(),base=clone(bar.state.bounds),get=bar.getState;
  const pending=[];
  bar.getState=()=>new Promise(resolve=>pending.push({resolve,state:clone(bar.state)}));
  Object.assign(bar.state.bounds,{x:base.x+40,y:base.y+10});
  const old=h.api.drag({bounds:clone(bar.state.bounds)});
  Object.assign(bar.state.bounds,{x:base.x+90,y:base.y+30});
  const latest=h.api.drag({bounds:clone(bar.state.bounds)});
  assert.equal(pending.length,2);
  pending[0].resolve(pending[0].state);await old;
  pending[1].resolve(pending[1].state);await latest;bar.getState=get;
  assert.equal(h.timers.size,1);
  Array.from(h.timers.values())[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.disk().settings.offsetX,90);assert.equal(h.disk().settings.offsetY,30);
});
test('drag persistence in flight holds its position while focus hiding remains independent', async () => {
  const h=await harness();await h.api.rebuild();h.api.allowDrag();
  const bar=h.api.bar(),b=bar.state.bounds;
  Object.assign(b,{x:b.x+90,y:b.y+30});const dragged=clone(b);
  await h.api.drag({bounds:clone(b)});
  let release,entered;const ready=new Promise(resolve=>{entered=resolve;});
  h.hooks.current=async target=>{entered();await new Promise(resolve=>{release=resolve;});return clone(target);};
  Array.from(h.timers.values())[0]();await ready;delete h.hooks.current;
  await h.api.sync();assert.deepEqual(bar.state.bounds,dragged,'follow must not snap back before the save');
  h.env.active={...codex(),id:'other',pid:999,handle:888};await h.api.sync();
  assert.equal(bar.state.visible,false);
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.writes.length,0,'loss of focus invalidates the pending save');
});
test('reset invalidates a drag after its recovery checkpoint but before the file commit', async () => {
  const h=await harness();await h.api.initializeRecovery();await h.api.rebuild();h.api.allowDrag();
  const bar=h.api.bar(),b=bar.state.bounds;Object.assign(b,{x:b.x+80,y:b.y+20});
  await h.api.drag({bounds:clone(b)});
  let release,entered;const ready=new Promise(resolve=>{entered=resolve;});
  h.hooks.writeJSON=async(target,value)=>{
    if(target.includes('draft-recovery/')&&value.pending){entered();await new Promise(resolve=>{release=resolve;});}
    h.files.set(target,JSON.stringify(value));
  };
  Array.from(h.timers.values())[0]();await ready;
  const opening=h.api.openManager();release();await opening;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.disk().settings.offsetX,0);assert.equal(h.disk().settings.offsetY,0);
  assert.equal(h.calls.writes.filter(c=>c.target===h.file).length,0,'canceled intent must not commit');
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
test('pending toolbar drag never delays unrelated foreground hiding or saves stale offsets', async () => {
  const h=await harness();await h.api.rebuild();h.api.allowDrag();
  const b=h.api.bar().state.bounds;
  Object.assign(b,{x:b.x+80,y:b.y+20});
  await h.api.drag({bounds:clone(b)});
  const queued=Array.from(h.timers.values())[0];assert.ok(queued);
  h.env.active={...codex(),id:'other',pid:999,handle:888};
  await h.api.sync();
  assert.equal(h.api.bar().state.visible,false);
  queued();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.writes.length,0);
});
test('target geometry change cancels pending drag and immediately follows the current frame', async () => {
  const h=await harness();await h.api.rebuild();h.api.allowDrag();
  const b=h.api.bar().state.bounds;
  Object.assign(b,{x:b.x+80,y:b.y+20});await h.api.drag({bounds:clone(b)});
  const queued=Array.from(h.timers.values())[0];
  h.env.active.x+=160;h.env.active.height-=60;
  await h.api.sync();
  const expected=h.api.frame(h.env.active,b.height,h.api.state().data.settings,
    [{bounds:{x:0,y:0,width:1920,height:1080}}]);
  assert.equal(b.x,expected.x);assert.equal(b.y,expected.y);
  queued();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.writes.length,0);
});
test('opening manager cancels pending drag before its delayed callback can persist', async () => {
  const h=await harness();await h.api.rebuild();h.api.allowDrag();
  const b=h.api.bar().state.bounds;
  Object.assign(b,{x:b.x+80,y:b.y+20});await h.api.drag({bounds:clone(b)});
  const queued=Array.from(h.timers.values())[0];
  await h.api.openManager();await h.api.sync();
  queued();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.api.bar().state.visible,false);assert.equal(h.calls.writes.length,0);
});
test('genuine native drag immediately after programmatic follow is accepted; stale move is rejected', async () => {
  const h=await harness();await h.api.rebuild();
  const b=h.api.bar().state.bounds,old=clone(b);
  Object.assign(b,{x:b.x+90,y:b.y+25});
  await h.api.drag({bounds:old});assert.equal(h.timers.size,0);
  await h.api.drag({bounds:clone(b)});assert.equal(h.timers.size,1);
  Array.from(h.timers.values())[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.disk().settings.offsetX,90);assert.equal(h.disk().settings.offsetY,25);
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
test('target resolution accepts exact visible toolbar Host PID/nativeWindowId', async () => {
  const h = await hostReady(); assert.ok(await h.api.codexWindow());
  assert.equal(h.calls.current.at(-1).handle, 501);
});
for (const variant of ['other Host window', 'wrong PID', 'missing handle', 'hidden', 'offscreen', 'manager']) {
  test('target resolution rejects ' + variant + ' even when a previous Codex window was cached', async () => {
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
    assert.equal(await h.api.codexWindow(),null);
  });
}
for (const variant of ['pid', 'handle', 'id', 'membership']) {
  test('target resolution rejects cached Codex identity change: ' + variant, async () => {
    const h = await hostReady();
    h.hooks.current = target => {
      if (variant === 'membership') {h.env.group = { pids: [] };h.env.now=Date.now()+401;}
      return { ...clone(target), ...(variant === 'pid' ? { pid: 202 } : {}),
        ...(variant === 'handle' ? { handle: 502 } : {}),
        ...(variant === 'id' ? { id: 'replacement' } : {}) };
    };
    assert.equal(await h.api.codexWindow(),null);
  });
}
test('active Codex target resolution revalidates identity and foreground', async () => {
  const h = await harness(); assert.ok(await h.api.codexWindow());
  assert.deepEqual(h.calls.current, [codex()]);
  assert.deepEqual(h.calls.appGets, [
    {bundleId:'com.openai.codex'},{bundleId:'com.anthropic.claudefordesktop'},{bundleId:'ai.opencode.desktop'}]);
});
test('positive app sample expires and never spans an executable path or PID change',async()=>{
  const h=await harness();h.env.now=1000;
  const codexQueries=()=>h.calls.appGets.filter(app=>app.bundleId==='com.openai.codex').length;
  assert.ok(await h.api.codexWindow());assert.equal(codexQueries(),1);
  h.env.now=1399;assert.ok(await h.api.codexWindow());assert.equal(codexQueries(),1);
  h.env.now=1400;assert.ok(await h.api.codexWindow());assert.equal(codexQueries(),2);
  h.env.active.exePath='/fixture/replaced';h.env.applications=[];
  assert.equal(await h.api.codexWindow(),null);
  assert.equal(codexQueries(),3);
  h.env.applications=[{bundleId:'com.openai.codex'}];h.env.active={...codex(),pid:102,id:'new',handle:502};
  h.env.group.pids=[102];h.env.group.instances=[{pid:102}];
  assert.ok(await h.api.codexWindow());assert.equal(codexQueries(),4);
});
test('lifecycle notification invalidates positive app sample before the next target read',async()=>{
  const h=await harness();h.env.now=1000;await h.api.setFollowing(true);
  assert.ok(await h.api.codexWindow());const count=h.calls.appGets.length;
  h.env.applications=[];
  await h.events.get('app.terminated')[0]({type:'app.terminated'});
  assert.equal(await h.api.codexWindow(),null);assert.ok(h.calls.appGets.length>count);
});
test('focus notification before native foreground settles hides first then recovers without another event',async()=>{
  const h=await harness();await h.api.rebuild();
  h.env.active=null;await h.api.sync();assert.equal(h.api.bar().state.visible,false);
  assert.equal(h.timers.size,1);
  h.env.active=codex();
  const [id,retry]=h.timers.entries().next().value;h.timers.delete(id);await retry();
  assert.equal(h.api.bar().state.visible,true);assert.equal(h.timers.size,0);
});
test('absent foreground retry is bounded and disabled follow cancels pending observation',async()=>{
  const h=await harness();await h.api.rebuild();h.env.active=null;await h.api.sync();
  let attempts=0;
  while(h.timers.size&&attempts<4){
    const [id,retry]=h.timers.entries().next().value;h.timers.delete(id);await retry();attempts++;
  }
  assert.equal(attempts,2);assert.equal(h.timers.size,0);assert.equal(h.api.bar().state.visible,false);
  await h.api.sync();assert.equal(h.timers.size,1);
  await h.api.setFollowing(false);assert.equal(h.timers.size,0);
});
test('application backend errors reach the caller and hide the toolbar with the original diagnostic',async()=>{
  const h=await harness();h.env.now=1000;await h.api.rebuild();
  const cause=error('PERMISSION_DENIED',{message:'owned identity snapshot denied'});
  h.hooks.appGet=()=>{throw cause;};h.env.now=1400;
  await assert.rejects(h.api.codexWindow(),actual=>actual===cause);
  await h.api.sync();assert.equal(h.api.bar().state.visible,false);
  assert.equal(h.timers.size,0,'permission/backend errors do not schedule observation retries');
  assert.ok(h.calls.logs.some(s=>s.includes('PERMISSION_DENIED')&&s.includes(cause.message)));
});
test('hidden move settles before an overlapping identity failure hides the toolbar',async()=>{
  const h=await harness();h.env.now=1000;await h.api.rebuild();
  const panel=h.api.bar();Object.assign(panel.state,{visible:false,onScreen:false});h.env.active.x+=30;
  let release,entered;const started=new Promise(resolve=>{entered=resolve;});
  const hold=new Promise(resolve=>{release=resolve;});
  h.hooks.move=async(p,x,y)=>{entered();await hold;Object.assign(p.state.bounds,{x,y});};
  const cause=error('BACKEND_FAILED',{message:'identity refresh unavailable'});
  h.hooks.appGet=()=>{throw cause;};
  const hides=h.calls.hides.length,running=h.api.sync();await started;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.hides.length,hides,'do not race hide against an unfinished native move');
  release();await running;
  assert.equal(panel.state.visible,false);
  assert.ok(h.calls.logs.some(s=>s.includes(cause.message)));
});
test('overlapping move and identity failures retain both diagnostics',async()=>{
  const h=await harness();h.env.now=1000;await h.api.rebuild();
  Object.assign(h.api.bar().state,{visible:false,onScreen:false});h.env.active.x+=30;
  h.hooks.move=async()=>{throw error('POSITION_FAILED');};
  h.hooks.appGet=()=>{throw error('PERMISSION_DENIED');};
  await h.api.sync();assert.equal(h.api.bar().state.visible,false);
  for(const code of ['POSITION_FAILED','PERMISSION_DENIED'])
    assert.ok(h.calls.logs.some(s=>s.includes(code)),code);
});
for (const variant of ['pid', 'handle', 'id', 'foreground', 'membership']) {
  test('active Codex second observation rejects changed ' + variant, async () => {
    const h = await harness();
    h.hooks.current = target => {
      if (variant === 'membership') {h.env.group = { pids: [] };h.env.now=Date.now()+401;}
      return { ...clone(target), ...(variant === 'pid' ? { pid: 202 } : {}),
        ...(variant === 'handle' ? { handle: 502 } : {}),
        ...(variant === 'id' ? { id: 'replacement' } : {}),
        ...(variant === 'foreground' ? { isForeground: false } : {}) };
    };
    assert.equal(await h.api.codexWindow(),null);
    assert.equal(h.calls.current.length, 1);
  });
}
test('missing bundle cannot resolve a target; clipboard still works and disabled prompts cannot copy', async () => {
  const h = await harness(); h.env.applications = [];
  assert.equal(await h.api.codexWindow(),null);
  await h.api.copy(prompt.id);assert.deepEqual(h.calls.copies,[prompt.body]);
  assert.equal(h.calls.appGets.length, 3);
  const disabled = library(); disabled.prompts[0].enabled = false;
  const d = await harness(disabled); await d.api.copy(prompt.id); await d.api.copy('unknown');
  assert.deepEqual(d.calls.copies, []); assert.equal(d.calls.current.length, 0);
});
test('failed native observation cannot resolve a target or silently fall back', async () => {
  const h = await harness(); h.hooks.current = async () => { throw error('STALE_TARGET'); };
  await assert.rejects(h.api.codexWindow(), { code: 'STALE_TARGET' });
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

test('default startup follows, registers lifecycle events, and hides on unrelated foreground', async () => {
  const h=await harness(library(),null);await h.api.main();
  assert.equal(h.api.state().following,true);assert.equal(h.events.size,8);
  assert.equal(h.api.bar().state.visible,true);
  assert.ok(h.calls.logs.includes('CODEX_SHORTCUT_MODE=FOLLOW'));
  h.env.active={id:'other',pid:999,handle:888};await h.api.sync();
  assert.equal(h.api.bar().state.visible,false);
});
test('unknown startup mode fails closed before observing desktop or writing the library', async () => {
  await assert.rejects(harness(library(),null,'typo'),{code:'INVALID_MODE'});
});
test('relative default uses sidebar 300 plus gap 16, recenters on resize and clamps offsets', async () => {
  const {api}=await model, win={x:100,y:100,width:900,height:700};
  const offset={offsetX:0,offsetY:0},displays=[{x:0,y:0,width:1920,height:1080}];
  assert.deepEqual(clone(api.frame(win,280,offset,displays)),{x:416,y:310});
  assert.deepEqual(clone(api.frame({...win,height:800},280,offset,displays)),{x:416,y:360});
  for(const n of [-10000,10000]){
    const p=api.frame(win,280,{offsetX:n,offsetY:n},displays);
    assert.ok(p.x>=416&&p.x+60<=984);assert.ok(p.y>=116&&p.y+280<=784);
  }
  assert.throws(()=>api.frame({...win,height:300},280,offset,displays),{code:'TARGET_TOO_SMALL'});
  assert.throws(()=>api.frame({...win,width:390},280,offset,displays),{code:'TARGET_TOO_SMALL'});
  assert.throws(()=>api.frame(win,280,{offsetX:0,offsetY:0},[]),{code:'DISPLAY_UNAVAILABLE'});
});
test('explicit target file replaces defaults and validates before any desktop subscription',async()=>{
  const h=await harness(library(),null);
  const file='/virtual/target-config.json';
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=file;
  h.files.set(file,JSON.stringify({schemaVersion:1,profiles:[{id:'own',name:'Verified own fixture',
    app:{bundleId:'com.example.own'},layout:{sidebarWidth:80,gap:12,top:10,bottom:10,right:10}}]}));
  h.env.applications=[{bundleId:'com.example.own'}];
  h.env.group.identity={kind:'bundleId',value:'com.example.own'};
  await h.api.main(false);
  assert.deepEqual(h.calls.appGets[0],{bundleId:'com.example.own'});
  assert.equal(h.calls.appGets.some(a=>a.bundleId==='com.openai.codex'),false);
  assert.equal(h.api.bar().state.bounds.x,192);
  const invalid=await harness(library(),null);
  invalid.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=file;
  invalid.files.set(file,'{"schemaVersion":1,"profiles":[]}');
  await assert.rejects(invalid.api.main(false),{code:'INVALID_TARGET_CONFIG'});
  assert.equal(invalid.events.size,0);assert.equal(invalid.calls.appGets.length,0);
});
test('configured app membership never admits unrelated windows in the toolbar host',async()=>{
  const h=await hostReady();
  h.env.group.pids.push(900);h.env.group.instances.push({pid:900});
  h.env.active.handle++;
  assert.equal(await h.api.codexWindow(),null);
  h.env.active.handle--;
  assert.ok(await h.api.codexWindow());
});
for(const code of ['EXISTING_DRAFT','SELECTION_UNREADABLE','TARGET_CHANGED','LAYOUT_CHANGED','VALUE_UNREADABLE']){
  test('insertion preflight '+code+' automatically copies full Unicode prompt with reason',async()=>{
    const doc=library();doc.prompts[0].body='长草稿提示 🚀\n中文 e\u0301 '+ '正文'.repeat(200);
    const h=await harness(doc,false);await h.api.rebuild();await h.api.openManager();
    await h.panel().control('calibrate').emit('click');
    h.hooks.insert=()=>({status:'rejected',code,actionState:'not_started'});
    await h.api.bar().click('p0');
    assert.deepEqual(h.calls.copies,[doc.prompts[0].body]);assert.equal(h.calls.inserts.length,1);
    assert.ok(h.calls.toasts.some(t=>t.message.includes(code)&&t.message.includes('已复制完整正文')));
  });
}
test('thrown input helper latches unknown, preserves clipboard and warns',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.openManager();
  await h.panel().control('calibrate').emit('click');
  h.hooks.insert=()=>{throw error('NATIVE_TIMEOUT');};
  await h.api.bar().click('p0');await h.api.bar().click('p0');
  assert.equal(h.calls.inserts.length,1);assert.deepEqual(h.calls.copies,[]);
  assert.ok(h.calls.toasts.some(t=>/结果未确认.*先检查草稿/.test(t.message)));
});
test('observed direct paste reports paste without claiming full readback or blocking the next click',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.openManager();
  await h.panel().control('calibrate').emit('click');
  h.hooks.insert=()=>({status:'inserted',code:'PASTE_OBSERVED',verified:false,actionState:'acknowledged'});
  await h.api.bar().click('p0');await h.api.bar().click('p0');
  assert.equal(h.calls.inserts.length,2);assert.deepEqual(h.calls.copies,[]);
  assert.equal(h.calls.toasts.filter(t=>t.message==='已粘贴 · 尚未发送').length,2);
  assert.equal(h.calls.toasts.some(t=>/已写入并读回|结果未确认/.test(t.message)),false);
});
for(const receipt of [
  {status:'inserted',code:'PASTE_OBSERVED',verified:false,actionState:'unknown'},
  {status:'inserted',code:'PASTE_OBSERVED',actionState:'acknowledged'},
  {status:'inserted',verified:true,actionState:'unknown'},
  {status:'inserted',verified:true},
  {status:'inserted',verified:true,actionState:'not_started'},
  {status:'inserted',verified:false,actionState:'acknowledged'},
  {status:'rejected',code:'FAILED',actionState:'acknowledged'},
  {status:'rejected',code:'FAILED'},
  {status:'rejected',code:'FAILED',verified:true,actionState:'not_started'},
  {status:'rejected',code:'FAILED',verified:1,actionState:'not_started'},
  {status:'rejected',code:'FAILED',verified:'true',actionState:'not_started'},
])test('inconsistent insertion receipt latches and never reports input success '+JSON.stringify(receipt),async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.openManager();
  await h.panel().control('calibrate').emit('click');
  h.hooks.insert=()=>receipt;
  await h.api.bar().click('p0');await h.api.bar().click('p0');
  assert.equal(h.calls.inserts.length,1);
  assert.deepEqual(h.calls.copies,[]);
  assert.ok(!h.calls.toasts.some(t=>t.message.includes('已写入并读回')));
  assert.ok(h.calls.toasts.some(t=>/结果未确认.*先检查草稿/.test(t.message)));
  await h.api.bar().click('settings');
  assert.equal(h.panel().control('calibrate').state.disabled,true);
});
test('failed fallback clipboard readback never reports copied or confirmed input',async()=>{
  const h=await harness(library(),false);await h.api.rebuild();await h.api.openManager();
  await h.panel().control('calibrate').emit('click');
  h.hooks.insert=()=>({status:'rejected',code:'EXISTING_DRAFT',actionState:'not_started'});
  h.hooks.clipboardRead=()=> 'someone changed clipboard';
  await h.api.bar().click('p0');
  assert.ok(!h.calls.logs.some(s=>s.startsWith('CODEX_SHORTCUT_COPIED=')));
  assert.ok(h.calls.toasts.some(t=>t.level==='error'&&/未确认复制成功/.test(t.message)));
});
test('invalid manual label stays an unsaved draft instead of persisting an unexportable item',async()=>{
  const h=await harness();await h.api.openManager();
  await input(h.panel(),'label','三个字');await h.panel().control('save').emit('click');
  assert.equal(h.calls.writes.length,0);assert.equal(h.api.state().editDirty,true);
  assert.equal(h.panel().control('label').state.value,'三个字');
});

test('save pending field reads cannot write A content into B after selection changes', async () => {
  const doc=library();
  doc.prompts.push({...prompt,id:'ps_second_1',body:'B original',name:'B',order:1});
  const h=await harness(doc,false);await h.api.openManager();
  const panel=h.panel();await input(panel,'body','A edited');
  let entered,release;
  const ready=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const control=panel.control('body'),getState=control.getState;
  control.getState=async()=>{const snapshot=await getState();entered();await gate;return snapshot;};
  const saving=panel.control('save').emit('click');await ready;
  try{h.env.answers.push(true);await panel.control('row1').emit('click');}
  finally{release();await saving;}
  assert.equal(h.calls.writes.length,0);
  assert.equal(h.disk().prompts[0].body,doc.prompts[0].body);
  assert.equal(h.disk().prompts[1].body,'B original');
  assert.equal(h.api.state().editId,'ps_second_1');
  assert.ok(h.calls.logs.some(value=>value.includes('EDIT_CHANGED')));
});

test('delete pending persistence preserves edits made during the operation', async () => {
  const h=await harness(library(),false);await h.api.openManager();
  const panel=h.panel();let entered,release;
  const ready=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  h.hooks.writeJSON=async(target,value)=>{entered();await gate;h.files.set(target,JSON.stringify(value));};
  h.env.answers.push(true);
  const deleting=panel.control('delete').emit('click');await ready;
  try{await input(panel,'body','NEW UNSAVED DURING DELETE');}
  finally{release();await deleting;}
  assert.equal(h.calls.writes.length,1);assert.equal(h.disk().prompts.length,0);
  assert.equal(panel.control('body').state.value,'NEW UNSAVED DURING DELETE');
  assert.equal(h.api.state().draft.body,'NEW UNSAVED DURING DELETE');
  assert.equal(h.api.state().editDirty,true);
});

// Recovery is based on a kernel lease, never elapsed time or a PID guess.
test('inactive v1 receipt is backed up exactly before a deliberate save', async () => {
  const h = await harness();
  await h.api.persist(change);
  const interrupted = h.files.get(h.lock).split('\n').slice(0, 2).join('\n') + '\n';
  h.files.set(h.lock, interrupted);
  await h.api.persist(next => { next.settings.offsetX = 9; });
  const backups = [...h.files.entries()].filter(([key]) => key.includes('/lock-recovery/'));
  assert.equal(backups.length, 1);
  assert.equal(backups[0][1], interrupted);
  assert.equal(h.disk().revision, 2);
  assert.deepEqual(h.calls.removes, []);
});
test('active kernel lease blocks stale-looking receipt takeover without writes', async () => {
  const h = await harness();
  await h.api.persist(change);
  const receipt = h.files.get(h.lock);
  h.leases.add(h.lock);
  const writes = h.calls.writes.length;
  await assert.rejects(h.api.persist(change), { code: 'LOCKED' });
  assert.equal(h.calls.writes.length, writes);
  assert.equal(h.files.get(h.lock), receipt);
  assert.equal([...h.files.keys()].some(key => key.includes('/lock-recovery/')), false);
});

test('clean successful save reports saved without inventing concurrent edits', async () => {
  const h=await harness(library(),false);await h.api.openManager();
  const panel=h.panel();await input(panel,'name','已保存名称');
  await panel.control('save').emit('click');
  assert.equal(h.api.state().editDirty,false);
  assert.equal(panel.control('status').state.text,'已保存并从文件读回');
  assert.equal(h.env.answers.length,0);
});

// Recovery simulations share the same filesystem/lock set between executions.
// Clearing that lock set models OS release after a crash; it is not live proof.
test('draft recovery restores exact unsaved Unicode and gates save until disk reconciliation', async () => {
  const a=await harness(library(),false,'copy');
  await a.api.initializeRecovery();await a.api.openManager();
  const body=' \r\n未发送 👩🏽‍💻 e\u0301\n\n ';
  await input(a.panel(),'body',body);
  a.leases.clear();
  const b=await harness(library(),false,'copy',a);
  await b.api.initializeRecovery();await b.api.openManager();
  assert.equal(b.api.state().draft.body,body);
  assert.equal(b.api.state().resolution.kind,'RECOVERED');
  await b.panel().control('save').emit('click');
  assert.equal(b.calls.writes.filter(x=>x.target===b.file).length,0);
  await b.api.reconcile();
  assert.equal(b.api.state().draft.body,body);
  assert.equal(b.api.state().editDirty,true);
  assert.equal(b.api.state().editId,prompt.id);
  await b.panel().control('save').emit('click');
  assert.equal(b.disk().revision,1);assert.equal(b.disk().prompts[0].body,body);
  await b.api.closeRecovery();
});

test('draft recovery never adopts an active editor journal and isolates two sessions', async () => {
  const a=await harness(library(),false,'copy');
  await a.api.initializeRecovery();await a.api.openManager();await input(a.panel(),'body','活跃 A');
  const b=await harness(library(),false,'copy',a);
  await b.api.initializeRecovery();await b.api.openManager();
  assert.equal(b.api.state().resolution,null);assert.equal(b.api.state().editDirty,false);
  await input(b.panel(),'body','独立 B');
  const journals=Array.from(a.files.entries()).filter(([p])=>/draft-[a-z0-9-]+\.json$/.test(p));
  assert.equal(journals.length,2);
  assert.deepEqual(journals.map(([,s])=>JSON.parse(s).draft.body).sort(),['活跃 A','独立 B'].sort());
  await a.api.closeRecovery();await b.api.closeRecovery();
});

test('draft recovery preserves a concurrent library revision by recovering as a new item', async () => {
  const a=await harness(library(),false,'copy');
  await a.api.initializeRecovery();await a.api.openManager();await input(a.panel(),'body','恢复 A 草稿');
  await a.api.closeRecovery();
  const other=library();other.revision=1;other.prompts[0].body='其他实例保存';a.setDisk(other);
  const b=await harness(other,false,'copy',a);
  await b.api.initializeRecovery();await b.api.openManager();await b.api.reconcile();
  assert.equal(b.api.state().editId,null);assert.equal(b.api.state().draft.body,'恢复 A 草稿');
  await b.panel().control('save').emit('click');
  assert.equal(b.disk().revision,2);
  assert.deepEqual(b.disk().prompts.map(p=>p.body),['其他实例保存','恢复 A 草稿']);
  await b.api.closeRecovery();
});

test('draft recovery reconciles a post-commit crash without replaying the save', async () => {
  const a=await harness(library(),false,'copy');
  await a.api.initializeRecovery();await a.api.openManager();await input(a.panel(),'body','提交可能已发生');
  a.hooks.writeJSON=async(target,value)=>{
    a.files.set(target,JSON.stringify(value));
    if(target===a.file)throw error('CANCELED',{committed:true});
  };
  await a.panel().control('save').emit('click');
  assert.equal(a.disk().revision,1);assert.equal(a.api.state().resolution.kind,'UNCERTAIN');
  await a.api.closeRecovery();
  const b=await harness(a.disk(),false,'copy',a);
  await b.api.initializeRecovery();await b.api.openManager();
  assert.ok(b.api.state().pendingWrite);
  await b.api.reconcile();
  assert.equal(b.api.state().editDirty,false);assert.equal(b.disk().revision,1);
  assert.equal(b.calls.writes.filter(x=>x.target===b.file).length,0);
  await b.api.closeRecovery();
});

test('draft recovery explicit discard is durable and does not resurrect discarded edits', async () => {
  const a=await harness(library(),false,'copy');
  await a.api.initializeRecovery();await a.api.openManager();await input(a.panel(),'body','明确放弃');
  a.env.answers.push(true);await a.panel().control('discard').emit('click');await a.api.closeRecovery();
  const b=await harness(library(),false,'copy',a);await b.api.initializeRecovery();
  assert.equal(b.api.state().resolution,null);assert.equal(b.api.state().editDirty,false);
  assert.equal(b.calls.writes.filter(x=>x.target===b.file).length,0);
  await b.api.closeRecovery();
});

test('draft recovery failure blocks business commit while keeping the editor draft', async () => {
  const a=await harness(library(),false,'copy');await a.api.initializeRecovery();await a.api.openManager();
  a.hooks.writeJSON=async(target,value)=>{
    if(target!==a.file)throw error('IO_FAILED');
    a.files.set(target,JSON.stringify(value));
  };
  await input(a.panel(),'body','恢复文件写失败');await a.panel().control('save').emit('click');
  assert.equal(a.disk().revision,0);assert.equal(a.api.state().draft.body,'恢复文件写失败');
  assert.equal(a.api.state().editDirty,true);
  assert.equal(a.calls.writes.filter(x=>x.target===a.file).length,0);
  await a.api.closeRecovery();
});

test('draft recovery serializes edits and waits for the latest checkpoint before release', async () => {
  const a=await harness(library(),false,'copy');await a.api.initializeRecovery();await a.api.openManager();
  let release,entered;
  const ready=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>release=resolve);
  let first=true;
  a.hooks.writeJSON=async(target,value)=>{
    if(first){first=false;entered();await hold;}
    a.files.set(target,JSON.stringify(value));
  };
  const older=input(a.panel(),'body','较早草稿');await ready;
  const newer=input(a.panel(),'body','最后草稿 🚀');const closing=a.api.closeRecovery();
  release();await Promise.all([older,newer,closing]);
  assert.equal(a.leases.size,0);
  const b=await harness(library(),false,'copy',a);await b.api.initializeRecovery();
  assert.equal(b.api.state().draft.body,'最后草稿 🚀');await b.api.closeRecovery();
});

test('draft recovery preserves invalid records instead of overwriting them', async () => {
  const a=await harness(library(),false,'copy');
  const bad='/virtual/.runtime/examples/custom-ui/codex-prompt-shortcuts/draft-recovery/draft-invalid.json';
  a.files.set(bad,'{"schemaVersion":1,"library":"wrong","dirty":true}');
  const original=a.files.get(bad);await a.api.initializeRecovery();
  assert.equal(a.files.get(bad),original);assert.equal(a.api.state().resolution,null);
  assert.ok(a.calls.logs.some(x=>x.includes('INVALID_RECOVERY')));await a.api.closeRecovery();
});

test('draft recovery retains its original baseline across two crashes before reconciliation', async () => {
  const a=await harness(library(),false,'copy');await a.api.initializeRecovery();await a.api.openManager();
  await input(a.panel(),'body','两次崩溃前草稿');await a.api.closeRecovery();
  const other=library();other.revision=1;other.prompts[0].body='并行已保存';a.setDisk(other);
  const b=await harness(other,false,'copy',a);await b.api.initializeRecovery();await b.api.openManager();
  await b.api.closeRecovery();
  const c=await harness(other,false,'copy',a);await c.api.initializeRecovery();await c.api.openManager();
  await c.api.reconcile();assert.equal(c.api.state().editId,null);
  await c.panel().control('save').emit('click');
  assert.deepEqual(c.disk().prompts.map(p=>p.body),['并行已保存','两次崩溃前草稿']);
  await c.api.closeRecovery();
});

test('draft recovery archives an uncommitted import intent and reports no replay accurately', async () => {
  const a=await harness(library(),false,'copy');await a.api.initializeRecovery();await a.api.openManager();
  a.hooks.writeJSON=async(target,value)=>{
    if(target===a.file)throw error('IO_FAILED');a.files.set(target,JSON.stringify(value));
  };
  await assert.rejects(a.api.persist(next=>next.prompts.push({...prompt,id:'ps_imported',body:'未落盘的导入正文'})));
  await a.api.closeRecovery();
  const b=await harness(library(),false,'copy',a);await b.api.initializeRecovery();await b.api.openManager();
  await b.api.reconcile();assert.equal(b.disk().revision,0);
  const archives=Array.from(b.files.entries()).filter(([p])=>p.includes('/history/intent-'));
  assert.equal(archives.length,1);
  assert.equal(JSON.parse(archives[0][1]).pending.prompts[1].body,'未落盘的导入正文');
  assert.match(b.panel().control('status').state.text,/上次提交未写入/);
  assert.equal(b.calls.writes.filter(x=>x.target===b.file).length,0);await b.api.closeRecovery();
});

test('draft recovery preserves pending evidence and stays blocked on a third-party commit', async () => {
  const a=await harness(library(),false,'copy');await a.api.initializeRecovery();await a.api.openManager();
  a.hooks.writeJSON=async(target,value)=>{
    if(target===a.file)throw error('IO_FAILED');a.files.set(target,JSON.stringify(value));
  };
  await assert.rejects(a.api.persist(change));await a.api.closeRecovery();
  const other=library();other.revision=2;other.prompts[0].body='第三版本';a.setDisk(other);
  const b=await harness(other,false,'copy',a);await b.api.initializeRecovery();await b.api.openManager();
  await assert.rejects(b.api.reconcile(),{code:'UNCERTAIN'});
  assert.ok(b.api.state().pendingWrite);assert.equal(b.api.state().resolution.kind,'RECOVERED');
  await assert.rejects(b.api.persist(change),{code:'RECONCILE_REQUIRED'});
  assert.equal(b.disk().prompts[0].body,'第三版本');await b.api.closeRecovery();
});

test('draft recovery cancels closing when queued native input arrives during its checkpoint', async () => {
  const a=await harness(library(),false,'copy');await a.api.initializeRecovery();await a.api.openManager();
  await input(a.panel(),'body','关闭前草稿');a.env.answers.push(true);
  let release,entered;const ready=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
  let first=true;a.hooks.writeJSON=async(target,value)=>{
    if(first){first=false;entered();await hold;}a.files.set(target,JSON.stringify(value));
  };
  const panel=a.panel(),closing=panel.control('close').emit('click');await ready;
  assert.equal(panel.control('body').state.disabled,true);
  const newer=input(panel,'body','关闭等待期间新输入');release();await Promise.all([closing,newer]);
  assert.equal(a.panel(),panel);assert.equal(a.api.state().draft.body,'关闭等待期间新输入');
  assert.equal(a.api.state().editDirty,true);assert.equal(panel.control('body').state.disabled,false);
  await a.api.closeRecovery();
  const b=await harness(library(),false,'copy',a);await b.api.initializeRecovery();
  assert.equal(b.api.state().draft.body,'关闭等待期间新输入');await b.api.closeRecovery();
});

test('draft recovery close failure keeps editing usable and retains the undiscarded draft', async () => {
  const a=await harness(library(),false,'copy');await a.api.initializeRecovery();await a.api.openManager();
  await input(a.panel(),'body','不能丢失');a.env.answers.push(true);
  a.hooks.writeJSON=async()=>{throw error('IO_FAILED');};
  await a.panel().control('close').emit('click');
  assert.equal(a.api.state().editDirty,true);assert.equal(a.api.state().draft.body,'不能丢失');
  assert.equal(a.panel().control('body').state.disabled,false);
  delete a.hooks.writeJSON;await input(a.panel(),'body','失败后仍能编辑');
  assert.equal(a.api.state().draft.body,'失败后仍能编辑');
  await a.api.closeRecovery();
});


test('scoped follow polls only the selected process and cleans up on disable/quit',async()=>{
  const h=await harness(library(),false);
  const config='/virtual/scope.json';
  h.files.set(config,JSON.stringify({schemaVersion:1,scope:{pid:101,exePath:'/fixture/Codex',profile:'opencode'}}));
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
  h.hooks.forbidGlobal=true;h.hooks.appGet=()=>assert.fail('global App.get');
  await h.api.setFollowing(true);await h.api.rebuild();
  assert.ok(await h.api.codexWindow());assert.equal(h.events.size,0);
  assert.equal(h.calls.appGets.length,0);assert.ok(h.timers.size>0);
  let polls=0;h.hooks.scoped=()=>{polls++;return null;};
  const [timer,callback]=h.timers.entries().next().value;h.timers.delete(timer);
  await callback();assert.ok(polls>0);assert.ok(h.timers.size>0);
  assert.equal(await h.api.codexWindow(),null);
  h.hooks.scoped=()=>({...codex(),pid:202});
  await assert.rejects(h.api.codexWindow(),{code:'VERIFICATION_FAILED'});
  h.hooks.scoped=()=>{throw error('PERMISSION_DENIED');};
  await assert.rejects(h.api.codexWindow(),{code:'PERMISSION_DENIED'});
  delete h.hooks.scoped;
  await h.api.setFollowing(false);assert.equal(h.timers.size,0);
  await h.api.setFollowing(true);await h.api.openManager();
  await h.panel().control('quit').emit('click');assert.equal(h.timers.size,0);
});


test('Codex desktop scoped follow shows the five-button bar in its content area without editor qualification',async()=>{
  const h=await harness(library(),false),config='/virtual/codex-scope.json';
  h.env.active={...codex(),title:'ChatGPT',exePath:'/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'};
  h.files.set(config,JSON.stringify({schemaVersion:1,scope:{pid:101,
    exePath:h.env.active.exePath,profile:'codex'}}));
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
  h.hooks.forbidGlobal=true;h.hooks.appGet=()=>assert.fail('global App.get');
  h.hooks.composer=()=>assert.fail('Showing Codex buttons must not require editor access');
  h.hooks.scoped=scope=>{
    assert.deepEqual(scope,{pid:101,exePath:'/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'});
    return h.env.active?clone(h.env.active):null;
  };
  h.installWatcher();await h.api.setFollowing(true);await h.api.rebuild();
  const bar=h.api.bar(),anchor=win=>({x:win.x+316,
    y:Math.round(win.y+16+(win.height-32-bar.state.bounds.height)/2)});
  const assertPlacement=()=>{
    assert.equal(bar.state.visible,true);assert.equal(bar.state.onScreen,true);
    const expected=anchor(h.env.active);
    assert.equal(bar.state.bounds.x,expected.x);assert.equal(bar.state.bounds.y,expected.y);
  };
  assert.equal(bar.buttons.size,5);assertPlacement();
  assert.equal(h.watchers.has(101),true);
  assert.equal(h.calls.inserterOptions.length,0);assert.equal(h.calls.discovers.length,0);
  h.env.active={...h.env.active,x:180,y:140,width:1100,height:850};await h.api.sync();assertPlacement();
  const saved=clone(h.env.active);h.env.active=null;await h.api.sync();assert.equal(bar.state.visible,false);
  h.env.active={...saved,id:'mac:101:502',handle:502,title:'New conversation'};
  await h.api.sync();assertPlacement();
  await h.api.openManager();assert.equal(bar.state.visible,false);
  await h.panel().control('close').emit('click');assertPlacement();
  h.env.active={...h.env.active,width:350};await h.api.sync();assert.equal(bar.state.visible,false);
  h.env.active=saved;await h.api.sync();assertPlacement();
  assert.equal(h.calls.appGets.length,0);assert.equal(h.events.size,0);
  assert.deepEqual(h.disk(),library());
  await h.api.setFollowing(false);assert.equal(h.watchers.size,0);assert.equal(h.timers.size,0);
});

test('explicit scopes isolate saved offsets and resetting one application preserves the other',async()=>{
  const doc=library();doc.settings.offsetX=99;doc.settings.offsetY=88;
  const h=await harness(doc,false),config='/virtual/two-scopes.json';
  const alpha=codex(),beta={...codex(),id:'darwin:202:native:303',pid:202,handle:303,exePath:'/fixture/Beta'};
  h.files.set(config,JSON.stringify({schemaVersion:1,scopes:[
    {pid:101,exePath:'/fixture/Codex',profile:'opencode'},
    {pid:202,exePath:'/fixture/Beta',profile:'beta'}],profiles:[{
      id:'beta',name:'Beta',app:{path:'/fixture/Beta'},layout:{sidebarWidth:0,gap:16,top:16,bottom:16,right:16}}]}));
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
  h.hooks.forbidGlobal=true;h.hooks.appGet=()=>assert.fail('global App.get');
  const observed=[];h.hooks.scoped=scope=>{observed.push(scope.pid);
    return scope.pid===h.env.active?.pid?clone(h.env.active):null;};
  await h.api.setFollowing(true);await h.api.rebuild();
  const bar=h.api.bar(),initial=clone(bar.state.bounds);
  assert.equal(initial.x,alpha.x+16,'legacy offset must not leak into OpenCode');
  async function move(dx,dy){
    h.api.allowDrag();bar.state.bounds.x+=dx;bar.state.bounds.y+=dy;
    await h.api.drag({bounds:clone(bar.state.bounds)});
    Array.from(h.timers.values()).at(-1)();await new Promise(resolve=>setImmediate(resolve));
  }
  await move(45,20);const alphaPosition=clone(bar.state.bounds);
  h.env.active=beta;await h.api.sync();assert.equal(bar.state.bounds.x,beta.x+16);
  await move(20,5);await h.api.openManager();await h.panel().control('reset').emit('click');
  await h.panel().control('close').emit('click');assert.equal(bar.state.bounds.x,beta.x+16);
  h.env.active=alpha;await h.api.sync();assert.deepEqual(bar.state.bounds,alphaPosition);
  assert.equal(h.disk().settings.offsetX,99);assert.equal(h.disk().settings.offsetY,88);
  const positions=h.disk().settings.positions;
  assert.deepEqual(positions[JSON.stringify(['opencode','path','/fixture/Codex'])],{offsetX:45,offsetY:20});
  assert.deepEqual(positions[JSON.stringify(['beta','path','/fixture/Beta'])],{offsetX:0,offsetY:0});
  assert.ok(observed.every(pid=>pid===101||pid===202));assert.equal(h.calls.appGets.length,0);assert.equal(h.events.size,0);
  const restarted=await harness(h.disk(),false);
  restarted.files.set(config,h.files.get(config));restarted.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
  restarted.hooks.scoped=scope=>scope.pid===101?clone(alpha):null;
  await restarted.api.setFollowing(true);await restarted.api.rebuild();
  assert.deepEqual(restarted.api.bar().state.bounds,alphaPosition);
});

test('application switches during a scoped scan hide the toolbar and never query unconfigured apps',async()=>{
  const h=await harness(library(),false),config='/virtual/race-scopes.json';
  h.files.set(config,JSON.stringify({schemaVersion:1,scopes:[
    {pid:101,exePath:'/fixture/Codex',profile:'opencode'},
    {pid:202,exePath:'/fixture/Other',profile:'other'}],profiles:[{
      id:'other',name:'Other',app:{path:'/fixture/Other'},layout:{sidebarWidth:0,gap:16,top:16,bottom:16,right:16}}]}));
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;h.hooks.forbidGlobal=true;
  h.hooks.appGet=()=>assert.fail('global App.get');
  let count=0;h.hooks.scoped=scope=>{count++;
    if(scope.pid===101)return clone(codex());
    return {...codex(),id:'darwin:202:native:303',pid:202,handle:303,exePath:'/fixture/Other'};
  };
  await h.api.setFollowing(true);await h.api.rebuild();
  assert.equal(h.api.bar().state.visible,false);assert.ok(count>=2);
  assert.ok(h.calls.logs.some(s=>s.includes('TARGET_CHANGED')));
});

test('follow startup waits for first native toolbar without showing over an unavailable target',async()=>{
  const h=await harness(library(),true);h.env.active=null;
  await h.api.rebuild();const bar=h.api.bar();delete bar.state.nativeWindowId;
  let delayed=0,waited=0,release;
  const waiting=new Promise(resolve=>{release=resolve;});
  h.hooks.delay=async ms=>{
    assert.equal(ms,250);assert.equal(bar.state.visible,false);delayed++;
    bar.state.nativeWindowId=999;
  };
  h.hooks.waitUntilClosed=async panel=>{
    assert.equal(panel,bar);assert.equal(bar.state.nativeWindowId,999);waited++;release();
    await panel.click('settings');await h.panel().control('quit').emit('click');
  };
  const running=h.api.main(true);await waiting;await running;
  assert.equal(delayed,1);assert.equal(waited,1);
});


function claudeCodeTree(win, code=true, session='Session - Claude Code') {
  const bounds=(x,y,width,height)=>({x,y,width,height,coordinateSpace:'screen'});
  const node=(role,name,extra={},children=[])=>({role,name,...extra,children});
  return {complete:true,truncated:false,root:node('window','Claude',{},[
    node('group',session,{nativeRole:'AXWebArea'},[
      node('unknown',code?'Claude Code':'Claude',{nativeRole:'AXHeading'}),
      node('group','Primary pane',{bounds:bounds(win.x+288,win.y,win.width-288,win.height)},[
        node('checkbox','Terminal',{enabled:true}),node('checkbox','Files',{enabled:true}),
        node('textField','Prompt',{nativeRole:'AXTextArea',enabled:true,
          bounds:bounds(win.x+320,win.y+win.height-90,win.width-360,60)})])])])};
}
async function claudeHarness() {
  const h=await harness(library(),false),config='/virtual/claude-scope.json';
  h.env.active={...codex(),title:'Claude',exePath:'/Applications/Claude.app/Contents/MacOS/Claude'};
  h.files.set(config,JSON.stringify({schemaVersion:1,scope:{pid:101,
    exePath:h.env.active.exePath,profile:'claude-code'}}));
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
  h.hooks.forbidGlobal=true;h.hooks.appGet=()=>assert.fail('global App.get');
  h.hooks.scoped=scope=>scope.pid===h.env.active?.pid?clone(h.env.active):null;
  h.hooks.composer=options=>{assert.equal(options.maxDepth,64);return claudeCodeTree(h.env.active);};
  await h.api.setFollowing(true);await h.api.rebuild();
  return h;
}
test('Claude Code scene controls visibility and uses the measured pane above the composer',async()=>{
  const h=await claudeHarness(),bar=h.api.bar(),win=h.env.active;
  assert.equal(bar.state.visible,true);
  assert.equal(bar.state.bounds.x,win.x+304);
  assert.ok(bar.state.bounds.y+bar.state.bounds.height<=win.y+win.height-102);
  h.hooks.composer=()=>claudeCodeTree(win,false);await h.api.sync();
  assert.equal(bar.state.visible,false,'Cowork/Chat must not reuse the Code editor');
  h.hooks.composer=()=>({...claudeCodeTree(win),complete:false,truncated:true});await h.api.sync();
  assert.equal(bar.state.visible,false,'incomplete native trees must remain hidden');
  h.hooks.composer=()=>claudeCodeTree(win,true,'Replacement - Claude Code');await h.api.sync();
  assert.equal(bar.state.visible,true);
  h.env.active=null;await h.api.sync();assert.equal(bar.state.visible,false);
  assert.equal(h.calls.appGets.length,0);assert.equal(h.calls.current.length,0);assert.equal(h.events.size,0);
});
test('Claude paste bypasses redundant discovery and keeps a fresh scene gate',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();
  await bar.buttons.get('p0').callback();await bar.buttons.get('p0').callback();
  assert.equal(h.calls.discovers.length,0);
  assert.ok(h.calls.inserterOptions.every(x=>x.searchDepth===64&&x.editorSelector.name==='Prompt'));
  assert.ok(h.calls.inserterOptions.every(x=>x.inputMode==='paste'));
  assert.ok(h.calls.inserterOptions.every(x=>x.editorModel==='claude-code'));
  const inserted=h.calls.inserts.length;
  const options=h.calls.liveInserterOptions.at(-1);
  h.hooks.insert=async()=>{
    h.hooks.composer=()=>claudeCodeTree(h.env.active,false);
    await options.verifyContext();
    assert.fail('changed Code scene must reject');
  };
  await bar.buttons.get('p0').callback();
  assert.equal(h.calls.inserts.length,inserted+1);
  assert.ok(h.calls.logs.some(s=>s.includes('SCENE_CHANGED')));
});

test('configured strict policy is forwarded without accidentally enabling paste',async()=>{
  const h=await harness(library(),false),config='/virtual/strict-target.json';
  h.files.set(config,JSON.stringify({schemaVersion:1,profiles:[{
    id:'strict-target',name:'Strict',app:{bundleId:'com.openai.codex'},
    layout:{sidebarWidth:300,gap:16,top:16,bottom:16,right:16},inputMode:'strict',
    editorSelector:{role:'textField',identifier:'fixture-composer'},
  }]}));
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
  await h.api.setFollowing(true);await h.api.rebuild();
  await h.api.bar().buttons.get('p0').callback();
  assert.equal(h.calls.inserterOptions.length,1);
  assert.equal(h.calls.inserterOptions[0].inputMode,'strict');
});
test('Claude read-only check uses its qualified deep selector instead of pointer calibration',async()=>{
  const h=await claudeHarness();
  h.hooks.calibrate=()=>assert.fail('Claude must not use shallow pointer calibration');
  await h.api.openManager();await h.panel().control('calibrate').emit('click');
  assert.equal(h.calls.discovers.length,1);
  assert.equal(h.calls.discovers[0].maxDepth,64);
  assert.equal(h.calls.discovers[0].editorSelector.name,'Prompt');
  assert.equal(h.api.bar().state.visible,true);
  assert.ok(h.calls.toasts.some(t=>t.message?.includes('追加并读回，不会发送')||t.text?.includes('追加并读回，不会发送')));
});


test('custom Claude descriptors use the scene-measured Prompt selector',async()=>{
  for(const editorSelector of [undefined,{role:'textField',name:'Other field'}]){
    const h=await harness(library(),false),config='/virtual/custom-claude.json';
    h.env.active={...codex(),exePath:'/Applications/Claude.app/Contents/MacOS/Claude'};
    h.files.set(config,JSON.stringify({schemaVersion:1,
      scope:{pid:101,exePath:h.env.active.exePath,profile:'desktop'},profiles:[{
        id:'desktop',name:'Claude',app:{path:'/Applications/Claude.app'},
        layout:{sidebarWidth:0,gap:16,top:16,bottom:16,right:16},editorSelector}]}));
    h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
    h.hooks.forbidGlobal=true;h.hooks.appGet=()=>assert.fail('global App.get');
    h.hooks.scoped=()=>clone(h.env.active);h.hooks.composer=()=>claudeCodeTree(h.env.active);
    await h.api.setFollowing(true);await h.api.rebuild();await h.api.bar().buttons.get('p0').callback();
    assert.equal(h.calls.discovers.length,1);assert.equal(h.calls.discovers[0].editorSelector.name,'Prompt');
  }
});


test('Claude toolbar recovers at the same position after a transient scene read fails',async()=>{
  const h=await claudeHarness(),bar=h.api.bar(),position=clone(bar.state.bounds);let reads=0;
  h.hooks.composer=()=>{if(++reads===1)throw error('STALE_TARGET');return claudeCodeTree(h.env.active);};
  await h.api.sync();assert.equal(bar.state.visible,false);
  h.hooks.composer=()=>claudeCodeTree(h.env.active);await h.api.sync();
  assert.equal(bar.state.visible,true);assert.deepEqual(bar.state.bounds,position);
});
test('scoped poll coalesces while a deep scene observation is running',async()=>{
  const h=await claudeHarness();let entered,release,reads=0,measurements=0;
  const ready=new Promise(resolve=>{entered=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  h.hooks.composer=async options=>{reads++;if(options.properties.includes('bounds'))measurements++;
    entered();await held;return claudeCodeTree(h.env.active);};
  const pending=h.api.sync();await ready;
  assert.equal(h.timers.size,1);
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);
  await callback();release();await pending;
  assert.equal(reads,2,'measurement plus final complete structure check; guard queues neither');
  assert.equal(measurements,1,'only one complete geometry measurement per sync');
  assert.equal(h.api.bar().state.visible,true);
});

test('an unchanged scoped guard skips deep scene reads and native visibility mutations',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();let reads=0;
  h.hooks.composer=()=>{reads++;return claudeCodeTree(h.env.active);};
  const hides=h.calls.hides.length,moves=h.calls.moves.length;
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,0,'unchanged guard must not rescan the complete scene');
  assert.equal(h.calls.hides.length,hides);assert.equal(h.calls.moves.length,moves);
  assert.equal(bar.state.visible,true);
});

test('an unchanged absent target keeps only its guard instead of restarting hidden-toolbar retries',async()=>{
  const h=await claudeHarness();h.env.active=null;
  await h.api.sync();
  // Exhaust the existing bounded focus-transition retries before measuring the
  // steady absent state; the 250ms foreground guard must remain alive.
  for(let i=0;i<2;i++){
    const [id,callback]=Array.from(h.timers).find(([id])=>h.timerDelays.get(id)===40);
    h.timers.delete(id);await callback();
  }
  assert.equal(h.timers.size,1);let reads=0;
  h.hooks.scoped=()=>{reads++;return null;};
  for(let i=0;i<4;i++){
    const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.timers.size,1,'an absent target must not restart the two short retries');
  }
  assert.equal(reads,4);assert.equal(h.api.bar().state.visible,false);
  h.env.active={...codex(),exePath:'/Applications/Claude.app/Contents/MacOS/Claude'};
  h.hooks.scoped=()=>clone(h.env.active);
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.api.bar().state.visible,true,'returning target must still receive fresh qualification');
});

test('a visible qualified window translation moves without hiding or repeating scene qualification',async()=>{
  const h=await claudeHarness(),bar=h.api.bar(),before=clone(bar.state.bounds);let reads=0;
  h.hooks.composer=()=>{reads++;return claudeCodeTree(h.env.active);};
  const hides=h.calls.hides.length;h.env.active.x+=40;h.env.active.y+=20;
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,0);assert.equal(h.calls.hides.length,hides);
  assert.equal(bar.state.bounds.x,before.x+40);assert.equal(bar.state.bounds.y,before.y+20);
  assert.equal(bar.state.visible,true);
});

test('a scoped guard recovers a missing visible toolbar with fresh scene evidence',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();let reads=0;
  bar.state.visible=false;bar.state.onScreen=false;
  h.hooks.composer=()=>{reads++;return claudeCodeTree(h.env.active);};
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(reads>=2);assert.equal(bar.state.visible,true);
});

test('recovery consumes its scoped guard sample once and retains both presentation rechecks',async()=>{
  const h=await harness(library(),false),config='/virtual/guard-sample.json';
  h.files.set(config,JSON.stringify({schemaVersion:1,scope:{pid:101,exePath:'/fixture/Codex',profile:'opencode'}}));
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
  await h.api.setFollowing(true);await h.api.rebuild();
  const bar=h.api.bar();bar.state.visible=false;bar.state.onScreen=false;let reads=0;
  h.hooks.scoped=()=>{reads++;return clone(h.env.active);};
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,3,'one guard observation plus pre/post presentation exact reads');
  assert.equal(bar.state.visible,true);
});

test('native activation hints wake immediately and unchanged activation does not rescan or hide',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  assert.equal(h.watchers.size,1);let reads=0;
  h.hooks.composer=()=>{reads++;return claudeCodeTree(h.env.active);};
  const hides=h.calls.hides.length;
  for(let i=0;i<5;i++)h.watchers.get(101)({reasons:['app-active-changed'],active:true});
  assert.equal(h.timers.size,1);const [id,callback]=h.timers.entries().next().value;
  assert.equal(h.timerDelays.get(id),0);h.timers.delete(id);await callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,0);assert.equal(h.calls.hides.length,hides);
  await h.api.setFollowing(false);assert.equal(h.watchers.size,0);assert.equal(h.timers.size,0);
});

test('capability and repeated activation hints do not add another scan behind an in-flight guard',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  let enter,release;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.hooks.scoped=async()=>{enter();await held;return clone(h.env.active);};
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);
  const pending=callback();await ready;
  h.watchers.get(101)({reasons:['capabilities-changed'],active:true});
  h.watchers.get(101)({reasons:['app-active-changed','capabilities-changed'],active:true});
  release();await pending;
  assert.equal(h.timers.size,1);
  const next=h.timers.keys().next().value;
  assert.equal(h.timerDelays.get(next),250,'fresh in-flight observation already covers these hints');
  assert.equal(h.api.bar().state.visible,true);
});

test('a mixed capability/deactivation hint still invalidates and wakes an in-flight guard',async()=>{
  const h=await claudeHarness();h.installWatcher();
  await h.api.setFollowing(true);
  let enter,release;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  const stale=clone(h.env.active);
  h.hooks.scoped=async()=>{enter();await held;return stale;};
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);
  const pending=callback();await ready;h.env.active=null;
  h.watchers.get(101)({reasons:['capabilities-changed','app-deactivated'],active:false});
  assert.equal(h.api.bar().state.visible,false);
  release();await pending;
  const next=h.timers.keys().next().value;
  assert.equal(h.timerDelays.get(next),0,'deactivation must retain the immediate follow-up query');
  assert.equal(h.api.bar().state.visible,false,'late pre-deactivation observation must not show');
});

test('native deactivation invalidates a blocked scene immediately and drops the late result',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const bar=h.api.bar(),old=clone(h.env.active);let enter,release;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.hooks.composer=async()=>{enter();await held;return claudeCodeTree(old);};
  const pending=h.api.sync();await ready;h.env.active=null;
  h.watchers.get(101)({reasons:['app-active-changed'],active:false});
  assert.equal(bar.state.visible,false,'KVO hint must hide before AX completion');
  release();await pending;assert.equal(bar.state.visible,false);
});

test('coalesced native focus changes revalidate the same window without flashing',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const hides=h.calls.hides.length;let reads=0,shows=0;
  h.hooks.composer=()=>{reads++;return claudeCodeTree(h.env.active);};
  h.hooks.show=()=>{shows++;};
  h.watchers.get(101)({reasons:['app-active-changed','focused-window-changed'],active:true});
  assert.equal(h.api.bar().state.visible,true,'a focus hint does not prove the window changed');
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(reads>=2,'focus changes still require complete fresh scene checks');
  assert.equal(h.calls.hides.length,hides);assert.equal(shows,0);
  assert.equal(h.api.bar().state.visible,true);
});

test('focus and layout hints during a prompt click keep the bar visible and defer deep reads',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const bar=h.api.bar(),hides=h.calls.hides.length;let enter,release,reads=0,shows=0;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.hooks.composer=()=>{reads++;return claudeCodeTree(h.env.active);};
  h.hooks.show=()=>{shows++;};
  h.hooks.insert=async()=>{enter();await held;return {status:'inserted',verified:true,actionState:'acknowledged'};};
  const pending=bar.click('p0');await ready;
  for(const reason of ['focused-ui-element-changed','layout-changed','focused-window-changed']){
    h.watchers.get(101)({reasons:[reason],active:true});
    assert.equal(bar.state.visible,true,'the nonactivating bar must stay visible during input');
    const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  }
  assert.equal(reads,0,'input owns editor reads while the foreground guard remains active');
  release();await pending;await new Promise(resolve=>setImmediate(resolve));
  assert.ok(reads>=2);assert.equal(h.calls.hides.length,hides);assert.equal(shows,0);
  assert.equal(bar.state.visible,true);
});

test('a focus hint hides an actual replacement before its slow scene read',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const bar=h.api.bar();let enter,release;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.env.active={...h.env.active,id:'mac:101:502',handle:502};
  h.hooks.composer=async()=>{enter();await held;return claudeCodeTree(h.env.active);};
  h.watchers.get(101)({reasons:['focused-window-changed'],active:true});
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();await ready;
  assert.equal(bar.state.visible,false,'fresh native identity replacement must hide before qualification');
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bar.state.visible,true);
});

test('a layout hint rejects a changed Code page and does not reuse a held scene result',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const bar=h.api.bar(),old=clone(h.env.active);let enter,release,first=true;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.hooks.composer=async()=>{if(first){first=false;enter();await held;return claudeCodeTree(old);}
    return claudeCodeTree(h.env.active,false);};
  const pending=h.api.sync();await ready;
  h.watchers.get(101)({reasons:['layout-changed'],active:true});
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  release();await pending;
  assert.equal(bar.state.visible,false,'a late valid tree cannot restore the now-invalid page');
});

test('a merged deactivate/reactivate hint still hides immediately during a prompt click',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const bar=h.api.bar();let enter,release;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.hooks.insert=async()=>{enter();await held;return {status:'blocked',code:'TARGET_CHANGED',actionState:'unknown'};};
  const pending=bar.click('p0');await ready;h.env.active=null;
  h.watchers.get(101)({reasons:['app-deactivated','app-activated','focused-ui-element-changed'],active:true});
  assert.equal(bar.state.visible,false,'merged loss must not be mistaken for a harmless focus hint');
  release();await pending;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bar.state.visible,false);assert.equal(h.calls.inserts.length,1);
});

test('a soft hint during native show never performs expired hide cleanup or restarts show',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const bar=h.api.bar();bar.state.visible=false;bar.state.onScreen=false;
  const hides=h.calls.hides.length;let shows=0;
  h.hooks.show=()=>{shows++;h.watchers.get(101)({reasons:['focused-ui-element-changed'],active:true});};
  await h.api.sync();
  assert.equal(shows,1);assert.equal(h.calls.hides.length,hides);
  assert.equal(bar.state.visible,true);
  assert.equal(h.api.state().sceneVersion,h.api.state().sceneVerifiedVersion);
});

test('input fences a held scene candidate and preserves the confirmed scene until input finishes',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const bar=h.api.bar(),signature=h.api.state().codeScene.signature,hides=h.calls.hides.length;
  let enter,release,inputEnter,inputRelease,first=true;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  const inputReady=new Promise(resolve=>{inputEnter=resolve;}),inputHeld=new Promise(resolve=>{inputRelease=resolve;});
  h.hooks.composer=async()=>{if(first){first=false;enter();await held;
    return claudeCodeTree(h.env.active,true,'Stale candidate - Claude Code');}
    return claudeCodeTree(h.env.active);};
  const pending=h.api.sync();await ready;
  assert.equal(h.api.state().codeScene.signature,signature,'qualification is a local candidate');
  h.hooks.insert=async()=>{inputEnter();await inputHeld;return {status:'inserted',verified:true,actionState:'acknowledged'};};
  const insertion=bar.click('p0');await inputReady;
  release();await pending;
  assert.equal(h.api.state().codeScene.signature,signature,'an older candidate cannot replace the input binding');
  assert.equal(bar.state.visible,true);assert.equal(h.calls.hides.length,hides);
  assert.notEqual(h.api.state().sceneVersion,h.api.state().sceneVerifiedVersion,'input deferral does not acknowledge a scene');
  inputRelease();await insertion;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.api.state().sceneVersion,h.api.state().sceneVerifiedVersion);
  assert.equal(h.api.state().codeScene.signature,signature);
});

test('soft hints during a held guard preserve dirty work until the latest full qualification completes',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const verifiedAt=h.api.state().sceneVerifiedAt;h.env.now=verifiedAt+50;
  let enter,release,reads=0,first=true;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.hooks.scoped=async()=>{if(first){first=false;enter();await held;}return clone(h.env.active);};
  h.hooks.composer=()=>{reads++;return claudeCodeTree(h.env.active);};
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);const guard=callback();await ready;
  for(let i=0;i<8;i++)h.watchers.get(101)({reasons:['focused-ui-element-changed','layout-changed'],active:true});
  assert.equal(h.api.state().sceneVerifiedAt,verifiedAt);
  assert.notEqual(h.api.state().sceneVersion,h.api.state().sceneVerifiedVersion);
  release();await guard;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,2,'one current complete qualification covers the coalesced hints');
  assert.equal(h.api.state().sceneVersion,h.api.state().sceneVerifiedVersion);
  assert.equal(h.api.state().sceneVerifiedAt,h.env.now);
  h.env.now+=1001;const [next,tick]=h.timers.entries().next().value;h.timers.delete(next);await tick();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,4,'the no-notification periodic scene guard still runs');
});

test('a late scene error cannot clear a newer detached visibility owner',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();let enter,release;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.hooks.composer=async()=>{enter();await held;throw error('TIMEOUT');};
  const pending=h.api.sync();await ready;await h.api.setFollowing(false);
  const hides=h.calls.hides.length;release();await pending;
  assert.equal(bar.state.visible,true);assert.equal(h.calls.hides.length,hides);
});

test('a late native show completion cannot hide a newer detached visibility owner',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();bar.state.visible=false;bar.state.onScreen=false;
  let enter,release;
  const ready=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.hooks.show=async()=>{enter();await held;};
  const pending=h.api.sync();await ready;await h.api.setFollowing(false);
  const hides=h.calls.hides.length;release();await pending;
  assert.equal(bar.state.visible,true);assert.equal(h.calls.hides.length,hides);
});

test('another configured process focus hint does not dirty or hide the current owner',async()=>{
  const h=await claudeHarness(),config=h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG;
  const value=JSON.parse(h.files.get(config));value.scopes=[value.scope,
    {pid:202,exePath:'/fixture/OpenCode',profile:'opencode'}];delete value.scope;
  h.files.set(config,JSON.stringify(value));h.installWatcher();await h.api.setFollowing(true);
  const hides=h.calls.hides.length,version=h.api.state().sceneVersion;
  h.watchers.get(202)({reasons:['focused-window-changed','layout-changed'],active:true});
  assert.equal(h.api.state().sceneVersion,version);assert.equal(h.calls.hides.length,hides);
  assert.equal(h.api.bar().state.visible,true);
});

test('unsupported native watch falls back and native close never recreates the toolbar',async()=>{
  const h=await claudeHarness();h.installWatcher();h.hooks.watch=()=>{throw error('NOT_SUPPORTED');};
  await h.api.setFollowing(true);assert.ok(h.calls.logs.some(s=>s.includes('"backend":"polling"')));
  assert.ok(h.timers.size);delete h.hooks.watch;
  await h.api.setFollowing(true);const bar=h.api.bar();await bar.close();
  const count=h.panels.length;h.watchers.get(101)({reasons:['app-active-changed'],active:true});
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.api.bar(),null);assert.equal(h.panels.length,count);
});

test('explicit scope reload releases old subscriptions and late callbacks cannot affect the replacement',async()=>{
  const h=await claudeHarness();h.installWatcher();await h.api.setFollowing(true);
  const old=h.watchers.get(101),config=h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG;
  const next=JSON.parse(h.files.get(config));next.scope.pid=202;h.files.set(config,JSON.stringify(next));
  h.env.active={...h.env.active,pid:202,id:'mac:202:602',handle:602};
  await h.api.setFollowing(true);
  assert.equal(h.watchers.has(101),false);assert.equal(h.watchers.has(202),true);
  assert.equal(h.api.bar().state.visible,true);
  old({reasons:['app-deactivated'],active:false});assert.equal(h.api.bar().state.visible,true);
  h.files.set(config,'{}');await assert.rejects(h.api.setFollowing(true),{code:'INVALID_TARGET_CONFIG'});
  assert.equal(h.watchers.size,0);assert.equal(h.timers.size,0);assert.equal(h.api.bar().state.visible,false);
});

test('a scene switch during show is rejected by the final complete structure check',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();
  bar.state.visible=false;bar.state.onScreen=false;
  h.hooks.show=()=>{h.hooks.composer=()=>claudeCodeTree(h.env.active,false);};
  await h.api.sync();assert.equal(bar.state.visible,false);
  delete h.hooks.show;h.hooks.composer=()=>claudeCodeTree(h.env.active);
  await h.api.sync();assert.equal(bar.state.visible,true);
});

test('scoped foreground guard hides during a held scene read and discards its late result',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();let entered,release;
  const ready=new Promise(resolve=>{entered=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const old=clone(h.env.active);
  h.hooks.composer=async()=>{entered();await held;return claudeCodeTree(old);};
  const pending=h.api.sync();await ready;
  h.env.active=null;
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  assert.equal(bar.state.visible,false,'light guard must not wait for the deep read');
  release();await pending;
  assert.equal(bar.state.visible,false,'late Code result cannot show an obsolete toolbar');
});

test('scoped geometry replacement cancels an old scene before any toolbar move',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();let entered,release,first=true;
  const ready=new Promise(resolve=>{entered=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const old=clone(h.env.active),moves=h.calls.moves.length;
  h.hooks.composer=async()=>{if(first){first=false;entered();await held;return claudeCodeTree(old);}
    return claudeCodeTree(h.env.active);};
  const pending=h.api.sync();await ready;h.env.active.x+=40;
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);await callback();
  assert.equal(bar.state.visible,false);release();await pending;
  assert.equal(bar.state.visible,true);assert.equal(bar.state.bounds.x,h.env.active.x+304);
  assert.ok(h.calls.moves.slice(moves).every(m=>m.x===h.env.active.x+304));
});

test('drag final readback rejects movement that never produced a current move receipt',async()=>{
  const h=await harness();await h.api.rebuild();h.api.allowDrag();
  const bar=h.api.bar();bar.state.bounds.x+=40;
  await h.api.drag({bounds:clone(bar.state.bounds)});
  const callback=Array.from(h.timers.values())[0];
  bar.state.bounds.x+=30;callback();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.writes.length,0,'do not save the obsolete first frame');
});

test('a stale foreground guard failure cannot hide a newly detached toolbar',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();let entered,release;
  const ready=new Promise(resolve=>{entered=resolve;});
  h.hooks.scoped=async()=>{entered();await new Promise(resolve=>{release=resolve;});throw error('TIMEOUT');};
  const [id,callback]=h.timers.entries().next().value;h.timers.delete(id);
  const pending=callback();await ready;await h.api.setFollowing(false);
  assert.equal(bar.state.visible,true);release();await pending;
  assert.equal(bar.state.visible,true,'old subscription cannot mutate the new mode');
});

test('partially offscreen target preserves a user drag from the clipped edge',async()=>{
  const h=await harness();h.env.active.x=-400;await h.api.rebuild();h.api.allowDrag();
  const bar=h.api.bar();assert.equal(bar.state.bounds.x,8);
  bar.state.bounds.x=48;
  await h.api.drag({bounds:clone(bar.state.bounds)});
  Array.from(h.timers.values()).at(-1)();await new Promise(resolve=>setImmediate(resolve));
  await h.api.sync();assert.equal(bar.state.bounds.x,48,'saved offset must use the unclipped anchor');
  await h.api.sync();assert.equal(bar.state.bounds.x,48);
});

test('a changed recheck hides the old toolbar before a replacement observation can complete',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();let reads=0,entered,release;
  const ready=new Promise(resolve=>{entered=resolve;}),old=clone(h.env.active);
  h.hooks.scoped=async()=>{
    if(++reads===3){h.env.active.x+=40;return clone(h.env.active);}
    if(reads===4){entered();await new Promise(resolve=>{release=resolve;});}
    return clone(h.env.active);
  };
  const pending=h.api.sync();await ready;
  assert.equal(bar.state.visible,false,'old geometry must be hidden before a slow replacement read');
  release();await pending;assert.equal(bar.state.bounds.x,old.x+40+304);
});


test('scoped OpenCode path adapter receives its empty-paragraph model',async()=>{
  const h=await harness(library(),false),config='/virtual/opencode-scope.json';
  h.env.active={...codex(),title:'OpenCode',exePath:'/Applications/OpenCode.app/Contents/MacOS/OpenCode'};
  h.files.set(config,JSON.stringify({schemaVersion:1,scope:{pid:101,exePath:h.env.active.exePath,profile:'opencode'}}));
  h.executionEnv.OPENDESK_SHORTCUTS_TARGET_CONFIG=config;
  h.hooks.forbidGlobal=true;h.hooks.appGet=()=>assert.fail('global App.get');
  h.hooks.scoped=()=>clone(h.env.active);
  await h.api.setFollowing(true);await h.api.rebuild();await h.api.bar().buttons.get('p0').callback();
  assert.equal(h.calls.inserterOptions.at(-1).editorModel,'opencode');
  assert.equal(h.calls.inserterOptions.at(-1).inputMode,'paste');
});
test('Claude insertion window guards avoid scene scans while explicit context gate stays fresh',async()=>{
  const h=await claudeHarness();let scans=0;const options=h.calls.liveInserterOptions.at(-1);
  h.hooks.composer=()=>{scans++;return claudeCodeTree(h.env.active);};
  await h.api.bar().buttons.get('p0').callback();
  const count=scans;
  await options.getTarget();await options.getTarget();
  assert.equal(scans,count);
  await options.verifyContext();assert.equal(scans,count+1);
  h.hooks.composer=()=>claudeCodeTree(h.env.active,false);
  await assert.rejects(options.verifyContext(),{code:'SCENE_CHANGED'});
});

test('paste clicks share one busy gate through verification but slow feedback permits the next click',async()=>{
  const h=await claudeHarness(),bar=h.api.bar();
  let entered,release;const started=new Promise(resolve=>{entered=resolve;});
  h.hooks.insert=async()=>{entered();await new Promise(resolve=>{release=resolve;});
    return {status:'inserted',verified:true,actionState:'acknowledged'};};
  const first=bar.buttons.get('p0').callback();await started;
  await bar.buttons.get('p0').callback();
  assert.equal(h.calls.inserts.length,1);assert.equal(h.calls.inserterOptions.length,1);
  let toastStarted,finishToast;const feedback=new Promise(resolve=>{toastStarted=resolve;});
  h.hooks.toast=async()=>{toastStarted();await new Promise(resolve=>{finishToast=resolve;});};
  release();await feedback;
  h.hooks.insert=async()=>({status:'inserted',verified:true,actionState:'acknowledged'});
  const second=bar.buttons.get('p0').callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.inserts.length,2);assert.equal(h.calls.discovers.length,0);
  h.hooks.toast=null;finishToast();await Promise.all([first,second]);
});
