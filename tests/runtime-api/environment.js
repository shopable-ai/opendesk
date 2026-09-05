// Project environment Runtime behavior. The formal gate supplies one explicit
// env file and controlled inherited values; run through:
// ./scripts/test_runtime_apis.sh environment
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

function environmentCommand(script) {
  if (System.getPlatformInfo().os === 'windows') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', script] };
  }
  return { command: '/bin/sh', args: ['-c', script] };
}

(() => {
  const { assert, equal, test } = RuntimeAPITest;

  test({
    name: 'Execution.env resolves explicit project values as a frozen string snapshot',
    tier: 'unit',
    covers: ['Execution.env'],
  }, () => {
    equal(Execution.env.OPENDESK_ENV_FILE_ONLY, 'file-value', 'explicit file value');
    equal(Execution.env.OPENDESK_ENV_PRECEDENCE, 'shell-value', 'shell precedence');
    equal(Execution.env.OPENDESK_ENV_LITERAL, '${SHOULD_NOT_EXPAND}', 'literal variable reference');
    equal(Execution.env.OPENDESK_ENV_EMPTY, '', 'empty value');
    equal(Execution.env.OPENDESK_ENV_QUOTED, 'quoted value', 'quoted value');
    equal(Execution.env.OPENDESK_ENV_SYSTEM_ONLY, 'system=a=b', 'inherited system value');
    assert(typeof Execution.env.PATH === 'string' && Execution.env.PATH.length > 0, 'system PATH is missing');
    equal(Execution.env.__proto__, 'literal-key', '__proto__ environment key');
    equal(Object.getPrototypeOf(Execution.env), null, 'environment snapshot prototype');
    assert(Object.isFrozen(Execution.env), 'Execution.env is mutable');
    assert(Object.values(Execution.env).every((value) => typeof value === 'string'), 'non-string environment value');
  });

  test({
    name: 'Command.run inherits the same execution environment baseline',
    tier: 'unit',
    covers: ['Execution.env', 'Command.run'],
  }, async () => {
    const fixture = System.getPlatformInfo().os === 'windows'
      ? environmentCommand('echo|set /p=%OPENDESK_ENV_FILE_ONLY%:%OPENDESK_ENV_PRECEDENCE%:%OPENDESK_ENV_SYSTEM_ONLY%')
      : environmentCommand('printf "%s:%s:%s" "$OPENDESK_ENV_FILE_ONLY" "$OPENDESK_ENV_PRECEDENCE" "$OPENDESK_ENV_SYSTEM_ONLY"');
    const result = await Command.run(fixture.command, fixture.args);
    equal(result.stdout, 'file-value:shell-value:system=a=b', 'child environment baseline');
  });

  test({
    name: 'Command.run overrides system values without dropping the inherited baseline',
    tier: 'unit',
    covers: ['Execution.env', 'Command.run'],
  }, async () => {
    const windows = System.getPlatformInfo().os === 'windows';
    const fixture = windows
      ? environmentCommand('echo|set /p=%OPENDESK_ENV_SYSTEM_ONLY%:%OPENDESK_ENV_FILE_ONLY%')
      : environmentCommand('printf "%s:%s" "$OPENDESK_ENV_SYSTEM_ONLY" "$OPENDESK_ENV_FILE_ONLY"');
    const override = {};
    override[windows ? 'opendesk_env_system_only' : 'OPENDESK_ENV_SYSTEM_ONLY'] = 'command-value';
    const result = await Command.run(fixture.command, fixture.args, { env: override });
    equal(result.stdout, 'command-value:file-value', 'child environment override');

    let invalid = null;
    try {
      await Command.run(fixture.command, fixture.args, { env: { 'INVALID-NAME': 'value' } });
    } catch (error) {
      invalid = error;
    }
    assert(invalid && invalid.code === 'INVALID_ARGUMENT', String(invalid));
  });
})();

await RuntimeAPITest.run('RUNTIME-API-ENVIRONMENT');
