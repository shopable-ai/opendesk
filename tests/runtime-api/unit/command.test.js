(() => {
  const { equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Command');

  test({
    name: 'Command is available to the local JavaScript entrypoint',
    tier: 'unit',
    covers: RuntimeAPIObjects.Command.methods.map((method) => `Command.${method}`),
  }, () => {
    const capabilities = Command.getCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schema version');
    equal(capabilities.enabled, true, 'local Runtime entrypoint');
    equal(capabilities.supported, true, 'platform support');
    equal(capabilities.executionScoped, true, 'execution ownership');
  });
})();
