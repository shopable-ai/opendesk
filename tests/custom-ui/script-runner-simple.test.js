'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const controllerFile = path.join(repo, 'examples/custom-ui/script-runner-simple/controller.js');
vm.runInThisContext(fs.readFileSync(controllerFile, 'utf8'), {filename: controllerFile});
const Runner = globalThis.OpenDeskScriptRunnerSimple;

function FileAPI() {
  return {
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
        async show() {},
        async close() {
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

function fixture(options = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'script-runner-simple-'));
  const scriptRoot = path.join(temp, 'recipes');
  fs.mkdirSync(scriptRoot, {recursive: true});
  const scriptNames = options.scriptNames || ['a.js'];
  for (const name of scriptNames) fs.writeFileSync(path.join(scriptRoot, name), `// ${name}\n`);
  if (options.order) {
    fs.writeFileSync(path.join(scriptRoot, '.opendesk-runner.json'), JSON.stringify({schemaVersion: 1, order: options.order}));
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
    file: FileAPI(),
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

test('Stop immediately after Run cancels before Command.run can start', async () => {
  const f = fixture();
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
  const f = fixture({scriptNames: ['a.js', 'b.js'], command});
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
  const f = fixture({scriptNames: ['a.js', 'b.js'], order: ['b.js', 'a.js']});
  try {
    const outcome = await selectAllAndRun(f);
    assert.deepEqual(outcome, {status: 'succeeded', completed: 2, total: 2});
    assert.deepEqual(f.calls.map(call => path.basename(call.args[1])), ['b.js', 'a.js']);
    assert.equal(f.calls[0].executable, '/fake/opendesk');
    assert.equal(f.calls[1].executable, '/fake/opendesk');
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
  const f = fixture({scriptNames: ['a.js', 'b.js'], command});
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
    async run(executable, args, options) {
      calls++;
      return {exitCode: 0, stdout: '', stderr: ''};
    },
  };
  const f = fixture({command});
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
