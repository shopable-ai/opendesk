'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load(relative) {
  const filename = path.join(__dirname, '..', '..', relative);
  vm.runInThisContext(fs.readFileSync(filename, 'utf8'), {filename});
}

test('10 logical Run actions produce exactly 10 ui_action events across pointer and keyboard', async () => {
  delete globalThis.OpenDeskProductAnalyticsIntegration;
  delete globalThis.OpenDeskFlowRunnerShortcutController;
  load('apps/opendesk/product-analytics/integration.js');
  load('apps/opendesk/flow-runner/shortcut-controller.js');

  const analytics = [];
  const screens = [];
  const client = {
    uiAction(surface, actionId, inputMethod) {
      analytics.push({surface, actionId, inputMethod});
      return Promise.resolve({accepted: true});
    },
    screenViewed(surface) {
      screens.push(surface);
      return Promise.resolve({accepted: true});
    },
  };

  const nativeWindows = [];
  class FakeFloatingWindow {
    constructor() {
      this.buttons = new Map();
      this.handlers = new Map();
      this.closed = false;
      this.closedPromise = new Promise(resolve => { this.resolveClosed = resolve; });
      nativeWindows.push(this);
    }
    addButton(id, _label, _icon, callback) { this.buttons.set(id, callback); }
    addLabel() {}
    addSeparator() {}
    updateButton() { return Promise.resolve({}); }
    updateLabel() { return Promise.resolve({}); }
    getButtonState() { return Promise.resolve({screenBounds: {x: 0, y: 0, width: 20, height: 20}}); }
    getState() { return Promise.resolve({bounds: {x: 0, y: 0, width: 300, height: 40}}); }
    on(name, callback) { this.handlers.set(name, callback); }
    onError() {}
    show() { return Promise.resolve({bounds: {x: 0, y: 0, width: 300, height: 40}}); }
    waitUntilClosed() { return this.closedPromise; }
    hide() { return Promise.resolve(); }
    close() {
      if (!this.closed) {
        this.closed = true;
        const callback = this.handlers.get('close');
        if (callback) callback({type: 'close'});
        this.resolveClosed();
      }
      return Promise.resolve();
    }
  }

  const shortcuts = new Map();
  const globalShortcut = {
    register(accelerator, callback) { shortcuts.set(accelerator, callback); },
    unregister(accelerator) { shortcuts.delete(accelerator); },
  };

  const entry = {name: 'recipe.js'};
  const BaseController = {
    createApp(settings) {
      const toolbar = new settings.FloatingWindow({});
      let runs = 0;
      let stops = 0;
      const api = {
        async run() {
          await toolbar.updateButton('run', {disabled: false});
          await toolbar.updateButton('stop', {disabled: true});
          await toolbar.show();
          await toolbar.waitUntilClosed();
        },
        requestRun() { runs++; return Promise.resolve({status: 'succeeded'}); },
        stopRun() { stops++; return Promise.resolve(true); },
        entries() { return [entry]; },
        state() { return {selectedEntryKey: entry.name, running: false, activeRun: null, runs, stops}; },
      };
      toolbar.addButton('run', 'Run', 'play.fill', () => api.requestRun([entry], 'toolbar'));
      toolbar.addButton('stop', 'Stop', 'stop.fill', () => api.stopRun('toolbar'));
      toolbar.addButton('previous', 'Previous', 'backward.fill', () => true);
      toolbar.addButton('next', 'Next', 'forward.fill', () => true);
      toolbar.addButton('list', 'List', 'list.bullet', () => true);
      return Object.freeze(api);
    },
  };

  const AnalyticsController = OpenDeskProductAnalyticsIntegration.wrapController(BaseController, {client});
  const Controller = OpenDeskFlowRunnerShortcutController.wrapController(AnalyticsController, {
    globalShortcut,
    system: {getPlatformInfo: () => ({os: 'darwin'})},
    console: {warn() {}},
  });
  const app = Controller.createApp({FloatingWindow: FakeFloatingWindow});
  const lifecycle = app.run();

  for (let i = 0; i < 20 && !shortcuts.has('CommandOrControl+Alt+R'); i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(nativeWindows.length, 1);
  assert.equal(screens.length, 1, 'screen_viewed must follow one real show()');

  const native = nativeWindows[0];
  for (let i = 0; i < 5; i++) await native.buttons.get('run')();
  const keyboardRun = shortcuts.get('CommandOrControl+Alt+R');
  assert.equal(typeof keyboardRun, 'function', 'Run shortcut was not registered');
  for (let i = 0; i < 5; i++) await keyboardRun();

  const runs = analytics.filter(event => event.actionId === 'flow.run');
  assert.equal(runs.length, 10, JSON.stringify(analytics));
  assert.equal(runs.filter(event => event.inputMethod === 'pointer').length, 5);
  assert.equal(runs.filter(event => event.inputMethod === 'keyboard').length, 5);
  assert.ok(runs.every(event => event.surface === 'flow_runner'));

  await native.close();
  await lifecycle;
});
