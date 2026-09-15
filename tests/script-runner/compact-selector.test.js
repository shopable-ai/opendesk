'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../../apps/opendesk/script-runner/controller.js');
delete require.cache[controllerPath];
delete global.OpenDeskScriptRunnerSimple;
require(controllerPath);

const ScriptRunner = global.OpenDeskScriptRunnerSimple;
assert.ok(ScriptRunner && typeof ScriptRunner.createApp === 'function');

function createControl() {
  const handlers = new Map();
  const state = {};
  return {
    state,
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
      return this;
    },
    async update(patch) {
      Object.assign(state, patch || {});
      return Object.assign({}, state);
    },
    async getState() {
      return Object.assign({}, state);
    },
    async emit(event) {
      for (const handler of handlers.get(event) || []) await handler();
    },
  };
}

function createWindow(spec) {
  const controls = new Map();
  const handlers = new Map();
  const window = {
    spec,
    visible: false,
    closed: false,
    control(id) {
      if (!controls.has(id)) controls.set(id, createControl());
      return controls.get(id);
    },
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
      return window;
    },
    async show() {
      window.visible = true;
      return {bounds: {x: 100, y: 100, width: 310, height: 272}};
    },
    async hide() {
      window.visible = false;
    },
    async close() {
      if (window.closed) return;
      window.closed = true;
      window.visible = false;
      for (const handler of handlers.get('close') || []) await handler();
    },
  };
  return window;
}

function createHarness(initialNames) {
  const root = '/recipes';
  let names = initialNames.slice();
  const writes = new Map();
  const windows = [];
  const commandCalls = [];
  let runGate = null;
  let toolbar = null;

  function join() {
    const parts = Array.from(arguments).filter(Boolean);
    return parts.join('/').replace(/\/+/g, '/');
  }

  const file = {
    join,
    path(value) { return String(value); },
    stat(path) {
      if (path === root) return {type: 'directory'};
      if (writes.has(path)) return {type: 'file'};
      const name = String(path).split('/').pop();
      if (names.includes(name)) return {type: 'file'};
      return null;
    },
    listDir(path) {
      assert.equal(path, root);
      return names.slice();
    },
    read(path) {
      return writes.get(path);
    },
    write(path, value) {
      writes.set(path, String(value));
    },
    ensureDir() {},
  };

  const command = {
    async run(executable, args, options) {
      commandCalls.push({executable, args: args.slice(), options});
      if (runGate) return runGate.promise;
      return {exitCode: 0, stdout: '', stderr: ''};
    },
  };

  const ui = {
    async createWindow(spec) {
      const window = createWindow(spec);
      windows.push(window);
      return window;
    },
  };

  function FloatingWindow(spec) {
    const handlers = new Map();
    const buttons = new Map();
    const labels = new Map();
    toolbar = {
      id: 'mockToolbar',
      spec,
      buttons,
      labels,
      addButton(id, label, icon, action) {
        buttons.set(id, {id, label, icon, action, state: {disabled: false, active: false}});
      },
      addLabel(id, text, options) {
        labels.set(id, {id, text, options: Object.assign({}, options)});
      },
      on(event, handler) {
        const list = handlers.get(event) || [];
        list.push(handler);
        handlers.set(event, list);
      },
      onError() {},
      async updateButton(id, patch) {
        Object.assign(buttons.get(id).state, patch || {});
      },
      async updateLabel(id, patch) {
        Object.assign(labels.get(id), patch || {});
      },
      async show() {
        return {bounds: {x: 600, y: 700, width: 360, height: 44}};
      },
      async waitUntilClosed() {},
      async click(id) {
        return buttons.get(id).action();
      },
    };
    return toolbar;
  }

  const app = ScriptRunner.createApp({
    file,
    command,
    execution: {workdir: '/work'},
    system: {
      getExecutablePath() { return '/opendesk'; },
      getPlatformInfo() { return {os: 'darwin'}; },
    },
    ui,
    FloatingWindow,
    AbortController,
    logger: {log() {}, error() {}},
    scriptRoot: root,
    openListOnStart: false,
  });

  return {
    app,
    windows,
    commandCalls,
    get toolbar() { return toolbar; },
    setNames(next) { names = next.slice(); },
    deferRun() {
      let resolve;
      const promise = new Promise(res => { resolve = res; });
      runGate = {promise, resolve};
      return {
        resolve(value = {exitCode: 0, stdout: '', stderr: ''}) {
          runGate = null;
          resolve(value);
        },
      };
    },
    selectorWindow() {
      return windows.findLast(window => String(window.spec.id || '').startsWith('scriptRunnerSelector')) || null;
    },
    managerWindow() {
      return windows.findLast(window => String(window.spec.id || '').startsWith('scriptRunnerList')) || null;
    },
  };
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}

test('default selection uses the first sorted script and updates toolbar label', async () => {
  const h = createHarness(['C.js', 'A.js', 'B.js']);
  await h.app.rescan();
  assert.deepEqual(h.app.scripts().map(script => script.name), ['A.js', 'B.js', 'C.js']);
  assert.equal(h.app.state().selectedScriptName, 'A.js');
  assert.equal(h.toolbar.labels.get('script').text, 'A.js');
});

test('compact selector changes selection without running and closes after selection', async () => {
  const h = createHarness(['A.js', 'B.js', 'C.js']);
  await h.app.rescan();
  await h.app.openSelector();
  const selector = h.selectorWindow();
  assert.ok(selector && selector.visible);
  await selector.control('compactScript1').emit('click');
  assert.equal(h.app.state().selectedScriptName, 'B.js');
  assert.equal(h.app.state().selectorVisible, false);
  assert.equal(h.toolbar.labels.get('script').text, 'B.js');
  assert.equal(h.commandCalls.length, 0);
});

test('toolbar Run executes selected script instead of scripts[0]', async () => {
  const h = createHarness(['A.js', 'B.js', 'C.js']);
  await h.app.rescan();
  await h.app.selectScript('B.js');
  await h.toolbar.click('run');
  assert.equal(h.commandCalls.length, 1);
  assert.equal(h.commandCalls[0].args[1], '/recipes/B.js');
  assert.equal(h.app.state().lastOutcome.status, 'succeeded');
});

test('running state disables switching while preserving Run/Stop semantics', async () => {
  const h = createHarness(['A.js', 'B.js', 'C.js']);
  await h.app.rescan();
  await h.app.selectScript('B.js');
  const gate = h.deferRun();
  const running = h.toolbar.click('run');
  await flush();
  assert.equal(h.app.state().running, true);
  assert.equal(h.toolbar.buttons.get('run').state.disabled, true);
  assert.equal(h.toolbar.buttons.get('stop').state.disabled, false);
  assert.equal(h.toolbar.buttons.get('list').state.disabled, true);
  assert.equal(await h.app.selectScript('C.js'), false);
  assert.equal(h.app.state().selectedScriptName, 'B.js');
  gate.resolve();
  await running;
  await flush();
  assert.equal(h.app.state().running, false);
});

test('refresh preserves selected script by name when it still exists', async () => {
  const h = createHarness(['A.js', 'B.js', 'C.js']);
  await h.app.rescan();
  await h.app.selectScript('B.js');
  h.setNames(['C.js', 'B.js', 'A.js']);
  await h.app.rescan();
  assert.equal(h.app.state().selectedScriptName, 'B.js');
});

test('refresh falls back to first sorted script when selected script disappears', async () => {
  const h = createHarness(['A.js', 'B.js', 'C.js']);
  await h.app.rescan();
  await h.app.selectScript('B.js');
  h.setNames(['C.js', 'A.js']);
  await h.app.rescan();
  assert.equal(h.app.state().selectedScriptName, 'A.js');
  assert.equal(h.toolbar.labels.get('script').text, 'A.js');
});

test('Manage scripts closes compact selector and opens existing full manager', async () => {
  const h = createHarness(['A.js', 'B.js']);
  await h.app.rescan();
  await h.app.openSelector();
  const selector = h.selectorWindow();
  await selector.control('compactManage').emit('click');
  assert.equal(h.app.state().selectorVisible, false);
  assert.equal(h.app.state().listVisible, true);
  const manager = h.managerWindow();
  assert.ok(manager && manager.visible);
  assert.match(manager.spec.content.html, /runSelected/);
  assert.match(manager.spec.content.html, /restoreOrder/);
});

test('empty script directory has no invalid selection and Run executes nothing', async () => {
  const h = createHarness([]);
  await h.app.rescan();
  assert.equal(h.app.state().selectedScriptName, null);
  assert.equal(h.toolbar.buttons.get('run').state.disabled, true);
  const outcome = await h.toolbar.click('run');
  assert.equal(outcome.status, 'empty');
  assert.equal(h.commandCalls.length, 0);
});

test('script-list toolbar button toggles compact selector instead of full manager', async () => {
  const h = createHarness(['A.js', 'B.js']);
  await h.app.rescan();
  await h.toolbar.click('list');
  assert.equal(h.app.state().selectorVisible, true);
  assert.equal(h.app.state().listVisible, false);
  await h.toolbar.click('list');
  assert.equal(h.app.state().selectorVisible, false);
  assert.equal(h.app.state().listVisible, false);
});
