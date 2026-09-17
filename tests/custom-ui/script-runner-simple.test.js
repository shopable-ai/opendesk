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
    remove: p => fs.unlinkSync(p),
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
        hidden: false,
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
        async show() { this.shown = true; this.hidden = false; },
        async hide() { this.hidden = true; this.shown = false; },
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
    constructor(spec) {
      current = this;
      this.spec = spec;
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
  const confirmations = [];
  const command = options.command || {
    async run(executable, args, commandOptions) {
      calls.push({executable, args, options: commandOptions});
      return {exitCode: 0, stdout: '', stderr: ''};
    },
  };
  const app = Runner.createApp({
    scriptRoot,
    flowCatalog: options.flowCatalog === true,
    managedScriptRoot: options.managedScriptRoot !== false,
    openListOnStart: options.openListOnStart !== false,
    hideListOnClose: options.hideListOnClose === true,
    file: options.file || FileAPI(),
    command,
    execution: {workdir: temp},
    system: {getExecutablePath: () => '/fake/opendesk', getPlatformInfo: () => ({os: 'darwin'})},
    ui,
    dialog: options.dialog || {
      async confirm(spec) {
        confirmations.push(spec);
        return false;
      },
    },
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
  return {temp, scriptRoot, ui, toolbar, calls, confirmations, app, appRun, cleanup};
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

test('toolbar can start without a list and defaults to the active display bottom-right corner', async () => {
  const f = await fixture({openListOnStart: false});
  try {
    assert.equal(f.ui.windows.length, 0);
    assert.deepEqual(f.toolbar.spec.position, {
      mode: 'anchor',
      horizontal: 'right',
      vertical: 'bottom',
      margin: 16,
      display: 'active',
    });
  } finally {
    await f.cleanup();
  }
});

test('prepared list stays hidden until open and reuses the same normal window after hide', async () => {
  const f = await fixture({openListOnStart: false, hideListOnClose: true});
  try {
    const prepared = await f.app.prepareList();
    assert.equal(f.ui.windows.length, 1);
    assert.equal(prepared, f.ui.windows[0]);
    assert.equal(prepared.spec.kind, 'normal');
    assert.equal(prepared.spec.alwaysOnTop, false);
    assert.equal(prepared.shown, false);
    assert.equal(f.app.state().listPrepared, true);
    assert.equal(f.app.state().listVisible, false);
    assert.equal(f.toolbar.buttons.get('list').active, false);

    const opened = await f.app.openList('tray');
    assert.equal(opened, prepared);
    assert.equal(prepared.shown, true);
    assert.equal(f.app.state().listVisible, true);
    assert.equal(f.toolbar.buttons.get('list').active, false, 'the toolbar list button now owns only the compact selector state');

    await click(prepared, 'closeList');
    assert.equal(prepared.hidden, true);
    assert.equal(f.app.state().listVisible, false);
    assert.equal(f.toolbar.buttons.get('list').active, false);

    assert.equal(await f.app.openList('reopen'), prepared);
    assert.equal(f.ui.windows.length, 1);
    assert.equal(prepared.spec.alwaysOnTop, false, 'reopening must not promote the reused list window');
  } finally {
    await f.cleanup();
  }
});

test('automation list uses compact icon controls with accessible labels', () => {
  const html = Runner.buildListHTML([{name: 'daily-report.js'}], {
    configValid: true,
    configError: '',
    loadError: null,
    loading: false,
    running: false,
    rowCapacity: 32,
    selectedNames: new Set(),
    scriptRoot: '/tmp/recipes',
    statusMessage: '',
  });

  assert.match(html, /id="name0"[^>]*data-icon="doc\.text\.fill"/);
  assert.match(html, /id="run0"[^>]*class="run icon-button"[^>]*data-icon="play\.fill"[^>]*aria-label="[^"]+"/);
  assert.match(html, /id="up0"[^>]*data-icon="square\.and\.arrow\.up"/);
  assert.match(html, /id="down0"[^>]*data-icon="square\.and\.arrow\.down"/);
  assert.match(html, /id="delete0"[^>]*class="delete icon-button"[^>]*data-icon="trash"[^>]*aria-label="删除第 1 个自动化"/);
  for (const [id, icon] of [
    ['runSelected', 'play.fill'],
    ['stopRun', 'stop.fill'],
    ['openDirectory', 'folder.fill'],
    ['refresh', 'arrow.clockwise'],
    ['restoreOrder', 'arrow.counterclockwise'],
    ['closeList', 'xmark'],
  ]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*class="[^"]*icon-button[^"]*"[^>]*data-icon="${icon.replace('.', '\\.') }"[^>]*title="[^"]+"[^>]*aria-label="[^"]+"`));
  }
  assert.match(html, /id="emptyRefresh"[^>]*aria-label="空列表时刷新自动化列表"/);
  assert.match(html, /id="errorRefresh"[^>]*aria-label="加载失败后重新扫描自动化目录"/);
});

test('compact selector presents current selection and makes overflow discoverable without changing its five-row layout', () => {
  const html = Runner.buildCompactSelectorHTML([
    {name: 'a.js'}, {name: 'b.js'}, {name: 'c.js'},
    {name: 'd.js'}, {name: 'e.js'}, {name: 'f.js'},
  ], 'b.js');

  assert.match(html, /当前脚本<\/span><strong>b\.js<\/strong><span class="compact-count">共 6 个 · 可滚动查看/);
  assert.match(html, /class="compact-list has-overflow"/);
  assert.match(html, /class="compact-script selected"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(html, /<p class="compact-title">选择脚本<\/p>/);
});

test('automation list keeps Runtime-hidden icon and grid controls out of layout', async () => {
  const f = await fixture({scriptNames: ['a.js']});
  try {
    const window = f.ui.windows[0];
    assert.match(window.spec.content.css, /\[hidden\]\{display:none!important\}/);
    for (const id of ['emptyOpenDirectory', 'emptyRefresh', 'errorRefresh', 'name1', 'run1', 'up1', 'down1', 'delete1']) {
      assert.equal(window.control(id).state.visible, false, `${id} must stay hidden in the ready layout`);
    }
  } finally {
    await f.cleanup();
  }
});

test('empty startup still creates the main list page with legal empty actions', async () => {
  const f = await fixture({scriptNames: []});
  try {
    assert.equal(f.ui.windows.length, 1);
    const window = f.ui.windows[0];
    assert.equal(window.shown, true);
    assert.equal(f.app.state().viewState, 'empty');
    assert.equal(f.app.state().selectedScriptName, null);
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
    assert.equal(f.app.state().selectedScriptName, 'a.js');
    assert.equal(window.control('emptyTitle').state.visible, false);
    assert.equal(window.control('name0').state.text, 'a.js');
    assert.equal(window.control('name0').state.visible, true);
    assert.equal(f.toolbar.buttons.get('run').disabled, false);
  } finally {
    await f.cleanup();
  }
});

test('App Mode list close hides and reopens the same main window', async () => {
  const f = await fixture({hideListOnClose: true});
  try {
    const window = f.ui.windows[0];
    await click(window, 'closeList');
    assert.equal(window.hidden, true);
    assert.equal(window.closed, false);

    await f.app.openList('reopen');
    assert.equal(f.ui.windows.length, 1);
    assert.equal(f.ui.windows[0], window);
    assert.equal(window.shown, true);
    assert.equal(window.hidden, false);
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
    assert.equal(f.app.state().selectedScriptName, null);
    assert.deepEqual(f.app.state().selectedNames, []);
    assert.equal(window.control('name0').state.visible, false);
    assert.equal(window.control('emptyTitle').state.visible, true);
    assert.equal(f.toolbar.buttons.get('run').disabled, true);
  } finally {
    await f.cleanup();
  }
});

test('row Delete requires explicit confirmation, removes the local file, and selects the next automation', async () => {
  let accepted = false;
  const confirmations = [];
  const f = await fixture({
    scriptNames: ['a.js', 'b.js'],
    dialog: {
      async confirm(spec) {
        confirmations.push(spec);
        return accepted;
      },
    },
  });
  try {
    const window = f.ui.windows[0];
    assert.equal(await click(window, 'delete0'), false);
    assert.equal(fs.existsSync(path.join(f.scriptRoot, 'a.js')), true);
    assert.equal(confirmations[0].defaultAction, 'cancel');
    assert.equal(confirmations[0].confirmText, '永久删除');
    assert.match(confirmations[0].message, /a\.js/);
    assert.match(confirmations[0].message, /不能撤销/);

    accepted = true;
    assert.equal(await click(window, 'delete0'), true);
    assert.equal(fs.existsSync(path.join(f.scriptRoot, 'a.js')), false);
    assert.deepEqual(f.app.scripts().map(script => script.name), ['b.js']);
    assert.equal(f.app.state().selectedScriptName, 'b.js');
    assert.equal(f.app.state().pendingDeleteName, null);
    assert.equal(window.control('name0').state.text, 'b.js');
    assert.equal(window.control('delete0').state.disabled, false);
    assert.equal(window.control('delete1').state.visible, false);
    const config = JSON.parse(fs.readFileSync(path.join(f.scriptRoot, '.opendesk-runner.json'), 'utf8'));
    assert.deepEqual(config.order, ['b.js']);
  } finally {
    await f.cleanup();
  }
});

test('row Delete uninstalls a Flow without removing its independent business data', async () => {
  const installId = 'flow-' + 'd'.repeat(32);
  const calls = [];
  const catalog = JSON.stringify({
    ok: true,
    result: {flows: [{installId, name: 'Daily Export', state: 'ready'}]},
  });
  const f = await fixture({
    flowCatalog: true,
    scriptNames: [],
    dialog: {confirm: async () => true},
    command: {
      async run(executable, args, options) {
        calls.push({executable, args, options});
        if (args[0] === 'flow' && args[1] === 'list') {
          return {exitCode: 0, stdout: catalog, stderr: ''};
        }
        if (args[0] === 'flow' && args[1] === 'uninstall') {
          return {exitCode: 0, stdout: JSON.stringify({ok: true, result: {installId}}), stderr: ''};
        }
        throw new Error(`unexpected command: ${args.join(' ')}`);
      },
    },
  });
  try {
    const window = f.ui.windows[0];
    assert.equal(await click(window, 'delete0'), true);
    const uninstall = calls.find(call => call.args[0] === 'flow' && call.args[1] === 'uninstall');
    assert.deepEqual(uninstall.args, ['flow', 'uninstall', installId]);
    assert.equal(uninstall.args.includes('--remove-data'), false);
    assert.deepEqual(f.app.scripts(), []);
    assert.equal(f.app.state().viewState, 'empty');
    assert.equal(f.app.state().selectedScriptName, null);
    assert.equal(window.control('emptyTitle').state.visible, true);
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

test('list keeps Stop visible and wired while its Floating Toolbar is covered', async () => {
  let started = 0;
  const command = {
    run(executable, args, options) {
      started++;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), {code: 'CANCELED'})), {once: true});
      });
    },
  };
  const f = await fixture({command});
  try {
    const window = f.ui.windows[0];
    const pending = click(window, 'run0');
    for (let i = 0; i < 20 && started === 0; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(started, 1);
    assert.equal(window.control('stopRun').state.disabled, false);
    assert.equal(await click(window, 'stopRun'), true);
    assert.deepEqual(await pending, {status: 'canceled', completed: 0, total: 1});
    assert.equal(window.control('stopRun').state.disabled, true);
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

test('compact selector defaults to first sorted script and keeps toolbar label in sync', async () => {
  const f = await fixture({openListOnStart: false, scriptNames: ['c.js', 'a.js', 'b.js']});
  try {
    await waitFor(
      () => f.app.state().scriptCount === 3 && f.toolbar.labels.get('script').text === 'a.js',
      'script load and toolbar synchronization',
    );
    assert.deepEqual(f.app.scripts().map(script => script.name), ['a.js', 'b.js', 'c.js']);
    assert.equal(f.app.state().selectedScriptName, 'a.js');
    assert.equal(f.toolbar.labels.get('script').text, 'a.js');
  } finally {
    await f.cleanup();
  }
});

test('compact selector changes selected script without auto-running and closes after selection', async () => {
  const f = await fixture({openListOnStart: false, scriptNames: ['a.js', 'b.js', 'c.js']});
  try {
    await f.toolbar.buttons.get('list').callback();
    assert.equal(f.app.state().selectorVisible, true);
    assert.equal(f.app.state().listVisible, false);
    const selector = f.ui.windows[0];
    assert.match(selector.spec.content.html, /当前脚本<\/span><strong>a\.js<\/strong><span class="compact-count">共 3 个/);
    assert.match(selector.spec.content.css, /overflow-y:auto/);
    await click(selector, 'compactScript1');
    assert.equal(f.app.state().selectedScriptName, 'b.js');
    assert.equal(f.app.state().selectorVisible, false);
    assert.equal(f.toolbar.labels.get('script').text, 'b.js');
    assert.equal(f.calls.length, 0);
  } finally {
    await f.cleanup();
  }
});

test('toolbar Run executes selected script rather than the first script', async () => {
  const f = await fixture({openListOnStart: false, scriptNames: ['a.js', 'b.js', 'c.js']});
  try {
    assert.equal(await f.app.selectScript('b.js'), true);
    const outcome = await f.toolbar.buttons.get('run').callback();
    assert.deepEqual(outcome, {status: 'succeeded', completed: 1, total: 1});
    assert.equal(f.calls.length, 1);
    assert.equal(path.basename(f.calls[0].args[1]), 'b.js');
    assert.equal(f.app.state().selectedScriptName, 'b.js');
  } finally {
    await f.cleanup();
  }
});

test('Flow Catalog entries use stable install identity, manifest display name, and explicit flow run', async () => {
  const installId = 'flow-' + 'a'.repeat(32);
  const catalog = JSON.stringify({
    ok: true,
    command: 'flow.list',
    result: {flows: [{installId, name: 'Export Orders', state: 'ready'}]},
  });
  const fCalls = [];
  const f = await fixture({
    flowCatalog: true,
    scriptNames: [],
    command: {
      async run(executable, args, options) {
        fCalls.push({executable, args, options});
        if (args[0] === 'flow' && args[1] === 'list') return {exitCode: 0, stdout: catalog, stderr: ''};
        if (args[0] === 'flow' && args[1] === 'run') return {exitCode: 0, stdout: '', stderr: ''};
        throw new Error(`unexpected command: ${args.join(' ')}`);
      },
    },
  });
  try {
    assert.deepEqual(f.app.scripts().map(script => ({name: script.name, displayName: script.displayName, kind: script.kind})), [
      {name: `flow:${installId}`, displayName: 'Export Orders', kind: 'flow'},
    ]);
    assert.equal(f.app.state().selectedScriptName, `flow:${installId}`);
    assert.equal(f.toolbar.labels.get('script').text, 'Export Orders');
    assert.equal(fCalls.filter(call => call.args[0] === 'flow' && call.args[1] === 'run').length, 0);
    const outcome = await f.toolbar.buttons.get('run').callback();
    assert.deepEqual(outcome, {status: 'succeeded', completed: 1, total: 1});
    const flowRun = fCalls.find(call => call.args[0] === 'flow' && call.args[1] === 'run');
    assert.deepEqual(flowRun.args.slice(0, 3), ['flow', 'run', installId]);
    assert.equal(flowRun.args.includes('-script'), false);
  } finally {
    await f.cleanup();
  }
});

test('plain JS and MJS imports remain discoverable as local Flow records until explicit run', async () => {
  const installId = 'local-' + 'b'.repeat(32);
  const calls = [];
  const f = await fixture({
    flowCatalog: true,
    scriptNames: [],
    command: {
      async run(executable, args, options) {
        calls.push({executable, args, options});
        if (args[0] === 'flow' && args[1] === 'list') {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ok: true, result: {flows: [{installId, name: '本地 MJS Flow', state: 'ready', origin: 'js'}]}}),
            stderr: '',
          };
        }
        if (args[0] === 'flow' && args[1] === 'run') return {exitCode: 0, stdout: '', stderr: ''};
        throw new Error(`unexpected command: ${args.join(' ')}`);
      },
    },
  });
  try {
    assert.deepEqual(f.app.scripts().map(script => ({name: script.name, displayName: script.displayName})), [
      {name: `flow:${installId}`, displayName: '本地 MJS Flow'},
    ]);
    assert.equal(calls.some(call => call.args[0] === 'flow' && call.args[1] === 'run'), false);
    await f.toolbar.buttons.get('run').callback();
    assert.deepEqual(calls.find(call => call.args[0] === 'flow' && call.args[1] === 'run').args.slice(0, 3), ['flow', 'run', installId]);
  } finally {
    await f.cleanup();
  }
});

test('Runner keeps bare odpkg on the protected -script path and displays authenticated package metadata', async () => {
  const fCalls = [];
  const f = await fixture({
    flowCatalog: true,
    scriptNames: ['sealed.odpkg'],
    command: {
      async run(executable, args, options) {
        fCalls.push({executable, args, options});
        if (args[0] === 'flow' && args[1] === 'list') return {exitCode: 0, stdout: JSON.stringify({ok: true, result: {flows: []}}), stderr: ''};
        if (args[0] === 'package' && args[1] === 'inspect') {
          return {exitCode: 0, stdout: JSON.stringify({ok: true, result: {manifest: {packageId: 'protected-export'}}}), stderr: ''};
        }
        if (args[0] === '-script') return {exitCode: 0, stdout: '', stderr: ''};
        throw new Error(`unexpected command: ${args.join(' ')}`);
      },
    },
  });
  try {
    assert.equal(f.app.scripts()[0].displayName, 'protected-export');
    assert.equal(f.toolbar.labels.get('script').text, 'protected-export');
    assert.equal(fCalls.filter(call => call.args[0] === '-script').length, 0);
    const outcome = await f.toolbar.buttons.get('run').callback();
    assert.equal(outcome.status, 'succeeded');
    const runCall = fCalls.find(call => call.args[0] === '-script');
    assert(runCall, 'bare odpkg was not sent through -script');
    assert.equal(runCall.args[1].endsWith('sealed.odpkg'), true);
  } finally {
    await f.cleanup();
  }
});

test('running disables Run and compact selection while Stop remains enabled', async () => {
  let started = 0;
  let release;
  const command = {
    run() {
      started++;
      return new Promise(resolve => { release = () => resolve({exitCode: 0, stdout: '', stderr: ''}); });
    },
  };
  const f = await fixture({openListOnStart: false, scriptNames: ['a.js', 'b.js', 'c.js'], command});
  try {
    await f.app.selectScript('b.js');
    const pending = f.toolbar.buttons.get('run').callback();
    await waitFor(() => started === 1, 'selected script run');
    assert.equal(f.toolbar.buttons.get('run').disabled, true);
    assert.equal(f.toolbar.buttons.get('stop').disabled, false);
    assert.equal(f.toolbar.buttons.get('list').disabled, true);
    assert.equal(await f.app.selectScript('c.js'), false);
    assert.equal(f.app.state().selectedScriptName, 'b.js');
    release();
    assert.equal((await pending).status, 'succeeded');
  } finally {
    await f.cleanup();
  }
});

test('refresh preserves selected script by name and selects the old-order successor when it disappears', async () => {
  const f = await fixture({openListOnStart: false, scriptNames: ['a.js', 'b.js', 'c.js']});
  try {
    await f.app.selectScript('b.js');
    assert.equal(await f.app.rescan(), true);
    assert.equal(f.app.state().selectedScriptName, 'b.js');
    fs.rmSync(path.join(f.scriptRoot, 'b.js'));
    assert.equal(await f.app.rescan(), true);
    assert.equal(f.app.state().selectedScriptName, 'c.js');
    assert.equal(f.toolbar.labels.get('script').text, 'c.js');
  } finally {
    await f.cleanup();
  }
});

test('Manage scripts closes compact selector and opens the existing full manager', async () => {
  const f = await fixture({openListOnStart: false, scriptNames: ['a.js', 'b.js']});
  try {
    await f.toolbar.buttons.get('list').callback();
    const selector = f.ui.windows[0];
    await click(selector, 'compactManage');
    assert.equal(f.app.state().selectorVisible, false);
    assert.equal(f.app.state().listVisible, true);
    assert.equal(f.ui.windows.length, 2);
    const manager = f.ui.windows[1];
    assert.equal(manager.shown, true);
    assert.match(manager.spec.content.html, /id="runSelected"/);
    assert.match(manager.spec.content.html, /id="restoreOrder"/);
  } finally {
    await f.cleanup();
  }
});

test('script-list toolbar button toggles only the compact selector', async () => {
  const f = await fixture({openListOnStart: false, scriptNames: ['a.js', 'b.js']});
  try {
    await f.toolbar.buttons.get('list').callback();
    assert.equal(f.app.state().selectorVisible, true);
    assert.equal(f.app.state().listVisible, false);
    assert.equal(f.toolbar.buttons.get('list').active, true);
    await f.toolbar.buttons.get('list').callback();
    assert.equal(f.app.state().selectorVisible, false);
    assert.equal(f.app.state().listVisible, false);
    assert.equal(f.toolbar.buttons.get('list').active, false);
  } finally {
    await f.cleanup();
  }
});
