(() => {
  const { test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('console');

  test({
    name: 'console methods accept structured output and paired markers',
    tier: 'unit',
    covers: RuntimeAPIObjects.console.methods.map((method) => `console.${method}`),
  }, async () => {
    console.log('[RUNTIME-API-CONSOLE] log');
    console.info('[RUNTIME-API-CONSOLE] info');
    console.warn('[RUNTIME-API-CONSOLE] warn');
    console.error('[RUNTIME-API-CONSOLE] expected test marker');
    console.debug('[RUNTIME-API-CONSOLE] debug');
    console.table([{ ok: true }]);
    console.group('host-api-group');
    console.groupEnd('host-api-group');
    console.time('host-api-timer');
    console.timeEnd('host-api-timer');
    console.clear();
  });
})();
