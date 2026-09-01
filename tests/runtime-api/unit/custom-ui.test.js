(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('ui');

  test({
    name: 'ui is dormant by default and reports the disabled activation source',
    tier: 'unit',
    covers: ['ui.getCapabilities'],
  }, async () => {
    const capabilities = ui.getCapabilities();
    equal(capabilities.enabled, false, 'ui enabled without authorization');
    equal(capabilities.available, false, 'dormant ui reported available');
    equal(capabilities.activationSource, 'disabled', 'unexpected ui activation source');
    equal(Execution.activationSource, 'disabled', 'Execution activation source differs');
    assert(Array.isArray(capabilities.controls) && capabilities.controls.includes('button'), 'control capabilities missing');
  });

  test({
    name: 'dormant ui rejects every mutating entry with structured UI_DISABLED errors',
    tier: 'unit',
    covers: ['ui.createWindow', 'ui.closeAll', 'ui.on'],
  }, async () => {
    const cases = [
      ['createWindow', () => ui.createWindow({})],
      ['closeAll', () => ui.closeAll()],
      ['on', () => ui.on('click', () => {})],
    ];
    for (const [operation, invoke] of cases) {
      let error = null;
      try {
        await invoke();
      } catch (caught) {
        error = caught;
      }
      assert(error, operation + ' did not reject');
      equal(error.code, 'UI_DISABLED', operation + ' returned the wrong code');
      equal(error.operation, operation, operation + ' returned the wrong operation');
      equal(error.capability, 'ui', operation + ' omitted the capability');
    }
  });
})();
