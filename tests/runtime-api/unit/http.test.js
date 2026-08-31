(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('http');
  test({ name: 'http.request rejects an empty request before network activity', tier: 'unit', covers: ['http.request'] }, async () => {
    await expectThrow(() => http.request({}), 'url is required');
    assert(typeof http.get === 'function' && typeof http.post === 'function', 'http helpers missing');
  });
})();
