(() => {
  const { assert, test } = RuntimeAPITest;
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
})();
