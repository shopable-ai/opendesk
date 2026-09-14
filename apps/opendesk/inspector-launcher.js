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
    const now = typeof settings.now === 'function' ? settings.now : Date.now;
    let launchSequence = 0;

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

    function freshLaunchURL(url) {
      launchSequence += 1;
      const nonce = String(now()) + '-' + String(launchSequence);
      return url + '?launch=' + encodeURIComponent(nonce);
    }

    async function notifyFailure(message) {
      const toast = ui && (typeof ui.toast === 'function'
        ? ui.toast.bind(ui)
        : (typeof ui.notify === 'function' ? ui.notify.bind(ui) : null));
      if (toast) {
        try {
          await toast({message: String(message), timeoutMs: 5000});
          return;
        } catch (_) {
          // Toast is best-effort; the structured log below is the durable
          // fallback and must not hide the original launch failure.
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
        // Force a fresh browser navigation even when an old canonical tab is
        // already open. This value is only a navigation nonce, never a pairing
        // code or credential; the page removes it from the visible URL.
        const launchURL = freshLaunchURL(state.url);
        if (platform === 'windows') {
          await command.run('explorer.exe', [launchURL], runOptions);
        } else if (platform === 'darwin') {
          await command.run('/usr/bin/open', [launchURL], runOptions);
        } else {
          await command.run('xdg-open', [launchURL], runOptions);
        }
        return Object.freeze({status: 'opened', source: source || 'inspector.open', url: launchURL});
      } catch (error) {
        await notifyFailure('Inspector 打开失败，请查看运行日志。');
        throw error;
      }
    }

    return Object.freeze({open, getCapabilities: capabilities});
  }

  global.OpenDeskInspectorLauncher = Object.freeze({create});
})(globalThis);
