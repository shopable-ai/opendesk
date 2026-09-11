(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('automation');

  test({
    name: 'automation.app is fail-closed outside explicit App Mode without replacing global App',
    tier: 'unit',
    covers: ['automation.app', 'automation.app.getCapabilities', 'automation.app.onAction', 'automation.app.updateMenuItem', 'automation.app.quit'],
  }, async () => {
    assert(typeof App === 'object' && typeof App.list === 'function', 'existing external-application App global was replaced');
    assert(automation && typeof automation.app === 'object', 'automation.app capability handle is missing');
    const capabilities = automation.app.getCapabilities();
    equal(capabilities.enabled, false, 'ordinary Script Mode enabled the App Shell');
    equal(capabilities.available, false, 'ordinary Script Mode reported App Shell availability');

    for (const invoke of [
      () => automation.app.onAction(() => {}),
      () => automation.app.updateMenuItem('status', { label: 'changed' }),
      () => automation.app.quit(),
    ]) {
      let error = null;
      try { await invoke(); } catch (caught) { error = caught; }
      assert(error, 'disabled App Shell operation did not reject');
      equal(error.code, 'APP_MODE_DISABLED', 'disabled App Shell error code');
    }
  });
})();
