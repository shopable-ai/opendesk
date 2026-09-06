(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('http');

  test({
    name: 'http.download validates its native-only argument boundary before network activity',
    tier: 'unit',
    covers: ['http.download'],
  }, async () => {
    assert(typeof http.download === 'function', 'http.download missing');
    await expectThrow(() => http.download('ftp://example.test/file', { path: 'ignored.bin' }), 'INVALID_URL');
    await expectThrow(() => http.download('https://example.test/file', { path: 'ignored.bin', maxBytes: 0 }), 'INVALID_ARGUMENT');
  });
})();
