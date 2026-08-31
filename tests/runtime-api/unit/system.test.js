(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('System');

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
