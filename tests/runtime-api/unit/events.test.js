(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Events');

  test({ name: 'Events reports explicit backend capabilities', tier: 'unit', covers: ['Events.getCapabilities'] }, async () => {
    const capabilities = Events.getCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schema version');
    assert(capabilities.events && capabilities.events['clipboard.changed'], 'clipboard capability must be present');
    assert(capabilities.events['clipboard.changed'].backend === 'polling', 'fallback must be explicit');
    assert(capabilities.events['display.changed'].intervalMs > 0, 'poll interval must be visible');
  });

  test({ name: 'Events subscription unsubscribe is idempotent', tier: 'unit', covers: ['Events.on'] }, async () => {
    const subscription = Events.on('display.changed', () => {});
    equal(subscription.event, 'display.changed', 'subscription event');
    equal(subscription.backend, 'polling', 'subscription backend');
    subscription.unsubscribe();
    subscription.unsubscribe();
  });

  test({ name: 'Events once rejects with a structured timeout', tier: 'unit', covers: ['Events.once'] }, async () => {
    let code = '';
    try {
      await Events.once('display.changed', { timeout: 10 });
    } catch (error) {
      code = error && error.code;
    }
    equal(code, 'TIMEOUT', 'once timeout code');
  });

  test({ name: 'Events rejects unknown event names and invalid callbacks', tier: 'unit', covers: ['Events.on', 'Events.once'] }, async () => {
    await expectThrow(() => Events.on('shortcut.pressed', () => {}), 'INVALID_EVENT');
    await expectThrow(() => Events.on('clipboard.changed', null), 'INVALID_ARGUMENT');
    await expectThrow(() => Events.once('clipboard.changed', { timeout: 0 }), 'INVALID_ARGUMENT');
  });
})();
