(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('App');

  test({
    name: 'App lists process instances and groups stable application identity',
    tier: 'unit',
    covers: ['App.list', 'App.get', 'App.isRunning', 'App.getCapabilities'],
  }, async () => {
    const capabilities = App.getCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schema version');
    assert(typeof capabilities.backend === 'string' && capabilities.backend.length > 0, 'backend must be explicit');
    equal(capabilities.grouping.multiProcess, true, 'multi-process grouping capability');
    equal(capabilities.readiness.customPredicate, false, 'custom predicate must not be implied');

    const applications = App.list();
    assert(Array.isArray(applications) && applications.length > 0, 'App.list must contain at least one desktop application');
    const current = applications.find(item => item && Number.isInteger(item.pid) && item.pid > 0);
    assert(current, 'App.list must include a valid process identity');
    const grouped = App.get({ pid: current.pid });
    assert(grouped && grouped.running && grouped.pids.includes(current.pid), 'App.get PID group');
    equal(App.isRunning({ pid: current.pid }), true, 'current process is running');
    assert(grouped.instances[0].BundleIdentifier === undefined, 'projection must stay lowerCamel');
  });

  test({
    name: 'App lifecycle async methods fail closed before changing unrelated applications',
    tier: 'unit',
    covers: ['App.launch', 'App.waitForLaunch', 'App.waitForExit', 'App.terminate', 'App.restart'],
  }, async () => {
    await expectThrow(() => App.launch({ pid: 1 }), 'INVALID_ARGUMENT');
    await expectThrow(() => App.launch('OpenDeskInvalidFixture', { args: ['--unsupported'] }), 'NOT_SUPPORTED');
    await expectThrow(() => App.waitForLaunch({ bundleId: 'com.opendesk.runtime-api.definitely-missing' }, { timeout: 5 }), 'TIMEOUT');
    equal(await App.waitForExit({ pid: 2147483647 }, { timeout: 100 }), true, 'missing PID is already exited');
    await expectThrow(() => App.terminate({ pid: 2147483647 }, { timeout: 100 }), 'NOT_FOUND');
    await expectThrow(() => App.restart({ pid: 2147483647 }, { timeout: 100 }), 'NOT_FOUND');
  });
})();
