(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Notifications');

  test({
    name: 'Notifications exposes an explicit platform and privacy capability boundary',
    tier: 'unit',
    covers: ['Notifications.getCapabilities'],
  }, async () => {
    const capabilities = Notifications.getCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schema version');
    assert(typeof capabilities.platform === 'string' && capabilities.platform.length > 0, 'platform must be explicit');
    assert(typeof capabilities.backend === 'string' && capabilities.backend.length > 0, 'backend must be explicit');
    equal(capabilities.activate.supported, false, 'programmatic activation must not be implied');
    equal(capabilities.events.supported, false, 'Events notification source must not be implied');
    if (capabilities.platform === 'darwin') {
      equal(capabilities.scope, 'own-app', 'macOS scope');
      equal(capabilities.list.supported, true, 'macOS own-app list capability');
    } else {
      equal(capabilities.scope, 'none', 'unsupported platform scope');
    }
  });

  test({
    name: 'Notifications validates list wait and dismiss before native access',
    tier: 'unit',
    covers: ['Notifications.list', 'Notifications.waitFor', 'Notifications.dismiss'],
  }, async () => {
    await expectThrow(() => Notifications.list({ includeContent: 'yes' }), 'INVALID_ARGUMENT');
    await expectThrow(() => Notifications.waitFor({ pollInterval: 10 }), 'INVALID_ARGUMENT');
    await expectThrow(() => Notifications.dismiss({ id: 'fixture', extra: true }), 'INVALID_ARGUMENT');
  });
})();
