(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('axios');
  test({ name: 'axios compatibility object exposes its documented defaults', tier: 'unit', covers: ['axios.request'] }, async () => {
    assert(axios && typeof axios.defaults === 'object', 'axios.defaults missing');
  });
})();
