(function installSchedulerTestCLIExampleBridge(global) {
  'use strict';

  function decode(result, operation) {
    const stdout = result && typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const stderr = result && typeof result.stderr === 'string' ? result.stderr.trim() : '';
    let envelope = null;
    for (const candidate of [stdout, stderr]) {
      if (!candidate) continue;
      try {
        envelope = JSON.parse(candidate);
        break;
      } catch (_) {}
    }
    if (!envelope) throw new Error(`${operation} did not return JSON`);
    if (envelope.ok !== true) {
      const error = new Error(envelope.error && envelope.error.message
        ? String(envelope.error.message)
        : `${operation} failed`);
      error.code = envelope.error && envelope.error.code
        ? String(envelope.error.code)
        : 'SCHEDULER_CLI_FAILED';
      throw error;
    }
    return envelope.result;
  }

  async function run(args, operation, timeoutMs) {
    const result = await Command.run(System.getExecutablePath(), ['scheduler'].concat(args), {
      cwd: Execution.workdir,
      timeout: timeoutMs || 30000,
      maxOutputBytes: 2 << 20,
      hideWindow: true,
    });
    return decode(result, operation);
  }

  global.OpenDeskSchedulerTestCLIExamples = Object.freeze({run});
})(globalThis);
