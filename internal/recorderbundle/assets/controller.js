// Framework-owned integration layer for the built-in Recorder UI.
// The core Recorder state machine remains in controller-core.js; this wrapper
// adds History without coupling the released runtime to the source examples tree.
(function installOpenDeskSimpleRecordingConsoleWithHistory(global) {
  'use strict';

  const file = global.File;
  const execution = global.Execution;
  if (!file || typeof file.join !== 'function' || typeof file.read !== 'function' || !execution || !execution.scriptDir) {
    throw new Error('recording-console-simple history wrapper requires File and Execution.scriptDir');
  }

  const HISTORY_ICON_GLYPHS = Object.freeze({
    'play.fill': '▶',
    pencil: '✎',
    'folder.fill': '📁',
    'trash.fill': '🗑',
    'backward.end.fill': '│◀',
    'backward.fill': '◀',
    'forward.fill': '▶',
    'forward.end.fill': '▶│',
    'arrow.clockwise': '↻',
  });

  const explicitRoot = typeof global.__OPENDESK_RECORDER_UI_ROOT === 'string'
    ? global.__OPENDESK_RECORDER_UI_ROOT.trim()
    : '';
  const baseDir = explicitRoot || file.join(execution.scriptDir, 'recording-console-simple');
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

  function isDialogBusy(error) {
    const code = error && error.code ? String(error.code) : '';
    const message = error && error.message ? String(error.message) : String(error || '');
    return code === 'DIALOG_BUSY' || /(^|\s|:)DIALOG_BUSY(?=\s|:|$)/.test(message);
  }

  function createDialogCoordinator(baseDialog, logger) {
    if (!baseDialog || typeof baseDialog.alert !== 'function'
      || typeof baseDialog.confirm !== 'function' || typeof baseDialog.prompt !== 'function') {
      throw new Error('recording-console-simple requires Dialog alert/confirm/prompt');
    }

    let activeModal = null;

    function busyError(method, active, cause) {
      const error = cause instanceof Error
        ? cause
        : new Error(`Dialog.${method}: DIALOG_BUSY: another ${active.method} dialog is already active`);
      if (!error.code) error.code = 'DIALOG_BUSY';
      if (!error.operation) error.operation = `Dialog.${method}`;
      return error;
    }

    async function invoke(method, spec) {
      // Dialog is intentionally single-modal per script execution. A concurrent
      // request is surfaced as busy; mapping it to a normal cancel would make a
      // destructive toolbar action look as if its click was ignored.
      if (activeModal) throw busyError(method, activeModal);
      const modal = {method, startedAt: new Date().toISOString()};
      activeModal = modal;
      try {
        return await baseDialog[method](spec);
      } catch (error) {
        // A modal created outside this adapter can still race with us. The native
        // Dialog contract reports that case as DIALOG_BUSY. Keep the execution
        // alive, but let the action wrapper render an explicit failure instead of
        // silently converting the operation into a user cancellation.
        if (isDialogBusy(error)) {
          if (logger && typeof logger.warn === 'function') {
            try { logger.warn(`[recording-history] HISTORY_DIALOG_BUSY ${JSON.stringify({method})}`); } catch (_) {}
          }
          throw busyError(method, modal, error);
        }
        throw error;
      } finally {
        if (activeModal === modal) activeModal = null;
      }
    }

    const coordinated = {
      alert(spec) { return invoke('alert', spec); },
      confirm(spec) { return invoke('confirm', spec); },
      prompt(spec) { return invoke('prompt', spec); },
      getState() {
        return activeModal
          ? {active: true, method: activeModal.method, startedAt: activeModal.startedAt}
          : {active: false, method: '', startedAt: ''};
      },
    };
    if (typeof baseDialog.getCapabilities === 'function') {
      coordinated.getCapabilities = baseDialog.getCapabilities.bind(baseDialog);
    }
    return Object.freeze(coordinated);
  }

  function createHistoryUIAdapter(baseUI) {
    if (!baseUI || typeof baseUI.createWindow !== 'function') {
      throw new Error('recording-console-simple history requires ui.createWindow()');
    }

    const wrapper = {
      async createWindow(spec) {
        const inner = await baseUI.createWindow(spec);
        if (!inner || typeof inner.control !== 'function') return inner;

        const windowWrapper = {};
        for (const name of ['on', 'show', 'hide', 'close', 'focus', 'getState', 'waitUntilClosed']) {
          if (typeof inner[name] === 'function') windowWrapper[name] = inner[name].bind(inner);
        }
        Object.defineProperty(windowWrapper, 'id', {
          enumerable: true,
          configurable: false,
          get() { return inner.id; },
        });
        windowWrapper.control = function control(id) {
          const target = inner.control(id);
          if (!target || typeof target.update !== 'function') return target;
          const controlWrapper = {};
          for (const name of ['on', 'getState', 'focus']) {
            if (typeof target[name] === 'function') controlWrapper[name] = target[name].bind(target);
          }
          controlWrapper.update = function update(patch) {
            const next = patch && typeof patch === 'object' ? {...patch} : patch;
            if (next && next.text === '' && typeof next.icon === 'string') {
              const glyph = HISTORY_ICON_GLYPHS[next.icon];
              if (glyph) next.text = glyph;
            }
            return target.update(next);
          };
          return controlWrapper;
        };
        return windowWrapper;
      },
    };

    if (typeof baseUI.toast === 'function') {
      wrapper.toast = baseUI.toast.bind(baseUI);
    } else if (typeof baseUI.notify === 'function') {
      // Keep compatibility with runtimes that expose only the historical name.
      wrapper.toast = baseUI.notify.bind(baseUI);
    }
    return Object.freeze(wrapper);
  }

  function createToolbarAdapter(BaseFloatingWindow, managerRef) {
    if (typeof BaseFloatingWindow !== 'function') {
      throw new Error('recording-console-simple requires FloatingWindow');
    }

    return function HistoryAwareFloatingWindow(options) {
      const input = options || {};
      const toolbarOptions = input.toolbar ? {...input.toolbar} : null;
      if (toolbarOptions && toolbarOptions.maxRows === 1
        && (!Number.isFinite(toolbarOptions.maxColumns) || toolbarOptions.maxColumns < 9)) {
        toolbarOptions.maxColumns = 9;
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
    const dialog = settings.dialog || global.Dialog;
    const ui = settings.ui || global.ui;
    if (!dialog || typeof dialog.confirm !== 'function' || typeof dialog.prompt !== 'function'
      || !ui || typeof ui.createWindow !== 'function') {
      return coreAPI.createApp(settings);
    }
    const managerRef = {current: null};
    const BaseFloatingWindow = settings.FloatingWindow || global.FloatingWindow;
    const HistoryAwareFloatingWindow = createToolbarAdapter(BaseFloatingWindow, managerRef);
    const sharedDialog = createDialogCoordinator(dialog, settings.logger || global.console);
    const coreApp = coreAPI.createApp({...settings, dialog: sharedDialog, FloatingWindow: HistoryAwareFloatingWindow});
    const historyUI = createHistoryUIAdapter(ui);

    const history = historyAPI.createManager({
      file: settings.file || global.File,
      ui: historyUI,
      dialog: sharedDialog,
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
