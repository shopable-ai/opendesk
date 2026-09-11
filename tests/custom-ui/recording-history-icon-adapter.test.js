'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const controllerPath = path.resolve(__dirname, '../../examples/custom-ui/recording-console-simple/controller.js');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');

function loadController(baseUI) {
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
          return `globalThis.OpenDeskSimpleRecordingConsole = { createApp() { return globalThis.__coreApp; } };`;
        }
        if (file.endsWith('/recording-history.js')) {
          return `globalThis.OpenDeskRecordingHistory = { createManager(options) { globalThis.__historyOptions = options; return globalThis.__history; } };`;
        }
        throw new Error(`unexpected read: ${file}`);
      },
    },
    Execution: {scriptDir: '/scripts'},
    FloatingWindow: function FloatingWindow() {},
    __coreApp: coreApp,
    __history: history,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(controllerSource, sandbox, {filename: 'controller.js'});
  sandbox.OpenDeskSimpleRecordingConsole.createApp({ui: baseUI, FloatingWindow: sandbox.FloatingWindow});
  return sandbox.__historyOptions.ui;
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

  const historyUI = loadController(baseUI);
  const window = await historyUI.createWindow({id: 'history'});

  await window.control('run0').update({icon: 'play.fill', text: ''});
  await window.control('rename0').update({icon: 'pencil', text: ''});
  await window.control('open0').update({icon: 'folder.fill', text: ''});
  await window.control('delete0').update({icon: 'trash.fill', text: ''});

  assert.deepEqual(patches.get('run0'), {icon: 'play.fill', text: '▶'});
  assert.deepEqual(patches.get('rename0'), {icon: 'pencil', text: '✎'});
  assert.deepEqual(patches.get('open0'), {icon: 'folder.fill', text: '📁'});
  assert.deepEqual(patches.get('delete0'), {icon: 'trash.fill', text: '▥'});
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

  const historyUI = loadController(baseUI);
  const window = await historyUI.createWindow({id: 'history'});
  await window.control('refreshHistory').update({icon: 'play.fill', text: '刷新'});
  await window.control('futureAction').update({icon: 'unknown.icon', text: ''});

  assert.deepEqual(patches[0], {icon: 'play.fill', text: '刷新'});
  assert.deepEqual(patches[1], {icon: 'unknown.icon', text: ''});
});
