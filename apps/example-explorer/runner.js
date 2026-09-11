(function installOpenDeskExampleRunner(global) {
  'use strict';

  function normalizeError(error) {
    return {
      code: error && error.code ? String(error.code) : 'EXAMPLE_RUN_FAILED',
      message: error && error.message ? String(error.message) : String(error || 'Unknown failure'),
      exitCode: error && Number.isInteger(error.exitCode) ? error.exitCode : null,
      stdout: error && typeof error.stdout === 'string' ? error.stdout : '',
      stderr: error && typeof error.stderr === 'string' ? error.stderr : '',
    };
  }

  function createRunner(options) {
    const command = options.command;
    const execution = options.execution;
    const system = options.system;
    const Abort = options.AbortController;
    const logger = options.logger || global.console;
    const executable = system.getExecutablePath();
    const launchApi = options.launchApi || global.OpenDeskExampleLaunchSpec;
    const platformInfo = typeof system.getPlatformInfo === 'function' ? system.getPlatformInfo() : null;
    const currentPlatform = platformInfo && (platformInfo.os || platformInfo.platform)
      ? String(platformInfo.os || platformInfo.platform).toLowerCase()
      : '';
    let active = null;

    function launchSpecFor(entry) {
      if (!launchApi || typeof launchApi.create !== 'function') {
        throw new Error('Example launch metadata is unavailable');
      }
      return launchApi.create(entry, {
        platform: currentPlatform,
        workdir: execution.workdir,
        pathApi: global.path,
      });
    }

    async function run(entry) {
      if (active) throw new Error('An example is already running');
      if (!entry) {
        const error = new Error('No example is selected');
        error.code = 'EXAMPLE_NOT_RUNNABLE';
        throw error;
      }
      const spec = launchSpecFor(entry);
      if (!spec.platformSupported) {
        const error = new Error(`This example is unsupported on ${currentPlatform || 'the current platform'}`);
        error.code = 'EXAMPLE_UNSUPPORTED_PLATFORM';
        throw error;
      }
      if (!spec.runnable || entry.runPolicy !== 'safe') {
        const error = new Error('This example is not approved for one-click execution');
        error.code = 'EXAMPLE_NOT_RUNNABLE';
        throw error;
      }

      const controller = new Abort();
      const startedAt = Date.now();
      active = {controller, entry, startedAt};
      try {
        const result = await command.run(executable, spec.buildArgs(), {
          cwd: execution.workdir,
          timeout: 0,
          maxOutputBytes: 2 * 1024 * 1024,
          signal: controller.signal,
        });
        const outcome = {
          status: 'succeeded',
          exitCode: result.exitCode,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          durationMs: Date.now() - startedAt,
        };
        if (outcome.stdout && logger && typeof logger.log === 'function') logger.log(outcome.stdout);
        if (outcome.stderr && logger && typeof logger.error === 'function') logger.error(outcome.stderr);
        return outcome;
      } catch (error) {
        const normalized = normalizeError(error);
        const outcome = {
          status: normalized.code === 'CANCELED' || controller.signal.aborted ? 'canceled' : 'failed',
          exitCode: normalized.exitCode,
          stdout: normalized.stdout,
          stderr: normalized.stderr,
          durationMs: Date.now() - startedAt,
          error: normalized,
        };
        if (outcome.stdout && logger && typeof logger.log === 'function') logger.log(outcome.stdout);
        if (outcome.stderr && logger && typeof logger.error === 'function') logger.error(outcome.stderr);
        return outcome;
      } finally {
        active = null;
      }
    }

    function stop() {
      if (!active) return false;
      active.controller.abort('OpenDesk Examples stopped by user');
      return true;
    }

    function isRunning() {
      return !!active;
    }

    return {run, stop, isRunning, launchSpecFor};
  }

  global.OpenDeskExampleRunner = {createRunner};
})(globalThis);
