(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('axios');
  test({ name: 'axios compatibility object exposes documented defaults and response type forwarding', tier: 'unit', covers: ['axios.request'] }, async () => {
    assert(axios && typeof axios.defaults === 'object', 'axios.defaults missing');
    assert(axios.defaults.responseType === 'json', 'axios default responseType changed');
  });
})();
