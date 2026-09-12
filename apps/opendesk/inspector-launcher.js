(function installOpenDeskInspectorLauncher(global) {
  'use strict';

  const INSPECTOR_ENV = 'OPENDESK_APP_INSPECTOR_URL';
  const LOOPBACK_INSPECTOR_URL = /^http:\/\/127\.0\.0\.1:\d+\/accessibility-workbench\/$/;

  function create(options) {
    const settings = options || {};
    const system = settings.system || global.System;
    const command = settings.command || global.Command;
    const execution = settings.execution || global.Execution;
    const ui = settings.ui || (global.automation && global.automation.ui);
    const logger = settings.logger || global.console;

    if (!system || typeof system.getEnv !== 'function' || typeof system.getPlatformInfo !== 'function') {
      throw new Error('Inspector launcher requires System.getEnv/getPlatformInfo');
    }
    if (!command || typeof command.run !== 'function') {
      throw new Error('Inspector launcher requires Command.run()');
    }

    function configuredURL() {
      const value = String(system.getEnv(INSPECTOR_ENV) || '').trim();
      return LOOPBACK_INSPECTOR_URL.test(value) ? value : '';
    }

    function capabilities() {
      const url = configuredURL();
      return Object.freeze({
        enabled: !!url,
        available: !!url,
        transport: 'app-loopback-browser',
        url,
      });
    }

    async function notifyFailure(message) {
      if (ui && typeof ui.notify === 'function') {
        try {
          await ui.notify({message: String(message), type: 'negative', timeout: 5000});
          return;
        } catch (_) {
          // Notification is best-effort; the structured log below is the
          // durable fallback and must not hide the original launch failure.
        }
      }
      if (logger && typeof logger.error === 'function') {
        logger.error('[INSPECTOR] ' + String(message));
      }
    }

    async function open(source) {
      const state = capabilities();
      if (!state.available) {
        const message = 'Inspector 暂时不可用，请查看运行日志。';
        await notifyFailure(message);
        return Object.freeze({status: 'unavailable', source: source || 'inspector.open', message});
      }

      const platform = system.getPlatformInfo().os;
      const runOptions = {
        cwd: execution && execution.workdir ? execution.workdir : undefined,
        timeout: 10000,
        maxOutputBytes: 256 * 1024,
      };
      try {
        if (platform === 'windows') {
          await command.run('explorer.exe', [state.url], runOptions);
        } else if (platform === 'darwin') {
          await command.run('/usr/bin/open', [state.url], runOptions);
        } else {
          await command.run('xdg-open', [state.url], runOptions);
        }
        return Object.freeze({status: 'opened', source: source || 'inspector.open', url: state.url});
      } catch (error) {
        await notifyFailure('Inspector 打开失败，请查看运行日志。');
        throw error;
      }
    }

    return Object.freeze({open, getCapabilities: capabilities});
  }

  global.OpenDeskInspectorLauncher = Object.freeze({create});
})(globalThis);
