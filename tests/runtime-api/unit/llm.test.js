(() => {
  const {assert, equal, test} = RuntimeAPITest;
  RuntimeAPITest.contractObject('LLM');

  test({
    name: 'LLM capability query is side-effect-free and distinguishes configuration from availability',
    tier: 'unit',
    covers: ['LLM.getCapabilities'],
  }, () => {
    const capabilities = LLM.getCapabilities();
    equal(capabilities.schemaVersion, 1);
    equal(capabilities.kind, 'llm');
    equal(capabilities.executionScoped, true);
    equal(typeof capabilities.enabled, 'boolean');
    equal(typeof capabilities.supported, 'boolean');
    equal(typeof capabilities.configured, 'boolean');
    equal(capabilities.executableFound, null);
    equal(capabilities.checked, false);
    equal(capabilities.available, null);
    assert(Array.isArray(capabilities.supportedProtocols));
  });

  test({
    name: 'LLM pre-canceled calls reject before configuration or HTTP work',
    tier: 'unit',
    covers: ['LLM.generate'],
  }, async () => {
    const controller = new AbortController();
    controller.abort('unit pre-cancel');
    let error = null;
    try {
      await LLM.generate({prompt: 'must not run', signal: controller.signal});
    } catch (caught) {
      error = caught;
    }
    assert(error && error.name === 'ModelCallError', String(error));
    equal(error.code, 'CANCELED');
    equal(error.operation, 'LLM.generate');
  });
})();
