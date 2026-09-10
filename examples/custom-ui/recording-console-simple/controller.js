// Thin integration layer for recording-console-simple.
// The previously validated controller implementation is kept byte-for-byte in
// controller-core.js; this file adds the History surface without rewriting the
// Recorder capture/generate/replay state machine.
(function installOpenDeskSimpleRecordingConsoleWithHistory(global) {
  'use strict';

  const file = global.File;
  const execution = global.Execution;
  if (!file || typeof file.join !== 'function' || typeof file.read !== 'function' || !execution || !execution.scriptDir) {
    throw new Error('recording-console-simple history wrapper requires File and Execution.scriptDir');
  }

  const baseDir = file.join(execution.scriptDir, 'recording-console-simple');
  const coreFile = file.join(baseDir, 'controller-core.js');
  const historyFile = file.join(baseDir, 'recording-history.js');

  (0, eval)(file.read(coreFile) + '\n//# sourceURL=' + coreFile);
  const coreAPI = global.OpenDeskSimpleRecordingConsole;
  if (!coreAPI || typeof coreAPI.createApp !== 'function') {
    throw new Error('recording-console-simple core controller did not load');
  }

  (0, eval)(file.read(historyFile) + '\n//# sourceURL=' + historyFile);
  const historyAPI = global.OpenDeskRecordingHistory;
  if (!historyAPI || typeof historyAPI.createManager !== 'function') {
    throw new Error('recording-console-simple history controller did not load');
  }

  function createToolbarAdapter(BaseFloatingWindow, managerRef) {
    if (typeof BaseFloatingWindow !== 'function') {
      throw new Error('recording-console-simple requires FloatingWindow');
    }

    return function HistoryAwareFloatingWindow(options) {
      const input = options || {};
      const toolbarOptions = input.toolbar ? {...input.toolbar} : null;
      if (toolbarOptions && toolbarOptions.maxRows === 1
        && (!Number.isFinite(toolbarOptions.maxColumns) || toolbarOptions.maxColumns < 8)) {
        toolbarOptions.maxColumns = 8;
      }
      const inner = new BaseFloatingWindow(toolbarOptions ? {...input, toolbar: toolbarOptions} : input);
      const wrapper = {};

      const forward = [
        'addSeparator', 'addSpacer', 'addLabel', 'addSwitch', 'addCheckbox', 'addInput', 'addSelect',
        'addSlider', 'addSegmentedControl', 'addProgress', 'removeButton', 'removeLabel', 'removeControl',
        'updateLabel', 'updateControl', 'getButtonState', 'getLabelState', 'getControlState',
        'onButtonClick', 'onControlChange', 'onError', 'on', 'show', 'hide', 'close', 'getState',
        'setPosition', 'setPlacement', 'setAlwaysOnTop', 'setDraggable', 'waitUntilClosed', 'run',
      ];
      for (const name of forward) {
        if (typeof inner[name] === 'function') wrapper[name] = inner[name].bind(inner);
      }

      wrapper.addButton = function addButton(id, label, icon, callback) {
        if (id !== 'stop') return inner.addButton(id, label, icon, callback);
        return inner.addButton(id, label, icon, event => {
          const manager = managerRef.current;
          if (manager && manager.isRunActive()) return manager.cancelRun();
          return typeof callback === 'function' ? callback(event) : undefined;
        });
      };

      wrapper.updateButton = async function updateButton(id, patch) {
        const result = await inner.updateButton(id, patch);
        if (id === 'stop') {
          const manager = managerRef.current;
          if (manager) await manager.syncAvailability();
        }
        return result;
      };

      Object.defineProperty(wrapper, 'id', {
        enumerable: true,
        configurable: false,
        get() { return inner.id; },
      });
      return wrapper;
    };
  }

  function createApp(options) {
    const settings = options || {};
    const managerRef = {current: null};
    const BaseFloatingWindow = settings.FloatingWindow || global.FloatingWindow;
    const HistoryAwareFloatingWindow = createToolbarAdapter(BaseFloatingWindow, managerRef);
    const coreApp = coreAPI.createApp({...settings, FloatingWindow: HistoryAwareFloatingWindow});

    const history = historyAPI.createManager({
      file: settings.file || global.File,
      ui: settings.ui || global.ui,
      dialog: settings.dialog || global.Dialog,
      command: settings.command || global.Command,
      execution: settings.execution || global.Execution,
      system: settings.system || global.System,
      toolbar: coreApp.toolbar(),
      app: coreApp,
      logger: settings.logger || global.console,
      sleep: settings.sleep,
      runCountdownStepMs: Number.isFinite(settings.historyCountdownStepMs)
        ? settings.historyCountdownStepMs : settings.countdownStepMs,
      runTimeoutMs: settings.runTimeoutMs,
      openDeskBinary: settings.openDeskBinary,
      recordingsRoot: settings.recordingsRoot,
      platform: settings.platform,
    });
    managerRef.current = history;

    async function show() {
      const shown = await coreApp.show();
      await history.syncAvailability();
      return shown;
    }

    async function run() {
      try {
        return await coreApp.run();
      } finally {
        await history.close();
      }
    }

    async function close() {
      await history.close();
      return coreApp.close();
    }

    async function stop() {
      if (history.isRunActive()) return history.cancelRun();
      return coreApp.stop();
    }

    return Object.freeze({
      ...coreApp,
      run,
      show,
      close,
      stop,
      openHistory: history.open,
      refreshHistory: history.refresh,
      history: () => history,
    });
  }

  global.OpenDeskSimpleRecordingConsole = Object.freeze({
    ...coreAPI,
    createApp,
  });
})(globalThis);
