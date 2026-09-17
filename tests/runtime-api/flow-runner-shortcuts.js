'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

const controllerFile = File.join(
  Execution.scriptDir,
  '..', '..',
  'apps', 'opendesk', 'flow-runner', 'shortcut-controller.js',
);
(0, eval)(File.read(controllerFile) + '\n//# sourceURL=' + controllerFile);

if (!globalThis.OpenDeskFlowRunnerShortcutController
  || typeof OpenDeskFlowRunnerShortcutController.wrapController !== 'function') {
  throw new Error('OpenDesk Flow Runner shortcut controller did not load');
}

function createHarness(platform, conflictAccelerator) {
  const registrations = new Map();
  const buttonLabels = new Map();
  let toolbar = null;
  let state = {
    selectedEntryKey: 'demo.js',
    running: false,
    activeRun: null,
  };

  const shortcut = {
    register(accelerator, callback) {
      if (accelerator === conflictAccelerator) {
        const error = new Error('shortcut already registered');
        error.code = 'ALREADY_REGISTERED';
        throw error;
      }
      if (registrations.has(accelerator)) {
        throw new Error('duplicate shortcut registration: ' + accelerator);
      }
      registrations.set(accelerator, callback);
    },
    unregister(accelerator) {
      registrations.delete(accelerator);
    },
  };

  class FakeFloatingWindow {
    constructor() {
      this.handlers = new Map();
      toolbar = this;
    }
    addButton(id, label, icon, callback) {
      buttonLabels.set(id, label);
      this[id + 'Callback'] = callback;
    }
    addLabel() {}
    addSeparator() {}
    updateLabel() { return {}; }
    getButtonState() { return null; }
    getState() { return {}; }
    on(event, callback) { this.handlers.set(event, callback); }
    onError() {}
    async show() { return {bounds: {x: 0, y: 0, width: 320, height: 48}}; }
    waitUntilClosed() { return new Promise(() => {}); }
    async hide() { return null; }
    async close() {
      const callback = this.handlers.get('close');
      if (callback) callback({type: 'close'});
      return null;
    }
    updateButton(id, patch) {
      return {id, patch};
    }
  }

  const BaseController = {
    createApp(settings) {
      const window = new settings.FloatingWindow({});
      window.addButton('run', '运行', 'play.fill', () => app.requestRun([{name: 'demo.js'}], 'button'));
      window.addButton('stop', '停止', 'stop.fill', () => app.stopRun());
      window.updateButton('run', {disabled: false, active: false});
      window.updateButton('stop', {disabled: true, active: false});

      const app = {
        entries() { return [{name: 'demo.js', kind: 'javascript'}]; },
        state() { return Object.assign({}, state); },
        async showToolbar() { return window.show(); },
        async closeToolbar() { return window.close(); },
        requestRun() {
          state = {
            selectedEntryKey: 'demo.js',
            running: true,
            activeRun: {current: {name: 'demo.js'}},
          };
          window.updateButton('run', {disabled: true, active: true});
          window.updateButton('stop', {disabled: false, active: false});
          return Promise.resolve({status: 'running'});
        },
        async stopRun() {
          state = {
            selectedEntryKey: 'demo.js',
            running: false,
            activeRun: null,
          };
          window.updateButton('stop', {disabled: true, active: false});
          window.updateButton('run', {disabled: false, active: false});
          return true;
        },
      };
      return app;
    },
  };

  const wrapped = OpenDeskFlowRunnerShortcutController.wrapController(BaseController, {
    globalShortcut: shortcut,
    system: {getPlatformInfo() { return {os: platform}; }},
    console: {warn() {}},
  });
  const app = wrapped.createApp({FloatingWindow: FakeFloatingWindow});
  return {app, registrations, buttonLabels, toolbar: () => toolbar};
}

async function main() {
  const shortcuts = OpenDeskFlowRunnerShortcutController.shortcuts;
  assert(shortcuts.run === 'CommandOrControl+Alt+R', 'Run accelerator drifted');
  assert(shortcuts.stop === 'CommandOrControl+Alt+X', 'Stop accelerator drifted');

  const mac = createHarness('darwin');
  assert(mac.buttonLabels.get('run') === '运行（⌘⌥R）', 'macOS Run tooltip label missing shortcut');
  assert(mac.buttonLabels.get('stop') === '停止（⌘⌥X）', 'macOS Stop tooltip label missing shortcut');

  await mac.app.showToolbar();
  assert(mac.registrations.size === 1, 'idle runner must own exactly one shortcut');
  assert(mac.registrations.has(shortcuts.run), 'idle runner must register Run');
  assert(!mac.registrations.has(shortcuts.stop), 'idle runner must not register Stop');

  await mac.registrations.get(shortcuts.run)();
  assert(mac.registrations.size === 1, 'running runner must still own exactly one shortcut');
  assert(!mac.registrations.has(shortcuts.run), 'Run must be released once execution starts');
  assert(mac.registrations.has(shortcuts.stop), 'running runner must register Stop');

  await mac.registrations.get(shortcuts.stop)();
  assert(mac.registrations.size === 1, 'idle runner must return to one shortcut after stopping');
  assert(mac.registrations.has(shortcuts.run), 'Run must return after stopping');
  assert(!mac.registrations.has(shortcuts.stop), 'Stop must be released after stopping');

  await mac.app.closeToolbar();
  assert(mac.registrations.size === 0, 'closing runner must release all shortcuts');

  const windows = createHarness('windows');
  assert(windows.buttonLabels.get('run') === '运行（Ctrl+Alt+R）', 'Windows Run tooltip label missing shortcut');
  assert(windows.buttonLabels.get('stop') === '停止（Ctrl+Alt+X）', 'Windows Stop tooltip label missing shortcut');

  const conflict = createHarness('darwin', shortcuts.run);
  await conflict.app.showToolbar();
  assert(conflict.registrations.size === 0, 'shortcut conflict must not leave partial registration');
  const conflictState = conflict.app.state();
  assert(conflictState.player.shortcutError, 'shortcut conflict must remain diagnosable in state');
  assert(conflictState.player.shortcutError.code === 'ALREADY_REGISTERED', 'shortcut conflict code must be preserved');

  console.log('FLOW_RUNNER_SHORTCUTS_OK=' + JSON.stringify({
    run: shortcuts.run,
    stop: shortcuts.stop,
    macRunLabel: mac.buttonLabels.get('run'),
    macStopLabel: mac.buttonLabels.get('stop'),
    windowsRunLabel: windows.buttonLabels.get('run'),
    windowsStopLabel: windows.buttonLabels.get('stop'),
  }));
}

await main();
