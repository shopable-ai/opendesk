(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('http');
  test({ name: 'http.request rejects an empty request and unsupported response types before network activity', tier: 'unit', covers: ['http.request'] }, async () => {
    await expectThrow(() => http.request({}), 'url is required');
    await expectThrow(() => http.request({ url: 'http://127.0.0.1:1', responseType: 'stream' }), 'unsupported responseType');
    assert(typeof http.get === 'function' && typeof http.post === 'function', 'http helpers missing');
  });
})();
