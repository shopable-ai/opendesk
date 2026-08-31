(() => {
  const { expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('http');
  RuntimeAPITest.contractObject('axios');

  test({ name: 'http.request rejects a missing URL instead of panicking', tier: 'unit', covers: ['http.request'] }, async () => {
    await expectThrow(() => http.request({}), 'url is required');
  });
})();
