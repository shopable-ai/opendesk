// Local Runtime API behavior. Run from the repository root with:
// ./dist/opendesk -script tests/runtime-api/command.js -console-mode script
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

function commandFixture(script) {
  const platform = System.getPlatformInfo().os;
  if (platform === 'windows') return { command: 'cmd.exe', args: ['/d', '/s', '/c', script] };
  return { command: '/bin/sh', args: ['-c', script] };
}

function timeoutFixture() {
  if (System.getPlatformInfo().os === 'windows') {
    return commandFixture('ping -n 3 127.0.0.1 >NUL');
  }
  return commandFixture('sleep 2');
}

(() => {
  const { assert, equal, test } = RuntimeAPITest;

  test({
    name: 'Command.run captures bounded UTF-8 stdout, stderr, env and input',
    tier: 'unit',
    covers: ['Command.getCapabilities', 'Command.run'],
  }, async () => {
    const capabilities = Command.getCapabilities();
    equal(capabilities.enabled, true, 'local CLI capability');
    equal(capabilities.supported, true, 'platform support');

    const inheritedFixture = System.getPlatformInfo().os === 'windows'
      ? commandFixture('echo|set /p=%OPENDESK_RUNTIME_API_RUN_ID%')
      : commandFixture('printf %s "$OPENDESK_RUNTIME_API_RUN_ID"');
    const inherited = await Command.run(inheritedFixture.command, inheritedFixture.args);
    equal(inherited.stdout, Execution.env.OPENDESK_RUNTIME_API_RUN_ID || '', 'Command default environment differs from Execution.env');

    const fixture = System.getPlatformInfo().os === 'windows'
      ? commandFixture('set /p OPENDESK_INPUT=& echo|set /p=out:%OPENDESK_INPUT%:%OPENDESK_COMMAND_TEST%& echo err 1>&2')
      : commandFixture('IFS= read -r value; printf "out:%s:%s" "$value" "$OPENDESK_COMMAND_TEST"; printf "err" >&2');
    const result = await Command.run(fixture.command, fixture.args, {
      input: 'hello\n',
      env: { OPENDESK_COMMAND_TEST: 'env-ok' },
    });
    equal(result.exitCode, 0, 'direct exit code');
    assert(result.stdout.includes('out:hello:env-ok'), JSON.stringify(result));
    assert(result.stderr.includes('err'), JSON.stringify(result));
    equal(Object.keys(result).sort().join(','), 'exitCode,stderr,stdout', 'minimal result shape');

    if (System.getPlatformInfo().os !== 'windows') {
      const eof = await Command.run('/bin/sh', ['-c', 'if IFS= read -r value; then exit 9; else printf stdin-eof; fi']);
      equal(eof.stdout, 'stdin-eof', 'stdin is closed automatically without options.input');
      const noArguments = await Command.run('/usr/bin/uname');
      assert(noArguments.stdout.trim().length > 0, 'optional args invocation');
    }
  });

  test({
    name: 'Command.run reports non-zero exit, output limit and timeout',
    tier: 'unit',
    covers: ['Command.run'],
  }, async () => {
    const nonzero = commandFixture(System.getPlatformInfo().os === 'windows' ? 'exit /b 7' : 'exit 7');
    let exitError = null;
    try {
      await Command.run(nonzero.command, nonzero.args);
    } catch (error) {
      exitError = error;
    }
    assert(exitError && exitError.code === 'EXIT_NONZERO' && exitError.exitCode === 7, String(exitError));

    const noisy = commandFixture(System.getPlatformInfo().os === 'windows'
      ? 'for /L %i in (1,1,80) do @echo|set /p=x'
      : 'printf 0123456789abcdef');
    let outputError = null;
    try {
      await Command.run(noisy.command, noisy.args, { maxOutputBytes: 8 });
    } catch (error) {
      outputError = error;
    }
    assert(outputError && outputError.code === 'OUTPUT_LIMIT', String(outputError));

    const slow = timeoutFixture();
    let timeoutError = null;
    try {
      await Command.run(slow.command, slow.args, { timeout: 40 });
    } catch (error) {
      timeoutError = error;
    }
    assert(timeoutError && timeoutError.code === 'TIMEOUT', String(timeoutError));

    let invalidError = null;
    try {
      await Command.run('', []);
    } catch (error) {
      invalidError = error;
    }
    assert(invalidError && invalidError.code === 'INVALID_ARGUMENT', String(invalidError));

    let startError = null;
    try {
      await Command.run('opendesk-command-that-must-not-exist-9c5feab8', []);
    } catch (error) {
      startError = error;
    }
    assert(startError && startError.code === 'START_FAILED', String(startError));
  });

  test({
    name: 'Command.run AbortSignal prevents start, cancels in-flight work, and removes listeners',
    tier: 'unit',
    covers: ['Command.run'],
  }, async () => {
    const preCanceled = new AbortController();
    preCanceled.abort('cancel before launch');
    let preCanceledError = null;
    try {
      await Command.run('opendesk-command-that-must-not-start-37cdd957', [], {signal: preCanceled.signal});
    } catch (error) {
      preCanceledError = error;
    }
    assert(preCanceledError && preCanceledError.code === 'CANCELED', String(preCanceledError));

    const controller = new AbortController();
    const signal = controller.signal;
    const originalAdd = signal.addEventListener;
    const originalRemove = signal.removeEventListener;
    let added = 0;
    let removed = 0;
    signal.addEventListener = function(type, listener) {
      added += 1;
      return originalAdd.call(this, type, listener);
    };
    signal.removeEventListener = function(type, listener) {
      removed += 1;
      return originalRemove.call(this, type, listener);
    };
    const slow = timeoutFixture();
    const startedAt = Date.now();
    const pending = Command.run(slow.command, slow.args, {signal});
    setTimeout(() => controller.abort('cancel in flight'), 40);
    let canceledError = null;
    try {
      await pending;
    } catch (error) {
      canceledError = error;
    }
    assert(canceledError && canceledError.code === 'CANCELED', String(canceledError));
    assert(Date.now() - startedAt < 1500, 'AbortSignal did not cancel the command promptly');
    equal(added, 1, 'abort listener registration count');
    equal(removed, 1, 'abort listener cleanup count');

    let invalidSignalError = null;
    try {
      await Command.run(slow.command, slow.args, {signal: {aborted: false}});
    } catch (error) {
      invalidSignalError = error;
    }
    assert(invalidSignalError && invalidSignalError.code === 'INVALID_ARGUMENT', String(invalidSignalError));
  });
})();

await RuntimeAPITest.run('RUNTIME-API-COMMAND');
