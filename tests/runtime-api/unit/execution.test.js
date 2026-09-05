(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Execution');

  test({
    name: 'Execution exposes one coherent runtime-owned context snapshot',
    tier: 'unit',
    covers: RuntimeAPIObjects.Execution.properties.map((property) => `Execution.${property}`),
  }, async () => {
    equal(Execution.id, Execution.executionId, 'Execution ID alias differs');
    assert(typeof Execution.id === 'string' && Execution.id.length > 0, 'Execution ID is empty');
    assert(Execution.input !== undefined, 'Execution input is missing');
    assert(typeof Execution.workdir === 'string' && Execution.workdir.length > 0, 'Execution workdir is empty');
    assert(Execution.env && typeof Execution.env === 'object' && !Array.isArray(Execution.env), 'Execution env is missing');
    assert(Object.isFrozen(Execution.env), 'Execution env must be frozen');
    assert(Object.isFrozen(Execution), 'Execution context must be frozen');
    assert(Object.values(Execution.env).every((value) => typeof value === 'string'), 'Execution env contains a non-string value');
    equal(Execution.env.OPENDESK_RUNTIME_API_RUN_ID, RuntimeAPITest.context.runId, 'local shell environment was not captured');
    assert(['legacy', 'upgraded', 'playwright'].includes(Execution.stack), 'Execution stack label is invalid');
    assert(typeof Execution.artifactDir === 'string' && Execution.artifactDir.length > 0, 'Execution artifactDir is empty');
    assert(typeof Execution.source === 'string' && Execution.source.length > 0, 'Execution source is empty');
    equal(Execution.ext, '.js', 'Execution source extension differs');
    assert(/^[0-9a-f]{64}$/.test(Execution.scriptHash), 'Execution scriptHash is not lowercase SHA-256');
    assert(['disabled', 'cli', 'projectConfig', 'httpRequest'].includes(Execution.activationSource), 'Execution activationSource is invalid');
  });
})();
