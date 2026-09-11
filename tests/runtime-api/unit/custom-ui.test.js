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
    equal(capabilities.window.toast, capabilities.window.notify, 'toast capability must mirror the legacy native notification capability');
  });

  test({
    name: 'dormant ui rejects every mutating entry with structured UI_DISABLED errors',
    tier: 'unit',
    covers: ['ui.toast', 'ui.notify', 'ui.createWindow', 'ui.closeAll', 'ui.on'],
  }, async () => {
    const cases = [
      ['toast', () => ui.toast('must not appear'), 'ui.toast'],
      ['notify compatibility alias', () => ui.notify('must not appear'), 'ui.notify'],
      ['createWindow', () => ui.createWindow({}), 'createWindow'],
      ['closeAll', () => ui.closeAll(), 'closeAll'],
      ['on', () => ui.on('click', () => {}), 'on'],
    ];
    for (const [label, invoke, expectedOperation] of cases) {
      let error = null;
      try {
        await invoke();
      } catch (caught) {
        error = caught;
      }
      assert(error, label + ' did not reject');
      equal(error.code, 'UI_DISABLED', label + ' returned the wrong code');
      equal(error.operation, expectedOperation, label + ' returned the wrong operation');
      equal(error.capability, 'ui', label + ' omitted the capability');
    }
  });
})();
