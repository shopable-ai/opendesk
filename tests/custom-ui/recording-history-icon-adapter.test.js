'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const controllerPath = path.resolve(__dirname, '../../examples/custom-ui/recording-console-simple/controller.js');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');

function defaultDialog() {
  return {
    async alert() {},
    async confirm() { return false; },
    async prompt() { return null; },
  };
}

function loadController(baseUI, rawDialog = defaultDialog()) {
  const toolbar = {};
  const coreApp = {
    async show() {}, async run() {}, async close() {}, async stop() {},
    state: () => ({phase: 'ready'}),
    toolbar: () => toolbar,
  };
  const history = {
    async open() {}, async refresh() {}, async close() {}, async syncAvailability() {},
    isRunActive: () => false, async cancelRun() {},
  };
  const sandbox = {
    console,
    File: {
      join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
      read(file) {
        if (file.endsWith('/controller-core.js')) {
          return `globalThis.OpenDeskSimpleRecordingConsole = { createApp(options) { globalThis.__coreOptions = options; return globalThis.__coreApp; } };`;
        }
        if (file.endsWith('/recording-history.js')) {
          return `globalThis.OpenDeskRecordingHistory = { createManager(options) { globalThis.__historyOptions = options; return globalThis.__history; } };`;
        }
        throw new Error(`unexpected read: ${file}`);
      },
    },
    Execution: {scriptDir: '/scripts'},
    FloatingWindow: function FloatingWindow() {},
    Dialog: rawDialog,
    __coreApp: coreApp,
    __history: history,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(controllerSource, sandbox, {filename: 'controller.js'});
  sandbox.OpenDeskSimpleRecordingConsole.createApp({
    ui: baseUI,
    FloatingWindow: sandbox.FloatingWindow,
    dialog: rawDialog,
  });
  return {
    historyUI: sandbox.__historyOptions.ui,
    coreDialog: sandbox.__coreOptions.dialog,
    historyDialog: sandbox.__historyOptions.dialog,
  };
}

test('history UI adapter keeps built-in icon metadata and supplies visible fallback glyphs', async () => {
  const patches = new Map();
  const baseUI = {
    async createWindow() {
      return {
        id: 'history-window',
        control(id) {
          return {
            on() {},
            async update(patch) {
              patches.set(id, {...patch});
              return patch;
            },
          };
        },
        on() {}, async show() {}, async close() {},
      };
    },
  };

  const {historyUI} = loadController(baseUI);
  const window = await historyUI.createWindow({id: 'history'});

  await window.control('run0').update({icon: 'play.fill', text: ''});
  await window.control('rename0').update({icon: 'pencil', text: ''});
  await window.control('open0').update({icon: 'folder.fill', text: ''});
  await window.control('delete0').update({icon: 'trash.fill', text: ''});

  assert.deepEqual(patches.get('run0'), {icon: 'play.fill', text: '▶'});
  assert.deepEqual(patches.get('rename0'), {icon: 'pencil', text: '✎'});
  assert.deepEqual(patches.get('open0'), {icon: 'folder.fill', text: '📁'});
  assert.deepEqual(patches.get('delete0'), {icon: 'trash.fill', text: '🗑'});
});

test('history UI adapter does not replace explicit labels or unknown icons', async () => {
  const patches = [];
  const baseUI = {
    async createWindow() {
      return {
        control() {
          return {on() {}, async update(patch) { patches.push({...patch}); return patch; }};
        },
        on() {}, async show() {}, async close() {},
      };
    },
  };

  const {historyUI} = loadController(baseUI);
  const window = await historyUI.createWindow({id: 'history'});
  await window.control('refreshHistory').update({icon: 'play.fill', text: '刷新'});
  await window.control('futureAction').update({icon: 'unknown.icon', text: ''});

  assert.deepEqual(patches[0], {icon: 'play.fill', text: '刷新'});
  assert.deepEqual(patches[1], {icon: 'unknown.icon', text: ''});
});

test('shared Dialog coordinator reports modal overlap and recovers after DIALOG_BUSY', async () => {
  let resolveFirstConfirm;
  const calls = [];
  const rawDialog = {
    async alert(spec) { calls.push(['alert', spec]); },
    confirm(spec) {
      calls.push(['confirm', spec]);
      return new Promise(resolve => { resolveFirstConfirm = resolve; });
    },
    async prompt(spec) { calls.push(['prompt', spec]); return 'value'; },
    getCapabilities() { return {supported: true}; },
  };
  const baseUI = {async createWindow() { return {control() { return null; }}; }};
  const {coreDialog, historyDialog} = loadController(baseUI, rawDialog);

  assert.equal(coreDialog, historyDialog, 'core and History must share one modal gate');
  assert.deepEqual(coreDialog.getCapabilities(), {supported: true});

  const first = coreDialog.confirm({title: 'first'});
  assert.deepEqual(historyDialog.getState().active, true);
  for (const [method, spec] of [
    ['confirm', {title: 'second'}],
    ['prompt', {title: 'rename'}],
    ['alert', {title: 'error'}],
  ]) {
    await assert.rejects(
      () => historyDialog[method](spec),
      error => error.code === 'DIALOG_BUSY' && error.operation === `Dialog.${method}`,
    );
  }
  assert.equal(calls.length, 1, 'overlapping modal calls must not reach native Dialog');
  resolveFirstConfirm(true);
  assert.equal(await first, true);
  assert.equal(historyDialog.getState().active, false);

  rawDialog.confirm = async () => {
    const error = new Error('Dialog.confirm: DIALOG_BUSY: only one modal dialog may be active in an execution');
    error.code = 'DIALOG_BUSY';
    throw error;
  };
  await assert.rejects(
    () => historyDialog.confirm({title: 'delete'}),
    error => error.code === 'DIALOG_BUSY' && error.operation === 'Dialog.confirm',
    'native DIALOG_BUSY must be explicit rather than imitating user cancel',
  );
  assert.equal(historyDialog.getState().active, false, 'native DIALOG_BUSY must release the shared gate');

  rawDialog.prompt = async () => {
    throw new Error('Dialog.prompt: DIALOG_BUSY: only one modal dialog may be active in an execution');
  };
  await assert.rejects(
    () => coreDialog.prompt({title: 'rename'}),
    error => error.code === 'DIALOG_BUSY' && error.operation === 'Dialog.prompt',
  );
  rawDialog.confirm = async spec => { calls.push(['confirm-recovered', spec]); return false; };
  assert.equal(await historyDialog.confirm({title: 'after-busy'}), false);
  assert.equal(historyDialog.getState().active, false);
});
