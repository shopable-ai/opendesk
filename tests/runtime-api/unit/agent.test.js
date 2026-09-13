(() => {
  const {assert, equal, test} = RuntimeAPITest;
  RuntimeAPITest.contractObject('Agent');

  test({
    name: 'Agent capability query does not launch a CLI and does not equate configuration with availability',
    tier: 'unit',
    covers: ['Agent.getCapabilities'],
  }, () => {
    const capabilities = Agent.getCapabilities();
    equal(capabilities.schemaVersion, 1);
    equal(capabilities.kind, 'agent');
    equal(capabilities.executionScoped, true);
    equal(capabilities.defaultBackend, 'codex');
    equal(typeof capabilities.enabled, 'boolean');
    equal(typeof capabilities.supported, 'boolean');
    equal(typeof capabilities.configured, 'boolean');
    equal(capabilities.checked, false);
    equal(capabilities.available, null);
    assert(Array.isArray(capabilities.supportedBackends));
  });

  test({
    name: 'Agent pre-canceled calls reject before profile resolution or Command work',
    tier: 'unit',
    covers: ['Agent.run'],
  }, async () => {
    const controller = new AbortController();
    controller.abort('unit pre-cancel');
    let error = null;
    try {
      await Agent.run({prompt: 'must not run', signal: controller.signal});
    } catch (caught) {
      error = caught;
    }
    assert(error && error.name === 'ModelCallError', String(error));
    equal(error.code, 'CANCELED');
    equal(error.operation, 'Agent.run');
  });
})();
