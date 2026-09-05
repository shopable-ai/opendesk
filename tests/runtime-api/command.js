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
})();

await RuntimeAPITest.run('RUNTIME-API-COMMAND');
