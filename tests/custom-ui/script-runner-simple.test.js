'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const controllerFile = path.join(repo, 'apps/opendesk/script-runner/controller.js');
vm.runInThisContext(fs.readFileSync(controllerFile, 'utf8'), {filename: controllerFile});
const Runner = globalThis.OpenDeskScriptRunnerSimple;

function FileAPI(overrides = {}) {
  const api = {
    join: path.join,
    path: value => path.resolve(value),
    stat(p) {
      try {
        const stat = fs.statSync(p);
        return {type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other'};
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    listDir: p => fs.readdirSync(p),
    read: p => fs.readFileSync(p, 'utf8'),
    write(p, content) {
      fs.mkdirSync(path.dirname(p), {recursive: true});
      fs.writeFileSync(p, content);
    },
    ensureDir: p => fs.mkdirSync(p, {recursive: true}),
  };
  return Object.assign(api, overrides);
}

function FakeUI() {
  const windows = [];
  return {
    windows,
    async createWindow(spec) {
      const controls = new Map();
      const listeners = new Map();
      const window = {
        spec,
        controls,
        shown: false,
        closed: false,
        control(id) {
          if (!controls.has(id)) {
            const state = {};
            const handlers = {};
            controls.set(id, {
              id,
              state,
              handlers,
              on(type, callback) { handlers[type] = callback; },
              async update(patch) { Object.assign(state, patch); return {id, ...state}; },
              async getState() { return {id, ...state}; },
            });
          }
          return controls.get(id);
        },
        on(type, callback) { listeners.set(type, callback); },
        async show() { this.shown = true; },
        async close() {
          if (this.closed) return;
          this.closed = true;
          const callback = listeners.get('close');
          if (callback) callback({type: 'close'});
        },
      };
      windows.push(window);
      return window;
    },
  };
}

function ToolbarCapture() {
  let current = null;
  class FakeToolbar {
    constructor() {
      current = this;
      this.id = 'script-runner-test-toolbar';
      this.buttons = new Map();
      this.labels = new Map();
      this.handlers = new Map();
      this.closed = false;
      this.closedPromise = new Promise(resolve => { this.resolveClosed = resolve; });
    }
    addButton(id, label, icon, callback) { this.buttons.set(id, {id, label, icon, callback, disabled: false}); }
    addLabel(id, text, options) { this.labels.set(id, {id, text, ...(options || {})}); }
    async updateButton(id, patch) { Object.assign(this.buttons.get(id), patch); }
    async updateLabel(id, patch) { Object.assign(this.labels.get(id), patch); }
    on(type, callback) { this.handlers.set(type, callback); }
    onError(callback) { this.errorHandler = callback; }
    async show() { return {bounds: null}; }
    waitUntilClosed() { return this.closedPromise; }
    async close() {
      if (this.closed) return;
      this.closed = true;
      const callback = this.handlers.get('close');
      if (callback) callback({type: 'close'});
      this.resolveClosed();
    }
  }
  return {FakeToolbar, current: () => current};
}

async function waitFor(predicate, message = 'condition') {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail(`timed out waiting for ${message}`);
}

async function fixture(options = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'script-runner-simple-'));
  const scriptRoot = path.join(temp, 'recipes');
  if (options.createRoot !== false) fs.mkdirSync(scriptRoot, {recursive: true});
  const scriptNames = options.scriptNames === undefined ? ['a.js'] : options.scriptNames;
  if (options.createRoot !== false) {
    for (const name of scriptNames) fs.writeFileSync(path.join(scriptRoot, name), `// ${name}\n`);
    if (options.order) {
      fs.writeFileSync(path.join(scriptRoot, '.opendesk-runner.json'), JSON.stringify({schemaVersion: 1, order: options.order}));
    }
  }
  const ui = FakeUI();
  const toolbarCapture = ToolbarCapture();
  const calls = [];
  const command = options.command || {
    async run(executable, args, commandOptions) {
      calls.push({executable, args, options: commandOptions});
      return {exitCode: 0, stdout: '', stderr: ''};
    },
  };
  const app = Runner.createApp({
    scriptRoot,
    managedScriptRoot: options.managedScriptRoot !== false,
    openListOnStart: options.openListOnStart !== false,
    file: options.file || FileAPI(),
    command,
    execution: {workdir: temp},
    system: {getExecutablePath: () => '/fake/opendesk', getPlatformInfo: () => ({os: 'darwin'})},
    ui,
    FloatingWindow: toolbarCapture.FakeToolbar,
    AbortController,
    logger: {log() {}, error() {}},
  });
  const appRun = app.run();
  const toolbar = toolbarCapture.current();
  if (options.openListOnStart !== false) {
    await waitFor(() => ui.windows.length > 0 && app.state().loading === false, 'startup list');
  }
  async function cleanup() {
    await toolbar.close();
    await appRun;
    fs.rmSync(temp, {recursive: true, force: true});
  }
  return {temp, scriptRoot, ui, toolbar, calls, app, appRun, cleanup};
}

async function click(window, id) {
  const control = window.control(id);
  assert.equal(typeof control.handlers.click, 'function', `${id} should have a click handler`);
  return control.handlers.click({type: 'click'});
}

async function selectAllAndRun(f) {
  const window = await f.app.openList();
  for (let index = 0; index < f.app.scripts().length; index++) {
    window.control(`select${index}`).state.checked = true;
  }
  return click(window, 'runSelected');
}

test('empty startup still creates the main list page with legal empty actions', async () => {
  const f = await fixture({scriptNames: []});
  try {
    assert.equal(f.ui.windows.length, 1);
    const window = f.ui.windows[0];
    assert.equal(window.shown, true);
    assert.equal(f.app.state().viewState, 'empty');
    assert.equal(f.toolbar.buttons.get('run').disabled, true);
    assert.equal(f.toolbar.buttons.get('stop').disabled, true);
    assert.equal(window.control('runSelected').state.disabled, true);
    assert.equal(window.control('refresh').state.disabled, false);
    assert.equal(window.control('openDirectory').state.disabled, false);
    assert.equal(window.control('emptyTitle').state.visible, true);
    assert.equal(window.control('emptyRefresh').state.visible, true);
    assert.match(window.spec.content.html, /暂无可运行脚本/);
  } finally {
    await f.cleanup();
  }
});

test('empty refreshes to ready in the same window', async () => {
  const f = await fixture({scriptNames: []});
  try {
    const window = f.ui.windows[0];
    fs.writeFileSync(path.join(f.scriptRoot, 'a.js'), '// a\n');
    assert.equal(await click(window, 'refresh'), true);
    assert.equal(f.ui.windows.length, 1);
    assert.equal(f.ui.windows[0], window);
    assert.equal(f.app.state().viewState, 'ready');
    assert.deepEqual(f.app.scripts().map(s => s.name), ['a.js']);
    assert.equal(window.control('emptyTitle').state.visible, false);
    assert.equal(window.control('name0').state.text, 'a.js');
    assert.equal(window.control('name0').state.visible, true);
    assert.equal(f.toolbar.buttons.get('run').disabled, false);
  } finally {
    await f.cleanup();
  }
});

test('ready refreshes to empty, clears stale selection, and keeps the same window', async () => {
  const f = await fixture({scriptNames: ['a.js']});
  try {
    const window = f.ui.windows[0];
    window.control('select0').state.checked = true;
    await window.control('select0').handlers.change({type: 'change'});
    assert.deepEqual(f.app.state().selectedNames, ['a.js']);
    fs.rmSync(path.join(f.scriptRoot, 'a.js'));
    assert.equal(await click(window, 'refresh'), true);
    assert.equal(f.ui.windows.length, 1);
    assert.equal(f.app.state().viewState, 'empty');
    assert.deepEqual(f.app.state().selectedNames, []);
    assert.equal(window.control('name0').state.visible, false);
    assert.equal(window.control('emptyTitle').state.visible, true);
    assert.equal(f.toolbar.buttons.get('run').disabled, true);
  } finally {
    await f.cleanup();
  }
});

test('empty run guard is safe even when invoked at controller level', async () => {
  const f = await fixture({scriptNames: []});
  try {
    assert.deepEqual(await f.app.requestRun([], 'test'), {status: 'empty', completed: 0, total: 0});
    assert.deepEqual(await f.app.requestRun(undefined, 'test'), {status: 'empty', completed: 0, total: 0});
    assert.equal(f.calls.length, 0);
  } finally {
    await f.cleanup();
  }
});

test('scan error is distinct from legal empty', async () => {
  const f = await fixture({createRoot: false, managedScriptRoot: false, scriptNames: []});
  try {
    assert.equal(f.app.state().viewState, 'error');
    assert.equal(f.app.state().scriptCount, 0);
    assert.equal(f.app.state().loadError.code, 'SCRIPT_ROOT_NOT_FOUND');
    const window = f.ui.windows[0];
    assert.equal(window.control('emptyTitle').state.visible, false);
    assert.equal(window.control('errorTitle').state.visible, true);
    assert.equal(f.toolbar.buttons.get('run').disabled, true);
  } finally {
    await f.cleanup();
  }
});

test('managed default script root is created and becomes legal empty', async () => {
  const f = await fixture({createRoot: false, managedScriptRoot: true, scriptNames: []});
  try {
    assert.equal(fs.statSync(f.scriptRoot).isDirectory(), true);
    assert.equal(f.app.state().viewState, 'empty');
    assert.equal(f.app.state().loadError, null);
  } finally {
    await f.cleanup();
  }
});

test('Stop immediately after Run cancels before Command.run can start', async () => {
  const f = await fixture({openListOnStart: false});
  try {
    const pending = f.toolbar.buttons.get('run').callback();
    const stopped = await f.toolbar.buttons.get('stop').callback();
    const outcome = await pending;
    assert.equal(stopped, true);
    assert.deepEqual(outcome, {status: 'canceled', completed: 0, total: 1});
    assert.equal(f.calls.length, 0);
    assert.equal(f.app.state().running, false);
  } finally {
    await f.cleanup();
  }
});

test('Stop aborts an in-flight child and prevents the remaining selected queue', async () => {
  let firstSignal;
  let started = 0;
  const command = {
    run(executable, args, options) {
      started++;
      firstSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), {code: 'CANCELED'})), {once: true});
      });
    },
  };
  const f = await fixture({scriptNames: ['a.js', 'b.js'], command});
  try {
    const pending = selectAllAndRun(f);
    for (let i = 0; i < 20 && started === 0; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(started, 1);
    assert.ok(firstSignal);
    assert.equal(await f.toolbar.buttons.get('stop').callback(), true);
    const outcome = await pending;
    assert.equal(firstSignal.aborted, true);
    assert.deepEqual(outcome, {status: 'canceled', completed: 0, total: 2});
    assert.equal(started, 1);
  } finally {
    await f.cleanup();
  }
});

test('Run Selected follows current list order and gives each child a distinct log directory', async () => {
  const f = await fixture({scriptNames: ['a.js', 'b.js'], order: ['b.js', 'a.js']});
  try {
    const outcome = await selectAllAndRun(f);
    assert.deepEqual(outcome, {status: 'succeeded', completed: 2, total: 2});
    assert.deepEqual(f.calls.map(call => path.basename(call.args[1])), ['b.js', 'a.js']);
    assert.equal(f.calls[0].options.signal, f.calls[1].options.signal);
    const firstLog = f.calls[0].args[f.calls[0].args.indexOf('-log-dir') + 1];
    const secondLog = f.calls[1].args[f.calls[1].args.indexOf('-log-dir') + 1];
    assert.notEqual(firstLog, secondLog);
  } finally {
    await f.cleanup();
  }
});

test('queue is fail-fast after the first child failure', async () => {
  let calls = 0;
  const command = {
    async run() {
      calls++;
      throw Object.assign(new Error('fixture failed'), {code: 'EXIT_NONZERO', exitCode: 9});
    },
  };
  const f = await fixture({scriptNames: ['a.js', 'b.js'], command});
  try {
    const outcome = await selectAllAndRun(f);
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.completed, 0);
    assert.equal(outcome.failedScript, 'a.js');
    assert.equal(calls, 1);
  } finally {
    await f.cleanup();
  }
});

test('a canceled run fully releases state so a later run can start', async () => {
  let calls = 0;
  const command = {
    async run() {
      calls++;
      return {exitCode: 0, stdout: '', stderr: ''};
    },
  };
  const f = await fixture({command, openListOnStart: false});
  try {
    const first = f.toolbar.buttons.get('run').callback();
    assert.equal(await f.toolbar.buttons.get('stop').callback(), true);
    assert.equal((await first).status, 'canceled');
    assert.equal(f.app.state().running, false);
    const second = await f.toolbar.buttons.get('run').callback();
    assert.deepEqual(second, {status: 'succeeded', completed: 1, total: 1});
    assert.equal(calls, 1);
  } finally {
    await f.cleanup();
  }
});

test('Run stays owned until final UI cleanup settles, then the next run owns Stop', async () => {
  const f = await fixture({openListOnStart: false});
  let releaseCleanup;
  let cleanupEntered;
  const entered = new Promise(resolve => { cleanupEntered = resolve; });
  const cleanup = new Promise(resolve => { releaseCleanup = resolve; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    const updateButton = f.toolbar.updateButton.bind(f.toolbar);
    let delayCleanup = true;
    let started = false;
    let sawBusy = false;
    f.toolbar.updateButton = async (id, patch) => {
      if (started && id === 'run' && patch.disabled) sawBusy = true;
      if (delayCleanup && sawBusy && id === 'run' && !patch.disabled && !f.app.state().activeRun) {
        delayCleanup = false;
        cleanupEntered();
        await cleanup;
      }
      return updateButton(id, patch);
    };
    started = true;
    const first = f.toolbar.buttons.get('run').callback();
    const stop = f.app.stopRun();
    await entered;
    assert.equal(f.app.state().running, true, 'pending final UI cleanup must retain run ownership');
    assert.equal(f.toolbar.buttons.get('run').callback(), first, 'a repeated Run must join cleanup');
    releaseCleanup();
    assert.equal(await stop, true);
    assert.equal((await first).status, 'canceled');
    assert.equal(f.app.state().activeRun, null);
    assert.equal(f.app.state().running, false);
    const second = f.toolbar.buttons.get('run').callback();
    assert.equal(f.app.state().activeRun.canceled, false);
    assert.equal(await f.app.stopRun(), true);
    assert.equal((await second).status, 'canceled');
    assert.deepEqual(await f.toolbar.buttons.get('run').callback(), {status: 'succeeded', completed: 1, total: 1});
    assert.equal(f.toolbar.buttons.get('run').disabled, false);
    assert.equal(f.toolbar.buttons.get('stop').disabled, true);
    assert.equal(await f.app.stopRun(), false);
  } finally {
    releaseCleanup();
    await f.cleanup();
  }
});
