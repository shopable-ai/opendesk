(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('System');

  test({
    name: 'System delay is event-loop-owned and platform info is normalized',
    tier: 'unit',
    covers: ['System.delay', 'System.getPlatformInfo'],
  }, async () => {
    const platform = System.getPlatformInfo();
    assert(platform && typeof platform.os === 'string' && platform.os.length > 0, JSON.stringify(platform));
    assert(typeof platform.arch === 'string' && platform.arch.length > 0, JSON.stringify(platform));
    assert(Number.isInteger(platform.processId) && platform.processId > 0, JSON.stringify(platform));
    assert(typeof platform.runtimeVersion === 'string' && platform.runtimeVersion.length > 0, JSON.stringify(platform));

    let timerFired = false;
    setTimeout(() => { timerFired = true; }, 0);
    const startedAt = Date.now();
    const pending = System.delay(10);
    assert(pending && typeof pending.then === 'function', 'System.delay must return a Promise');
    await pending;
    assert(timerFired, 'System.delay blocked the Runtime event loop');
    assert(Date.now() - startedAt >= 5, 'System.delay resolved too early');

    for (const [milliseconds, expectedMessage] of [
      [-1, 'greater than or equal to 0'],
      [NaN, 'finite'],
      [Infinity, 'finite'],
      [86400001, 'must not exceed'],
    ]) {
      let rejected = false;
      try {
        await System.delay(milliseconds);
      } catch (error) {
        rejected = String(error && error.message || error).includes(expectedMessage);
      }
      assert(rejected, `System.delay must reject invalid milliseconds: ${milliseconds}`);
    }
  });

  test({
    name: 'System environment accessors read only the execution snapshot',
    tier: 'unit',
    covers: ['System.getEnv', 'System.hasEnv', 'Execution.env'],
  }, () => {
    const name = 'OPENDESK_RUNTIME_API_RUN_ID';
    equal(System.getEnv(name), Execution.env[name], 'inherited execution value');
    equal(System.hasEnv(name), true, 'present inherited execution value');

    const missing = 'OPENDESK_ENV_NAME_THAT_MUST_NOT_EXIST';
    equal(System.getEnv(missing), undefined, 'missing value');
    equal(System.getEnv(missing, 'fallback'), 'fallback', 'missing fallback');
    equal(System.hasEnv(missing), false, 'missing presence');

    for (const invoke of [
      () => System.getEnv(),
      () => System.getEnv('INVALID-NAME'),
      () => System.getEnv(missing, 42),
      () => System.getEnv(missing, 'one', 'two'),
      () => System.hasEnv(),
      () => System.hasEnv('INVALID-NAME'),
    ]) {
      let rejected = false;
      try {
        invoke();
      } catch (error) {
        rejected = error && error.name === 'TypeError';
      }
      assert(rejected, 'invalid System environment access did not throw TypeError');
    }
  });

  test({
    name: 'System read-only APIs return documented value families',
    tier: 'unit',
    covers: [
      'System.getSystemInfo', 'System.getProcessList', 'System.getNetworkInterfaces',
      'System.getNetworkConnections', 'System.getPowerInfo', 'System.getDirectoryContents',
      'System.getExecutablePath', 'System.getWorkingDirectory', 'System.getUserInfo',
      'System.isAdministrator', 'System.getSystemMetrics', 'System.getFingerprint', 'System.toJSON',
    ],
  }, async () => {
    const cwd = await System.getWorkingDirectory();
    assert(typeof cwd === 'string' && cwd.length > 0, JSON.stringify(cwd));
    assert(typeof await System.getExecutablePath() === 'string');
    assert(Array.isArray(await System.getDirectoryContents(cwd)));
    assert(Array.isArray(await System.getProcessList()));
    assert(Array.isArray(await System.getNetworkInterfaces()));
    assert(Array.isArray(await System.getNetworkConnections()));
    assert(typeof await System.getPowerInfo() === 'object');
    assert(typeof await System.getSystemInfo() === 'object');
    assert(typeof await System.getUserInfo() === 'object');
    assert(typeof await System.getSystemMetrics() === 'object');
    assert(typeof await System.isAdministrator() === 'boolean');
    assert(typeof await System.getFingerprint() === 'string');
    const encoded = await System.toJSON({ hostApi: true });
    assert(typeof encoded === 'string' && encoded.includes('hostApi'), encoded);
  });

  test({
    name: 'System session capability and state are explicit without claiming lock state',
    tier: 'unit',
    covers: ['System.getSessionCapabilities', 'System.getSessionState'],
  }, async () => {
    const capabilities = System.getSessionCapabilities();
    assert(capabilities && capabilities.schemaVersion === 1, JSON.stringify(capabilities));
    assert(typeof capabilities.backend === 'string' && capabilities.backend.length > 0, JSON.stringify(capabilities));
    assert(capabilities.lock.requiresConfirmation === true, JSON.stringify(capabilities.lock));
    assert(capabilities.logout.requiresConfirmation === true, JSON.stringify(capabilities.logout));
    assert(capabilities.wake.supported === false && capabilities.switchUser.supported === false, JSON.stringify(capabilities));

    if (capabilities.state.supported) {
      const state = System.getSessionState();
      assert(state.schemaVersion === 1 && state.platform === capabilities.platform, JSON.stringify(state));
      assert(typeof state.state === 'string' && state.state.length > 0, JSON.stringify(state));
      assert(state.locked === null || typeof state.locked === 'boolean', JSON.stringify(state));
      assert(typeof state.observedAt === 'string' && state.observedAt.length > 0, JSON.stringify(state));
    }
  });

  test({
    name: 'System session mutations require confirmation before platform access',
    tier: 'unit',
    covers: ['System.lock', 'System.logout', 'System.startScreenSaver'],
  }, async () => {
    for (const operation of ['lock', 'logout', 'startScreenSaver']) {
      let code = '';
      try {
        System[operation]();
      } catch (error) {
        code = error && error.code;
      }
      assert(code === 'CONFIRMATION_REQUIRED', `${operation} code=${code}`);
    }
  });
})();
