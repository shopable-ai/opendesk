(function installOpenDeskFlowRunnerShortcutController(global) {
  'use strict';

  const RUN_ACCELERATOR = 'CommandOrControl+Alt+R';
  const STOP_ACCELERATOR = 'CommandOrControl+Alt+X';

  function formatShortcutLabel(accelerator, platform) {
    const parts = String(accelerator || '').split('+').filter(Boolean);
    if (platform === 'darwin') {
      return parts.map(part => {
        if (part === 'CommandOrControl' || part === 'Command') return '⌘';
        if (part === 'Control') return '⌃';
        if (part === 'Alt') return '⌥';
        if (part === 'Shift') return '⇧';
        return part;
      }).join('');
    }
    return parts.map(part => {
      if (part === 'CommandOrControl' || part === 'Control') return 'Ctrl';
      if (part === 'Command') return 'Cmd';
      return part;
    }).join('+');
  }

  function shortcutLabelForButton(id, label, platform) {
    if (id === 'run') return `${label}（${formatShortcutLabel(RUN_ACCELERATOR, platform)}）`;
    if (id === 'stop') return `${label}（${formatShortcutLabel(STOP_ACCELERATOR, platform)}）`;
    return label;
  }

  function normalizeError(error) {
    if (!error) return null;
    return {
      code: error.code ? String(error.code) : '',
      message: error.message ? String(error.message) : String(error),
    };
  }

  function wrapController(BaseController, defaults) {
    if (!BaseController || typeof BaseController.createApp !== 'function') {
      throw new Error('flow runner shortcuts require a base controller');
    }

    const wrapper = Object.assign({}, BaseController);
    wrapper.createApp = options => {
      const settings = Object.assign({}, options || {});
      const injected = defaults || {};
      const NativeFloatingWindow = settings.FloatingWindow;
      const shortcut = injected.globalShortcut || settings.globalShortcut || global.globalShortcut;
      const system = injected.system || settings.system || global.System;
      const logger = injected.console || settings.console || global.console;
      if (typeof NativeFloatingWindow !== 'function') {
        return BaseController.createApp(settings);
      }

      let app = null;
      let toolbarVisible = false;
      let shortcutMode = '';
      let shortcutFailedMode = '';
      let shortcutError = null;
      const controlState = {runDisabled: true, stopDisabled: true};

      function platform() {
        try {
          if (system && typeof system.getPlatformInfo === 'function') {
            const info = system.getPlatformInfo();
            if (info && info.os) return info.os;
          }
        } catch (_) {}
        return global.process && global.process.platform || '';
      }

      function acceleratorFor(mode) {
        return mode === 'stop' ? STOP_ACCELERATOR : RUN_ACCELERATOR;
      }

      function logShortcutError(mode, error) {
        shortcutError = normalizeError(error);
        if (!logger || typeof logger.warn !== 'function') return;
        try {
          logger.warn('FLOW_RUNNER_SHORTCUT_UNAVAILABLE=' + JSON.stringify({
            mode,
            accelerator: acceleratorFor(mode),
            code: shortcutError && shortcutError.code || '',
            message: shortcutError && shortcutError.message || 'shortcut unavailable',
          }));
        } catch (_) {}
      }

      function unregisterCurrent() {
        if (!shortcutMode) return;
        const mode = shortcutMode;
        shortcutMode = '';
        if (!shortcut || typeof shortcut.unregister !== 'function') return;
        try {
          shortcut.unregister(acceleratorFor(mode));
        } catch (error) {
          logShortcutError(mode, error);
        }
      }

      function desiredMode() {
        if (!toolbarVisible) return '';
        if (!controlState.stopDisabled) return 'stop';
        if (!controlState.runDisabled) return 'run';
        return '';
      }

      function currentEntry() {
        if (!app || typeof app.state !== 'function') return null;
        const state = app.state();
        if (!state || state.running || state.activeRun) return null;
        const selected = state.selectedEntryKey;
        if (!selected) return null;
        const list = typeof app.entries === 'function' ? app.entries() : [];
        return list.find(entry => entry && entry.name === selected) || null;
      }

      function runFromShortcut() {
        const entry = currentEntry();
        if (!entry || !app || typeof app.requestRun !== 'function') return false;
        return app.requestRun([entry], 'shortcut-run');
      }

      function stopFromShortcut() {
        if (!app || typeof app.stopRun !== 'function') return false;
        return app.stopRun('shortcut-stop');
      }

      function syncShortcut() {
        const desired = desiredMode();
        if (desired === shortcutMode) return;
        if (!desired) {
          shortcutFailedMode = '';
          shortcutError = null;
          unregisterCurrent();
          return;
        }
        if (shortcutFailedMode === desired) return;
        shortcutFailedMode = '';
        unregisterCurrent();
        if (!shortcut || typeof shortcut.register !== 'function' || typeof shortcut.unregister !== 'function') {
          shortcutFailedMode = desired;
          logShortcutError(desired, new Error('globalShortcut API unavailable'));
          return;
        }
        try {
          shortcut.register(
            acceleratorFor(desired),
            desired === 'stop' ? stopFromShortcut : runFromShortcut,
          );
          shortcutMode = desired;
          shortcutError = null;
        } catch (error) {
          shortcutFailedMode = desired;
          logShortcutError(desired, error);
        }
      }

      function cleanupShortcut() {
        toolbarVisible = false;
        shortcutFailedMode = '';
        shortcutError = null;
        unregisterCurrent();
      }

      function observeButton(id, patch) {
        if (!patch || typeof patch.disabled !== 'boolean') return;
        if (id === 'run') controlState.runDisabled = patch.disabled;
        if (id === 'stop') controlState.stopDisabled = patch.disabled;
        if (id === 'run' || id === 'stop') syncShortcut();
      }

      function ShortcutFloatingWindow(spec) {
        const inner = new NativeFloatingWindow(spec);
        return {
          get id() { return inner.id; },
          addButton(id, label, icon, callback) {
            return inner.addButton(id, shortcutLabelForButton(id, label, platform()), icon, callback);
          },
          addLabel(id, text, labelOptions) { return inner.addLabel(id, text, labelOptions); },
          addSeparator(id) { return inner.addSeparator(id); },
          updateButton(id, patch) {
            observeButton(id, patch);
            return inner.updateButton(id, patch);
          },
          updateLabel(id, patch) { return inner.updateLabel(id, patch); },
          getButtonState(id) { return inner.getButtonState(id); },
          getState() { return inner.getState(); },
          on(event, callback) {
            if (event !== 'close') return inner.on(event, callback);
            return inner.on(event, value => {
              cleanupShortcut();
              return callback(value);
            });
          },
          onError(callback) { return inner.onError(callback); },
          async show() {
            const result = await inner.show();
            toolbarVisible = true;
            syncShortcut();
            return result;
          },
          waitUntilClosed() { return inner.waitUntilClosed(); },
          async hide() {
            cleanupShortcut();
            return inner.hide();
          },
          async close() {
            cleanupShortcut();
            return inner.close();
          },
        };
      }

      settings.FloatingWindow = ShortcutFloatingWindow;
      app = BaseController.createApp(settings);

      const decorated = Object.assign({}, app);
      if (typeof app.run === 'function') {
        decorated.run = async () => {
          try {
            return await app.run();
          } finally {
            cleanupShortcut();
          }
        };
      }
      if (typeof app.state === 'function') {
        decorated.state = () => {
          const state = app.state() || {};
          const player = Object.assign({}, state.player || {}, {
            shortcutMode,
            shortcutError: shortcutError ? Object.assign({}, shortcutError) : null,
            shortcuts: {
              run: {
                accelerator: RUN_ACCELERATOR,
                label: formatShortcutLabel(RUN_ACCELERATOR, platform()),
              },
              stop: {
                accelerator: STOP_ACCELERATOR,
                label: formatShortcutLabel(STOP_ACCELERATOR, platform()),
              },
            },
          });
          return Object.assign({}, state, {player});
        };
      }
      return Object.freeze(decorated);
    };
    return Object.freeze(wrapper);
  }

  global.OpenDeskFlowRunnerShortcutController = Object.freeze({
    wrapController,
    formatShortcutLabel,
    shortcutLabelForButton,
    shortcuts: Object.freeze({
      run: RUN_ACCELERATOR,
      stop: STOP_ACCELERATOR,
    }),
  });
})(globalThis);
